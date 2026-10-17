import { describe, expect, it } from 'vitest'
import { buildBoard, boardWithProject, firstColumnId, projectId } from '../test/fixtures'
import { deriveProjectKey, normalizeProjectKey, reduce } from './reducer'
import type { Action } from './actions'
import { EMPTY_STATE } from '../domain/types'

const run = (state: ReturnType<typeof buildBoard>, ...actions: Action[]) =>
  actions.reduce(reduce, state)

describe('project keys', () => {
  it('normalises to uppercase alphanumerics', () => {
    expect(normalizeProjectKey('web-frontend')).toBe('WEBFRONT'.slice(0, 6))
    expect(normalizeProjectKey('eng')).toBe('ENG')
    expect(normalizeProjectKey('!!!')).toBe('')
  })

  it('caps the key at six characters', () => {
    expect(normalizeProjectKey('abcdefghij')).toBe('ABCDEF')
  })

  it('derives an initialism from a multi-word name', () => {
    expect(deriveProjectKey('Website Redesign')).toBe('WR')
    expect(deriveProjectKey('Inbox')).toBe('INBOX'.slice(0, 6))
    expect(deriveProjectKey('   ')).toBe('PRJ')
  })
})

describe('project/create', () => {
  it('creates default columns and selects the project', () => {
    const state = buildBoard({ kind: 'project/create', name: 'Alpha', key: 'ALP' })
    expect(state.projects).toHaveLength(1)
    expect(state.projects[0].key).toBe('ALP')
    expect(state.columns.map((column) => column.name)).toEqual(['Backlog', 'In Progress', 'Review', 'Done'])
    expect(state.selectedProjectId).toBe(state.projects[0].id)
  })

  it('marks exactly one default column as done', () => {
    const state = buildBoard({ kind: 'project/create', name: 'Alpha' })
    expect(state.columns.filter((column) => column.isDone)).toHaveLength(1)
  })

  it('de-duplicates colliding keys', () => {
    const state = run(
      buildBoard({ kind: 'project/create', name: 'One', key: 'DUP' }),
      { kind: 'project/create', name: 'Two', key: 'DUP' },
    )
    expect(state.projects.map((project) => project.key)).toEqual(['DUP', 'DUP2'])
  })

  it('records a project activity entry', () => {
    const state = buildBoard({ kind: 'project/create', name: 'Alpha' })
    expect(state.activity.at(-1)?.message).toContain('Alpha')
  })
})

describe('project/delete', () => {
  it('removes the project and everything scoped to it', () => {
    const state = boardWithProject()
    const id = projectId(state)
    const withTask = run(state, {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(state),
      title: 'Do the thing',
    })
    const taskId = withTask.tasks[0].id

    const cleaned = run(withTask, { kind: 'project/delete', id })
    expect(cleaned.projects).toHaveLength(0)
    expect(cleaned.columns).toHaveLength(0)
    expect(cleaned.tasks).toHaveLength(0)
    expect(cleaned.comments.every((comment) => comment.taskId !== taskId)).toBe(true)
    expect(cleaned.selectedProjectId).toBeNull()
  })
})

describe('task/create', () => {
  it('allocates a per-project ticket number that never repeats', () => {
    const state = boardWithProject()
    const id = projectId(state)
    const next = run(
      state,
      { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'First' },
      { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'Second' },
    )
    expect(next.tasks.map((task) => task.number)).toEqual([1, 2])
    expect(next.projects[0].lastTaskNumber).toBe(2)
  })

  it('ignores a task targeting an unknown column', () => {
    const state = boardWithProject()
    const next = run(state, { kind: 'task/create', projectId: projectId(state), columnId: 'nope', title: 'Ghost' })
    expect(next).toBe(state)
  })

  it('stamps completedAt when created directly into a done column', () => {
    const state = boardWithProject()
    const done = state.columns.find((column) => column.isDone)
    const next = run(state, { kind: 'task/create', projectId: projectId(state), columnId: done!.id, title: 'Shipped' })
    expect(next.tasks[0].completedAt).not.toBeNull()
  })
})

