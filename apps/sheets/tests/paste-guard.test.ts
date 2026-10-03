import { describe, expect, it, vi } from 'vitest'
import { PASTE_CELL_LIMIT, installPasteGuard, tileTsv } from '../src/renderer/paste-guard'

/**
 * Paste size guard: wraps Univer's sheet clipboard paste() (every paste path
 * funnels through it) and refuses oversized payloads with a message instead
 * of freezing the worker on a million-cell write + recalc.
 */

function fakeItem(text: string): ClipboardItem {
  return {
    types: ['text/plain'],
    getType: async () => ({ text: async () => text }) as Blob,
  } as unknown as ClipboardItem
}

function fakeRuntime() {
  const calls: Array<{ item: ClipboardItem; pasteType?: string | undefined }> = []
  const service = {
    paste: vi.fn(async (item: ClipboardItem, pasteType?: string) => {
      calls.push({ item, pasteType })
      return true
    }),
  }
  const runtime = {
    univer: { __getInjector: () => ({ get: () => service }) },
  }
  return { runtime, service, calls }
}

describe('installPasteGuard', () => {
  it('lets normal pastes through untouched', async () => {
    const { runtime, service, calls } = fakeRuntime()
    const messages: string[] = []
    installPasteGuard(runtime as never, (m) => messages.push(m))
    expect(await service.paste(fakeItem('a\tb\nc\td\n'), 'default-paste')).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.pasteType).toBe('default-paste')
    expect(messages).toEqual([])
  })

  it('refuses payloads past the cell ceiling with a message', async () => {
    const { runtime, service, calls } = fakeRuntime()
    const messages: string[] = []
    installPasteGuard(runtime as never, (m) => messages.push(m))
    const rows = Math.ceil(PASTE_CELL_LIMIT / 10) + 100
    const huge = 'a\tb\tc\td\te\tf\tg\th\ti\tj\n'.repeat(rows)
    expect(await service.paste(fakeItem(huge))).toBe(false)
    expect(calls).toHaveLength(0)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/500[.,]000/)
  })

  it('passes format-only pastes (no text payload) through', async () => {
    const { runtime, service, calls } = fakeRuntime()
    installPasteGuard(runtime as never, () => {})
    const item = {
      types: [],
      getType: async () => ({ text: async () => '' }),
    } as unknown as ClipboardItem
    expect(await service.paste(item, 'special-paste-format')).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('restores the original paste on dispose', async () => {
    const { runtime, service } = fakeRuntime()
    const { dispose } = installPasteGuard(runtime as never, () => {})
    const original = service.paste
    dispose()
    // dispose reinstalls the pre-wrap function (identity change proves restore)
    expect(service.paste).not.toBe(original)
  })

  it('tiles single cell across multi-row/col target', () => {
    const tiled = tileTsv('42\n', 3, 2)
    expect(tiled).toBe('42\t42\n42\t42\n42\t42\n')
  })

  it('tiles 2x2 pattern across 4x3 destination', () => {
    const source = 'A\tB\nC\tD\n'
    const tiled = tileTsv(source, 4, 3)
    expect(tiled).toBe('A\tB\tA\nC\tD\tC\nA\tB\tA\nC\tD\tC\n')
  })
})
