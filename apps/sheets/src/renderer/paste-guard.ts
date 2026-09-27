import { ISheetClipboardService } from '@univerjs/sheets-ui'

import { estimatePasteCells } from '../domain/paste-formulas'
import { t } from './i18n/locale'
import type { UniverRuntime } from './univer-state'

/**
 * Paste size guard. Wraps Univer's sheet clipboard `paste` (every paste path —
 * ribbon, Ctrl+V, context menu — funnels through it) and refuses payloads
 * past the cell ceiling with a clear message instead of letting a
 * million-cell write + recalc freeze the worker. Reads only the pasted
 * text/plain extent; format-only pastes carry no text and pass through.
 * Copy-side materialization already caps streamed copies at 20k cells, so
 * anything reaching here at this size came from outside the sheet.
 */
export const PASTE_CELL_LIMIT = 500_000

export function installPasteGuard(
  runtime: UniverRuntime,
  setMessage: (message: string) => void,
): { dispose(): void } {
  const clipboardService = runtime.univer.__getInjector().get(ISheetClipboardService) as {
    paste(item: ClipboardItem, pasteType?: string): Promise<boolean>
  }
  const originalPaste = clipboardService.paste.bind(clipboardService)
  clipboardService.paste = async (item: ClipboardItem, pasteType?: string) => {
    try {
      if (item && Array.from(item.types as unknown as string[]).includes('text/plain')) {
        const text = await item.getType('text/plain').then((b) => b.text())
        const cells = estimatePasteCells(text)
        if (cells > PASTE_CELL_LIMIT) {
          setMessage(t('appPasteTooLarge', { cells: cells.toLocaleString(), max: PASTE_CELL_LIMIT.toLocaleString() }))
          return false
        }
      }
    } catch {
      // unreadable payload: proceed unguarded, same as before the fix
    }
    return originalPaste(item, pasteType)
  }
  return {
    dispose() {
      clipboardService.paste = originalPaste
    },
  }
}
