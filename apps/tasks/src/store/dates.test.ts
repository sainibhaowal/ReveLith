import { describe, expect, it } from 'vitest'

import {
  addDays,
  daysBetween,
  monthGrid,
  relativeDay,
  shiftMonth,
  spanLength,
  spanOf,
  toDay,
  today,
} from './dates'

describe('date helpers', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('is timezone-free: no off-by-one in either direction', () => {
    // A due date is a calendar day, so parsing must never shift it.
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01')
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31')
    expect(toDay(Date.parse('2024-06-15T00:00:00Z'))).toBe('2024-06-15')
  })

  it('counts days between two dates', () => {
    expect(daysBetween('2024-01-01', '2024-01-08')).toBe(7)
    expect(daysBetween('2024-01-08', '2024-01-01')).toBe(-7)
    expect(daysBetween('2024-01-01', '2024-01-01')).toBe(0)
  })

  it('builds a full six-week grid starting on the requested weekday', () => {
    const grid = monthGrid('2024-01', 1)
    expect(grid.weeks).toHaveLength(6)
    expect(grid.weeks[0]).toHaveLength(7)
    // 2024-01-01 was a Monday, so a Monday-start grid begins on the 1st.
    expect(grid.weeks[0]![0]).toBe('2024-01-01')

    const sunday = monthGrid('2024-01', 0)
    expect(sunday.weeks[0]![0]).toBe('2023-12-31')
  })

  it('shifts months across a year boundary', () => {
    expect(shiftMonth('2024-01', -1)).toBe('2023-12')
    expect(shiftMonth('2024-12', 1)).toBe('2025-01')
  })

  it('describes a day relative to today', () => {
    const ref = '2024-05-10'
    expect(relativeDay(ref, ref)).toBe('Today')
    expect(relativeDay(addDays(ref, 1), ref)).toBe('Tomorrow')
    expect(relativeDay(addDays(ref, -1), ref)).toBe('Yesterday')
    expect(relativeDay(addDays(ref, 3), ref)).toBe('In 3 days')
    expect(relativeDay(addDays(ref, -3), ref)).toBe('3 days ago')
    // Far dates fall back to the raw value rather than a vague phrase.
    expect(relativeDay('2024-06-30', ref)).toBe('2024-06-30')
  })

  it('derives a span from start and due dates', () => {
    expect(spanOf(null, null)).toBeNull()
    expect(spanOf('2024-05-01', null)).toEqual({ start: '2024-05-01', end: '2024-05-01' })
    expect(spanOf('2024-05-01', '2024-05-05')).toEqual({ start: '2024-05-01', end: '2024-05-05' })
    // A due date before the start date must not produce a negative span.
    expect(spanOf('2024-05-10', '2024-05-01')).toEqual({ start: '2024-05-10', end: '2024-05-10' })
    expect(spanLength({ start: '2024-05-01', end: '2024-05-01' })).toBe(1)
    expect(spanLength({ start: '2024-05-01', end: '2024-05-05' })).toBe(5)
  })

  it('exposes today as a plain date string', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})