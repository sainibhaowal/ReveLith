import { describe, expect, it } from 'vitest'
import {
  CHART_CATEGORY_WIRE_MAX,
  CHART_TEXT_WIRE_MAX,
  editableBorderStyleSchema,
  fillSpecSchema,
  hexColorSchema,
  MAX_PATCH_ENTRY_BYTES,
  patternFillSchema,
  richRunSchema,
  styleColorSchema,
  styleEditBorderSchema,
  themeColorSchema,
  workbookChartEditSchema,
  workbookStyleEditSchema,
  workbookVisualEditSchema,
  drawingAnchorSchema,
} from '../src/shared/edit-schemas'

describe('colors', () => {
  it('accepts a six-digit hex color and rejects anything else', () => {
    expect(hexColorSchema.safeParse('#AABBCC').success).toBe(true)
    expect(hexColorSchema.safeParse('#abc').success).toBe(false)
    expect(hexColorSchema.safeParse('AABBCC').success).toBe(false)
  })

  it('accepts a theme slot with and without a tint', () => {
    expect(themeColorSchema.safeParse({ theme: 4 }).success).toBe(true)
    expect(themeColorSchema.safeParse({ theme: 4, tint: -0.25 }).success).toBe(true)
  })

  it('rejects a theme index outside 0..11', () => {
    expect(themeColorSchema.safeParse({ theme: 12 }).success).toBe(false)
    expect(themeColorSchema.safeParse({ theme: -1 }).success).toBe(false)
  })

  it('rejects a tint outside -1..1', () => {
    expect(themeColorSchema.safeParse({ theme: 0, tint: 1.5 }).success).toBe(false)
  })

  it('accepts either a literal or a theme color', () => {
    expect(styleColorSchema.safeParse('#112233').success).toBe(true)
    expect(styleColorSchema.safeParse({ theme: 2 }).success).toBe(true)
  })
})

describe('style edit', () => {
  it('accepts an empty delta, since only changed keys are present', () => {
    expect(workbookStyleEditSchema.safeParse({}).success).toBe(true)
  })

  it('rejects an unknown key rather than dropping it silently', () => {
    // .strict(): a typo'd key must fail loudly, not be ignored
    expect(workbookStyleEditSchema.safeParse({ boldd: true }).success).toBe(false)
  })

  it('accepts a theme-slot color, not only a literal', () => {
    expect(workbookStyleEditSchema.safeParse({ fontColor: { theme: 4, tint: 0.4 } }).success).toBe(
      true,
    )
    expect(workbookStyleEditSchema.safeParse({ fillColor: '#FF0000' }).success).toBe(true)
  })

  it('null clears a color back to the theme default', () => {
    expect(workbookStyleEditSchema.safeParse({ fontColor: null }).success).toBe(true)
    expect(workbookStyleEditSchema.safeParse({ fillColor: null }).success).toBe(true)
  })

  it('accepts a pattern fill and a gradient fill', () => {
    expect(
      workbookStyleEditSchema.safeParse({
        fill: { pattern: 'solid', fg: { theme: 1 } },
      }).success,
    ).toBe(true)
    expect(
      workbookStyleEditSchema.safeParse({
        fill: {
          gradient: {
            angle: 90,
            stops: [
              { position: 0, color: '#000000' },
              { position: 1, color: '#FFFFFF' },
            ],
          },
        },
      }).success,
    ).toBe(true)
  })

  it('rejects a gradient with a single stop', () => {
    expect(
      fillSpecSchema.safeParse({
        gradient: { stops: [{ position: 0, color: '#000000' }] },
      }).success,
    ).toBe(false)
  })

  it('rejects a gradient angle outside 0..360', () => {
    expect(
      fillSpecSchema.safeParse({
        gradient: {
          angle: 400,
          stops: [
            { position: 0, color: '#000' },
            { position: 1, color: '#FFF' },
          ],
        },
      }).success,
    ).toBe(false)
  })

  it('rejects an unknown pattern name', () => {
    expect(patternFillSchema.safeParse({ pattern: 'plaid', fg: '#000000' }).success).toBe(false)
  })

  it('accepts every editable border style', () => {
    for (const style of editableBorderStyleSchema.options) {
      expect(editableBorderStyleSchema.safeParse(style).success).toBe(true)
    }
  })

  it('null removes a border edge', () => {
    expect(styleEditBorderSchema.safeParse(null).success).toBe(true)
    expect(styleEditBorderSchema.safeParse({ style: 'thin' }).success).toBe(true)
  })

  it('rejects an out-of-range font size and a non-positive one', () => {
    expect(workbookStyleEditSchema.safeParse({ fontSize: 0 }).success).toBe(false)
    expect(workbookStyleEditSchema.safeParse({ fontSize: 500 }).success).toBe(false)
    expect(workbookStyleEditSchema.safeParse({ fontSize: 11 }).success).toBe(true)
  })

  it('accepts 255 as the stacked-vertical rotation and rejects 181', () => {
    expect(workbookStyleEditSchema.safeParse({ textRotation: 255 }).success).toBe(true)
    expect(workbookStyleEditSchema.safeParse({ textRotation: 180 }).success).toBe(true)
    expect(workbookStyleEditSchema.safeParse({ textRotation: 181 }).success).toBe(false)
  })
})

