/**
 * The edit contract: zod schemas and limits that both the spreadsheet gateway
 * and the desktop IPC surface validate against.
 *
 * These live here rather than in the app's IPC module because they describe
 * workbook edits, not IPC. The renderer and the headless CLI have to agree on
 * exactly what a valid style or chart edit is; two copies of that definition
 * drift, and the drift only shows up as a rejection in one caller.
 */
import { z } from 'zod'

import { PATTERN_TYPES } from '../domain/style-color'

export const richRunSchema = z
  .object({
    text: z.string(),
    bold: z.boolean(),
    italic: z.boolean(),
    underline: z.boolean(),
    strikethrough: z.boolean(),
    color: z.string().optional(),
    size: z.number().positive().optional(),
    family: z.string().optional(),
    vertAlign: z.enum(['subscript', 'superscript']).optional(),
  })
  .strict()

export const drawingAnchorSchema = z
  .object({
    fromRow: z.number().int().nonnegative(),
    fromColumn: z.number().int().nonnegative(),
    fromRowOffset: z.number().int(),
    fromColumnOffset: z.number().int(),
    toRow: z.number().int().nonnegative(),
    toColumn: z.number().int().nonnegative(),
    toRowOffset: z.number().int(),
    toColumnOffset: z.number().int(),
    /**
     * True when the file carried a real `<xdr:to>` marker. Its offset clamps at
     * the cell edge (Excel's behavior for a broken writer) instead of walking
     * past it the way a synthesized oneCellAnchor/absoluteAnchor does.
     */
    explicitTo: z.boolean().optional(),
  })
  .strict()

/**
 * The gateway's per-entry patch cap: only entries it patches have to fit in
 * memory.
 *
 * A large, densely styled worksheet routinely exceeds 256 MiB as XML even when
 * the .xlsx itself is modest, so the cap has to be generous enough to keep
 * those editable while staying a real bound — it sits deliberately below V8's
 * maximum string length, so an oversized entry fails with a clear message
 * instead of dying mid-stringify. Shared so a renderer can pre-reject an edit on
 * a worksheet whose XML could never be rewritten, rather than letting Apply
 * succeed and every save fail afterwards.
 */
export const MAX_PATCH_ENTRY_BYTES = 500 * 1024 * 1024

export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/)

/** A styles.xml color: literal rgb, or a theme slot Excel re-resolves on a theme change. */
export const themeColorSchema = z
  .object({
    theme: z.number().int().min(0).max(11),
    tint: z.number().min(-1).max(1).optional(),
  })
  .strict()
export const styleColorSchema = z.union([hexColorSchema, themeColorSchema])

export const patternFillSchema = z
  .object({
    pattern: z.enum(PATTERN_TYPES),
    fg: styleColorSchema,
    bg: styleColorSchema.optional(),
  })
  .strict()
export const gradientFillSchema = z
  .object({
    gradient: z
      .object({
        type: z.enum(['linear', 'path']).optional(),
        angle: z.number().min(0).max(360).optional(),
        left: z.number().min(0).max(1).optional(),
        right: z.number().min(0).max(1).optional(),
        top: z.number().min(0).max(1).optional(),
        bottom: z.number().min(0).max(1).optional(),
        stops: z
          .array(z.object({ position: z.number().min(0).max(1), color: styleColorSchema }).strict())
          .min(2)
          .max(10),
      })
      .strict(),
  })
  .strict()
export const fillSpecSchema = z.union([patternFillSchema, gradientFillSchema])

/** OOXML border line styles the editor can write. */
export const editableBorderStyleSchema = z.enum([
  'thin',
  'medium',
  'thick',
  'dashed',
  'dotted',
  'double',
  'hair',
  'dashDot',
  'dashDotDot',
  'mediumDashed',
  'mediumDashDot',
  'mediumDashDotDot',
  'slantDashDot',
])

/** One border edge delta: an object sets the edge, null removes it. */
export const styleEditBorderSchema = z.union([
  z
    .object({
      style: editableBorderStyleSchema,
      color: styleColorSchema.optional(),
    })
    .strict(),
  z.null(),
])

/**
 * Renderer-neutral style delta: only the keys the user changed are present, and
 * `false` means "remove this attribute from the cell's style".
 */
