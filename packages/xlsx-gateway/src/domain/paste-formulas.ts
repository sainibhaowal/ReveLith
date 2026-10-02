import { columnIndex, columnLabel } from './cell-address'

/**
 * Vectorized R1C1-style formula translation for copy/cut/paste.
 *
 * Unlike formula-shift.ts (structural inserts/deletes, where `$` does NOT pin),
 * pasting honors absolute locks: only relative row/column parts shift by the
 * paste delta, `$`-locked parts stay. One regex pass per formula — no AST
 * re-parse per cell — so translating a million-cell block is a flat,
 * allocation-light loop over strings.
 *
 * Handled: plain refs (B2), absolute markers ($B$2, B$2, $B2), ranges
 * (B2:D4), whole-column (B:D) and whole-row (3:5) refs, sheet prefixes
 * (Sheet1!B2, 'My Sheet'!B2 — coordinates shift only when the prefix names
 * the source sheet; other sheets are untouched), quoted string literals
 * (skipped), function names (LOG10 etc. protected by boundary checks).
 * References shifted off-sheet become #REF! (Excel parity).
 */

export const PASTE_MAX_COL = 16383 // XFD
export const PASTE_MAX_ROW = 1048575 // 1048576

export interface PasteDelta {
  /** target row - source row (0-based), may be negative */
  readonly dRow: number
  /** target col - source col (0-based), may be negative */
  readonly dCol: number
}

export interface PasteTranslateOptions {
  /** sheet the formulas were copied from; explicit prefixes to it shift coordinates (prefix text preserved) */
  readonly sourceSheet?: string
  readonly maxCol?: number
  readonly maxRow?: number
}

export interface PasteTranslateResult {
  readonly formula: string
  readonly changed: boolean
  readonly hasRefError: boolean
}

// Boundaries mirror formula-shift.ts REF_RE: not preceded by name chars (protects
// LOG10, defined names) and not followed by a letter/digit/( (protects ABC1DEF,
// function calls). Whole-column/whole-row alternatives come first so B:D and
// 3:5 win over partial cell matches.
const PASTE_REF_RE =
  /(?<![A-Za-z0-9_.$!])(?:(?:'([^']+)'|([A-Za-z0-9_.]+))!)?(?:(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})(?![A-Za-z0-9(:])|(\$?)([0-9]{1,7}):(\$?)([0-9]{1,7})(?![A-Za-z0-9(:])|(\$?)([A-Z]{1,3})(\$?)([0-9]{1,7})(?::(\$?)([A-Z]{1,3})(\$?)([0-9]{1,7}))?(?![A-Za-z0-9(]))/g

function shiftIndex(index: number, delta: number, max: number): number | null {
  const next = index + delta
  return next < 0 || next > max ? null : next
}

