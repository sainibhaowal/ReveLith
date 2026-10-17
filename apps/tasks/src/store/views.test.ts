import { describe, expect, it } from 'vitest'
import type { Action } from './actions'
import { reduce } from './reducer'
import { boardWithProject, buildBoard, firstColumnId, projectId } from '../test/fixtures'
import { withDefaults } from './migrate'

function apply(state: ReturnType<typeof buildBoard>, ...actions: Action[]) {
  return actions.reduce(reduce, state)
}

function seeded() {
  const base = boardWithProject()
  const id = projectId(base)
  return apply(
    base,
    {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(base),
      title: 'Alpha',
      priority: 'high',
    },
    {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(base),
      title: 'Beta',
      priority: 'low',
    },
  )
}

describe('filters', () => {
  it('merges a patch into current filters', () => {
    const state = seeded()
    const next = apply(state, { kind: 'filters/set', patch: { query: 'alp' } })
    expect(next.filters.query).toBe('alp')
    expect(next.filters.showArchived).toBe(false)
  })

  it('clears back to defaults', () => {
    const state = apply(seeded(), { kind: 'filters/set', patch: { query: 'x', overdueOnly: true } })
    const next = apply(state, { kind: 'filters/clear' })
    expect(next.filters).toEqual({
      query: '',
      labelIds: [],
      priorities: [],
      columnIds: [],
      assigneeIds: [],
      dueWithinDays: null,
      overdueOnly: false,
      unassignedOnly: false,
      showArchived: false,
    })
  })

  it('sets the sort mode', () => {
    expect(apply(seeded(), { kind: 'sort/set', mode: 'title' }).sortMode).toBe('title')
  })
})

describe('saved views', () => {
  it('captures the current filters and sort', () => {
    const state = apply(
      seeded(),
      { kind: 'filters/set', patch: { query: 'alp', priorities: ['high'] } },
      { kind: 'sort/set', mode: 'priority' },
      { kind: 'view/create', name: 'High priority' },
    )
    const view = state.savedViews[0]
    expect(view.name).toBe('High priority')
    expect(view.filters.query).toBe('alp')
    expect(view.filters.priorities).toEqual(['high'])
    expect(view.sortMode).toBe('priority')
    expect(state.selectedViewId).toBe(view.id)
  })

  it('refuses an unnamed view', () => {
    const state = apply(seeded(), { kind: 'view/create', name: '   ' })
    expect(state.savedViews).toHaveLength(0)
  })

  it('snapshots filters, so later edits do not mutate the view', () => {
    const created = apply(
      seeded(),
      { kind: 'filters/set', patch: { query: 'alp' } },
      { kind: 'view/create', name: 'V' },
    )
    const edited = apply(created, { kind: 'filters/set', patch: { query: 'zzz' } })
    expect(edited.savedViews[0].filters.query).toBe('alp')
  })

  it('restores filters and sort when applied', () => {
    const created = apply(
      seeded(),
      { kind: 'filters/set', patch: { query: 'alp', overdueOnly: true } },
      { kind: 'sort/set', mode: 'title' },
      { kind: 'view/create', name: 'V' },
    )
    const wandered = apply(
      created,
      { kind: 'filters/clear' },
      { kind: 'sort/set', mode: 'createdAt' },
    )
    expect(wandered.selectedViewId).toBeNull()

    const restored = apply(wandered, { kind: 'view/apply', id: created.savedViews[0].id })
    expect(restored.filters.query).toBe('alp')
    expect(restored.filters.overdueOnly).toBe(true)
    expect(restored.sortMode).toBe('title')
    expect(restored.selectedViewId).toBe(created.savedViews[0].id)
  })

  it('drops the selected view once the filters are edited away', () => {
    const created = apply(
      seeded(),
      { kind: 'filters/set', patch: { query: 'alp' } },
      { kind: 'view/create', name: 'V' },
    )
    expect(created.selectedViewId).not.toBeNull()
    const edited = apply(created, { kind: 'filters/set', patch: { query: 'other' } })
    expect(edited.selectedViewId).toBeNull()
  })

  it('keeps the view selected when an unrelated filter is re-set to the same value', () => {
    const created = apply(
      seeded(),
      { kind: 'filters/set', patch: { query: 'alp' } },
      { kind: 'view/create', name: 'V' },
    )
    const same = apply(created, { kind: 'filters/set', patch: { query: 'alp' } })
    expect(same.selectedViewId).toBe(created.savedViews[0].id)
  })

  it('renames a view', () => {
    const created = apply(seeded(), { kind: 'view/create', name: 'Old' })
    const next = apply(created, { kind: 'view/rename', id: created.savedViews[0].id, name: 'New' })
    expect(next.savedViews[0].name).toBe('New')
  })

  it('deletes a view and clears the selection', () => {
    const created = apply(seeded(), { kind: 'view/create', name: 'V' })
    const next = apply(created, { kind: 'view/delete', id: created.savedViews[0].id })
    expect(next.savedViews).toHaveLength(0)
    expect(next.selectedViewId).toBeNull()
  })

  it('ignores applying an unknown view', () => {
    const state = seeded()
    expect(apply(state, { kind: 'view/apply', id: 'nope' })).toBe(state)
  })

  it('survives a save and reload', () => {
    const created = apply(
      seeded(),
      { kind: 'filters/set', patch: { query: 'alp' } },
      { kind: 'view/create', name: 'Kept' },
    )
    const restored = withDefaults(JSON.parse(JSON.stringify(created)))
    expect(restored.savedViews).toHaveLength(1)
    expect(restored.savedViews[0].name).toBe('Kept')
  })
})

