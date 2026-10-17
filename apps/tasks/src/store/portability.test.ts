import { describe, expect, it } from 'vitest'

import { boardToHtml } from './publicBoard'
import { importFromCsv, importFromJson, importFromTrello, parseCsv, runImport } from './importers'
import { seedBoard } from './migrate'
import { projectId } from '../test/fixtures'

describe('public board export', () => {
  const board = seedBoard()
  const id = projectId(board)

  it('produces a standalone HTML document', () => {
    const html = boardToHtml(board, id)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
    expect(html).toContain(board.projects[0].name)
  })

  it('inlines its styles so the file works offline with no network', () => {
    const html = boardToHtml(board, id)
    expect(html).toContain('<style>')
    // No external stylesheet or script may be referenced.
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet/)
    expect(html).not.toMatch(/<script[^>]+src=/)
  })

  it('has no sign-in surface, and no way to authenticate', () => {
    const html = boardToHtml(board, id)
    // Structural check: a shared board must offer nothing to log in with.
    expect(html).not.toMatch(/<form\b/)
    expect(html).not.toMatch(/type=["']password["']/)
    expect(html).not.toMatch(/sign[\s-]?in/i)
    expect(html).not.toMatch(/log[\s-]?in/i)
    expect(html).not.toMatch(/oauth|password|api[_ -]?key/i)
  })

  it('escapes task titles so a hostile title cannot inject markup', () => {
    const hostile = {
      ...board,
      tasks: [{ ...board.tasks[0], title: '<script>alert(1)</script>' }],
    }
    const html = boardToHtml(hostile, id)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('throws a clear error for an unknown project', () => {
    expect(() => boardToHtml(board, 'nope')).toThrow(/No project/)
  })

  it('lists tasks under their columns', () => {
    const html = boardToHtml(board, id)
    expect(html).toContain('DEMO-1')
    expect(html).toContain('class="col"')
  })
})

describe('CSV parsing', () => {
  it('handles quoted fields, escaped quotes and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ])
  })

  it('drops fully blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toHaveLength(2)
  })
})

describe('CSV import', () => {
  it('maps the recognised columns onto board fields', () => {
    const csv = [
      'title,status,priority,due,labels,assignee',
      'Write spec,Backlog,high,2024-06-01,docs;urgent,Ada',
      'Ship it,Done,low,,chore,Grace',
    ].join('\n')

    const report = importFromCsv(csv)
    expect(report).not.toBeNull()
    expect(report!.ok).toBe(true)
    expect(report!.tasks).toBe(2)
    expect(report!.columns).toBe(2)
  })

  it('creates a column per distinct status and marks done ones', () => {
    const report = importFromCsv('title,status\nA,Backlog\nB,Done')
    expect(report!.ok).toBe(true)
    expect(report!.columns).toBe(2)
  })

  it('returns null without a title column', () => {
    expect(importFromCsv('foo,bar\n1,2')).toBeNull()
  })

  it('warns when there is no assignee column', () => {
    const report = importFromCsv('title\nA')
    expect(report!.warnings.join(' ')).toContain('unassigned')
  })
})

describe('Trello import', () => {
  const payload = {
    name: 'Roadmap',
    lists: [
      { id: 'l1', name: 'To Do', closed: false },
      { id: 'l2', name: 'Done', closed: false },
      { id: 'l3', name: 'Old', closed: true },
    ],
    labels: [{ id: 'lb1', name: 'Bug', color: 'red' }],
    cards: [
      { id: 'c1', idList: 'l1', name: 'Fix the bug', desc: 'details', due: '2024-07-01', idLabels: ['lb1'] },
      { id: 'c2', idList: 'l2', name: 'Shipped', desc: '', due: null, idLabels: [] },
      { id: 'c3', idList: 'l3', name: 'Dropped', desc: '', due: null, idLabels: [] },
    ],
    checklists: [{ idCard: 'c1', name: 'Steps', checkItems: [{ name: 'repro', state: 'complete' }] }],
  }

  it('maps lists to columns and skips closed ones', () => {
    const report = importFromTrello(payload)
    expect(report!.ok).toBe(true)
    expect(report!.columns).toBe(2)
    // The card in the closed list has nowhere to go, so it is dropped.
    expect(report!.tasks).toBe(2)
  })

  it('carries labels and checklists across', () => {
    const report = importFromTrello(payload)
    expect(report!.labels).toBe(1)
    expect(report!.projectName).toBe('Roadmap')
  })

  it('returns null for a payload that is not a Trello export', () => {
    expect(importFromTrello({ nope: true })).toBeNull()
  })
})

describe('JSON import', () => {
  it('accepts this app’s own envelope', () => {
    const board = seedBoard()
    const report = importFromJson({ version: 2, state: board })
    expect(report).not.toBeNull()
    expect(report!.ok).toBe(true)
    expect(report!.projectKey).toBe('DEMO')
  })

  it('returns null for an unrelated payload', () => {
    expect(importFromJson({ hello: 'world' })).toBeNull()
  })
})

describe('runImport', () => {
  it('never throws on malformed input', () => {
    const report = runImport('json', 'not json at all {{{')
    expect(report.ok).toBe(false)
    expect(report.warnings[0]).toContain('Could not read')
  })

  it('reports an unrecognised format clearly', () => {
    const report = runImport('csv', '')
    expect(report.ok).toBe(false)
    expect(report.warnings[0]).toContain('CSV')
  })

  it('round-trips a Trello export through runImport', () => {
    const report = runImport('trello', JSON.stringify({ name: 'X', lists: [{ id: 'l', name: 'To Do', closed: false }], cards: [] }))
    expect(report.ok).toBe(true)
  })
})