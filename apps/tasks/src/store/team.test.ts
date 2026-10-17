import { describe, expect, it } from 'vitest'

import { EMPTY_FILTERS, memberInitials } from '../domain/types'
import type { CustomFieldValue, BoardState } from '../domain/types'
import type { Action } from './actions'
import { reduce } from './reducer'
import { filterTasks, memberWorkload, tasksAssignedTo } from './selectors'
import { buildBoard, firstColumnId, projectId } from '../test/fixtures'

/** Apply actions to an existing board. */
function apply(state: BoardState, ...actions: Action[]): BoardState {
  return actions.reduce(reduce, state)
}

const state = () =>
  buildBoard(
    { kind: 'project/create', name: 'Website Redesign', key: 'WEB' },
    { kind: 'member/create', name: 'Ada Lovelace', color: 'violet' },
    { kind: 'member/create', name: 'Grace Hopper', color: 'teal' },
  )

describe('members', () => {
  it('creates members with generated ids', () => {
    const board = state()
    expect(board.members).toHaveLength(2)
    expect(board.members[0].name).toBe('Ada Lovelace')
    expect(board.members[0].color).toBe('violet')
    expect(board.members[0].id).not.toBe(board.members[1].id)
  })

  it('derives two-letter avatars', () => {
    expect(memberInitials('Ada Lovelace')).toBe('AL')
    expect(memberInitials('Prince')).toBe('PR')
    expect(memberInitials('  Grace Brewster Murray Hopper ')).toBe('GH')
    expect(memberInitials('   ')).toBe('?')
  })
})

describe('task assignment', () => {
  it('assigns and unassigns, logging both directions', () => {
    let board = state()
    const id = projectId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: firstColumnId(board), title: 'Ship it' })
    const task = board.tasks[0]
    const ada = board.members[0].id

    board = apply(board, { kind: 'task/setAssignee', id: task.id, assigneeId: ada })
    expect(board.tasks[0].assigneeId).toBe(ada)
    expect(board.activity.some((entry) => entry.kind === 'assigned')).toBe(true)

    board = apply(board, { kind: 'task/setAssignee', id: task.id, assigneeId: null })
    expect(board.tasks[0].assigneeId).toBeNull()
    expect(board.activity.some((entry) => entry.kind === 'unassigned')).toBe(true)
  })

  it('refuses an assignee that does not exist instead of storing a dangling id', () => {
    let board = state()
    const id = projectId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: firstColumnId(board), title: 'A' })
    const task = board.tasks[0]

    board = apply(board, { kind: 'task/setAssignee', id: task.id, assigneeId: 'ghost' })
    expect(board.tasks[0].assigneeId).toBeNull()
  })

  it('returns the same reference when the assignee is unchanged', () => {
    let board = state()
    const id = projectId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: firstColumnId(board), title: 'A' })
    const ada = board.members[0].id
    const assigned = reduce(board, { kind: 'task/setAssignee', id: board.tasks[0].id, assigneeId: ada })
    expect(assigned.tasks[0].assigneeId).toBe(ada)

    // No change, so the reducer must return the identical state object.
    const again = reduce(assigned, {
      kind: 'task/setAssignee',
      id: assigned.tasks[0].id,
      assigneeId: ada,
    })
    expect(again).toBe(assigned)
  })

  it('unassigns rather than deleting work when a member is removed', () => {
    let board = state()
    const id = projectId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: firstColumnId(board), title: 'A' })
    const ada = board.members[0].id
    board = apply(board, { kind: 'task/setAssignee', id: board.tasks[0].id, assigneeId: ada })

    board = apply(board, { kind: 'member/delete', id: ada })
    expect(board.members.find((member) => member.id === ada)).toBeUndefined()
    expect(board.tasks[0].assigneeId).toBeNull()
    expect(board.tasks).toHaveLength(1)
  })
})

describe('unassigned filter', () => {
  it('matches tasks with no owner, not tasks without labels', () => {
    let board = state()
    const id = projectId(board)
    const column = firstColumnId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: column, title: 'Owned' })
    board = apply(board, { kind: 'task/create', projectId: id, columnId: column, title: 'Free' })
    const ada = board.members[0].id
    board = apply(board, { kind: 'task/setAssignee', id: board.tasks[0].id, assigneeId: ada })
    // Give the unowned task a label: it must still count as unassigned.
    const labelId = board.labels[0]?.id
    if (labelId) board = apply(board, { kind: 'task/setLabels', id: board.tasks[1].id, labelIds: [labelId] })

    const unassigned = filterTasks(board, board.tasks, {
      ...EMPTY_FILTERS,
      unassignedOnly: true,
    })
    expect(unassigned.map((task) => task.title)).toEqual(['Free'])
  })

  it('filters by named assignee', () => {
    let board = state()
    const id = projectId(board)
    const column = firstColumnId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: column, title: 'Owned' })
    board = apply(board, { kind: 'task/create', projectId: id, columnId: column, title: 'Free' })
    const ada = board.members[0].id
    board = apply(board, { kind: 'task/setAssignee', id: board.tasks[0].id, assigneeId: ada })

    const owned = filterTasks(board, board.tasks, {
      ...EMPTY_FILTERS,
      assigneeIds: [ada],
    })
    expect(owned.map((task) => task.title)).toEqual(['Owned'])
  })
})

