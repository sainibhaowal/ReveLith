import { describe, expect, it } from 'vitest'
import {
  alignElements,
  arrangeElements,
  deleteElements,
  distributeElements,
  duplicateElements,
  flipElements,
  getBounds,
  groupElements,
  selectAllIds,
  setFontFamily,
  setLocked,
  setOpacity,
  setStrokeWidth,
  setTextSize,
  ungroupElements,
  type BoardEl,
} from './ribbon/board-actions'

const el = (over: Partial<BoardEl> & { id: string }): BoardEl => ({
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  ...over,
})

describe('board actions', () => {
  it('computes bounds and selects ids', () => {
    expect(getBounds(el({ id: 'a', x: 5, y: 6, width: 10, height: 20 }))).toEqual({
      minX: 5,
      minY: 6,
      maxX: 15,
      maxY: 26,
    })
    expect(getBounds({ id: 'b' })).toBe(null)
    expect(selectAllIds([el({ id: 'a' }), el({ id: 'b' })])).toEqual(['a', 'b'])
  })

  it('arranges z-order preserving block order', () => {
    const list = [el({ id: 'a' }), el({ id: 'b' }), el({ id: 'c' }), el({ id: 'd' })]
    expect(arrangeElements(list, new Set(['b']), 'front').map((e) => e.id)).toEqual([
      'a',
      'c',
      'd',
      'b',
    ])
    expect(arrangeElements(list, new Set(['c']), 'back').map((e) => e.id)).toEqual([
      'c',
      'a',
      'b',
      'd',
    ])
    expect(arrangeElements(list, new Set(['b']), 'forward').map((e) => e.id)).toEqual([
      'a',
      'c',
      'b',
      'd',
    ])
    expect(arrangeElements(list, new Set(['c']), 'backward').map((e) => e.id)).toEqual([
      'a',
      'c',
      'b',
      'd',
    ])
    expect(arrangeElements(list, new Set(['b', 'c']), 'front').map((e) => e.id)).toEqual([
      'a',
      'd',
      'b',
      'c',
    ])
  })

  it('aligns to the shared bounding box', () => {
    const list = [
      el({ id: 'a', x: 0, y: 0, width: 10, height: 10 }),
      el({ id: 'b', x: 50, y: 40, width: 10, height: 10 }),
    ]
    const left = alignElements(list, new Set(['a', 'b']), 'left')
    expect(left.moved).toBe(1)
    expect(left.elements.find((e) => e.id === 'b')?.x).toBe(0)
    const middle = alignElements(list, new Set(['a', 'b']), 'middle')
    expect(middle.elements.find((e) => e.id === 'a')?.y).toBe(20)
    expect(middle.elements.find((e) => e.id === 'b')?.y).toBe(20)
  })

  it('distributes 3+ elements evenly, refuses fewer', () => {
    const list = [el({ id: 'a', x: 0 }), el({ id: 'b', x: 30 }), el({ id: 'c', x: 90 })]
    const res = distributeElements(list, new Set(['a', 'b', 'c']), 'horizontal')
    expect(res.moved).toBe(1)
    expect(res.elements.find((e) => e.id === 'b')?.x).toBe(45)
    expect(distributeElements(list.slice(0, 2), new Set(['a', 'b']), 'horizontal').moved).toBe(0)
  })

  it('groups and ungroups', () => {
    const list = [el({ id: 'a' }), el({ id: 'b' })]
    const grouped = groupElements(list, new Set(['a', 'b']))
    expect(grouped.grouped).toBe(2)
    expect(grouped.groupId).toBeTruthy()
    expect(grouped.elements[0]?.groupIds).toEqual([grouped.groupId])
    expect(groupElements(list, new Set(['a'])).grouped).toBe(0)
    const ungrouped = ungroupElements(grouped.elements, new Set(['a', 'b']))
    expect(ungrouped.ungrouped).toBe(2)
    expect(ungrouped.elements[0]?.groupIds).toEqual([])
  })

  it('groups safely when existing group metadata is malformed', () => {
    const list = [
      el({ id: 'a', groupIds: { stale: 'group' } as never }),
      el({ id: 'b', groupIds: ['existing', 42] as never }),
    ]
    const grouped = groupElements(list, new Set(['a', 'b']))
    expect(grouped.grouped).toBe(2)
    expect(grouped.elements[0]?.groupIds).toEqual([grouped.groupId])
    expect(grouped.elements[1]?.groupIds).toEqual(['existing', grouped.groupId])
  })

  it('locks, flips, and deletes with bound labels', () => {
    const list = [
      el({ id: 'r', type: 'rectangle', x: 10, y: 10, width: 20, height: 20 }),
      el({ id: 't', type: 'text', x: 12, y: 12, width: 10, height: 10, containerId: 'r' }),
    ]
    expect(setLocked(list, new Set(['r']), true).changed).toBe(1)
    const flipped = flipElements(list, new Set(['r', 't']), 'horizontal')
    expect(flipped.flipped).toBe(2)
    // box 10..30: r.x 10 -> 10 + (30 - 30) = 10? box.maxX=30, r.maxX=30 -> x stays 10; t.maxX=22 -> x = 10 + 8 = 18
    expect(flipped.elements.find((e) => e.id === 't')?.x).toBe(18)
    const deleted = deleteElements(list, new Set(['r']))
    expect(deleted.deleted).toBe(2)
  })

  it('flips tuple-based line points without producing invalid coordinates', () => {
    const line = el({
      id: 'line',
      type: 'line',
      x: 10,
      y: 10,
      width: 20,
      height: 10,
      points: [
        [0, 0],
        [20, 10],
      ],
    })
    const horizontal = flipElements([line], new Set(['line']), 'horizontal').elements[0]
    expect(horizontal?.points).toEqual([
      [20, 0],
      [0, 10],
    ])
    const vertical = flipElements([line], new Set(['line']), 'vertical').elements[0]
    expect(vertical?.points).toEqual([
      [0, 10],
      [20, 0],
    ])
  })

  it('duplicates with fresh ids and remapped bindings', () => {
    const list = [
      { ...el({ id: 'r', x: 0, y: 0 }), boundElements: [{ id: 't' }] },
      el({ id: 't', type: 'text', x: 2, y: 2, containerId: 'r' }),
    ]
    const { elements, clones } = duplicateElements(list, new Set(['r', 't']), 24, 24)
    expect(clones).toHaveLength(2)
    expect(elements).toHaveLength(4)
    const cloneR = clones.find((c) => c.x === 24)!
    const cloneT = clones.find((c) => c.type === 'text')!
    expect(cloneT.containerId).toBe(cloneR.id)
    expect(cloneR.boundElements).toEqual([{ id: cloneT.id }])
    expect(cloneR.id).not.toBe('r')
  })

  it('applies stroke, opacity, text size, and font family', () => {
    const list = [el({ id: 'a', type: 'rectangle' }), el({ id: 't', type: 'text', fontSize: 20 })]
    expect(setStrokeWidth(list, new Set(['a']), 4).applied).toBe(1)
    expect(setOpacity(list, new Set(['a', 't']), 50).applied).toBe(2)
    const sized = setTextSize(list, new Set(['a', 't']), 32)
    expect(sized.applied).toBe(1)
    expect(sized.skipped).toBe(1)
    const font = setFontFamily(list, new Set(['t']), 3)
    expect(font.applied).toBe(1)
    expect(font.elements.find((e) => e.id === 't')?.fontFamily).toBe(3)
  })
})
