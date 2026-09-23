import { z } from 'zod'
import type { AgentToolCall, AgentToolDef } from '@revelith/agent-core'
import { workbookOperationSchema, type WorkbookOperation } from '../../domain/workbook-dsl'
import {
  columnLabel,
  formatAddress,
  parseAddress,
  parseRange,
  rangeCellCount,
  type RangeBounds,
} from '../../domain/cell-address'
import type {
  ApplyOutcome,
  CellFormatState,
  CellScalar,
  ChangePlan,
} from '../../domain/workbook.types'
import { parseFormulaReferences } from '../formula-closure'
import type { SheetGrid } from './workbook-readers'
import type { CreateDocumentRequest, CreateDocumentResult } from '../../shared/desktop-api'
import { t } from '../i18n/locale'
import { guideCatalogSummary, loadGuides } from './guides'

/**
 * The workbook DSL as an AgentSkill tool set: read-only context/reader tools
 * and one propose tool. Mirrors the docx skill's read-before-write discipline
 * (get_document_context / read_blocks / replace_blocks), but the mutating
 * tool never touches the workbook directly : it only computes a ChangePlan
 * and hands it to the SAME plan/apply path the manual flow uses, which now
 * auto-applies immediately (undo via ⌘Z / inline button covers everything;
 * the preview card only remains as a manual fallback when apply fails).
 */

/** raw shape the model sends for one operation; validated against workbookOperationSchema */
export type ProposedOperation = Record<string, unknown>

export interface SheetRef {
  readonly id: string
  readonly name: string
  /** Data extent (from the xlsx dimension or known cells); may drift slightly
   * after structural changes within the session */
  readonly rows?: number
  readonly columns?: number
}

export interface ChartRef {
  readonly path: string
  readonly title: string
  readonly types: string
  readonly sheetId: string
}

export interface ActiveSheetInfo {
  readonly mode: 'demo' | 'lazy' | 'none'
  readonly sheetId: string
  readonly sheetName: string
  /** demo mode only: current revision, needed for the CAS-checked plan() call */
  readonly revision?: number
  /** non-empty cell addresses known to the caller without an extra read */
  readonly knownAddresses: readonly string[]
  /** lazy mode only: the viewport-backed range currently present in Univer */
  readonly loadedRange?: string | undefined
  /** every sheet in the workbook, active one included */
  readonly sheets: readonly SheetRef[]
  /** current selection in A1 notation, when one exists */
  readonly selection?: string | undefined
  /** merged ranges on the active sheet (A1 notation) */
  readonly merges?: readonly string[] | undefined
  /** charts in the workbook (imported files only) */
  readonly charts?: readonly ChartRef[] | undefined
}

export interface SheetsSkillDeps {
  getActiveSheetInfo(): ActiveSheetInfo
  /** Ensure a lazy workbook range is present in Univer before reading it. */
  ensureRangeLoaded?(range: RangeBounds): boolean | Promise<boolean>
  readCells(addresses: readonly string[]): Record<string, { value: CellScalar; formula?: string }>
  /** Bulk values+formulas for one rectangular block on any sheet (null when unavailable) */
  readSheetGrid(sheetId: string | undefined, bounds: RangeBounds): SheetGrid | null
  /** Select a range in the grid and scroll it into view; null = done, string = error */
  goToRange(range: string, sheetId?: string): string | null
  /** Write an AI-generated file and open it in a new tab */
  createDocument(request: CreateDocumentRequest): Promise<CreateDocumentResult>
  /** per-cell explicit formatting of the active sheet; cells with no explicit format are omitted */
  readFormats(addresses: readonly string[]): Record<string, CellFormatState>
  /** formatted report of a sheet's feature state (filters, CF, DV, names, visuals, …) */
  readSheetFeatures(sheetId?: string): string
  /** `applied` resolves with the real apply result (the lazy path applies async);
   * the tool awaits it so the model never hears "applied" for a batch that failed */
  proposeOperations(
    operations: readonly WorkbookOperation[],
    summary: string,
  ): { ok: true; plan: ChangePlan; applied?: Promise<ApplyOutcome> } | { ok: false; error: string }
}

const MAX_READ_ADDRESSES = 100
const MAX_READ_RANGE_CELLS = 2000
/** Read-back after write: max number of formula cells whose results are read back */
const MAX_READBACK_FORMULAS = 10
/** Read-back after write: wait time (ms) for Univer's async formula recalc */
const FORMULA_RECALC_DELAY_MS = 300
const MAX_READ_FORMAT_CELLS = 200

