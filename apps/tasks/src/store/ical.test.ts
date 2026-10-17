import { describe, expect, it } from 'vitest'
import type { Action } from './actions'
import { reduce } from './reducer'
import { boardWithProject, firstColumnId, projectId } from '../test/fixtures'
import { boardToIcs, icsEventCount, projectToIcs } from './ical'

const STAMP = new Date('2026-03-10T12:00:00Z')

function apply(state: ReturnType<typeof boardWithProject>, ...actions: Action[]) {
  return actions.reduce(reduce, state)
}

function withDates() {
  const base = boardWithProject()
  const id = projectId(base)
  return apply(
    base,
    { kind: 'task/create', projectId: id, columnId: firstColumnId(base), title: 'Dated', dueDate: '2026-04-01' },
    { kind: 'task/create', projectId: id, columnId: firstColumnId(base), title: 'Undated' },
    { kind: 'task/create', projectId: id, columnId: firstColumnId(base), title: 'Spanned', startDate: '2026-04-01', dueDate: '2026-04-05' },
  )
}

describe('projectToIcs', () => {
  it('emits a valid calendar envelope', () => {
    const ics = projectToIcs(withDates(), projectId(withDates()), STAMP)
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('PRODID:')
  })

  it('uses CRLF line endings', () => {
    const ics = projectToIcs(withDates(), projectId(withDates()), STAMP)
    expect(ics).toContain('\r\n')
  })

  it('creates one event per dated task and skips undated ones', () => {
    const state = withDates()
    const ics = projectToIcs(state, projectId(state), STAMP)
    const events = ics.split('BEGIN:VEVENT').length - 1
    expect(events).toBe(2)
    expect(ics).not.toContain('Undated')
  })

  it('writes DTEND as a date-only value', () => {
    const state = withDates()
    const ics = projectToIcs(state, projectId(state), STAMP)
    // RFC 5545 VALUE=DATE carries no time and no trailing Z.
    expect(ics).toContain('DTEND;VALUE=DATE:20260401')
    expect(ics).not.toContain('DTEND;VALUE=DATE:20260401T')
  })

  it('includes start and end for a spanned task', () => {
    const state = withDates()
    const ics = projectToIcs(state, projectId(state), STAMP)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260401')
    expect(ics).toContain('DTEND;VALUE=DATE:20260405')
  })

  it('puts the ticket id in the summary', () => {
    const state = withDates()
    expect(projectToIcs(state, projectId(state), STAMP)).toContain('SUMMARY:WEB-1 Dated')
  })

  it('marks tasks in a done column as COMPLETED', () => {
    const base = withDates()
    const done = base.columns.find((column) => column.isDone)!
    const state = apply(base, { kind: 'task/move', id: base.tasks[0].id, columnId: done.id })
    expect(projectToIcs(state, projectId(state), STAMP)).toContain('STATUS:COMPLETED')
    expect(projectToIcs(state, projectId(state), STAMP)).toContain('STATUS:CONFIRMED')
  })

  it('escapes commas, semicolons and newlines in text', () => {
    const base = withDates()
    const state = apply(base, {
      kind: 'task/update',
      id: base.tasks[0].id,
      patch: { title: 'a,b; c', description: 'line one\nline two' },
    })
    const ics = projectToIcs(state, projectId(state), STAMP)
    expect(ics).toContain('a\\,b\\; c')
    expect(ics).toContain('line one\\nline two')
  })

  it('escapes backslashes', () => {
    const base = withDates()
    const state = apply(base, { kind: 'task/update', id: base.tasks[0].id, patch: { title: 'a\\b' } })
    expect(projectToIcs(state, projectId(state), STAMP)).toContain('a\\\\b')
  })

  it('gives each event a stable unique UID', () => {
    const state = withDates()
    const ics = projectToIcs(state, projectId(state), STAMP)
    const uids = ics.split('\r\n').filter((line) => line.startsWith('UID:'))
    expect(uids).toHaveLength(2)
    expect(new Set(uids).size).toBe(2)
    expect(uids[0]).not.toContain(' ')
  })

  it('folds long lines at 75 octets', () => {
    const base = withDates()
    const state = apply(base, {
      kind: 'task/update',
      id: base.tasks[0].id,
      patch: { title: 'x'.repeat(200) },
    })
    const ics = projectToIcs(state, projectId(state), STAMP)
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75)
    }
  })

  it('reassembles a folded line back to the original text', () => {
    const title = 'y'.repeat(120)
    const base = withDates()
    const state = apply(base, { kind: 'task/update', id: base.tasks[0].id, patch: { title } })
    const ics = projectToIcs(state, projectId(state), STAMP)
    // Walk the contiguous continuation lines only, stripping the leading space.
    const lines = ics.split('\r\n')
    const start = lines.findIndex((line) => line.startsWith('SUMMARY:'))
    let unfolded = lines[start].slice('SUMMARY:'.length)
    for (let index = start + 1; index < lines.length; index += 1) {
      if (!lines[index].startsWith(' ')) break
      unfolded += lines[index].slice(1)
    }
    expect(unfolded).toBe(`WEB-1 ${title}`)
  })
})

describe('boardToIcs', () => {
  it('covers every non-archived project', () => {
    const base = withDates()
    const state = apply(base, { kind: 'project/create', name: 'Second', key: 'SEC' })
    const ics = boardToIcs(state, STAMP)
    expect(ics).toContain('X-WR-CALNAME:ReveLith Tasks')
    // Two projects, each with their own dated tasks.
    expect(ics.split('BEGIN:VEVENT').length - 1).toBe(2)
  })

  it('omits sub-tasks, which would duplicate the parent', () => {
    const base = withDates()
    const state = apply(base, {
      kind: 'task/create',
      projectId: projectId(base),
      columnId: firstColumnId(base),
      title: 'Child',
      parentId: base.tasks[0].id,
      dueDate: '2026-04-02',
    })
    expect(boardToIcs(state, STAMP).split('BEGIN:VEVENT').length - 1).toBe(2)
  })
})

describe('icsEventCount', () => {
  it('counts only dated tasks', () => {
    expect(icsEventCount(withDates())).toBe(2)
  })

  it('counts a single project when scoped', () => {
    const state = withDates()
    expect(icsEventCount(state, projectId(state))).toBe(2)
    expect(icsEventCount(state, 'unknown')).toBe(0)
  })
})
