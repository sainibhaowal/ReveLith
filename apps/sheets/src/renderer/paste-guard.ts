import { ISheetClipboardService } from '@univerjs/sheets-ui'

import { estimatePasteCells } from '@revelith/xlsx-gateway/domain/paste-formulas'
import { t } from './i18n/locale'
import type { UniverRuntime } from './univer-state'

/**
 * Paste size guard and Excel-style paste repeat.
 *
 * 1. Refuses payloads past the cell ceiling with a clear message instead of letting a
 *    million-cell write + recalc freeze the worker.
 * 2. Excel-style paste repeat: when destination selection is larger than copied range
 *    (e.g. copying 1 cell into 10 rows, or a 2x2 block into 6x4), repeats/tiles the
 *    source pattern across the entire target selection instead of truncating or
 *    filling only the top-left cell.
 */
export const PASTE_CELL_LIMIT = 500_000

/**
 * Tiles TSV text across target rows and columns if target dimensions exceed source.
 */
export function tileTsv(tsvText: string, targetRows: number, targetCols: number): string {
  const lines = tsvText.split(/\r\n|\r|\n/)
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  if (lines.length === 0 || targetRows <= 0 || targetCols <= 0) return tsvText
  const grid = lines.map((line) => line.split('\t'))
  const srcRows = grid.length
  const srcCols = Math.max(...grid.map((r) => r.length))
  if (srcRows === 0 || srcCols === 0) return tsvText
  if (targetRows <= srcRows && targetCols <= srcCols) return tsvText

  const outLines: string[] = []
  for (let r = 0; r < targetRows; r++) {
    const rowCells: string[] = []
    for (let c = 0; c < targetCols; c++) {
      const srcRow = grid[r % srcRows]
      const val = srcRow ? (srcRow[c % srcCols] ?? '') : ''
      rowCells.push(val)
    }
    outLines.push(rowCells.join('\t'))
  }
  return outLines.join('\n') + '\n'
}

export function installPasteGuard(
  runtime: UniverRuntime,
  setMessage: (message: string) => void,
): { dispose(): void } {
  const clipboardService = runtime.univer.__getInjector().get(ISheetClipboardService) as any
  const originalPaste = clipboardService.paste.bind(clipboardService)
  const originalGetPastedRange = clipboardService._getPastedRange?.bind(clipboardService)

  clipboardService.paste = async (item: ClipboardItem, pasteType?: string) => {
    try {
      if (item && Array.from(item.types as unknown as string[]).includes('text/plain')) {
        const text = await item.getType('text/plain').then((b) => b.text())
        const cells = estimatePasteCells(text)
        if (cells > PASTE_CELL_LIMIT) {
          setMessage(
            (t as any)('appPasteTooLarge', {
              cells: cells.toLocaleString(),
              max: PASTE_CELL_LIMIT.toLocaleString(),
            }) || `Paste is too large (${cells.toLocaleString()} cells, max ${PASTE_CELL_LIMIT.toLocaleString()})`,
          )
          return false
        }
      }
    } catch {
      // unreadable payload: proceed unguarded
    }
    return originalPaste(item, pasteType)
  }

  if (typeof originalGetPastedRange === 'function') {
    clipboardService._getPastedRange = function (cellMatrix: any) {
      const target = this._getPastingTarget?.()
      const res = originalGetPastedRange.call(this, cellMatrix)
      if (!res || !res.pastedRange || !target?.selection?.range) return res

      const selRange = target.selection.range
      const targetRowLen = selRange.endRow - selRange.startRow + 1
      const targetColLen = selRange.endColumn - selRange.startColumn + 1

      const { startColumn, endColumn, startRow, endRow } = cellMatrix.getDataRange()
      const srcRowCount = endRow - startRow + 1
      const srcColCount = endColumn - startColumn + 1

      if (
        (targetRowLen > srcRowCount || targetColLen > srcColCount) &&
        (targetRowLen > 1 || targetColLen > 1)
      ) {
        for (let r = 0; r < targetRowLen; r++) {
          for (let c = 0; c < targetColLen; c++) {
            const cell = cellMatrix.getValue(r % srcRowCount, c % srcColCount)
            if (cell !== undefined && cell !== null) {
              cellMatrix.setValue(r, c, cell)
            }
          }
        }
        if (res.pastedRange.rows && res.pastedRange.rows.length < targetRowLen) {
          res.pastedRange.rows = Array.from(
            { length: targetRowLen },
            (_, i) => selRange.startRow + i,
          )
        }
        if (res.pastedRange.cols && res.pastedRange.cols.length < targetColLen) {
          res.pastedRange.cols = Array.from(
            { length: targetColLen },
            (_, i) => selRange.startColumn + i,
          )
        }
      }
      return res
    }
  }

  return {
    dispose() {
      clipboardService.paste = originalPaste
      if (originalGetPastedRange) {
        clipboardService._getPastedRange = originalGetPastedRange
      }
    },
  }
}

/**
 * Clipboard image paste into the grid. Listens for native paste events carrying
 * image/* items and forwards data URLs to the visuals inserter. Safe no-op when
 * the handler is absent; never blocks text paste.
 */
export function installClipboardImagePaste(onImage: (dataUrl: string, mime: string) => void): {
  dispose(): void
} {
  const listener = (event: ClipboardEvent): void => {
    const items = event.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          const url = String(reader.result ?? '')
          if (url.startsWith('data:image/')) onImage(url, item.type)
        }
        reader.readAsDataURL(file)
        event.preventDefault()
        return
      }
    }
  }
  document.addEventListener('paste', listener)
  return {
    dispose() {
      document.removeEventListener('paste', listener)
    },
  }
}