export const WORKBOOK_TOOLS: AgentToolDef[] = [
  {
    name: 'get_workbook_context',
    description:
      'Get a workbook overview: all sheets (id/name/data-extent rows-columns), active sheet, current selection, known non-empty cell addresses. ' +
      'For data-size questions (how many rows / how much data), answer from the data extent here instead of reading block by block; use read_range or read_cells when concrete values are needed.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_range',
    description:
      'Read current values/formulas by rectangular range, returning a grid with row numbers and column letters. ' +
      'The requested range is not the worksheet data extent: never infer total row or record count from its ending row; use get_workbook_context. ' +
      'This is the preferred way to read data; max 2000 cells : read larger regions in multiple calls.',
    inputSchema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          description: 'Range like "A1:D20"; a single cell like "B2" is also accepted',
        },
      },
      required: ['range'],
    },
  },
  {
    name: 'load_guide',
    description:
      'Load operation guide documents into context (field definitions, conventions, common mistakes). Except for the most basic single-cell reads/writes, load the relevant guides before generating propose_operations; several can be loaded at once. ' +
      `Available guides: ${guideCatalogSummary()}`,
    inputSchema: {
      type: 'object',
      properties: {
        guides: {
          type: 'array',
          items: { type: 'string' },
          description: 'Guide names to load, e.g. ["writing","formatting"]',
        },
      },
      required: ['guides'],
    },
  },
  {
    name: 'read_formats',
    description:
      'Read explicit cell formats in a range (bold/italic/underline/colors/number format/alignment/borders); only formatted cells are returned. ' +
      'Use when you need to "reuse the format from somewhere" or inspect current formatting; max 200 cells.',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: 'Range like "A1:D20"' },
      },
      required: ['range'],
    },
  },
  {
    name: 'read_sheet_features',
    description:
      "Read a worksheet's feature state: AutoFilter (range and column criteria), conditional formatting rules, data validation rules, defined names, " +
      'freeze panes, hidden/protected status, shapes and images, and page setup pending save this session. ' +
      'Read the current state before modifying or clearing any of these existing settings : never change them blindly.',
    inputSchema: {
      type: 'object',
      properties: {
        sheetId: {
          type: 'string',
          description: 'Target sheet id; reads the active sheet when omitted',
        },
      },
      required: [],
    },
  },
  {
    name: 'read_cells',
    description:
      'Read current values/formulas of specific scattered cells (use read_range for contiguous regions). Always read the affected cells before writing : never assume their contents.',
    inputSchema: {
      type: 'object',
      properties: {
        addresses: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of cell addresses, e.g. ["A1","B2"], max 100',
        },
      },
      required: ['addresses'],
    },
  },
  {
    name: 'aggregate_range',
    description:
      'Compute statistics for a range without reading it cell by cell: non-empty count, distinct-value count, ' +
      'numeric sum/average/min/max, and the most frequent values. Handles very large ranges (up to 1,000,000 cells) efficiently. ' +
      'ALWAYS use this for "how many distinct X", value distributions, or column totals on large sheets — ' +
      'never loop read_range over big data. Aggregate one column at a time for meaningful distinct counts.',
    inputSchema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          description: 'Range like "D2:D88588" (typically one column, excluding the header)',
        },
        sheetId: { type: 'string', description: 'Target sheet id; the active sheet when omitted' },
        topValues: {
          type: 'number',
          description: 'How many most-frequent values to list (default 10, max 50)',
        },
      },
      required: ['range'],
    },
  },
  {
    name: 'find_cells',
    description:
      'Search the whole workbook (or one sheet) for cells whose value or formula matches a query; returns Sheet!Address with the cell content. ' +
      'Plain text matches as a case-insensitive substring; regex=true treats the query as a case-insensitive JavaScript regex; ' +
      'errors_only=true finds formula error cells (#REF!, #DIV/0!, #VALUE!, #NAME?, #N/A, #NUM!, #NULL!) and query may then be omitted. ' +
      'Prefer this over paging read_range when locating data or auditing errors.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text or regex to find; omit only with errors_only=true' },
        regex: { type: 'boolean', description: 'Treat query as a JavaScript regex (default false)' },
        look_in: {
          type: 'string',
          enum: ['values', 'formulas', 'both'],
          description: 'What to match against (default both)',
        },
        sheetId: { type: 'string', description: 'Restrict to one sheet id; all sheets when omitted' },
        max_results: { type: 'number', description: 'Maximum hits (default 50, max 200)' },
      },
    },
  },
  {
    name: 'select_range',
    description:
      "Select a range in the grid and scroll the user's view to it, activating its sheet. " +
      'Pure view navigation — changes no data, but it does replace whatever the user had selected. ' +
      'Use it only when they asked to be moved ("take me there", "select those rows").',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: 'Range like "A1:D20"; a single cell is also accepted' },
        sheetId: { type: 'string', description: 'Target sheet id; defaults to the active sheet' },
      },
      required: ['range'],
    },
  },
  {
    name: 'trace_precedents',
    description:
      'List the cells/ranges a formula reads (its precedents) with their current values, flagging any precedent that itself holds an error value — ' +
      'the first step when diagnosing a broken formula ("why is C10 #DIV/0!?"). Depth 1; call again on a suspect precedent to walk further up the chain.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Formula cell to audit, e.g. "C10"' },
        sheetId: { type: 'string', description: 'Sheet the cell lives on; defaults to the active sheet' },
      },
      required: ['address'],
    },
  },
  {
    name: 'trace_dependents',
    description:
      'Find every formula in the workbook (all sheets) that reads a given cell — its dependents. ' +
      'Use before changing or deleting a cell to see what would break, or to follow how an error value propagates downstream.',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Target cell, e.g. "B2"' },
        sheetId: { type: 'string', description: 'Sheet the cell lives on; defaults to the active sheet' },
      },
      required: ['address'],
    },
  },
  {
    name: 'create_document',
    description:
      'Create a NEW standalone file and open it in a new tab; the current workbook is not modified. ' +
      "Types 'xlsx' (default) and 'csv' export ONE worksheet: pass sheetId (defaults to the active sheet); the file gets the sheet's current displayed values (formulas and formatting are not carried over). " +
      "Types 'md' (Markdown source) and 'html' (complete standalone page) take authored content — use these for a report/summary as its own document. " +
      'title becomes the file name; xlsx/csv default it to the worksheet name.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['xlsx', 'csv', 'md', 'html'],
          description: 'File type (default xlsx)',
        },
        title: { type: 'string', description: 'File-name stem' },
        sheetId: { type: 'string', description: 'Worksheet to export (xlsx/csv); defaults to the active sheet' },
        content: { type: 'string', description: 'Authored source (md/html)' },
      },
    },
  },
  {
    name: 'propose_operations',
    description:
      'Submit a batch of change operations, applied to the workbook immediately (the user can roll back with the [Undo] button or ⌘Z). Basic operations: ' +
      '{op:"set_cell",sheetId,address,value} | {op:"set_formula",sheetId,address,formula(starts with =)} | ' +
      '{op:"clear_cell",sheetId,address} | {op:"rename_sheet",sheetId,name}. ' +
      'Field definitions for the remaining operations live in the guides : load_guide before using them: ' +
      'writing(set_range/clear_range/find_replace) | formatting(format_range) | ' +
      'layout(sort_range/merge_cells/unmerge_cells/set_row_height/set_col_width/set_rows_hidden/set_cols_hidden/set_freeze/set_page_setup) | ' +
      'structure(insert_rows/delete_rows/insert_cols/delete_cols/add_sheet/delete_sheet/' +
      'duplicate_sheet/set_sheet_hidden/move_sheet/protect_sheet) | ' +
      'charts(add_chart/edit_chart/delete_visual/add_sparkline/add_shape/edit_shape/add_image) | ' +
      'pivot(add_pivot/refresh_pivot) | ' +
      'table(add_table/add_table_row/add_table_column/delete_table_row/delete_table_column/delete_table) | ' +
      'data(set_hyperlink/set_filter/clear_filter/set_filter_criteria/add_conditional_format/' +
      'clear_conditional_formats/set_data_validation/set_note/add_defined_name/delete_defined_name). ' +
      'Limits: structural operations (row/column insert-delete, sheet add/delete/duplicate/move/hide) cannot share a batch with other classes; at most 2000 expanded cell changes; ' +
      'sheetId must be an id returned by get_workbook_context.',
    inputSchema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of operations in the workbook DSL discriminated-union format',
        },
        summary: { type: 'string', description: 'One-sentence summary of this batch of changes' },
      },
      required: ['operations', 'summary'],
    },
  },
]

