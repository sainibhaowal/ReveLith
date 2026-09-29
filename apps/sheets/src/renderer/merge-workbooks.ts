import type { CellScalar } from '@revelith/xlsx-gateway/domain/workbook.types'

/** Minimal merge-source shape (a subset of WorkbookFile) */
export interface MergeSourceFile {
  readonly sessionId: string
  readonly name: string
  readonly sheets: readonly MergeSourceSheet[]
}

export interface MergeSourceSheet {
  readonly id: string
  readonly name: string
  readonly rowCount: number
  readonly columnCount: number
}

/// Stay under the IPC schema's MAX_RANGE_CELLS (100k) with headroom.
const READ_CHUNK_CELLS = 90_000
/** set_range value grids cap at 500 rows (DSL schema); columns cap at 100 */
const _WRITE_CHUNK_ROWS = 500
const WRITE_CHUNK_COLS = 100
/** Total imported cells per merge call before stopping with a note */
const MAX_IMPORT_CELLS = 500_000

/** Excel's sheet-name cap; over-long names would pass the grid but fail the save. */
const SHEET_NAME_MAX = 31

/**
 * "Name" → "Name (2)" → "Name (3)" against the taken set (case-insensitive like
 * Excel). Suffixed candidates stay within the cap by trimming the base.
 */
export function dedupeSheetName(name: string, taken: ReadonlySet<string>): string {
  const lower = new Set([...taken].map((entry) => entry.toLowerCase()))
  if (!lower.has(name.toLowerCase())) return name
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`
    const base = name.slice(0, SHEET_NAME_MAX - suffix.length).replace(/[\s']+$/, '')
    const candidate = `${base}${suffix}`
    if (!lower.has(candidate.toLowerCase())) return candidate
  }
}

/** Rows per read chunk so rows × columns stays under the IPC cell cap */
export function chunkRowsFor(columnCount: number): number {
  return Math.max(1, Math.floor(READ_CHUNK_CELLS / Math.max(1, columnCount)))
}

/** A string starting with "=" would become a formula on write; keep source values literal */
function literalCell(value: CellScalar): CellScalar {
  return typeof value === 'string' && value.startsWith('=') ? `'${value}` : value
}

export interface MergeRunnerDeps {
  /** Current workbook sheet names (for dedupe) */
  existingNames(): string[]
  /** Sparse cell records for one source range */
  readSourceRange(
    sessionId: string,
    sheetId: string,
    range: { startRow: number; endRow: number; startColumn: number; endColumn: number },
  ): Promise<Array<{ row: number; column: number; value: CellScalar }>>
  /** Journaled sheet add + value writes (the normal propose path) */
  propose(
    operations: Record<string, unknown>[],
    summary: string,
  ):
    | { ok: true }
    | { ok: false; error: string }
    | Promise<{ ok: true } | { ok: false; error: string }>
  /** Sheet id for a name present in the current workbook (after add_sheet applies) */
  resolveSheetId(name: string): string | null
  closeSession(sessionId: string): Promise<void>
}

export interface MergedSheet {
  readonly file: string
  readonly sheet: string
  readonly as: string
  readonly cells: number
}

/**
 * Import every sheet of the given source files into the current workbook:
 * add_sheet first (its own structural batch), then set_range value batches.
 * Formulas arrive as their cached computed values (source references would
 * point at sheets that don't exist here). Sessions close when done.
 */
export async function mergeSources(
  deps: MergeRunnerDeps,
  files: readonly MergeSourceFile[],
): Promise<{ imported: MergedSheet[]; skipped: string[]; cells: number }> {
  const taken = new Set(deps.existingNames().map((name) => name.toLowerCase()))
  const imported: MergedSheet[] = []
  const skipped: string[] = []
  let cells = 0
  for (const file of files) {
    for (const sheet of file.sheets) {
      if (cells >= MAX_IMPORT_CELLS) {
        skipped.push(`${file.name} / ${sheet.name} (import budget reached)`)
        continue
      }
      if (sheet.rowCount <= 0 || sheet.columnCount <= 0) {
        skipped.push(`${file.name} / ${sheet.name} (empty)`)
        continue
      }
      const as = dedupeSheetName(sheet.name, taken)
      taken.add(as.toLowerCase())
      const added = await deps.propose(
        [{ op: 'add_sheet', name: as }],
        `Import ${file.name} / ${sheet.name}`,
      )
      if (!added.ok) {
        skipped.push(`${file.name} / ${sheet.name} (${added.error})`)
        continue
      }
      const targetId = deps.resolveSheetId(as)
      if (!targetId) {
        skipped.push(`${file.name} / ${sheet.name} (new sheet not found after add)`)
        continue
      }
      let sheetCells = 0
      let failed: string | null = null
      const rowsPerChunk = chunkRowsFor(sheet.columnCount)
      for (let startRow = 0; startRow < sheet.rowCount && !failed; startRow += rowsPerChunk) {
        const endRow = Math.min(startRow + rowsPerChunk - 1, sheet.rowCount - 1)
        let records: Array<{ row: number; column: number; value: CellScalar }>
        try {
          records = await deps.readSourceRange(file.sessionId, sheet.id, {
            startRow,
            endRow,
            startColumn: 0,
            endColumn: sheet.columnCount - 1,
          })
        } catch (error) {
          failed = error instanceof Error ? error.message : String(error)
          break
        }
        // Fold sparse records into dense row blocks (≤500×100 per set_range)
        const byRow = new Map<number, Map<number, CellScalar>>()
        for (const record of records) {
          let row = byRow.get(record.row)
          if (!row) {
            row = new Map()
            byRow.set(record.row, row)
          }
          row.set(record.column, literalCell(record.value))
        }
        for (const [row, cols] of [...byRow].sort((a, b) => a[0] - b[0])) {
          const sorted = [...cols].sort((a, b) => a[0] - b[0])
          for (let c = 0; c < sorted.length && !failed; c += WRITE_CHUNK_COLS) {
            const slice = sorted.slice(c, c + WRITE_CHUNK_COLS)
            const startColumn = slice[0]![0]
            const values = [slice.map(([, value]) => value)]
            const written = await deps.propose(
              [
                {
                  op: 'set_range',
                  sheetId: targetId,
                  start: `${columnLabel(startColumn)}${row + 1}`,
                  values,
                },
              ],
              `Import ${file.name} / ${sheet.name} rows ${row + 1}`,
            )
            if (!written.ok) {
              failed = written.error
              break
            }
            sheetCells += slice.length
            cells += slice.length
            if (cells >= MAX_IMPORT_CELLS) break
          }
        }
      }
      if (failed) skipped.push(`${file.name} / ${sheet.name} (partial: ${failed})`)
      else imported.push({ file: file.name, sheet: sheet.name, as, cells: sheetCells })
    }
    try {
      await deps.closeSession(file.sessionId)
    } catch {
      /* best-effort */
    }
  }
  return { imported, skipped, cells }
}

function columnLabel(column: number): string {
  let label = ''
  let remaining = column + 1
  while (remaining > 0) {
    remaining -= 1
    label = String.fromCharCode(65 + (remaining % 26)) + label
    remaining = Math.floor(remaining / 26)
  }
  return label
}
