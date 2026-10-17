import { describe, expect, it, vi } from 'vitest'

vi.mock('@excalidraw/excalidraw', () => ({
  restore: ({ elements }: { elements: unknown[] }, appState: unknown) => ({
    elements,
    appState: (appState as Record<string, unknown>) ?? {},
  }),
}))

import {
  loadInitialScene,
  migrateLegacyOpsToElements,
  serializeScene,
  isDarkPaper,
  normalizePaperForTheme,
} from './board-engine/persistence'
import { normalizeBoardElementPoints } from './board-engine/element-geometry'
import { loadInitialSceneFromContent } from './board-engine/open-content'
import { isDrawboardDocument, normalizeDrawboardDocument } from '../shared/ipc'

describe('drawboard persistence', () => {
  it('migrates legacy pen/shape/text/note ops to board elements', () => {
    const elements = migrateLegacyOpsToElements([
      {
        kind: 'stroke',
        tool: 'pen',
        color: '#1e40af',
        width: 4,
        points: [
          [0, 0],
          [10, 10],
        ],
      },
      { kind: 'shape', shape: 'rect', color: '#111', width: 3, from: [0, 0], to: [50, 40] },
      { kind: 'text', color: '#111', size: 20, at: [5, 5], text: 'hello' },
      { kind: 'note', color: '#fef08a', at: [10, 10], text: 'sticky' },
    ])
    const types = elements.map((e) => e.type)
    expect(types).toContain('freedraw')
    expect(types).toContain('rectangle')
    expect(types).toContain('text')
    // note produces rectangle + bound text
    expect(elements.length).toBeGreaterThanOrEqual(4)
  })

  it('skips legacy eraser strokes (no destructive mapping)', () => {
    const elements = migrateLegacyOpsToElements([
      {
        kind: 'stroke',
        tool: 'eraser',
        color: '#000',
        width: 12,
        points: [
          [0, 0],
          [5, 5],
        ],
      },
    ])
    expect(elements).toHaveLength(0)
  })

  it('round-trips a v2 scene through serialize + normalize + open', () => {
    const elements = migrateLegacyOpsToElements([
      { kind: 'text', color: '#111', size: 20, at: [5, 5], text: 'roundtrip' },
    ])
    const payload = serializeScene(elements, { viewBackgroundColor: '#ffffff' }, {})
    expect(payload.version).toBe(2)
    expect(isDrawboardDocument(payload)).toBe(true)
    const normalized = normalizeDrawboardDocument(payload)
    expect(normalized?.version).toBe(2)
    const scene = loadInitialSceneFromContent(payload)
    expect(scene.elements.length).toBeGreaterThan(0)
  })

  it('accepts raw board JSON and legacy v1 payloads', () => {
    const raw = { version: 2, elements: [] }
    expect(() => loadInitialSceneFromContent(raw)).not.toThrow()
    const v1 = {
      version: 1,
      ops: [{ kind: 'text', color: '#111', size: 20, at: [1, 1], text: 'x' }],
    }
    const scene = loadInitialSceneFromContent(v1)
    expect(scene.elements.length).toBeGreaterThan(0)
  })

  it('recovers and migrates a v2 local draft saved under the old storage prefix', async () => {
    localStorage.clear()
    const oldKey = 'revelith-whiteboard/scene-v2/browser'
    const newKey = 'revelith-drawboard/scene-v2/browser'
    const oldDraft = {
      version: 2,
      elements: migrateLegacyOpsToElements([
        { kind: 'text', color: '#111', size: 18, at: [2, 3], text: 'kept draft' },
      ]),
    }
    localStorage.setItem(oldKey, JSON.stringify(oldDraft))

    const scene = await loadInitialScene()

    expect(scene.migratedFromLegacy).toBe(false)
    expect(scene.elements).toHaveLength(1)
    expect(localStorage.getItem(newKey)).toBe(JSON.stringify(oldDraft))
    localStorage.clear()
  })

  it('repairs object and flattened stroke points before restoring an older board', () => {
    const scene = loadInitialSceneFromContent({
      version: 2,
      elements: [
        {
          id: 'old-arrow',
          type: 'arrow',
          x: 10,
          y: 20,
          width: 40,
          height: 30,
          points: [
            { x: 0, y: 0 },
            { x: 40, y: 30 },
          ],
        },
        {
          id: 'old-pen',
          type: 'freedraw',
          x: 5,
          y: 6,
          width: 20,
          height: 10,
          points: [0, 0, 20, 10],
        },
      ],
    })
    expect((scene.elements[0] as unknown as { points: unknown }).points).toEqual([
      [0, 0],
      [40, 30],
    ])
    expect((scene.elements[1] as unknown as { points: unknown }).points).toEqual([
      [0, 0],
      [20, 10],
    ])
    expect((scene.elements[0] as unknown as { groupIds: unknown[] }).groupIds).toEqual([])
    expect((scene.elements[1] as unknown as { groupIds: unknown[] }).groupIds).toEqual([])

    const repaired = normalizeBoardElementPoints([
      {
        id: 'broken-line',
        type: 'line',
        x: 0,
        y: 0,
        width: 8,
        height: 0,
        points: [{ x: Number.NaN, y: 0 }],
      },
    ])
    expect((repaired[0] as unknown as { points: unknown }).points).toEqual([
      [0, 0],
      [8, 0],
    ])
    expect((repaired[0] as unknown as { groupIds: unknown[] }).groupIds).toEqual([])
  })

  it('repairs ids, bindings, metadata, and unsupported recovery entries', () => {
    const repaired = normalizeBoardElementPoints([
      {
        id: 'same-id',
        type: 'rectangle',
        x: 'bad',
        y: Number.NaN,
        width: undefined,
        height: undefined,
        groupIds: { stale: true },
        boundElements: [
          { id: 'missing', type: 'text' },
          { id: 'kept', type: 'text' },
        ],
        frameId: 'missing-frame',
      },
      {
        id: 'same-id',
        type: 'line',
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 10 },
        ],
        startBinding: { elementId: 'missing' },
      },
      { type: 'not-an-excalidraw-element' },
      null,
    ])
    expect(repaired).toHaveLength(2)
    expect(new Set(repaired.map((element) => element.id)).size).toBe(2)
    for (const element of repaired) {
      const record = element as unknown as Record<string, unknown>
      expect(Array.isArray(record.groupIds)).toBe(true)
      expect(Array.isArray(record.boundElements)).toBe(true)
      expect(typeof record.id).toBe('string')
      expect(Number.isFinite(record.x)).toBe(true)
      expect(Number.isFinite(record.y)).toBe(true)
    }
    expect((repaired[0] as unknown as { boundElements: unknown[] }).boundElements).toEqual([])
    expect((repaired[0] as unknown as { frameId: unknown }).frameId).toBeNull()
    expect((repaired[1] as unknown as { startBinding: unknown }).startBinding).toBeNull()
  })

  it('rejects garbage content', () => {
    expect(isDrawboardDocument(null)).toBe(false)
    expect(isDrawboardDocument({ foo: 1 })).toBe(false)
    expect(() => loadInitialSceneFromContent({ foo: 1 })).toThrow()
  })

  it('detects dark paper and normalizes it for readability', () => {
    expect(isDarkPaper('#000000')).toBe(true)
    expect(isDarkPaper('#1e1e1e')).toBe(true)
    expect(isDarkPaper('#000')).toBe(true)
    expect(isDarkPaper('#ffffff')).toBe(false)
    expect(isDarkPaper('#fef08a')).toBe(false)
    expect(isDarkPaper('transparent')).toBe(false)
    expect(isDarkPaper(undefined)).toBe(false)
    const updated: unknown[] = []
    const api = {
      getAppState: () => ({ viewBackgroundColor: '#111111' }),
      updateScene: (scene: unknown) => {
        updated.push(scene)
      },
    }
    expect(normalizePaperForTheme(api, 'light')).toBe(true)
    expect(updated).toEqual([{ appState: { viewBackgroundColor: '#ffffff' } }])
    const clean: unknown[] = []
    const lightApi = {
      getAppState: () => ({ viewBackgroundColor: '#ffffff' }),
      updateScene: (scene: unknown) => {
        clean.push(scene)
      },
    }
    expect(normalizePaperForTheme(lightApi, 'dark')).toBe(false)
    expect(clean).toEqual([])
  })
})