export interface ToolExecution {
  output: string
  isError?: boolean
  /** true when propose_operations auto-applied a batch of changes */
  mutated: boolean
  summary: string
}

const fail = (summary: string, output: string): ToolExecution => ({
  output,
  isError: true,
  mutated: false,
  summary,
})

export function buildWorkbookContext(deps: SheetsSkillDeps): string {
  const info = deps.getActiveSheetInfo()
  if (info.mode === 'none') return 'No workbook is currently open.'
  const dims = (sheet: SheetRef): string =>
    sheet.rows && sheet.columns
      ? `, data extent about ${sheet.rows} rows × ${sheet.columns} columns`
      : ''
  const active = info.sheets.find((sheet) => sheet.id === info.sheetId)
  const lines = [
    `Active sheet: ${info.sheetName} (id=${info.sheetId}${active ? dims(active) : ''})`,
    info.mode === 'demo'
      ? `Mode: demo workbook, current revision=${info.revision}`
      : 'Mode: imported real xlsx file (some regions may still be streaming in)',
  ]
  if (active?.rows && active.columns) {
    lines.push(
      `Active sheet data area: A1:${columnLabel(active.columns - 1)}${active.rows}` +
        ' (answer data-size questions directly from this : do not tally block by block with read_range)',
    )
  }
  if (info.sheets.length > 1) {
    lines.push(
      `All sheets: ${info.sheets.map((sheet) => `${sheet.name} (id=${sheet.id}${dims(sheet)})`).join(', ')}`,
    )
  }
  if (info.selection) {
    lines.push(`Current selection: ${info.selection}`)
  }
  if (info.loadedRange) {
    lines.push(`Currently loaded viewport: ${info.loadedRange} (not the worksheet data extent)`)
  }
  if (info.merges && info.merges.length > 0) {
    lines.push(`Merged ranges on the active sheet: ${info.merges.slice(0, 50).join(', ')}`)
  }
  if (info.charts && info.charts.length > 0) {
    lines.push(
      'Charts in the workbook (use the path below with edit_chart to edit an existing chart; use add_chart to create one):',
    )
    for (const chart of info.charts) {
      lines.push(
        `- ${chart.path} | title: ${chart.title || '(none)'} | type: ${chart.types} | sheetId: ${chart.sheetId}`,
      )
    }
  }
  if (info.knownAddresses.length > 0) {
    lines.push(
      `Known non-empty cells (may be incomplete): ${info.knownAddresses.slice(0, 200).join(', ')}`,
    )
  } else {
    lines.push(
      'No known non-empty cell information yet; read on demand with read_range/read_cells.',
    )
  }
  return lines.join('\n')
}

function describeFormatState(format: CellFormatState): string {
  const parts: string[] = []
  if (format.bold) parts.push('bold')
  if (format.italic) parts.push('italic')
  if (format.underline) parts.push('underline')
  if (format.strikethrough) parts.push('strikethrough')
  if (format.fontFamily) parts.push(`font ${format.fontFamily}`)
  if (format.fontSize) parts.push(`size ${format.fontSize}`)
  if (format.fontColor) parts.push(`font color ${format.fontColor}`)
  if (format.fillColor) parts.push(`fill ${format.fillColor}`)
  if (format.numberFormat) parts.push(`number format ${format.numberFormat}`)
  if (format.horizontalAlign) parts.push(`align ${format.horizontalAlign}`)
  if (format.verticalAlign) parts.push(`valign ${format.verticalAlign}`)
  if (format.wrapText) parts.push('wrap')
  if (format.border) {
    parts.push(
      `border ${format.border.type}${format.border.color ? ` ${format.border.color}` : ''}`,
    )
  }
  return parts.join(', ') || '(none)'
}

// Cell text is emitted into tab/newline-delimited tool output (read_range grid,
// read_cells lists, plan summaries), where raw control characters would tear the
// line/column structure apart and scramble the model's view of the grid. Escape
// them : and backslash itself, so the encoding stays unambiguous. Univer streams
// in-cell paragraph breaks as \r (the file model uses \n; see edit-journal's
// dataStream conversion), so CR/CRLF are normalized to \n first: the model sees
// a single line-break representation, and echoing the same `\n` escape inside
// JSON string values of write operations round-trips into real line breaks.
function escapeCellText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '\\n')
}

function formatCellScalar(cell: { value: CellScalar; formula?: string | undefined }): string {
  // Formula cells prefer the value (the AI reasons from computed values, with
  // the formula as provenance); when the value isn't computed yet, give only the
  // formula
  if (cell.formula) {
    return cell.value === null || cell.value === undefined
      ? escapeCellText(cell.formula)
      : `${escapeCellText(String(cell.value))} (${escapeCellText(cell.formula)})`
  }
  if (cell.value === null) return '(empty)'
  return escapeCellText(String(cell.value))
}

function formatPlanSummary(plan: ChangePlan): string {
  const parts: string[] = []
  if (plan.structuralChanges.length > 0) {
    parts.push(plan.structuralChanges.map((change) => change.label).join('; '))
  }
  if (plan.formatChanges.length > 0) {
    parts.push(plan.formatChanges.map((change) => change.label).join('; '))
  }
  if (plan.cellChanges.length > 0) {
    const shown = plan.cellChanges.slice(0, 20)
    const rest = plan.cellChanges.length - shown.length
    parts.push(
      shown
        .map((c) => `${c.address}: ${formatCellScalar(c.before)} → ${formatCellScalar(c.after)}`)
        .join('; ') + (rest > 0 ? `; …${rest} more cells` : ''),
    )
  }
  if (plan.sheetRenames.length > 0) {
    parts.push(plan.sheetRenames.map((r) => `sheet ${r.before} → ${r.after}`).join('; '))
  }
  return parts.join(' | ') || '(no changes)'
}

