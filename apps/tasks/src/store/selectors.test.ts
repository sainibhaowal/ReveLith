import { describe, expect, it } from 'vitest'
import type { Action } from './actions'
import { reduce } from './reducer'
import { buildBoard, boardWithProject, firstColumnId, projectId } from '../test/fixtures'
import {
  boardTasks,
  columnLoad,
  daysUntilDue,
  EMPTY_FILTERS,
  filterTasks,
  hasActiveFilters,
  isBlocked,
  isOverdue,
  isTaskDone,
  projectColumns,
  projectStats,
  relatedTasks,
  remainingMinutes,
  sortTasks,
  subtasksOf,
  tasksBlockedBy,
  ticketId,
  totalLoggedMinutes,
} from './selectors'

const TODAY = new Date('2026-03-10T12:00:00Z')

function apply(state: ReturnType<typeof buildBoard>, ...actions: Action[]) {
  return actions.reduce(reduce, state)
}

function seeded() {
  const base = boardWithProject()
  const id = projectId(base)
  const backlog = firstColumnId(base)
  const done = base.columns.find((column) => column.isDone)!.id
  return apply(
    base,
    { kind: 'task/create', projectId: id, columnId: backlog, title: 'Alpha', priority: 'high', dueDate: '2026-03-09' },
    { kind: 'task/create', projectId: id, columnId: backlog, title: 'Beta', priority: 'low' },
    { kind: 'task/create', projectId: id, columnId: done, title: 'Gamma', priority: 'medium' },
  )
}

describe('ticket ids', () => {
  it('joins the project key and task number', () => {
    const state = seeded()
    expect(ticketId(state, state.tasks[0])).toBe('WEB-1')
  })
})

describe('isOverdue and daysUntilDue', () => {
  it('treats a past, unfinished due date as overdue', () => {
    const state = seeded()
    expect(isOverdue(state.tasks[0], TODAY)).toBe(true)
  })

  it('does not report a completed task as overdue', () => {
    const state = seeded()
    const doneTask = state.tasks.find((task) => task.title === 'Gamma')!
    expect(doneTask.dueDate).toBeNull()
    const withDue = apply(state, { kind: 'task/update', id: doneTask.id, patch: { dueDate: '2026-01-01' } })
    expect(isOverdue(withDue.tasks.find((task) => task.id === doneTask.id)!, TODAY)).toBe(false)
  })

  it('returns null for an undated task', () => {
    const state = seeded()
    expect(daysUntilDue(state.tasks[1], TODAY)).toBeNull()
  })

  it('counts whole days either side of today', () => {
    const state = seeded()
    const task = state.tasks[0]
    const in3 = apply(state, { kind: 'task/update', id: task.id, patch: { dueDate: '2026-03-13' } })
    expect(daysUntilDue(in3.tasks[0], TODAY)).toBe(3)
  })
})

describe('filterTasks', () => {
  it('matches free text across title, description, ticket and labels', () => {
    const state = seeded()
    const id = state.tasks[0].id
    const labelled = apply(state, { kind: 'task/setLabels', id, labelIds: [state.labels[0].id] })

    expect(filterTasks(labelled, labelled.tasks, { ...EMPTY_FILTERS, query: 'alph' })).toHaveLength(1)
    expect(filterTasks(labelled, labelled.tasks, { ...EMPTY_FILTERS, query: 'WEB-2' })).toHaveLength(1)
    expect(filterTasks(labelled, labelled.tasks, { ...EMPTY_FILTERS, query: state.labels[0].name })).toHaveLength(1)
    expect(filterTasks(labelled, labelled.tasks, { ...EMPTY_FILTERS, query: 'nothing here' })).toHaveLength(0)
  })

  it('filters by priority and column', () => {
    const state = seeded()
    expect(filterTasks(state, state.tasks, { ...EMPTY_FILTERS, priorities: ['high'] })).toHaveLength(1)
    const done = state.columns.find((column) => column.isDone)!
    expect(filterTasks(state, state.tasks, { ...EMPTY_FILTERS, columnIds: [done.id] })).toHaveLength(1)
  })

  it('hides archived tasks unless asked, and then shows only those', () => {
    const state = seeded()
    const archived = apply(state, { kind: 'task/setArchived', id: state.tasks[1].id, archived: true })
    expect(filterTasks(archived, archived.tasks, EMPTY_FILTERS)).toHaveLength(2)
    expect(filterTasks(archived, archived.tasks, { ...EMPTY_FILTERS, showArchived: true })).toHaveLength(1)
  })

  it('includes overdue tasks in a due-within window', () => {
    const state = seeded()
    const matches = filterTasks(state, state.tasks, { ...EMPTY_FILTERS, dueWithinDays: 3 }, TODAY)
    expect(matches.map((task) => task.title)).toContain('Alpha')
  })
})

describe('hasActiveFilters', () => {
  it('detects each filter dimension', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: 'x' })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, labelIds: ['a'] })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, overdueOnly: true })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, dueWithinDays: 7 })).toBe(true)
    // Archived-only view is a view mode, not a narrowing filter.
    expect(hasActiveFilters({ ...EMPTY_FILTERS, showArchived: true })).toBe(false)
  })
})