export const workbookStyleEditSchema = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    underlineStyle: z.enum(['single', 'double']).optional(),
    strikethrough: z.boolean().optional(),
    fontFamily: z.string().min(1).max(128).optional(),
    fontSize: z.number().positive().max(409).optional(),
    /** null removes the explicit font color, back to the theme default. */
    fontColor: z.union([styleColorSchema, z.null()]).optional(),
    /** null clears the fill back to the default "none" pattern. */
    fillColor: z.union([styleColorSchema, z.null()]).optional(),
    /** Pattern or gradient fill. Wins over fillColor when both are present. */
    fill: z.union([fillSpecSchema, z.null()]).optional(),
    horizontalAlignment: z.enum(['left', 'center', 'right', 'justify', 'distributed']).optional(),
    verticalAlignment: z.enum(['top', 'center', 'bottom']).optional(),
    wrapText: z.boolean().optional(),
    /**
     * OOXML textRotation: 0-90 counterclockwise, 91-180 clockwise (value-90),
     * 255 stacked vertical; 0 clears the rotation.
     */
    textRotation: z.union([z.number().int().min(0).max(180), z.literal(255)]).optional(),
    /** OOXML alignment indent steps; 0 clears. Renders as left cell padding. */
    indent: z.number().int().min(0).max(250).optional(),
    /**
     * Cell protection flags (xf <protection>). Meaningful once the sheet is
     * protected: true is the OOXML default for locked, false for hidden.
     */
    protectionLocked: z.boolean().optional(),
    protectionHidden: z.boolean().optional(),
    numberFormat: z.string().min(1).max(255).optional(),
    borderTop: styleEditBorderSchema.optional(),
    borderBottom: styleEditBorderSchema.optional(),
    borderLeft: styleEditBorderSchema.optional(),
    borderRight: styleEditBorderSchema.optional(),
  })
  .strict()

/**
 * Caps for chart strings that carry cell-derived text on the save wire. The
 * emitters clamp to these, so a long cell can never fail a whole save with a
 * schema rejection.
 */
export const CHART_TEXT_WIRE_MAX = 255

export const CHART_CATEGORY_WIRE_MAX = 1_024