/** Formula error values (#REF! … #NULL!) */
const ERROR_VALUE_RE = /^#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)$/
/** Hard cap for aggregate_range scans */
const MAX_AGGREGATE_CELLS = 1_000_000
/** Grid cells read per chunk (keeps each facade call small) */
const CHUNK_CELLS = 25_000
/** Total grid cells scanned by find/trace tools before truncating */
const MAX_SCAN_CELLS = 200_000
/** Distinct-value map cap for aggregate_range */
const MAX_DISTINCT = 50_000

/** Split bounds into row chunks of at most maxCells cells each */
function chunkBounds(bounds: RangeBounds, maxCells: number): RangeBounds[] {
  const columns = bounds.endColumn - bounds.startColumn + 1
  const rowsPerChunk = Math.max(1, Math.floor(maxCells / Math.max(1, columns)))
  const out: RangeBounds[] = []
  for (let row = bounds.startRow; row <= bounds.endRow; row += rowsPerChunk) {
    out.push({
      startRow: row,
      startColumn: bounds.startColumn,
      endRow: Math.min(row + rowsPerChunk - 1, bounds.endRow),
      endColumn: bounds.endColumn,
    })
  }
  return out
}

/** Resolve a sheet id (default active) to its ref + known extent */
function resolveSheet(
  deps: SheetsSkillDeps,
  sheetIdInput: unknown,
): { ref: SheetRef; activeId: string } | { bad: string } {
  const info = deps.getActiveSheetInfo()
  const want =
    typeof sheetIdInput === 'string' && sheetIdInput.trim() ? sheetIdInput.trim() : info.sheetId
  const ref = info.sheets.find((sheet) => sheet.id === want)
  if (!ref) return { bad: `Unknown sheet id "${want}"; use get_workbook_context for ids` }
  return { ref, activeId: info.sheetId }
}

/** Lazy workbooks stream the active sheet only; other sheets are unreadable yet */
async function ensureChunkReadable(
  deps: SheetsSkillDeps,
  sheetId: string,
  activeId: string,
  chunk: RangeBounds,
): Promise<boolean> {
  if (sheetId !== activeId || !deps.ensureRangeLoaded) return true
  return (await deps.ensureRangeLoaded(chunk)) !== false
}

/** 'Sheet2'! → Sheet2 (strips quotes/bang from reference qualifiers) */
function stripQualifier(qualifier: string | undefined): string | undefined {
  if (!qualifier) return undefined
  const unquoted = qualifier.endsWith('!') ? qualifier.slice(0, -1) : qualifier
  const dequoted = unquoted.startsWith("'") && unquoted.endsWith("'") ? unquoted.slice(1, -1) : unquoted
  return dequoted.replace(/''/g, "'").trim() || undefined
}

function qualifierSheetId(deps: SheetsSkillDeps, qualifier: string | undefined, sameId: string): string {
  const name = stripQualifier(qualifier)
  if (!name) return sameId
  const hit = deps
    .getActiveSheetInfo()
    .sheets.find((sheet) => sheet.name.toLowerCase() === name.toLowerCase())
  return hit ? hit.id : sameId
}

function sheetNameOf(deps: SheetsSkillDeps, sheetId: string): string {
  return deps.getActiveSheetInfo().sheets.find((sheet) => sheet.id === sheetId)?.name ?? sheetId
}

/** Clamp whole-axis (null) ref bounds to a sheet extent; null when the extent is unknown */
function clampRef(
  token: { startRow: number | null; endRow: number | null; startColumn: number | null; endColumn: number | null },
  rows: number | undefined,
  columns: number | undefined,
): RangeBounds | null {
  const startRow = token.startRow ?? 0
  const endRow = token.endRow ?? (rows !== undefined ? rows - 1 : null)
  const startColumn = token.startColumn ?? 0
  const endColumn = token.endColumn ?? (columns !== undefined ? columns - 1 : null)
  if (endRow === null || endColumn === null) return null
  return { startRow, startColumn, endRow, endColumn }
}

async function aggregateRange(
  call: AgentToolCall,
  deps: SheetsSkillDeps,
): Promise<ToolExecution> {
  const summary = 'Aggregate range'
  const raw = call.input.range
  if (typeof raw !== 'string' || !raw.trim()) return fail(summary, 'range must be a non-empty string')
  let bounds: RangeBounds
  try {
    bounds = parseRange(raw.trim().toUpperCase())
  } catch {
    return fail(summary, `Cannot parse range: ${raw}`)
  }
  if (rangeCellCount(bounds) > MAX_AGGREGATE_CELLS) {
    return fail(summary, `The range contains more than ${MAX_AGGREGATE_CELLS} cells`)
  }
  const sheet = resolveSheet(deps, call.input.sheetId)
  if ('bad' in sheet) return fail(summary, sheet.bad)
  const topValues = Math.min(50, Math.max(1, Math.trunc(Number(call.input.topValues)) || 10))
  let nonEmpty = 0
  let numericCount = 0
  let numericSum = 0
  let numericMin = Infinity
  let numericMax = -Infinity
  const distinct = new Map<string, { count: number; sample: string }>()
  let distinctTruncated = false
  let chunks = 0
  for (const chunk of chunkBounds(bounds, CHUNK_CELLS)) {
    if (!(await ensureChunkReadable(deps, sheet.ref.id, sheet.activeId, chunk))) {
      return fail(summary, 'The range could not be fully loaded; retry after workbook indexing completes.')
    }
    const grid = deps.readSheetGrid(sheet.ref.id, chunk)
    if (!grid) {
      return fail(
        summary,
        'The sheet could not be read (lazy workbooks only serve the active sheet; activate it first).',
      )
    }
    chunks += 1
    for (const row of grid.values) {
      for (const value of row) {
        if (value === null || value === '') continue
        nonEmpty += 1
        const key = `${typeof value}:${String(value)}`
        const slot = distinct.get(key)
        if (slot) slot.count += 1
        else if (distinct.size < MAX_DISTINCT) distinct.set(key, { count: 1, sample: String(value) })
        else distinctTruncated = true
        if (typeof value === 'number' && Number.isFinite(value)) {
          numericCount += 1
          numericSum += value
          if (value < numericMin) numericMin = value
          if (value > numericMax) numericMax = value
        }
      }
    }
  }
  void chunks
  const top = [...distinct.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topValues)
  const lines = [
    `Range ${raw.trim().toUpperCase()} on ${sheetNameOf(deps, sheet.ref.id)}: ${nonEmpty} non-empty cell(s)`,
    `Distinct values: ${distinct.size}${distinctTruncated ? ' (truncated at 50,000)' : ''}`,
  ]
  if (numericCount > 0) {
    lines.push(
      `Numeric: count=${numericCount} sum=${numericSum} avg=${numericSum / numericCount} min=${numericMin} max=${numericMax}`,
    )
  } else {
    lines.push('Numeric: none')
  }
  lines.push(`Top ${top.length} value(s):`)
  for (const [, entry] of top) lines.push(`- ${entry.sample} (×${entry.count})`)
  return { output: lines.join('\n'), mutated: false, summary }
}

