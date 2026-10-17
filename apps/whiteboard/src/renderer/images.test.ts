import { describe, expect, it, vi } from 'vitest'

vi.mock('@excalidraw/excalidraw', () => ({
  restore: ({ elements }: { elements: unknown[] }, _appState: unknown) => ({
    elements,
    appState: {},
  }),
}))

vi.mock('@excalidraw/excalidraw', () => ({
  restore: ({ elements }: { elements: unknown[] }, _appState: unknown) => ({
    elements,
    appState: {},
  }),
}))

import { describeImages, describeSelection, placeImagesOnBoard, toAgentImages } from './board-engine/images'

function mockApi(elements: Array<{ id: string; type: string; text?: string; x?: number; y?: number; width?: number; height?: number }> = []) {
  let current = [...elements]
  let files: unknown[] = []
  return {
    getSceneElements: vi.fn(() => current),
    getAppState: vi.fn(() => ({})),
    getFiles: vi.fn(() => Object.fromEntries(files.map((file) => [(file as { id: string }).id, file]))),
    updateScene: vi.fn((patch: { elements?: Array<{ id: string }> }) => {
      if (patch.elements) current = patch.elements as typeof current
    }),
    addFiles: vi.fn((f: unknown[]) => {
      files = f
    }),
    _files: () => files,
  }
}

const img = (over: Partial<{ id: string; name: string }> = {}) => ({
  id: over.id ?? 'img1',
  name: over.name ?? 'shot.png',
  size: 1000,
  mimeType: 'image/png',
  dataUrl: 'data:image/png;base64,AAA',
  width: 800,
  height: 600,
})

describe('board image attachments', () => {
  it('places staged images on the board and summarizes', () => {
    const api = mockApi()
    const res = placeImagesOnBoard(api as never, [img(), img({ id: 'img2', name: 'b.png' })])
    expect(res.placed).toBe(2)
    expect(res.summary).toContain('shot.png')
    expect(api._files()).toHaveLength(2)
    expect(api.getSceneElements()).toHaveLength(2)
  })

  it('describes the tracked selection', () => {
    const api = mockApi([
      { id: 'a', type: 'rectangle' },
      { id: 'b', type: 'text', text: 'hello board' },
    ])
    const detail = describeSelection(api as never, ['a', 'b'])
    expect(detail).toContain('2 element(s)')
    expect(detail).toContain('hello board')
    expect(describeSelection(api as never, [])).toContain('No board elements selected')
  })

  it('captures bounded selected content and the overall approximate selection bounds only', () => {
    const api = mockApi([
      { id: 'a', type: 'text', text: 'selected label', x: 10, y: 20, width: 30, height: 12 },
      { id: 'b', type: 'rectangle', x: 50, y: 60, width: 40, height: 25 },
      { id: 'other', type: 'text', text: 'not selected', x: -500, y: -500, width: 900, height: 900 },
    ])
    const detail = describeSelection(api as never, ['a', 'b'])
    expect(detail).toContain('Selected 2 element(s)')
    expect(detail).toContain('x=10, y=20, width=80, height=65')
    expect(detail).toContain('selected label')
    expect(detail).not.toContain('not selected')
  })

  it('describes staged images for context', () => {
    expect(describeImages([])).toBe('none')
    expect(describeImages([img()])).toContain('shot.png')
  })

  it('places images at explicit spots and converts to vision input', () => {
    const api = mockApi()
    const res = placeImagesOnBoard(api as never, [img()], [{ x: 300, y: 200, maxWidth: 200 }])
    expect(res.placed).toBe(1)
    expect(api.getSceneElements()[0]).toMatchObject({ x: 300, y: 200 })
    expect(api.getSceneElements()[0].width).toBeLessThanOrEqual(200)
    const agent = toAgentImages([img()])
    expect(agent).toEqual([{ base64: 'AAA', mime: 'image/png' }])
    expect(toAgentImages([])).toEqual([])
  })
})
