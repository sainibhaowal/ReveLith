import { describe, expect, it } from 'vitest'
import type { ExcalidrawElement as BoardElement } from '@excalidraw/excalidraw/element/types'
import { diffBoardElements, rejectBoardRevision } from './board-engine/revisions'

const element = (id: string, x = 0): BoardElement =>
  ({
    id,
    type: 'rectangle',
    x,
    y: 0,
    width: 20,
    height: 20,
    angle: 0,
    strokeColor: '#000',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: 'a0',
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
  }) as unknown as BoardElement

describe('drawboard revisions', () => {
  it('records added, edited, and deleted elements', () => {
    const changes = diffBoardElements(
      [element('edit'), element('delete')],
      [element('edit', 12), element('add')],
    )
    expect(changes.map((change) => change.kind).sort()).toEqual(['added', 'deleted', 'edited'])
  })

  it('rejects a change back to its before state and refuses stale edits', () => {
    const before = element('shape', 0)
    const after = element('shape', 12)
    const [revision] = diffBoardElements([before], [after])!
    expect(rejectBoardRevision([after], revision!)).toEqual([before])
    expect(rejectBoardRevision([element('shape', 24)], revision!)).toBeNull()
  })

  it('removes a newly added element when rejected', () => {
    const added = element('new')
    const [revision] = diffBoardElements([], [added])!
    expect(rejectBoardRevision([added], revision!)).toEqual([])
  })
})