async function findCells(call: AgentToolCall, deps: SheetsSkillDeps): Promise<ToolExecution> {
  const summary = 'Find cells'
  const errorsOnly = call.input.errors_only === true
  const query = String(call.input.query ?? '')
  if (!errorsOnly && !query.trim()) {
    return fail(summary, 'query must not be empty (omit it only with errors_only=true)')
  }
  const useRegex = call.input.regex === true
  let pattern: RegExp | null = null
  if (!errorsOnly && useRegex) {
    try {
      pattern = new RegExp(query, 'i')
    } catch {
      return fail(summary, `Invalid regex: ${query}`)
    }
  }
  const lowered = query.toLowerCase()
  const lookIn = String(call.input.look_in ?? 'both')
  if (lookIn !== 'values' && lookIn !== 'formulas' && lookIn !== 'both') {
    return fail(summary, 'look_in must be "values", "formulas", or "both"')
  }
  const maxResults = Math.min(200, Math.max(1, Math.trunc(Number(call.input.max_results)) || 50))
  const info = deps.getActiveSheetInfo()
  const only = typeof call.input.sheetId === 'string' && call.input.sheetId.trim() ? call.input.sheetId.trim() : undefined
  const targets = only
    ? info.sheets.filter((sheet) => sheet.id === only)
    : info.sheets
  if (only && targets.length === 0) {
    return fail(summary, `Unknown sheet id "${only}"; use get_workbook_context for ids`)
  }
  const hits: string[] = []
  let scanned = 0
  let truncated = false
  const skipped: string[] = []
  for (const sheet of targets) {
    if (hits.length >= maxResults) break
    if (sheet.rows === undefined || sheet.columns === undefined) {
      skipped.push(sheet.name)
      continue
    }
    const bounds: RangeBounds = { startRow: 0, startColumn: 0, endRow: sheet.rows - 1, endColumn: sheet.columns - 1 }
    for (const chunk of chunkBounds(bounds, CHUNK_CELLS)) {
      if (scanned >= MAX_SCAN_CELLS) {
        truncated = true
        break
      }
      if (!(await ensureChunkReadable(deps, sheet.id, info.sheetId, chunk))) continue
      const grid = deps.readSheetGrid(sheet.id, chunk)
      if (!grid) continue
      for (let r = 0; r < grid.values.length && hits.length < maxResults; r += 1) {
        const row = grid.values[r]!
        const frow = grid.formulas[r] ?? []
        for (let c = 0; c < row.length && hits.length < maxResults; c += 1) {
          scanned += 1
          const value = row[c]
          const formula = frow[c]
          const valueText = value === null ? '' : String(value)
          let matched = false
          let shown = valueText
          if (errorsOnly) {
            matched = ERROR_VALUE_RE.test(valueText)
          } else {
            const inValues = lookIn !== 'formulas' && (pattern ? pattern.test(valueText) : valueText.toLowerCase().includes(lowered))
            const inFormulas =
              lookIn !== 'values' && formula && (pattern ? pattern.test(formula) : formula.toLowerCase().includes(lowered))
            matched = inValues || !!inFormulas
            if (inFormulas && !inValues) shown = `${valueText} (${formula})`
            else if (formula) shown = `${valueText} (${formula})`
          }
          if (matched) {
            hits.push(`${sheet.name}!${formatAddress(chunk.startRow + r, chunk.startColumn + c)}: ${shown || '(empty)'}`)
          }
        }
      }
    }
    if (truncated) break
  }
  const notes: string[] = []
  if (skipped.length > 0) notes.push(`skipped sheets with unknown extent: ${skipped.join(', ')}`)
  if (truncated) notes.push(`scan truncated at ${MAX_SCAN_CELLS} cells`)
  const head = hits.length > 0 ? hits.join('\n') : '(no matches)'
  return {
    output: [head, ...notes.map((note) => `Note: ${note}`)].join('\n'),
    mutated: false,
    summary,
  }
}