describe('sortTasks', () => {
  it('orders by priority', () => {
    const state = seeded()
    const sorted = sortTasks(state.tasks, 'priority', state)
    expect(sorted.map((task) => task.priority)).toEqual(['high', 'medium', 'low'])
  })

  it('sorts undated tasks last', () => {
    const state = seeded()
    const withDates = apply(state, { kind: 'task/update', id: state.tasks[1].id, patch: { dueDate: '2026-04-01' } })
    const sorted = sortTasks(withDates.tasks, 'dueDate', withDates)
    // Alpha is due first, Beta second, and undated Gamma sinks to the bottom.
    expect(sorted.map((task) => task.title)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('does not mutate the input array', () => {
    const state = seeded()
    const before = state.tasks.map((task) => task.id)
    sortTasks(state.tasks, 'title', state)
    expect(state.tasks.map((task) => task.id)).toEqual(before)
  })
})

describe('relations', () => {
  it('reports a blocked task until its blocker is done', () => {
    const state = seeded()
    const [alpha, beta] = state.tasks
    const linked = apply(state, { kind: 'relation/link', fromTaskId: alpha.id, toTaskId: beta.id, type: 'blocked_by' })
    expect(isBlocked(linked, linked.tasks[0])).toBe(true)
    expect(tasksBlockedBy(linked, linked.tasks[0]).map((task) => task.title)).toEqual(['Beta'])

    const blockerDone = linked.columns.find((column) => column.isDone)!
    const unblocked = apply(linked, { kind: 'task/move', id: linked.tasks[1].id, columnId: blockerDone.id })
    expect(isBlocked(unblocked, unblocked.tasks[0])).toBe(false)
  })

  it('reads symmetric relations from either side', () => {
    const state = seeded()
    const linked = apply(state, { kind: 'relation/link', fromTaskId: state.tasks[0].id, toTaskId: state.tasks[1].id, type: 'relates_to' })
    expect(relatedTasks(linked, linked.tasks[0])).toHaveLength(1)
    expect(relatedTasks(linked, linked.tasks[1])).toHaveLength(1)
  })
})

describe('subtasks', () => {
  it('lists children in manual order and hides archived ones', () => {
    const state = seeded()
    const parent = state.tasks[0]
    const withKids = apply(
      state,
      { kind: 'task/create', projectId: parent.projectId, columnId: parent.columnId, title: 'Child 1', parentId: parent.id },
      { kind: 'task/create', projectId: parent.projectId, columnId: parent.columnId, title: 'Child 2', parentId: parent.id },
    )
    expect(subtasksOf(withKids, parent.id).map((task) => task.title)).toEqual(['Child 1', 'Child 2'])

    const childId = subtasksOf(withKids, parent.id)[0].id
    const archived = apply(withKids, { kind: 'task/setArchived', id: childId, archived: true })
    expect(subtasksOf(archived, parent.id)).toHaveLength(1)
  })
})

describe('time tracking', () => {
  it('sums entries and computes remaining against an estimate', () => {
    const state = seeded()
    const taskId = state.tasks[0].id
    const logged = apply(
      state,
      { kind: 'task/update', id: taskId, patch: { estimateMinutes: 120 } },
      { kind: 'task/logTime', id: taskId, minutes: 45 },
      { kind: 'task/logTime', id: taskId, minutes: 30 },
    )
    const task = logged.tasks[0]
    expect(totalLoggedMinutes(task)).toBe(75)
    expect(remainingMinutes(task)).toBe(45)
  })

  it('returns null remaining when there is no estimate', () => {
    const state = seeded()
    expect(remainingMinutes(state.tasks[0])).toBeNull()
  })

  it('ignores non-positive time entries', () => {
    const state = seeded()
    const next = apply(state, { kind: 'task/logTime', id: state.tasks[0].id, minutes: 0 })
    expect(next).toBe(state)
  })
})

describe('project aggregates', () => {
  it('counts completion, overdue and blocked work', () => {
    const state = seeded()
    const stats = projectStats(state, projectId(state), TODAY)
    expect(stats.total).toBe(3)
    expect(stats.done).toBe(1)
    expect(stats.overdue).toBe(1)
    expect(stats.completion).toBe(33)

    const linked = apply(state, { kind: 'relation/link', fromTaskId: state.tasks[0].id, toTaskId: state.tasks[1].id, type: 'blocked_by' })
    expect(projectStats(linked, projectId(linked), TODAY).blocked).toBe(1)
  })

  it('reports zero completion for an empty project', () => {
    const state = boardWithProject()
    expect(projectStats(state, projectId(state)).completion).toBe(0)
  })

  it('counts top-level load per column, ignoring sub-tasks', () => {
    const state = seeded()
    const parent = state.tasks[0]
    const withKid = apply(state, { kind: 'task/create', projectId: parent.projectId, columnId: parent.columnId, title: 'Kid', parentId: parent.id })
    expect(columnLoad(withKid, parent.columnId)).toBe(2)
  })

  it('lists columns in display order', () => {
    const state = boardWithProject()
    const names = projectColumns(state, projectId(state)).map((column) => column.name)
    expect(names).toEqual(['Backlog', 'In Progress', 'Review', 'Done'])
  })
})

describe('isTaskDone', () => {
  it('follows the column, not the completedAt stamp', () => {
    const state = seeded()
    const gamma = state.tasks.find((task) => task.title === 'Gamma')!
    expect(isTaskDone(state, gamma)).toBe(true)
  })
})

describe('boardTasks', () => {
  it('returns nothing without a project', () => {
    const state = seeded()
    expect(boardTasks(state, null, EMPTY_FILTERS, 'position', TODAY)).toEqual([])
  })

  it('scopes to the project and applies filters and sort', () => {
    const state = seeded()
    const rows = boardTasks(state, projectId(state), { ...EMPTY_FILTERS, priorities: ['high'] }, 'title', TODAY)
    expect(rows.map((task) => task.title)).toEqual(['Alpha'])
  })
})