describe('attachment metadata', () => {
  it('attaches to a task and records activity', () => {
    const state = seeded()
    const taskId = state.tasks[0].id
    const next = apply(state, {
      kind: 'attachment/add',
      id: 'att_1',
      taskId,
      name: 'shot.png',
      mime: 'image/png',
      size: 2048,
    })
    expect(next.attachments).toHaveLength(1)
    expect(next.attachments[0].name).toBe('shot.png')
    expect(next.activity.at(-1)?.message).toContain('shot.png')
  })

  it('ignores an attachment for an unknown task', () => {
    const state = seeded()
    const next = apply(state, {
      kind: 'attachment/add',
      id: 'att_1',
      taskId: 'ghost',
      name: 'x',
      mime: 'text/plain',
      size: 1,
    })
    expect(next).toBe(state)
  })

  it('removes an attachment', () => {
    const state = seeded()
    const withOne = apply(state, {
      kind: 'attachment/add',
      id: 'att_1',
      taskId: state.tasks[0].id,
      name: 'x',
      mime: 'text/plain',
      size: 1,
    })
    const next = apply(withOne, { kind: 'attachment/remove', id: 'att_1' })
    expect(next.attachments).toHaveLength(0)
  })

  it('drops attachment records when the task is deleted', () => {
    const state = seeded()
    const taskId = state.tasks[0].id
    const withOne = apply(state, {
      kind: 'attachment/add',
      id: 'att_1',
      taskId,
      name: 'x',
      mime: 'text/plain',
      size: 1,
    })
    const next = apply(withOne, { kind: 'task/delete', id: taskId })
    expect(next.attachments).toHaveLength(0)
  })
})

describe('withDefaults', () => {
  it('fills in fields missing from an older document', () => {
    const legacy = withDefaults({ projects: [], columns: [], tasks: [] })
    expect(legacy.attachments).toEqual([])
    expect(legacy.savedViews).toEqual([])
    expect(legacy.filters.query).toBe('')
    expect(legacy.sortMode).toBe('position')
    expect(legacy.selectedViewId).toBeNull()
  })

  it('clears a selected view that no longer exists', () => {
    const restored = withDefaults({ savedViews: [], selectedViewId: 'view_gone' })
    expect(restored.selectedViewId).toBeNull()
  })

  it('keeps a selected view that does exist', () => {
    const view = {
      id: 'v1',
      name: 'V',
      filters: withDefaults({}).filters,
      sortMode: 'title' as const,
      createdAt: 1,
    }
    expect(withDefaults({ savedViews: [view], selectedViewId: 'v1' }).selectedViewId).toBe('v1')
  })

  it('drops the open task on load', () => {
    expect(withDefaults({ selectedTaskId: 'task_1' }).selectedTaskId).toBeNull()
  })
})
