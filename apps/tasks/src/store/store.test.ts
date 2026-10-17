import { describe, expect, it } from 'vitest'
import type { Action } from './actions'
import { reduce } from './reducer'
import { BoardStore, UNDO_LIMIT } from './store'
import { boardWithProject, buildBoard, firstColumnId, projectId } from '../test/fixtures'

function seeded(): BoardStore {
  const base = boardWithProject()
  const id = projectId(base)
  const actions: Action[] = [
    { kind: 'task/create', projectId: id, columnId: firstColumnId(base), title: 'First' },
    { kind: 'task/create', projectId: id, columnId: firstColumnId(base), title: 'Second' },
  ]
  return new BoardStore(actions.reduce(reduce, base))
}

describe('undo', () => {
  it('starts with nothing to undo', () => {
    expect(seeded().canUndo()).toBe(false)
  })

  it('restores the previous board', () => {
    const store = seeded()
    const before = store.getState()
    store.dispatch({ kind: 'task/update', id: before.tasks[0].id, patch: { title: 'Renamed' } })
    expect(store.getState().tasks[0].title).toBe('Renamed')

    expect(store.undo()).toBe(true)
    expect(store.getState().tasks[0].title).toBe('First')
  })

  it('returns false when there is nothing to undo', () => {
    expect(seeded().undo()).toBe(false)
  })

  it('steps back through several edits in order', () => {
    const store = seeded()
    const id = store.getState().tasks[0].id
    store.dispatch({ kind: 'task/update', id, patch: { title: 'One' } })
    store.dispatch({ kind: 'task/update', id, patch: { title: 'Two' } })
    store.dispatch({ kind: 'task/update', id, patch: { title: 'Three' } })
    expect(store.undoDepth()).toBe(3)

    store.undo()
    expect(store.getState().tasks[0].title).toBe('Two')
    store.undo()
    expect(store.getState().tasks[0].title).toBe('One')
    store.undo()
    expect(store.getState().tasks[0].title).toBe('First')
    expect(store.canUndo()).toBe(false)
  })

  it('restores a deleted task', () => {
    const store = seeded()
    const id = store.getState().tasks[1].id
    store.dispatch({ kind: 'task/delete', id })
    expect(store.getState().tasks).toHaveLength(1)
    store.undo()
    expect(store.getState().tasks).toHaveLength(2)
    expect(store.getState().tasks.some((task) => task.id === id)).toBe(true)
  })

  it('restores a deleted project with its tasks', () => {
    const store = seeded()
    const projectIdValue = store.getState().projects[0].id
    store.dispatch({ kind: 'project/delete', id: projectIdValue })
    expect(store.getState().projects).toHaveLength(0)
    store.undo()
    expect(store.getState().projects).toHaveLength(1)
    expect(store.getState().tasks).toHaveLength(2)
  })

  it('does not record selection or view switching', () => {
    const store = seeded()
    const taskId = store.getState().tasks[0].id
    store.dispatch({ kind: 'ui/selectTask', id: taskId })
    store.dispatch({ kind: 'project/select', id: store.getState().projects[0].id })
    store.dispatch({ kind: 'view/create', name: 'Mine' })
    store.dispatch({ kind: 'view/apply', id: null })

    expect(store.undoDepth()).toBe(1)
  })

  it('does not record a no-op action', () => {
    const store = seeded()
    store.dispatch({ kind: 'task/delete', id: 'does-not-exist' })
    expect(store.undoDepth()).toBe(0)
  })

  it('notifies subscribers on undo', () => {
    const store = seeded()
    let notifications = 0
    store.subscribe(() => {
      notifications += 1
    })
    store.dispatch({ kind: 'task/update', id: store.getState().tasks[0].id, patch: { title: 'X' } })
    store.undo()
    expect(notifications).toBe(2)
  })

  it('caps history at the limit', () => {
    const store = seeded()
    const id = store.getState().tasks[0].id
    for (let index = 0; index < UNDO_LIMIT + 10; index += 1) {
      store.dispatch({ kind: 'task/update', id, patch: { title: `v${index}` } })
    }
    expect(store.undoDepth()).toBe(UNDO_LIMIT)
  })

  it('restores the board when the replacement is undone', () => {
    const store = seeded()
    const original = store.getState()
    store.dispatch({ kind: 'board/replace', state: buildBoard() })
    expect(store.getState().projects).toHaveLength(0)

    expect(store.undo()).toBe(true)
    expect(store.getState().projects).toHaveLength(1)
    expect(store.getState().tasks).toHaveLength(2)
    expect(store.getState()).toEqual(original)
  })
})

describe('redo', () => {
  it('reapplies an undone edit', () => {
    const store = seeded()
    const id = store.getState().tasks[0].id
    store.dispatch({ kind: 'task/update', id, patch: { title: 'Changed' } })
    store.undo()
    expect(store.getState().tasks[0].title).toBe('First')

    expect(store.redo()).toBe(true)
    expect(store.getState().tasks[0].title).toBe('Changed')
  })

  it('returns false when there is nothing to redo', () => {
    expect(seeded().redo()).toBe(false)
  })

  it('drops the redo branch once a new edit lands', () => {
    const store = seeded()
    const id = store.getState().tasks[0].id
    store.dispatch({ kind: 'task/update', id, patch: { title: 'Changed' } })
    store.undo()
    expect(store.canRedo()).toBe(true)

    store.dispatch({ kind: 'task/update', id, patch: { title: 'Different' } })
    expect(store.canRedo()).toBe(false)
    expect(store.getState().tasks[0].title).toBe('Different')
  })

  it('walks back and forth without corrupting state', () => {
    const store = seeded()
    const id = store.getState().tasks[0].id
    store.dispatch({ kind: 'task/update', id, patch: { title: 'A' } })
    store.dispatch({ kind: 'task/update', id, patch: { title: 'B' } })

    store.undo()
    store.undo()
    expect(store.getState().tasks[0].title).toBe('First')
    store.redo()
    expect(store.getState().tasks[0].title).toBe('A')
    store.redo()
    expect(store.getState().tasks[0].title).toBe('B')
    expect(store.canRedo()).toBe(false)
  })
})

describe('view commands', () => {
  it('records filters and sort, not selection', () => {
    const store = seeded()
    store.dispatch({ kind: 'filters/set', patch: { query: 'urgent' } })
    store.dispatch({ kind: 'sort/set', mode: 'priority' })
    // Selection happened in between; it must not be part of the view.
    store.dispatch({ kind: 'ui/selectTask', id: store.getState().tasks[0].id })
    store.dispatch({ kind: 'view/create', name: 'Urgent' })

    const view = store.getState().savedViews[0]
    expect(view.filters.query).toBe('urgent')
    expect(view.sortMode).toBe('priority')
  })
})