describe('derived member views', () => {
  it('lists a member’s open work and their workload', () => {
    let board = state()
    const id = projectId(board)
    const column = firstColumnId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: column, title: 'Mine' })
    const ada = board.members[0].id
    board = apply(board, { kind: 'task/setAssignee', id: board.tasks[0].id, assigneeId: ada })

    expect(tasksAssignedTo(board, ada).map((task) => task.title)).toEqual(['Mine'])

    const workload = memberWorkload(board, id)
    const adaRow = workload.find((row) => row.member.id === ada)
    expect(adaRow?.open).toBe(1)
    expect(adaRow?.done).toBe(0)
  })
})

describe('task duplication', () => {
  function boardWithSubtask() {
    let board = state()
    const id = projectId(board)
    const column = firstColumnId(board)
    board = apply(board, {
      kind: 'task/create',
      projectId: id,
      columnId: column,
      title: 'Parent',
      priority: 'high',
      labelIds: board.labels.map((label) => label.id),
    })
    const parent = board.tasks[0]
    board = apply(board, {
      kind: 'task/create',
      projectId: id,
      columnId: column,
      title: 'Child',
      parentId: parent.id,
    })
    return { board, parentId: parent.id }
  }

  it('copies the task with a fresh id and ticket number', () => {
    const { board, parentId } = boardWithSubtask()
    const next = apply(board, { kind: 'task/duplicate', id: parentId })

    expect(next.tasks).toHaveLength(4)
    const copy = next.tasks.find((task) => task.title === 'Parent' && task.id !== parentId)
    expect(copy).toBeDefined()
    expect(copy!.priority).toBe('high')
    expect(copy!.labelIds).toEqual(board.tasks[0].labelIds)
    expect(copy!.id).not.toBe(parentId)
    expect(next.projects[0].lastTaskNumber).toBe(4)
    expect(next.activity.some((entry) => entry.kind === 'duplicated')).toBe(true)
  })

  it('copies sub-tasks and re-parents them onto the copy', () => {
    const { board, parentId } = boardWithSubtask()
    const next = apply(board, { kind: 'task/duplicate', id: parentId })

    const copies = next.tasks.filter((task) => task.title === 'Parent')
    expect(copies).toHaveLength(2)
    const copy = copies.find((task) => task.id !== parentId)!
    const children = next.tasks.filter((task) => task.parentId === copy.id)
    expect(children).toHaveLength(1)
    expect(children[0].title).toBe('Child')
  })

  it('leaves comments and time entries with the original', () => {
    const { board, parentId } = boardWithSubtask()
    const withComment = apply(board, { kind: 'comment/add', taskId: parentId, body: 'discussion' })
    const withTime = apply(board, { kind: 'task/logTime', id: parentId, minutes: 30 })

    const next = apply(board, { kind: 'task/duplicate', id: parentId })
    const copy = next.tasks.find((task) => task.title === 'Parent' && task.id !== parentId)!
    expect(copy.timeEntries).toEqual([])
    expect(next.comments.filter((comment) => comment.taskId === copy.id)).toHaveLength(0)
    expect(withComment.comments).toHaveLength(1)
    expect(withTime.tasks[0].timeEntries).toHaveLength(1)
  })

  it('can drop the copy into another column and rename it', () => {
    const { board, parentId } = boardWithSubtask()
    const other = board.columns.find((entry) => entry.name === 'In Progress')!.id
    const next = apply(board, { kind: 'task/duplicate', id: parentId, columnId: other, title: 'Copy of it' })

    const copy = next.tasks.find((task) => task.title === 'Copy of it')!
    expect(copy.columnId).toBe(other)
  })
})

