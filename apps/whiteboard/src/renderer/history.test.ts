import { describe, expect, it, vi } from 'vitest'
import { createBoardHistory } from './board-engine/history'

describe('board history', () => {
  it('undoes and redoes across snapshots', () => {
    const history = createBoardHistory(10, 0)
    history.reset([{ id: 'a' }])
    expect(history.canUndo()).toBe(false)
    history.push([{ id: 'a' }, { id: 'b' }], true)
    history.push([{ id: 'a' }, { id: 'b' }, { id: 'c' }], true)
    expect(history.canUndo()).toBe(true)
    expect(history.undo()).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(history.canRedo()).toBe(true)
    expect(history.redo()).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(history.canRedo()).toBe(false)
  })

  it('drops the redo tail on new changes and caps the stack', () => {
    const history = createBoardHistory(3, 0)
    history.reset([1])
    history.push([2], true)
    history.push([3], true)
    history.undo()
    history.push([4], true)
    expect(history.canRedo()).toBe(false)
    expect(history.undo()).toEqual([2])
    history.push([5], true)
    history.push([6], true)
    history.push([7], true)
    // capped at 3: undo walks 7 -> 6 -> 5 then stops
    expect(history.undo()).toEqual([6])
    expect(history.undo()).toEqual([5])
    expect(history.undo()).toBe(null)
  })

  it('coalesces rapid streams but forces exact entries', () => {
    vi.useFakeTimers()
    try {
      const history = createBoardHistory(10, 1200)
      history.reset(['a'])
      expect(history.push(['b'])).toBe(true)
      vi.advanceTimersByTime(100)
      expect(history.push(['c'])).toBe(false)
      expect(history.push(['d'], true)).toBe(true)
      expect(history.undo()).toEqual(['b'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips identical snapshots', () => {
    const history = createBoardHistory(10, 0)
    history.reset(['a'])
    expect(history.push(['a'], true)).toBe(false)
    expect(history.canUndo()).toBe(false)
  })
})
