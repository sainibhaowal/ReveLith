import { describe, expect, it } from 'vitest'
import {
  MIN_GAP,
  needsRebalance,
  positionAfter,
  positionBefore,
  positionBetween,
  spread,
} from './position'

describe('position', () => {
  it('places the first item at a positive step', () => {
    expect(positionAfter(null)).toBe(1024)
    expect(positionBefore(null)).toBe(1024)
  })

  it('appends after the last position', () => {
    expect(positionAfter(1024)).toBe(2048)
    expect(positionBefore(1024)).toBe(0)
  })

  it('inserts the midpoint between two neighbours', () => {
    expect(positionBetween(1024, 2048)).toBe(1536)
  })

  it('treats a null bound as the open end of the group', () => {
    expect(positionBetween(null, 1024)).toBe(0)
    expect(positionBetween(1024, null)).toBe(2048)
  })

  it('keeps repeated inserts strictly ordered', () => {
    const before = 1024
    let after = 2048
    const inserted: number[] = []
    for (let index = 0; index < 10; index += 1) {
      const next = positionBetween(before, after)
      inserted.push(next)
      after = next
    }
    // Every insert lands strictly between the bounds it was given.
    for (const value of inserted) {
      expect(value).toBeGreaterThan(1024)
      expect(value).toBeLessThan(2048)
    }
  })

  it('flags neighbours that are too close to split again', () => {
    expect(needsRebalance(1024, 1024 + MIN_GAP * 2)).toBe(false)
    expect(needsRebalance(1024, 1024 + MIN_GAP / 2)).toBe(true)
  })

  it('spreads a group into ascending, evenly spaced positions', () => {
    const positions = spread(3)
    expect(positions).toEqual([1024, 2048, 3072])
    expect(spread(0)).toEqual([])
    expect(spread(-3)).toEqual([])
  })
})