describe('external links', () => {
  it('adds and removes links, logging both', () => {
    let board = state()
    const id = projectId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: firstColumnId(board), title: 'A' })
    const taskId = board.tasks[0].id

    board = apply(board, {
      kind: 'externalLink/add',
      taskId,
      type: 'issue',
      url: 'https://github.com/o/r/issues/482',
      externalId: '482',
    })
    expect(board.externalLinks).toHaveLength(1)
    expect(board.externalLinks[0].externalId).toBe('482')
    expect(board.activity.some((entry) => entry.kind === 'link_added')).toBe(true)

    board = apply(board, { kind: 'externalLink/remove', id: board.externalLinks[0].id })
    expect(board.externalLinks).toHaveLength(0)
    expect(board.activity.some((entry) => entry.kind === 'link_removed')).toBe(true)
  })

  it('drops links when their task is deleted', () => {
    let board = state()
    const id = projectId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: firstColumnId(board), title: 'A' })
    board = apply(board, {
      kind: 'externalLink/add',
      taskId: board.tasks[0].id,
      type: 'branch',
      url: 'https://example.com/tree/feature',
    })
    board = apply(board, { kind: 'task/delete', id: board.tasks[0].id })
    expect(board.externalLinks).toHaveLength(0)
  })
})

describe('bulk edits', () => {
  function threeTasks() {
    let board = state()
    const id = projectId(board)
    const column = firstColumnId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: column, title: 'One' })
    board = apply(board, { kind: 'task/create', projectId: id, columnId: column, title: 'Two' })
    board = apply(board, { kind: 'task/create', projectId: id, columnId: column, title: 'Three' })
    return board
  }

  it('updates every selected task and clears the selection', () => {
    const board = threeTasks()
    const ids = [board.tasks[0].id, board.tasks[1].id]
    const next = apply(board, { kind: 'selection/set', ids })
    expect(next.selectedTaskIds).toEqual(ids)

    const edited = apply(board, { kind: 'bulk/update', ids, patch: { priority: 'urgent' } })
    expect(edited.tasks.filter((task) => task.priority === 'urgent')).toHaveLength(2)
    expect(edited.tasks[2].priority).not.toBe('urgent')
    expect(edited.selectedTaskIds).toEqual([])
    expect(edited.activity.filter((entry) => entry.kind === 'bulk_updated')).toHaveLength(2)
  })

  it('toggles selection', () => {
    const board = threeTasks()
    let next = apply(board, { kind: 'selection/toggle', id: board.tasks[0].id })
    expect(next.selectedTaskIds).toEqual([board.tasks[0].id])
    next = apply(next, { kind: 'selection/toggle', id: board.tasks[0].id })
    expect(next.selectedTaskIds).toEqual([])
  })

  it('moves a whole selection into one column', () => {
    const board = threeTasks()
    const target = board.columns.find((entry) => entry.name === 'In Progress')!.id
    const ids = board.tasks.map((task) => task.id)
    const next = apply(board, { kind: 'bulk/move', ids, columnId: target })
    expect(next.tasks.every((task) => task.columnId === target)).toBe(true)
    // Moving promotes sub-tasks, so nothing may stay parented to a moved task.
    expect(next.tasks.every((task) => task.parentId === null)).toBe(true)
  })

  it('refuses to re-parent a task under one of the selected tasks', () => {
    const board = threeTasks()
    const ids = [board.tasks[0].id, board.tasks[1].id]
    const next = apply(board, {
      kind: 'bulk/update',
      ids,
      patch: { parentId: board.tasks[0].id },
    })
    expect(next.tasks[0].parentId).toBeNull()
  })

  it('deletes the whole selection, promoting sub-tasks', () => {
    let board = state()
    const id = projectId(board)
    const column = firstColumnId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: column, title: 'Parent' })
    board = apply(board, {
      kind: 'task/create',
      projectId: id,
      columnId: column,
      title: 'Child',
      parentId: board.tasks[0].id,
    })
    const ids = [board.tasks[0].id, board.tasks[1].id]
    const next = apply(board, { kind: 'selection/set', ids })
    expect(next.selectedTaskIds).toHaveLength(2)

    const deleted = apply(board, { kind: 'bulk/delete', ids })
    expect(deleted.tasks).toHaveLength(0)
    expect(deleted.selectedTaskIds).toHaveLength(0)
  })
})

describe('multiselect custom fields', () => {
  it('stores an array of options', () => {
    let board = state()
    const id = projectId(board)
    board = apply(board, { kind: 'task/create', projectId: id, columnId: firstColumnId(board), title: 'A' })
    board = apply(board, {
      kind: 'customField/define',
      projectId: id,
      name: 'Platforms',
      type: 'multiselect',
      options: ['Web', 'iOS', 'Android'],
    })
    const fieldId = board.customFields[0].id
    const value: CustomFieldValue = ['Web', 'iOS']
    board = apply(board, { kind: 'task/setCustomField', taskId: board.tasks[0].id, fieldId, value })
    expect(board.tasks[0].customFields[fieldId]).toEqual(['Web', 'iOS'])
  })
})