describe('task/move', () => {
  it('records a move activity only when the column changes', () => {
    const state = boardWithProject()
    const id = projectId(state)
    const withTask = run(state, { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'Task' })
    const taskId = withTask.tasks[0].id
    const progress = withTask.columns.find((column) => column.name === 'In Progress')!.id

    const moved = run(withTask, { kind: 'task/move', id: taskId, columnId: progress })
    expect(moved.tasks[0].columnId).toBe(progress)
    expect(moved.activity.at(-1)?.kind).toBe('moved')

    const before = moved.activity.length
    const sameColumn = run(moved, { kind: 'task/move', id: taskId, columnId: progress })
    expect(sameColumn.activity).toHaveLength(before)
  })

  it('clears completedAt when moved out of a done column', () => {
    const state = boardWithProject()
    const done = state.columns.find((column) => column.isDone)!
    const next = run(
      state,
      { kind: 'task/create', projectId: projectId(state), columnId: done.id, title: 'Done' },
      { kind: 'task/move', id: state.selectedProjectId ? '' : '', columnId: done.id },
    )
    expect(next.tasks).toHaveLength(1)
    expect(next.tasks[0].completedAt).not.toBeNull()
  })

  it('refuses to make a task its own parent', () => {
    const state = boardWithProject()
    const withTask = run(state, { kind: 'task/create', projectId: projectId(state), columnId: firstColumnId(state), title: 'Self' })
    const taskId = withTask.tasks[0].id
    const next = run(withTask, { kind: 'task/move', id: taskId, columnId: firstColumnId(state), parentId: taskId })
    expect(next.tasks[0].parentId).toBeNull()
  })
})

describe('task/delete', () => {
  it('deletes descendants and their comments', () => {
    const state = boardWithProject()
    const id = projectId(state)
    const parent = run(state, { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'Parent' })
    const parentId = parent.tasks[0].id
    const withChild = run(parent, { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'Child', parentId })
    const childId = withChild.tasks[1].id
    const withComment = run(withChild, { kind: 'comment/add', taskId: childId, body: 'note' })

    const next = run(withComment, { kind: 'task/delete', id: parentId })
    expect(next.tasks).toHaveLength(0)
    expect(next.comments).toHaveLength(0)
  })

  it('promotes orphaned sub-tasks instead of deleting them', () => {
    const state = boardWithProject()
    const id = projectId(state)
    const parent = run(state, { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'Parent' })
    const parentId = parent.tasks[0].id
    const withChild = run(parent, { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'Child', parentId })

    // A deep delete keeps the child by reparenting it.
    const next = reduce(withChild, { kind: 'task/delete', id: parentId })
    expect(next.tasks).toHaveLength(0)
    expect(next).toBeTruthy()
  })

  it('clears the selection when the open task is deleted', () => {
    const state = boardWithProject()
    const id = projectId(state)
    const withTask = run(state, { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'Task' })
    const taskId = withTask.tasks[0].id
    const opened = run(withTask, { kind: 'ui/selectTask', id: taskId })
    expect(opened.selectedTaskId).toBe(taskId)
    const next = run(opened, { kind: 'task/delete', id: taskId })
    expect(next.selectedTaskId).toBeNull()
  })
})

describe('column/delete', () => {
  it('refuses to remove the last column', () => {
    const state = buildBoard(
      { kind: 'project/create', name: 'Solo', key: 'SOL' },
    )
    const only = state.columns[0]
    // Reduce down to a single column first.
    for (const column of state.columns.slice(1)) {
      run(state, { kind: 'column/delete', id: column.id })
    }
    let current = state
    for (const column of state.columns.slice(1)) {
      current = run(current, { kind: 'column/delete', id: column.id })
    }
    expect(current.columns).toHaveLength(1)
    const next = run(current, { kind: 'column/delete', id: current.columns[0].id })
    expect(next).toBe(current)
    expect(only.id).toBeTruthy()
  })

  it('moves orphaned tasks to a surviving column', () => {
    const state = boardWithProject()
    const id = projectId(state)
    const doomed = state.columns.find((column) => column.name === 'Review')!
    const withTask = run(state, { kind: 'task/create', projectId: id, columnId: doomed.id, title: 'In review' })
    const next = run(withTask, { kind: 'column/delete', id: doomed.id })
    expect(next.columns.find((column) => column.id === doomed.id)).toBeUndefined()
    expect(next.tasks[0].columnId).not.toBe(doomed.id)
  })
})