describe('rich run', () => {
  const base = {
    text: 'x',
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  }

  it('accepts a run with the required flags', () => {
    expect(richRunSchema.safeParse(base).success).toBe(true)
  })

  it('accepts subscript and superscript', () => {
    expect(richRunSchema.safeParse({ ...base, vertAlign: 'subscript' }).success).toBe(true)
    expect(richRunSchema.safeParse({ ...base, vertAlign: 'superscript' }).success).toBe(true)
  })

  it('rejects any other vertAlign', () => {
    expect(richRunSchema.safeParse({ ...base, vertAlign: 'baseline' }).success).toBe(false)
  })

  it('requires the boolean flags rather than defaulting them', () => {
    // a run that silently defaults bold to false would change the text
    expect(richRunSchema.safeParse({ text: 'x' }).success).toBe(false)
  })
})

describe('chart edit', () => {
  it('constrains the chart path to the charts directory', () => {
    expect(
      workbookChartEditSchema.safeParse({ chartPath: 'xl/charts/chart1.xml', title: 'T' }).success,
    ).toBe(true)
    expect(
      workbookChartEditSchema.safeParse({ chartPath: '../../evil.xml', title: 'T' }).success,
    ).toBe(false)
  })

  it('rejects an edit with no property at all', () => {
    expect(workbookChartEditSchema.safeParse({ chartPath: 'xl/charts/chart1.xml' }).success).toBe(
      false,
    )
  })

  it('rejects an empty seriesColors record as no-op', () => {
    expect(
      workbookChartEditSchema.safeParse({
        chartPath: 'xl/charts/chart1.xml',
        seriesColors: {},
      }).success,
    ).toBe(false)
  })

  it('requires a series edit to carry a name or data', () => {
    expect(
      workbookChartEditSchema.safeParse({
        chartPath: 'xl/charts/chart1.xml',
        series: [{ index: 0 }],
      }).success,
    ).toBe(false)
    expect(
      workbookChartEditSchema.safeParse({
        chartPath: 'xl/charts/chart1.xml',
        series: [{ index: 0, name: 'S' }],
      }).success,
    ).toBe(true)
  })

  it('requires at least one bound on a value-axis edit', () => {
    const path = 'xl/charts/chart1.xml'
    expect(workbookChartEditSchema.safeParse({ chartPath: path, valueAxis: {} }).success).toBe(
      false,
    )
    expect(
      workbookChartEditSchema.safeParse({ chartPath: path, valueAxis: { min: 0 } }).success,
    ).toBe(true)
  })

  it('caps chart text on the wire', () => {
    const path = 'xl/charts/chart1.xml'
    expect(
      workbookChartEditSchema.safeParse({
        chartPath: path,
        title: 'x'.repeat(CHART_TEXT_WIRE_MAX + 1),
      }).success,
    ).toBe(false)
    expect(
      workbookChartEditSchema.safeParse({
        chartPath: path,
        title: 'x'.repeat(CHART_TEXT_WIRE_MAX),
      }).success,
    ).toBe(true)
  })

  it('exposes a category cap distinct from the text cap', () => {
    expect(CHART_CATEGORY_WIRE_MAX).toBe(1_024)
  })
})

describe('visual edit', () => {
  // a visual is located by its drawing part plus an anchor index
  const at = (extra: Record<string, unknown>) => ({
    drawingPath: 'xl/drawings/drawing1.xml',
    drawingIndex: 0,
    ...extra,
  })

  it('requires a removal or a new anchor', () => {
    expect(workbookVisualEditSchema.safeParse(at({})).success).toBe(false)
    expect(workbookVisualEditSchema.safeParse(at({ remove: true })).success).toBe(true)
  })

  it('accepts a frame size alongside an anchor', () => {
    expect(
      workbookVisualEditSchema.safeParse(
        at({
          anchor: {
            fromRow: 0,
            fromColumn: 0,
            fromRowOffset: 0,
            fromColumnOffset: 0,
            toRow: 2,
            toColumn: 2,
            toRowOffset: 0,
            toColumnOffset: 0,
          },
          frameSize: { width: 100, height: 50 },
        }),
      ).success,
    ).toBe(true)
  })

  it('rejects a non-positive frame dimension', () => {
    expect(
      workbookVisualEditSchema.safeParse(at({ remove: true, frameSize: { width: 0, height: 50 } }))
        .success,
    ).toBe(false)
  })

  it('requires the anchor index that locates the visual', () => {
    expect(
      workbookVisualEditSchema.safeParse({ drawingPath: 'xl/drawings/drawing1.xml' }).success,
    ).toBe(false)
  })

  it('rejects a negative anchor row', () => {
    expect(
      drawingAnchorSchema.safeParse({
        fromRow: -1,
        fromColumn: 0,
        fromRowOffset: 0,
        fromColumnOffset: 0,
        toRow: 1,
        toColumn: 1,
        toRowOffset: 0,
        toColumnOffset: 0,
      }).success,
    ).toBe(false)
  })
})

describe('patch entry cap', () => {
  it('sits below the V8 maximum string length', () => {
    // otherwise an oversized entry dies mid-stringify with an opaque error
    // instead of being rejected with a message
    expect(MAX_PATCH_ENTRY_BYTES).toBeLessThan(536_870_888)
  })

  it('is generous enough for a large dense worksheet', () => {
    expect(MAX_PATCH_ENTRY_BYTES).toBeGreaterThanOrEqual(256 * 1024 * 1024)
  })
})