async function tracePrecedents(call: AgentToolCall, deps: SheetsSkillDeps): Promise<ToolExecution> {
  const summary = 'Trace precedents'
  const raw = call.input.address
  if (typeof raw !== 'string' || !raw.trim()) return fail(summary, 'address must be a non-empty string')
  let target: { row: number; column: number }
  try {
    target = parseAddress(raw.trim().toUpperCase())
  } catch {
    return fail(summary, `Cannot parse address: ${raw}`)
  }
  const sheet = resolveSheet(deps, call.input.sheetId)
  if ('bad' in sheet) return fail(summary, sheet.bad)
  const cell = deps.readSheetGrid(sheet.ref.id, {
    startRow: target.row,
    startColumn: target.column,
    endRow: target.row,
    endColumn: target.column,
  })
  const formula = cell?.formulas[0]?.[0]
  if (!formula) {
    return {
      output: `${sheetNameOf(deps, sheet.ref.id)}!${raw.trim().toUpperCase()} is not a formula cell`,
      mutated: false,
      summary,
    }
  }
  const refs = parseFormulaReferences(formula)
  if (refs.length === 0) {
    return { output: `No cell references found in ${formula}`, mutated: false, summary }
  }
  const lines = [`${sheetNameOf(deps, sheet.ref.id)}!${raw.trim().toUpperCase()} = ${formula}`]
  for (const ref of refs) {
    const refSheetId = qualifierSheetId(deps, ref.qualifier, sheet.ref.id)
    const refSheet = deps.getActiveSheetInfo().sheets.find((s) => s.id === refSheetId)
    const bounds = clampRef(ref.token, refSheet?.rows, refSheet?.columns)
    if (!bounds) {
      lines.push(`- ${ref.qualifier ?? ''}${formatAddress(ref.token.startRow ?? 0, ref.token.startColumn ?? 0)}: sheet extent unknown, skipped`)
      continue
    }
    const count = (bounds.endRow - bounds.startRow + 1) * (bounds.endColumn - bounds.startColumn + 1)
    if (count > CHUNK_CELLS) {
      lines.push(
        `- ${sheetNameOf(deps, refSheetId)}!${formatAddress(bounds.startRow, bounds.startColumn)}:${formatAddress(bounds.endRow, bounds.endColumn)}: ${count} cells (too large; narrow it down)`,
      )
      continue
    }
    if (!(await ensureChunkReadable(deps, refSheetId, sheet.activeId, bounds))) {
      lines.push(`- range unreadable (still loading); retry shortly`)
      continue
    }
    const grid = deps.readSheetGrid(refSheetId, bounds)
    if (!grid) {
      lines.push(`- range unreadable (activate the sheet first)`)
      continue
    }
    const shown: string[] = []
    let errors = 0
    for (let r = 0; r < grid.values.length && shown.length < 10; r += 1) {
      for (let c = 0; c < (grid.values[r] ?? []).length && shown.length < 10; c += 1) {
        const value = grid.values[r]![c]
        const text = value === null ? '(empty)' : String(value)
        if (ERROR_VALUE_RE.test(text)) errors += 1
        shown.push(`${formatAddress(bounds.startRow + r, bounds.startColumn + c)}=${text}`)
      }
    }
    const rangeName =
      `${sheetNameOf(deps, refSheetId)}!${formatAddress(bounds.startRow, bounds.startColumn)}` +
      (count > 1 ? `:${formatAddress(bounds.endRow, bounds.endColumn)}` : '')
    lines.push(`- ${rangeName}: ${shown.join(', ')}${count > shown.length ? ` (…${count - shown.length} more)` : ''}${errors > 0 ? ` ⚠️ ${errors} error value(s)` : ''}`)
  }
  return { output: lines.join('\n'), mutated: false, summary }
}

async function traceDependents(call: AgentToolCall, deps: SheetsSkillDeps): Promise<ToolExecution> {
  const summary = 'Trace dependents'
  const raw = call.input.address
  if (typeof raw !== 'string' || !raw.trim()) return fail(summary, 'address must be a non-empty string')
  let target: { row: number; column: number }
  try {
    target = parseAddress(raw.trim().toUpperCase())
  } catch {
    return fail(summary, `Cannot parse address: ${raw}`)
  }
  const sheet = resolveSheet(deps, call.input.sheetId)
  if ('bad' in sheet) return fail(summary, sheet.bad)
  const info = deps.getActiveSheetInfo()
  const hits: string[] = []
  let scanned = 0
  let truncated = false
  for (const entry of info.sheets) {
    if (hits.length >= 100 || entry.rows === undefined || entry.columns === undefined) continue
    const bounds: RangeBounds = { startRow: 0, startColumn: 0, endRow: entry.rows - 1, endColumn: entry.columns - 1 }
    for (const chunk of chunkBounds(bounds, CHUNK_CELLS)) {
      if (scanned >= MAX_SCAN_CELLS) {
        truncated = true
        break
      }
      if (!(await ensureChunkReadable(deps, entry.id, info.sheetId, chunk))) continue
      const grid = deps.readSheetGrid(entry.id, chunk)
      if (!grid) continue
      for (let r = 0; r < (grid.formulas.length ?? 0) && hits.length < 100; r += 1) {
        const frow = grid.formulas[r] ?? []
        for (let c = 0; c < frow.length && hits.length < 100; c += 1) {
          const formula = frow[c]
          scanned += 1
          if (!formula) continue
          let depends = false
          for (const ref of parseFormulaReferences(formula)) {
            const refSheetId = qualifierSheetId(deps, ref.qualifier, entry.id)
            if (refSheetId !== sheet.ref.id) continue
            const clamped = clampRef(ref.token, sheet.ref.rows, sheet.ref.columns)
            if (!clamped) continue
            if (
              target.row >= clamped.startRow && target.row <= clamped.endRow &&
              target.column >= clamped.startColumn && target.column <= clamped.endColumn
            ) {
              depends = true
              break
            }
          }
          if (depends) {
            const value = grid.values[r]?.[c]
            hits.push(
              `${entry.name}!${formatAddress(chunk.startRow + r, chunk.startColumn + c)} ${formula} (=${value === null || value === undefined ? '(empty)' : String(value)})`,
            )
          }
        }
      }
    }
    if (truncated) break
  }
  const head =
    hits.length > 0
      ? hits.join('\n')
      : `(no dependents found; dependents reaching the cell only through a defined name are not detected)${truncated ? ` — scan truncated at ${MAX_SCAN_CELLS} cells` : ''}`
  return { output: head, mutated: false, summary }
}

/** Max grid cells serialized for an xlsx/csv export */
const MAX_EXPORT_CELLS = 500_000