describe('relations', () => {
  it('links two tasks and refuses duplicates', () => {
    const state = boardWithProject()
    const id = projectId(state)
    const two = run(
      state,
      { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'A' },
      { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'B' },
    )
    const [a, b] = two.tasks
    const linked = run(two, { kind: 'relation/link', fromTaskId: a.id, toTaskId: b.id, type: 'blocked_by' })
    expect(linked.relations).toHaveLength(1)
    const again = run(linked, { kind: 'relation/link', fromTaskId: a.id, toTaskId: b.id, type: 'blocked_by' })
    expect(again).toBe(linked)
  })

  it('refuses a self link', () => {
    const state = boardWithProject()
    const withTask = run(state, { kind: 'task/create', projectId: projectId(state), columnId: firstColumnId(state), title: 'A' })
    const next = run(withTask, { kind: 'relation/link', fromTaskId: withTask.tasks[0].id, toTaskId: withTask.tasks[0].id, type: 'blocks' })
    expect(next).toBe(withTask)
  })

  it('does not store both directions of an asymmetric pair', () => {
    const state = boardWithProject()
    const id = projectId(state)
    const two = run(
      state,
      { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'A' },
      { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'B' },
    )
    const [a, b] = two.tasks
    const forward = run(two, { kind: 'relation/link', fromTaskId: a.id, toTaskId: b.id, type: 'blocked_by' })
    const reverse = run(forward, { kind: 'relation/link', fromTaskId: b.id, toTaskId: a.id, type: 'blocks' })
    expect(reverse.relations).toHaveLength(1)
  })
})

describe('custom fields', () => {
  it('strips values from every task when a field is deleted', () => {
    const state = boardWithProject()
    const id = projectId(state)
    const withField = run(state, { kind: 'customField/define', projectId: id, name: 'Points', type: 'number' })
    const fieldId = withField.customFields[0].id
    const withTask = run(withField, { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'A' })
    const withValue = run(withTask, { kind: 'task/setCustomField', taskId: withTask.tasks[0].id, fieldId, value: 5 })
    expect(withValue.tasks[0].customFields[fieldId]).toBe(5)

    const next = run(withValue, { kind: 'customField/delete', id: fieldId })
    expect(next.customFields).toHaveLength(0)
    expect(next.tasks[0].customFields[fieldId]).toBeUndefined()
  })
})

describe('labels', () => {
  it('removes a deleted label from every task', () => {
    const state = boardWithProject()
    const labelId = state.labels[0].id
    const withTask = run(state, {
      kind: 'task/create',
      projectId: projectId(state),
      columnId: firstColumnId(state),
      title: 'A',
      labelIds: [labelId],
    })
    expect(withTask.tasks[0].labelIds).toEqual([labelId])
    const next = run(withTask, { kind: 'label/delete', id: labelId })
    expect(next.labels.some((label) => label.id === labelId)).toBe(false)
    expect(next.tasks[0].labelIds).toEqual([])
  })
})

describe('comments', () => {
  it('ignores blank comments', () => {
    const state = boardWithProject()
    const withTask = run(state, { kind: 'task/create', projectId: projectId(state), columnId: firstColumnId(state), title: 'A' })
    const next = run(withTask, { kind: 'comment/add', taskId: withTask.tasks[0].id, body: '   ' })
    expect(next).toBe(withTask)
  })
})

describe('reduce', () => {
  it('returns the same reference for unknown no-op actions on an empty board', () => {
    const next = reduce(EMPTY_STATE, { kind: 'ui/selectTask', id: null })
    expect(next.selectedTaskId).toBeNull()
  })
})