export function translatePastedFormula(
  formula: string,
  delta: PasteDelta,
  options: PasteTranslateOptions = {},
): PasteTranslateResult {
  const { sourceSheet, maxCol = PASTE_MAX_COL, maxRow = PASTE_MAX_ROW } = options
  let changed = false
  let hasRefError = false

  // Split on string literals so refs inside "..." are never rewritten.
  const segments = formula.split(/("(?:[^"]|"")*")/)
  const rewritten = segments.map((segment, index) => {
    if (index % 2 === 1) return segment
    return segment.replace(
      PASTE_REF_RE,
      (
        match: string,
        quoted?: string,
        bare?: string,
        wcAbsA?: string,
        wcA?: string,
        wcAbsB?: string,
        wcB?: string,
        wrAbsA?: string,
        wrA?: string,
        wrAbsB?: string,
        wrB?: string,
        cAbsA?: string,
        cA?: string,
        rAbsA?: string,
        rA?: string,
        cAbsB?: string,
        cB?: string,
        rAbsB?: string,
        rB?: string,
      ) => {
        const prefixSheet = quoted ?? bare
        const applies = prefixSheet === undefined || prefixSheet === sourceSheet
        if (!applies) return match
        const prefix =
          prefixSheet === undefined ? '' : `${quoted !== undefined ? `'${quoted}'` : bare}!`

        // Whole-column B:D
        if (wcA !== undefined && wcB !== undefined) {
          const a = columnIndex(wcA)
          const b = columnIndex(wcB)
          const na = wcAbsA ? a : shiftIndex(a, delta.dCol, maxCol)
          const nb = wcAbsB ? b : shiftIndex(b, delta.dCol, maxCol)
          if (na === null || nb === null) {
            changed = true
            hasRefError = true
            return `${prefix}#REF!`
          }
          const next = `${prefix}${wcAbsA}${columnLabel(na)}:${wcAbsB}${columnLabel(nb)}`
          if (next !== match) changed = true
          return next
        }
        // Whole-row 3:5
        if (wrA !== undefined && wrB !== undefined) {
          const a = Number(wrA) - 1
          const b = Number(wrB) - 1
          const na = wrAbsA ? a : shiftIndex(a, delta.dRow, maxRow)
          const nb = wrAbsB ? b : shiftIndex(b, delta.dRow, maxRow)
          if (na === null || nb === null) {
            changed = true
            hasRefError = true
            return `${prefix}#REF!`
          }
          const next = `${prefix}${wrAbsA}${na + 1}:${wrAbsB}${nb + 1}`
          if (next !== match) changed = true
          return next
        }
        // Cell or range
        if (cA === undefined || rA === undefined) return match
        const shiftPart = (
          colAbs: string | undefined,
          col: string,
          rowAbs: string | undefined,
          row: string,
        ): string | null => {
          const c = columnIndex(col)
          const r = Number(row) - 1
          const nc = colAbs ? c : shiftIndex(c, delta.dCol, maxCol)
          const nr = rowAbs ? r : shiftIndex(r, delta.dRow, maxRow)
          if (nc === null || nr === null) return null
          return `${colAbs ?? ''}${columnLabel(nc)}${rowAbs ?? ''}${nr + 1}`
        }
        const first = shiftPart(cAbsA, cA, rAbsA, rA)
        if (cB === undefined || rB === undefined) {
          if (first === null) {
            changed = true
            hasRefError = true
            return `${prefix}#REF!`
          }
          const next = `${prefix}${first}`
          if (next !== match) changed = true
          return next
        }
        const second = shiftPart(cAbsB, cB, rAbsB, rB)
        if (first === null || second === null) {
          changed = true
          hasRefError = true
          return `${prefix}#REF!`
        }
        const next = `${prefix}${first}:${second}`
        if (next !== match) changed = true
        return next
      },
    )
  })

  return { formula: rewritten.join(''), changed, hasRefError }
}

/**
 * Translate a flat block of formulas (row-major) by one delta: single pass
 * per formula, one output array. Returns the translated block plus counts.
 */
export function translatePastedRange(
  formulas: readonly string[],
  delta: PasteDelta,
  options: PasteTranslateOptions = {},
): { formulas: string[]; changedCount: number; refErrorCount: number } {
  const out = new Array<string>(formulas.length)
  let changedCount = 0
  let refErrorCount = 0
  for (let i = 0; i < formulas.length; i++) {
    const r = translatePastedFormula(formulas[i]!, delta, options)
    out[i] = r.formula
    if (r.changed) changedCount++
    if (r.hasRefError) refErrorCount++
  }
  return { formulas: out, changedCount, refErrorCount }
}

/** Count TSV payload cells (rows × max columns) for the paste size guard. */
export function estimatePasteCells(tsvText: string): number {
  const rows = tsvText.split(/\r\n|\r|\n/)
  // drop the trailing empty line a clipboard payload usually ends with
  while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop()
  if (rows.length === 0) return 0
  let cols = 0
  for (const row of rows) {
    const n = row.split('\t').length
    if (n > cols) cols = n
  }
  return rows.length * cols
}
