import { describe, expect, it } from 'vitest'
import type { Action } from './actions'
import { reduce } from './reducer'
import { boardWithProject, buildBoard, firstColumnId, projectId } from '../test/fixtures'
import {
  buildNotifications,
  findMentions,
  notificationCounts,
  notificationSummary,
} from './notifications'

const TODAY = new Date('2026-03-10T12:00:00Z')

function apply(state: ReturnType<typeof buildBoard>, ...actions: Action[]) {
  return actions.reduce(reduce, state)
}

/**
 * Five tasks: one overdue, one due in two days, one due in June, one undated,
 * and one completed-and-overdue (which must never notify).
 */
function seeded() {
  const base = boardWithProject()
  const id = projectId(base)
  const done = base.columns.find((column) => column.isDone)!.id
  const built = apply(
    base,
    {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(base),
      title: 'Overdue task',
      dueDate: '2026-03-01',
    },
    {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(base),
      title: 'Soon task',
      dueDate: '2026-03-12',
    },
    {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(base),
      title: 'Later task',
      dueDate: '2026-06-01',
    },
    { kind: 'task/create', projectId: id, columnId: firstColumnId(base), title: 'Undated task' },
    {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(base),
      title: 'Done task',
      dueDate: '2026-01-01',
    },
  )
  const doneTask = built.tasks.find((task) => task.title === 'Done task')!
  return apply(built, { kind: 'task/move', id: doneTask.id, columnId: done })
}

describe('buildNotifications', () => {
  it('reports the overdue task and the due-soon task', () => {
    const state = seeded()
    const notifications = buildNotifications(state, projectId(state), TODAY)
    const overdue = notifications.filter((entry) => entry.kind === 'overdue')
    const soon = notifications.filter((entry) => entry.kind === 'dueSoon')

    expect(overdue.map((entry) => entry.taskTitle)).toEqual(['Overdue task'])
    expect(soon.map((entry) => entry.taskTitle)).toEqual(['Soon task'])
  })

  it('ignores undated tasks entirely', () => {
    const state = seeded()
    const notifications = buildNotifications(state, projectId(state), TODAY)
    expect(notifications.some((entry) => entry.taskTitle === 'Undated task')).toBe(false)
  })

  it('never reports a completed task as overdue', () => {
    const state = seeded()
    const notifications = buildNotifications(state, projectId(state), TODAY)
    expect(notifications.some((entry) => entry.taskTitle === 'Done task')).toBe(false)
  })

  it('excludes tasks far in the future', () => {
    const state = seeded()
    const notifications = buildNotifications(state, projectId(state), TODAY)
    expect(notifications.some((entry) => entry.taskTitle === 'Later task')).toBe(false)
  })

  it('honours a custom due-soon window', () => {
    const state = seeded()
    const narrow = buildNotifications(state, projectId(state), TODAY, { dueWithinDays: 1 })
    expect(narrow.some((entry) => entry.kind === 'dueSoon')).toBe(false)
  })

  it('reports a blocked task', () => {
    const base = seeded()
    const later = base.tasks.find((task) => task.title === 'Later task')!
    const overdue = base.tasks.find((task) => task.title === 'Overdue task')!
    const state = apply(base, {
      kind: 'relation/link',
      fromTaskId: later.id,
      toTaskId: overdue.id,
      type: 'blocked_by',
    })
    const notifications = buildNotifications(state, projectId(state), TODAY)
    const blocked = notifications.filter((entry) => entry.kind === 'blocked')
    expect(blocked).toHaveLength(1)
    expect(blocked[0].taskTitle).toBe('Later task')
  })

  it('clears the blocked notification once the blocker is done', () => {
    const base = seeded()
    const later = base.tasks.find((task) => task.title === 'Later task')!
    const overdue = base.tasks.find((task) => task.title === 'Overdue task')!
    const linked = apply(base, {
      kind: 'relation/link',
      fromTaskId: later.id,
      toTaskId: overdue.id,
      type: 'blocked_by',
    })
    const doneColumn = linked.columns.find((column) => column.isDone)!
    const resolved = apply(linked, { kind: 'task/move', id: overdue.id, columnId: doneColumn.id })
    const notifications = buildNotifications(resolved, projectId(resolved), TODAY)
    expect(notifications.some((entry) => entry.kind === 'blocked')).toBe(false)
  })

  it('skips archived and sub-tasks', () => {
    const base = seeded()
    const state = apply(
      base,
      { kind: 'task/setArchived', id: base.tasks[0].id, archived: true },
      {
        kind: 'task/create',
        projectId: projectId(base),
        columnId: firstColumnId(base),
        title: 'Child',
        parentId: base.tasks[1].id,
        dueDate: '2026-03-02',
      },
    )
    const notifications = buildNotifications(state, projectId(state), TODAY)
    expect(notifications.some((entry) => entry.taskTitle === 'Overdue task')).toBe(false)
    expect(notifications.some((entry) => entry.taskTitle === 'Child')).toBe(false)
  })

  it('scopes to the given project by default', () => {
    const base = seeded()
    const firstProject = projectId(base)
    const state = apply(base, { kind: 'project/create', name: 'Other', key: 'OTH' })
    const other = state.projects[1]
    const withOtherTask = apply(state, {
      kind: 'task/create',
      projectId: other.id,
      columnId: state.columns.find((column) => column.projectId === other.id)!.id,
      title: 'Elsewhere',
      dueDate: '2026-03-01',
    })

    const scoped = buildNotifications(withOtherTask, firstProject, TODAY)
    expect(scoped.some((entry) => entry.taskTitle === 'Elsewhere')).toBe(false)
    expect(scoped.some((entry) => entry.taskTitle === 'Overdue task')).toBe(true)

    const global = buildNotifications(withOtherTask, firstProject, TODAY, { allProjects: true })
    expect(global.some((entry) => entry.taskTitle === 'Elsewhere')).toBe(true)
  })

  it('returns nothing for an empty board', () => {
    expect(buildNotifications(buildBoard(), null, TODAY)).toEqual([])
  })

  it('caps the list', () => {
    const base = boardWithProject()
    const id = projectId(base)
    const actions: Action[] = Array.from({ length: 150 }, (_, index) => ({
      kind: 'task/create' as const,
      projectId: id,
      columnId: firstColumnId(base),
      title: `Task ${index}`,
      dueDate: '2026-03-01',
    }))
    const state = actions.reduce(reduce, base)
    expect(buildNotifications(state, id, TODAY)).toHaveLength(100)
  })
})

