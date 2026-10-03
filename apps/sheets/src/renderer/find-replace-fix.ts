import { SheetsFindReplaceController } from '@univerjs/preset-sheets-find-replace'
import type { IRange } from '@univerjs/core'
import type { UniverRuntime } from './univer-state'

/**
 * Bounds the find/replace search scope to the populated data range
 * of the worksheet instead of scanning the full grid bounds (e.g. 1M rows x 16k cols),
 * which eliminates freezes when searching on large sheets.
 */
export function installFindReplaceGridFix(_runtime?: UniverRuntime): { dispose(): void } {
  const proto = (SheetsFindReplaceController as unknown as { prototype: Record<string, unknown> })
    ?.prototype as
    | {
        _findInWorksheet: (worksheet: any, query: any, unitId: string) => any
        _findInRange: (
          worksheet: any,
          query: any,
          range: IRange,
          unitId: string,
          dedupeFn?: any,
        ) => any
        __gridBoundPatched?: boolean
      }
    | undefined

  if (!proto || proto.__gridBoundPatched) {
    return { dispose: () => {} }
  }

  const origFindInWorksheet = proto._findInWorksheet
  const origFindInRange = proto._findInRange

  proto._findInWorksheet = function (worksheet: any, query: any, unitId: string) {
    const realRange = worksheet?.getDataRealRange?.() as IRange | undefined
    const rowCount = worksheet?.getRowCount?.() ?? 1000
    const colCount = worksheet?.getColumnCount?.() ?? 26

    const startRow = Math.max(0, realRange ? realRange.startRow : 0)
    const startColumn = Math.max(0, realRange ? realRange.startColumn : 0)
    const endRow = Math.min(rowCount - 1, Math.max(0, realRange ? realRange.endRow : 0))
    const endColumn = Math.min(colCount - 1, Math.max(0, realRange ? realRange.endColumn : 0))

    const range: IRange = {
      startRow,
      startColumn,
      endRow,
      endColumn,
    }
    return origFindInRange.call(this, worksheet, query, range, unitId)
  }

  proto._findInRange = function (
    worksheet: any,
    query: any,
    range: IRange,
    unitId: string,
    dedupeFn?: any,
  ) {
    const realRange = worksheet?.getDataRealRange?.() as IRange | undefined
    if (realRange && range) {
      const clampedRange: IRange = {
        startRow: Math.max(range.startRow, realRange.startRow),
        startColumn: Math.max(range.startColumn, realRange.startColumn),
        endRow: Math.min(range.endRow, realRange.endRow),
        endColumn: Math.min(range.endColumn, realRange.endColumn),
      }
      if (
        clampedRange.startRow > clampedRange.endRow ||
        clampedRange.startColumn > clampedRange.endColumn
      ) {
        return { results: [] }
      }
      return origFindInRange.call(this, worksheet, query, clampedRange, unitId, dedupeFn)
    }
    return origFindInRange.call(this, worksheet, query, range, unitId, dedupeFn)
  }

  proto.__gridBoundPatched = true

  return {
    dispose() {
      proto._findInWorksheet = origFindInWorksheet
      proto._findInRange = origFindInRange
      delete proto.__gridBoundPatched
    },
  }
}