export const workbookChartEditSchema = z
  .object({
    /** Constrained to the charts directory — the caller chooses the path. */
    chartPath: z.string().regex(/^xl\/charts\/[A-Za-z0-9._-]+\.xml$/),
    title: z.string().max(CHART_TEXT_WIRE_MAX).optional(),
    chartType: z.enum(['column', 'bar', 'line', 'area', 'pie', 'doughnut']).optional(),
    seriesColors: z.record(z.string().regex(/^[0-9]{1,3}$/), hexColorSchema).optional(),
    /** 'none' removes the legend; a side re-positions it, creating it if needed. */
    legend: z.enum(['none', 'right', 'bottom', 'top', 'left']).optional(),
    /**
     * Plot-level data labels: values on bars and points, category+percent or
     * percent on pie slices. 'none' removes them.
     */
    dataLabels: z.enum(['none', 'value', 'percent', 'category-percent']).optional(),
    /** Placement and number format of the data labels (`c:dLblPos` / `c:numFmt`). */
    dataLabelPosition: z.enum(['center', 'inside-end', 'outside-end']).optional(),
    dataLabelFormat: z.string().max(64).optional(),
    /** null removes that axis title. Axis-based charts only. */
    axisTitles: z
      .object({
        category: z.string().max(CHART_TEXT_WIRE_MAX).nullable().optional(),
        value: z.string().max(CHART_TEXT_WIRE_MAX).nullable().optional(),
      })
      .strict()
      .optional(),
    /**
     * Per-point fills (`c:dPt`), keyed series index then point index; this is
     * how pie and doughnut slices get individual colors.
     */
    pointColors: z
      .record(
        z.string().regex(/^[0-9]{1,3}$/),
        z.record(z.string().regex(/^[0-9]{1,3}$/), hexColorSchema),
      )
      .optional(),
    /**
     * Bar/line/area stacking. 'clustered' means side by side, which line and
     * area write as 'standard'.
     */
    grouping: z.enum(['clustered', 'stacked', 'percentStacked']).optional(),
    /** Value-axis major gridlines on/off. Axis charts only. */
    gridlines: z.boolean().optional(),
    /** Value-axis bounds; null resets that bound to auto. */
    valueAxis: z
      .object({
        min: z.number().finite().nullable().optional(),
        max: z.number().finite().nullable().optional(),
      })
      .strict()
      .refine((axis) => axis.min !== undefined || axis.max !== undefined, {
        message: 'A value-axis edit needs min or max.',
      })
      .optional(),
    /** Bar-family gap between categories, as a percentage of one bar's width. */
    gapWidthPct: z.number().int().min(0).max(500).optional(),
    /** Doughnut hole diameter, as a percentage of the chart size. */
    holeSizePct: z.number().int().min(10).max(90).optional(),
    /** Pie whole-ring explosion (series 0), as a percentage of the radius. */
    explosionPct: z.number().int().min(0).max(400).optional(),
    /** Pie per-slice explosion overrides (series 0), point index to percentage. */
    pointExplosions: z
      .record(z.string().regex(/^[0-9]{1,3}$/), z.number().int().min(0).max(400))
      .optional(),
    /**
     * Full series replacement (Select Data): every existing series drops and
     * these are written in order. Wins over `series` and `seriesColors`.
     */
    seriesSet: z
      .array(
        z
          .object({
            name: z.string().max(CHART_TEXT_WIRE_MAX),
            values: z.array(z.number().finite()).max(1_000),
            valuesRef: z.string().max(512).optional(),
            categories: z.array(z.string().max(CHART_CATEGORY_WIRE_MAX)).max(1_000).optional(),
            categoriesRef: z.string().max(512).optional(),
            color: hexColorSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(24)
      .optional(),
    /**
     * Per-series rewrite of name and/or data. Refs and caches travel together so
     * the file and the on-screen render stay in sync.
     */
    series: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(255),
            name: z.string().max(CHART_TEXT_WIRE_MAX).optional(),
            valuesRef: z.string().max(512).optional(),
            values: z.array(z.number().finite()).max(1_000).optional(),
            categoriesRef: z.string().max(512).optional(),
            categories: z.array(z.string().max(CHART_CATEGORY_WIRE_MAX)).max(1_000).optional(),
          })
          .strict()
          .refine(
            (entry) =>
              entry.name !== undefined ||
              entry.values !== undefined ||
              entry.categories !== undefined,
            { message: 'A series edit needs a name or data.' },
          ),
      )
      .max(24)
      .optional(),
  })
  .strict()
  .refine(
    (edit) =>
      edit.title !== undefined ||
      edit.chartType !== undefined ||
      (edit.seriesColors && Object.keys(edit.seriesColors).length > 0) ||
      (edit.pointColors && Object.keys(edit.pointColors).length > 0) ||
      edit.legend !== undefined ||
      edit.axisTitles !== undefined ||
      edit.dataLabels !== undefined ||
      edit.dataLabelPosition !== undefined ||
      edit.dataLabelFormat !== undefined ||
      edit.grouping !== undefined ||
      edit.gridlines !== undefined ||
      edit.valueAxis !== undefined ||
      edit.gapWidthPct !== undefined ||
      edit.holeSizePct !== undefined ||
      edit.explosionPct !== undefined ||
      (edit.pointExplosions && Object.keys(edit.pointExplosions).length > 0) ||
      (edit.seriesSet && edit.seriesSet.length > 0) ||
      (edit.series && edit.series.length > 0),
    { message: 'A chart edit needs at least one property.' },
  )

/**
 * Edit to a visual that already lives in the file, located by its
 * (drawingPath, anchor index) pair. `remove` deletes the anchor — charts fail
 * closed in the gateway rather than leaving a dangling reference — and `anchor`
 * rewrites the from/to markers.
 */
export const workbookVisualEditSchema = z
  .object({
    drawingPath: z.string().regex(/^xl\/drawings\/[A-Za-z0-9._/-]+\.xml$/),
    drawingIndex: z.number().int().nonnegative().max(10_000),
    remove: z.literal(true).optional(),
    anchor: drawingAnchorSchema.optional(),
    /**
     * New xfrm ext in EMU. Sent with `anchor` when a rotated shape is resized,
     * because the anchor stores the rotated bounding box, not the true frame.
     */
    frameSize: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((edit) => edit.remove === true || edit.anchor !== undefined, {
    message: 'A visual edit needs a removal or a new anchor.',
  })

export type WorkbookStyleEdit = z.infer<typeof workbookStyleEditSchema>
export type WorkbookChartEdit = z.infer<typeof workbookChartEditSchema>
export type WorkbookVisualEdit = z.infer<typeof workbookVisualEditSchema>
export type WorkbookRichRun = z.infer<typeof richRunSchema>