describe('mentions', () => {
  it('detects an @mention', () => {
    expect(findMentions('hey @rav can you look?', 'rav')).toBe(true)
    expect(findMentions('@rav please review', 'rav')).toBe(true)
    expect(findMentions('no mention here', 'rav')).toBe(false)
  })

  it('is case insensitive', () => {
    expect(findMentions('hi @RAV', 'rav')).toBe(true)
  })

  it('ignores an email address', () => {
    expect(findMentions('write to travis@example.com', 'travis')).toBe(false)
  })

  it('does not match a longer name that merely starts the same', () => {
    expect(findMentions('hi @ravent', 'rav')).toBe(false)
  })

  it('returns false for an empty author', () => {
    expect(findMentions('@ anyone', '  ')).toBe(false)
  })

  it('raises a notification for a mention', () => {
    const base = seeded()
    const state = apply(base, {
      kind: 'comment/add',
      taskId: base.tasks[2].id,
      body: '@rav take a look',
      author: 'Sam',
    })
    const notifications = buildNotifications(state, projectId(state), TODAY, {
      currentAuthor: 'rav',
    })
    const mentions = notifications.filter((entry) => entry.kind === 'mention')
    expect(mentions).toHaveLength(1)
    expect(mentions[0].message).toContain('Sam')
  })
})

describe('counts and summary', () => {
  it('counts per kind', () => {
    const state = seeded()
    const counts = notificationCounts(buildNotifications(state, projectId(state), TODAY))
    expect(counts.overdue).toBeGreaterThan(0)
    expect(counts.overdue + counts.dueSoon + counts.blocked).toBe(
      buildNotifications(state, projectId(state), TODAY).length,
    )
  })

  it('summarises for the status bar', () => {
    const state = seeded()
    const summary = notificationSummary(buildNotifications(state, projectId(state), TODAY))
    expect(summary).toContain('overdue')
  })

  it('summarises an empty list as blank', () => {
    expect(notificationSummary([])).toBe('')
  })

  it('pluralises mentions correctly', () => {
    expect(
      notificationSummary([
        { id: '1', kind: 'mention', taskId: null, taskTitle: 't', message: 'm', createdAt: 1 },
      ]),
    ).toBe('1 mention')
    expect(
      notificationSummary([
        { id: '1', kind: 'mention', taskId: null, taskTitle: 't', message: 'm', createdAt: 1 },
        { id: '2', kind: 'mention', taskId: null, taskTitle: 't', message: 'm', createdAt: 1 },
      ]),
    ).toBe('2 mentions')
  })
})
