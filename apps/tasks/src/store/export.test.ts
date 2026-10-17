import { describe, expect, it } from 'vitest'
import type { Action } from './actions'
import { reduce } from './reducer'
import { boardWithProject, buildBoard, firstColumnId, projectId } from '../test/fixtures'
import { BoardStore } from './store'
import { boardToJson, boardToMarkdown, compactTask, projectToCsv } from './export'
import { parseDocument, serializeDocument } from './migrate'

function apply(state: ReturnType<typeof buildBoard>, ...actions: Action[]) {
  return actions.reduce(reduce, state)
}

function richBoard() {
  const base = boardWithProject()
  const id = projectId(base)
  const labelId = base.labels[0].id
  const withField = apply(base, {
    kind: 'customField/define',
    projectId: id,
    name: 'Points',
    type: 'number',
  })
  const withTasks = apply(
    withField,
    {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(base),
      title: 'Fix "login", urgently',
      description: 'Users cannot sign in',
      labelIds: [labelId],
      priority: 'urgent',
      dueDate: '2026-03-01',
    },
    {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(base),
      title: 'Write docs',
      parentId: null,
    },
  )
  return apply(withTasks, {
    kind: 'task/create',
    projectId: id,
    columnId: firstColumnId(base),
    title: 'Child item',
    parentId: withTasks.tasks[0].id,
  })
}

describe('markdown export', () => {
  it('renders a heading per column with counts', () => {
    const state = richBoard()
    const md = boardToMarkdown(state, projectId(state))
    expect(md).toContain('# Website Redesign')
    expect(md).toContain('## Backlog (2)')
    expect(md).toContain('Key: `WEB`')
  })

  it('includes ticket, priority and due date', () => {
    const state = richBoard()
    const md = boardToMarkdown(state, projectId(state))
    expect(md).toContain('WEB-1 Fix "login", urgently')
    expect(md).toContain('urgent')
    expect(md).toContain('Due: 2026-03-01')
  })

  it('lists labels and sub-tasks', () => {
    const state = richBoard()
    const md = boardToMarkdown(state, projectId(state))
    expect(md).toContain('Labels: Bug')
    expect(md).toContain('Sub-tasks: Child item')
  })

  it('marks an empty column', () => {
    const state = richBoard()
    expect(boardToMarkdown(state, projectId(state))).toContain('_Empty_')
  })

  it('returns nothing for an unknown project', () => {
    expect(boardToMarkdown(buildBoard(), 'nope')).toBe('')
  })
})

describe('csv export', () => {
  it('emits a header and one row per task', () => {
    const state = richBoard()
    const csv = projectToCsv(state, projectId(state))
    const lines = csv.split('\n')
    expect(lines[0]).toBe(
      'ticket,title,column,priority,dueDate,labels,blockedBy,subtasks,timeLoggedMinutes,archived',
    )
    expect(lines).toHaveLength(4)
    expect(csv).toContain('WEB-3')
  })

  it('escapes quotes and commas', () => {
    const state = richBoard()
    const csv = projectToCsv(state, projectId(state))
    expect(csv).toContain('"Fix ""login"", urgently"')
  })

  it('records blocked-by tickets and archived state', () => {
    const base = richBoard()
    const linked = apply(base, {
      kind: 'relation/link',
      fromTaskId: base.tasks[1].id,
      toTaskId: base.tasks[0].id,
      type: 'blocked_by',
    })
    const archived = apply(linked, {
      kind: 'task/setArchived',
      id: linked.tasks[1].id,
      archived: true,
    })
    const csv = projectToCsv(archived, projectId(archived))
    expect(csv).toContain('WEB-1')
    expect(csv).toContain('yes')
  })
})

describe('json export', () => {
  it('round-trips through the document envelope', () => {
    const state = richBoard()
    const restored = parseDocument(JSON.parse(boardToJson({ ...state, selectedTaskId: null })))!
    expect(restored.tasks).toHaveLength(state.tasks.length)
    expect(restored.customFields).toHaveLength(state.customFields.length)
  })
})

describe('compactTask', () => {
  it('summarises a task for a one-line board snapshot', () => {
    const state = richBoard()
    const line = compactTask(state, state.tasks[0])
    expect(line).toContain('WEB-1')
    expect(line).toContain('Backlog')
    expect(line).toContain('urgent')
  })

  it('flags a blocked task', () => {
    const base = richBoard()
    const linked = apply(base, {
      kind: 'relation/link',
      fromTaskId: base.tasks[1].id,
      toTaskId: base.tasks[0].id,
      type: 'blocked_by',
    })
    expect(compactTask(linked, linked.tasks[1])).toContain('blocked')
  })
})

describe('BoardStore', () => {
  it('applies actions and notifies subscribers', () => {
    const store = new BoardStore(buildBoard())
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })
    store.dispatch({ kind: 'project/create', name: 'Alpha', key: 'ALP' })
    expect(notifications).toBe(1)
    unsubscribe()
    store.dispatch({ kind: 'project/create', name: 'Beta', key: 'BET' })
    expect(notifications).toBe(1)
  })

  it('skips notification for a no-op action', () => {
    const store = new BoardStore(buildBoard())
    let notifications = 0
    store.subscribe(() => {
      notifications += 1
    })
    store.dispatch({ kind: 'task/delete', id: 'missing' })
    expect(notifications).toBe(0)
  })

  it('replaces the whole board on board/replace', () => {
    const store = new BoardStore(richBoard())
    const incoming = parseDocument(serializeDocument(boardWithProject()))!
    store.dispatch({ kind: 'board/replace', state: incoming })
    expect(store.getState().projects).toHaveLength(1)
    expect(store.getState().selectedTaskId).toBeNull()
  })
})