async function createDocument(call: AgentToolCall, deps: SheetsSkillDeps): Promise<ToolExecution> {
  const summary = 'Create document'
  const type = String(call.input.type ?? 'xlsx')
  if (type !== 'xlsx' && type !== 'csv' && type !== 'md' && type !== 'html') {
    return fail(summary, 'type must be one of "xlsx", "csv", "md", "html"')
  }
  if (type === 'xlsx' || type === 'csv') {
    const sheet = resolveSheet(deps, call.input.sheetId)
    if ('bad' in sheet) return fail(summary, sheet.bad)
    if (sheet.ref.rows === undefined || sheet.ref.columns === undefined) {
      return fail(summary, `Sheet "${sheet.ref.name}" has no known data extent yet; read it first.`)
    }
    const bounds: RangeBounds = {
      startRow: 0,
      startColumn: 0,
      endRow: sheet.ref.rows - 1,
      endColumn: sheet.ref.columns - 1,
    }
    if (rangeCellCount(bounds) > MAX_EXPORT_CELLS) {
      return fail(summary, 'The worksheet is too large to export as a standalone file.')
    }
    const rows: CellScalar[][] = []
    for (const chunk of chunkBounds(bounds, CHUNK_CELLS)) {
      if (!(await ensureChunkReadable(deps, sheet.ref.id, sheet.activeId, chunk))) {
        return fail(summary, 'The sheet could not be fully loaded; retry after indexing completes.')
      }
      const grid = deps.readSheetGrid(sheet.ref.id, chunk)
      if (!grid) {
        return fail(summary, 'The sheet could not be read (activate it first in lazy workbooks).')
      }
      rows.push(...grid.values)
    }
    const title = String(call.input.title ?? sheet.ref.name)
    const result = await deps.createDocument({ type, title, rows, sheetName: sheet.ref.name })
    if (!result.ok) return fail(summary, result.error)
    return {
      output: `Created ${result.name} (${result.path}); the current workbook is unchanged`,
      mutated: false,
      summary,
    }
  }
  const content = String(call.input.content ?? '')
  if (!content.trim()) return fail(summary, 'content must not be empty')
  if (content.length > 2_000_000) return fail(summary, 'content is too large (2MB limit)')
  const title = String(call.input.title ?? 'Untitled')
  const result = await deps.createDocument({ type, title, content })
  if (!result.ok) return fail(summary, result.error)
  return {
    output: `Created ${result.name} (${result.path}); the current workbook is unchanged`,
    mutated: false,
    summary,
  }
}

