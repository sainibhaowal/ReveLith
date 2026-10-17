import { describe, expect, it, vi } from 'vitest'

vi.mock('@excalidraw/excalidraw', () => ({
  restore: ({ elements }: { elements: unknown[] }, appState: unknown) => ({
    elements,
    appState: (appState as Record<string, unknown>) ?? {},
  }),
  exportToBlob: async () => new Blob(['x'], { type: 'image/png' }),
  exportToSvg: async () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    return el as unknown as SVGSVGElement
  },
}))

import { safeFilename } from './board-engine/exporters'
import { loadLibraryItems, saveLibraryItems } from './board-engine/library'

describe('drawboard exporters + library', () => {
  it('builds safe filenames', () => {
    expect(safeFilename('My Board', '.png')).toBe('My Board.png')
    expect(safeFilename('a/b:c', '.svg')).toBe('a-b-c.svg')
    expect(safeFilename('', '.png')).toBe('drawing.png')
    expect(safeFilename('x.drawboard', '.drawboard')).toBe('x.drawboard')
    expect(safeFilename('x.whiteboard', '.whiteboard')).toBe('x.whiteboard')
  })

  it('persists library items best-effort', () => {
    saveLibraryItems([{ id: 'a' }])
    expect(loadLibraryItems()).toHaveLength(1)
    saveLibraryItems([])
    expect(loadLibraryItems()).toHaveLength(0)
  })

  it('migrates a saved library from the previous storage prefix', () => {
    localStorage.clear()
    const items = [{ id: 'legacy-item' }]
    localStorage.setItem('revelith-whiteboard/library-v1', JSON.stringify(items))

    expect(loadLibraryItems()).toEqual(items)
    expect(localStorage.getItem('revelith-drawboard/library-v1')).toBe(JSON.stringify(items))
    localStorage.clear()
  })
})