export function executeWorkbookTool(
  call: AgentToolCall,
  deps: SheetsSkillDeps,
): ToolExecution | Promise<ToolExecution> {
  switch (call.name) {
    case 'get_workbook_context':
      return {
        output: buildWorkbookContext(deps),
        mutated: false,
        summary: t('aiToolWorkbookContext'),
      }

    case 'read_range': {
      const raw = call.input.range
      if (typeof raw !== 'string' || !raw.trim())
        return fail(t('aiToolReadRange'), 'range must be a non-empty string')
      let bounds
      try {
        bounds = parseRange(raw.trim().toUpperCase())
      } catch {
        return fail(t('aiToolReadRange'), `Cannot parse range: ${raw}`)
      }
      if (rangeCellCount(bounds) > MAX_READ_RANGE_CELLS) {
        return fail(
          t('aiToolReadRange'),
          `The range contains more than ${MAX_READ_RANGE_CELLS} cells; read it in multiple calls`,
        )
      }
      const info = deps.getActiveSheetInfo()
      const active = info.sheets.find((sheet) => sheet.id === info.sheetId)
      if (
        active?.rows !== undefined &&
        active.columns !== undefined &&
        (bounds.endRow >= active.rows || bounds.endColumn >= active.columns)
      ) {
        return fail(
          t('aiToolReadRange'),
          `The requested range is outside the worksheet data extent A1:${columnLabel(active.columns - 1)}${active.rows}.`,
        )
      }
      const executeRead = (): ToolExecution => {
        const normalizedRange = `${formatAddress(bounds.startRow, bounds.startColumn)}:${formatAddress(bounds.endRow, bounds.endColumn)}`
        const metadata =
          active?.rows && active.columns
            ? `Read metadata: requested range ${normalizedRange}; authoritative worksheet data extent A1:${columnLabel(active.columns - 1)}${active.rows} (${active.rows} worksheet rows including any header). Do not infer total rows or records from the requested range.`
            : `Read metadata: requested range ${normalizedRange}; worksheet data extent is unknown. Do not infer total rows or records from the requested range.`
        const addresses: string[] = []
        for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
          for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
            addresses.push(formatAddress(row, column))
          }
        }
        const cells = deps.readCells(addresses)
        const header = [
          '',
          ...Array.from({ length: bounds.endColumn - bounds.startColumn + 1 }, (_, offset) =>
            columnLabel(bounds.startColumn + offset),
          ),
        ].join('\t')
        const rows: string[] = [metadata, header]
        for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
          const columns: string[] = [String(row + 1)]
          for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
            const cell = cells[formatAddress(row, column)]
            columns.push(
              cell
                ? cell.value === null
                  ? escapeCellText(cell.formula ?? '')
                  : formatCellScalar(cell)
                : '',
            )
          }
          rows.push(columns.join('\t'))
        }
        return {
          output: rows.join('\n'),
          mutated: false,
          summary: t('aiToolReadRangeOf', { range: raw.trim().toUpperCase() }),
        }
      }
      const loading = deps.ensureRangeLoaded?.(bounds)
      if (loading instanceof Promise) {
        return loading.then((loaded) =>
          loaded
            ? executeRead()
            : fail(
                t('aiToolReadRange'),
                'The requested range could not be fully loaded; retry after workbook indexing completes.',
              ),
        )
      }
      if (loading === false) {
        return fail(
          t('aiToolReadRange'),
          'The requested range could not be fully loaded; retry after workbook indexing completes.',
        )
      }
      return executeRead()
    }

    case 'load_guide': {
      const raw = call.input.guides
      if (!Array.isArray(raw) || raw.length === 0)
        return fail(t('aiToolLoadGuide'), 'guides must be a non-empty array')
      const outcome = loadGuides(raw.map(String))
      if (!outcome.ok) return fail(t('aiToolLoadGuide'), outcome.error)
      return {
        output: outcome.content,
        mutated: false,
        summary: t('aiToolLoadGuideOf', { names: raw.join(', ') }),
      }
    }

    case 'read_formats': {
      const raw = call.input.range
      if (typeof raw !== 'string' || !raw.trim())
        return fail(t('aiToolReadFormats'), 'range must be a non-empty string')
      let bounds
      try {
        bounds = parseRange(raw.trim().toUpperCase())
      } catch {
        return fail(t('aiToolReadFormats'), `Cannot parse range: ${raw}`)
      }
      if (rangeCellCount(bounds) > MAX_READ_FORMAT_CELLS) {
        return fail(
          t('aiToolReadFormats'),
          `The range contains more than ${MAX_READ_FORMAT_CELLS} cells; read it in multiple calls`,
        )
      }
      const addresses: string[] = []
      for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
        for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
          addresses.push(formatAddress(row, column))
        }
      }
      const formats = deps.readFormats(addresses)
      const lines = Object.entries(formats).map(
        ([address, format]) => `${address}: ${describeFormatState(format)}`,
      )
      return {
        output: lines.length > 0 ? lines.join('\n') : 'No explicit formats in this range.',
        mutated: false,
        summary: t('aiToolReadFormatsOf', { range: raw.trim().toUpperCase() }),
      }
    }

    case 'read_sheet_features': {
      const raw = call.input.sheetId
      const sheetId = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
      return {
        output: deps.readSheetFeatures(sheetId),
        mutated: false,
        summary: t('aiToolSheetFeatures'),
      }
    }

    case 'read_cells': {
      const raw = call.input.addresses
      if (!Array.isArray(raw) || raw.length === 0)
        return fail(t('aiToolReadCells'), 'addresses must be a non-empty array')
      const addresses = raw.slice(0, MAX_READ_ADDRESSES).map(String)
      const cells = deps.readCells(addresses)
      const lines = addresses.map((addr) => {
        const cell = cells[addr]
        return `${addr}: ${cell ? formatCellScalar(cell) : '(unknown)'}`
      })
      return {
        output: lines.join('\n'),
        mutated: false,
        summary: t('aiToolReadCellsCount', { count: addresses.length }),
      }
    }

    case 'aggregate_range':
      return aggregateRange(call, deps)

    case 'find_cells':
      return findCells(call, deps)

    case 'select_range': {
      const raw = call.input.range
      if (typeof raw !== 'string' || !raw.trim()) return fail('Select range', 'range must be a non-empty string')
      let normalized: string
      try {
        const bounds = parseRange(raw.trim().toUpperCase())
        normalized = `${formatAddress(bounds.startRow, bounds.startColumn)}:${formatAddress(bounds.endRow, bounds.endColumn)}`
      } catch {
        return fail('Select range', `Cannot parse range: ${raw}`)
      }
      const sheetId = typeof call.input.sheetId === 'string' && call.input.sheetId.trim() ? call.input.sheetId.trim() : undefined
      const problem = deps.goToRange(normalized, sheetId)
      if (problem) return fail('Select range', problem)
      return { output: `Selected ${normalized}`, mutated: false, summary: 'Select range' }
    }

    case 'trace_precedents':
      return tracePrecedents(call, deps)

    case 'trace_dependents':
      return traceDependents(call, deps)

    case 'create_document':
      return createDocument(call, deps)

    case 'propose_operations': {
      const rawOps = call.input.operations
      const summaryInput = call.input.summary
      if (!Array.isArray(rawOps) || rawOps.length === 0) {
        return fail(t('aiToolPropose'), 'operations must be a non-empty array')
      }
      if (typeof summaryInput !== 'string' || !summaryInput.trim()) {
        return fail(t('aiToolPropose'), 'summary must not be empty')
      }
      let operations: WorkbookOperation[]
      try {
        operations = z.array(workbookOperationSchema).parse(rawOps)
      } catch (e) {
        return fail(t('aiToolPropose'), e instanceof Error ? e.message : 'Invalid operation format')
      }
      const outcome = deps.proposeOperations(operations, summaryInput.trim())
      if (!outcome.ok) return fail(t('aiToolPropose'), outcome.error)
      const summary = summaryInput.trim()
      const finish = (): ToolExecution | Promise<ToolExecution> => {
        const warnings =
          outcome.plan.warnings.length > 0 ? `\nNote: ${outcome.plan.warnings.join('; ')}` : ''
        const opCount =
          outcome.plan.cellChanges.length +
          outcome.plan.formatChanges.length +
          outcome.plan.sheetRenames.length +
          outcome.plan.structuralChanges.length
        const base = `Auto-applied ${opCount} change(s) (undo via the side panel [Undo] button or ⌘Z): ${formatPlanSummary(outcome.plan)}${warnings}`
        // Read-back after write (write → verify): formula cells fetch their
        // computed values after the async recalc, so the AI sees real results and
        // errors like #REF!/#DIV/0! instead of just what it wrote.
        const formulaAddrs = outcome.plan.cellChanges
          .filter((c) => c.after.formula)
          .map((c) => c.address)
        if (formulaAddrs.length === 0) {
          return { output: base, mutated: true, summary }
        }
        return (async (): Promise<ToolExecution> => {
          await new Promise((resolve) => setTimeout(resolve, FORMULA_RECALC_DELAY_MS))
          const shown = formulaAddrs.slice(0, MAX_READBACK_FORMULAS)
          const cells = deps.readCells(shown)
          const lines = shown.map((addr) => {
            const v = cells[addr]?.value
            return `${addr} = ${v === null || v === undefined ? '(still computing; verify with read_cells)' : String(v)}`
          })
          const rest = formulaAddrs.length - shown.length
          const hasError = lines.some((l) =>
            /#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)/.test(l),
          )
          return {
            output:
              `${base}\nFormula results: ${lines.join('; ')}${rest > 0 ? `; …${rest} more formula cells` : ''}` +
              (hasError
                ? '\n⚠️ Formula error values present : check references/divisors and fix them.'
                : ''),
            mutated: true,
            summary,
          }
        })()
      }
      if (!outcome.applied) return finish()
      return outcome.applied.then((applied) =>
        applied.ok
          ? finish()
          : fail(
              t('aiToolPropose'),
              `Apply failed : the workbook is UNCHANGED: ${applied.reason ?? 'unknown reason'}. ` +
                'Do not tell the user the changes were made; adjust the operations and retry, or explain the failure.',
            ),
      )
    }

    default:
      return fail(call.name, `Unknown tool: ${call.name}`)
  }
}
