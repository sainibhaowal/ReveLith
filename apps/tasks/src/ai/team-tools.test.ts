import { describe, expect, it } from 'vitest'

import type { BoardState } from '../domain/types'
import type { Action } from '../store/actions'
import { reduce } from '../store/reducer'
import { TEAM_TOOLS } from './team-tools'
import { runTool, toolSchemas } from './tools'
import { buildBoard, firstColumnId, projectId } from '../test/fixtures'

function apply(state: BoardState, ...actions: Action[]): BoardState {
  return actions.reduce(reduce, state)
}

/** A live store, so a tool's dispatch actually lands and can be asserted on. */
function makeStore(initial: BoardState) {
  let state = initial
  return {
    getState: () => state,
    dispatch: (action: Action) => {
      state = reduce(state, action)
    },
    snapshot: () => state,
  }
}

type Store = ReturnType<typeof makeStore>

function seed(): Store {
  const base = buildBoard({ kind: 'project/create', name: 'Site', key: 'SITE' })
  const id = projectId(base)
  const column = firstColumnId(base)
  return makeStore(
    apply(
      base,
      { kind: 'member/create', name: 'Ada Lovelace', color: 'violet' },
      { kind: 'task/create', projectId: id, columnId: column, title: 'Ship the thing' },
    ),
  )
}

/** Run a tool against the live store. */
const run = (store: Store, name: string, input: Record<string, unknown> = {}) =>
  runTool(store, name, input)

const rows = (store: Store, name: string, input: Record<string, unknown> = {}) =>
  JSON.parse(run(store, name, input).output) as Record<string, unknown>[]

describe('team tools are registered', () => {
  it('adds every team tool to the schema surface', () => {
    const names = toolSchemas().map((tool) => tool.name)
    for (const tool of TEAM_TOOLS) expect(names).toContain(tool.name)
  })

  it('gives every tool an inputSchema, not input_schema', () => {
    expect(toolSchemas().every((tool) => 'inputSchema' in tool)).toBe(true)
  })

  it('has no duplicate tool names', () => {
    const names = toolSchemas().map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('members', () => {
  it('lists members with workload counts', () => {
    const store = seed()
    const result = rows(store, 'list_members')
    expect(result[0].name).toBe('Ada Lovelace')
    expect(result[0].initials).toBe('AL')
  })

  it('creates a member on the board', () => {
    const store = seed()
    const created = run(store, 'create_member', { name: 'Grace Hopper' })
    expect(created.mutated).toBe(true)
    expect(store.snapshot().members.map((m) => m.name)).toContain('Grace Hopper')
  })

  it('rejects a duplicate name regardless of case', () => {
    const store = seed()
    run(store, 'create_member', { name: 'Grace Hopper' })
    const again = run(store, 'create_member', { name: 'grace hopper' })
    expect(again.isError).toBe(true)
  })

  it('requires a name', () => {
    expect(run(seed(), 'create_member', {}).isError).toBe(true)
  })

  it('points the model at list_members when a name is unknown', () => {
    const result = run(seed(), 'assign_task', { task: 'Ship the thing', member: 'Nobody' })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('list_members')
  })

  it('keeps tasks when a member is removed', () => {
    const store = seed()
    run(store, 'assign_task', { task: 'Ship the thing', member: 'Ada Lovelace' })
    run(store, 'delete_member', { member: 'Ada Lovelace' })

    const state = store.snapshot()
    expect(state.members).toHaveLength(0)
    expect(state.tasks).toHaveLength(1)
    expect(state.tasks[0].assigneeId).toBeNull()
  })
})

describe('assignment', () => {
  it('assigns by name and lands on the task', () => {
    const store = seed()
    const result = run(store, 'assign_task', { task: 'Ship the thing', member: 'Ada Lovelace' })
    expect(result.mutated).toBe(true)
    expect(store.snapshot().tasks[0].assigneeId).toBe(store.getState().members[0].id)
  })

  it('unassigns when the member is omitted', () => {
    const store = seed()
    run(store, 'assign_task', { task: 'Ship the thing', member: 'Ada Lovelace' })
    const unassigned = run(store, 'assign_task', { task: 'Ship the thing' })
    expect(unassigned.output).toContain('Unassigned')
    expect(store.snapshot().tasks[0].assigneeId).toBeNull()
  })

  it('counts my_tasks against the owner', () => {
    const store = seed()
    run(store, 'assign_task', { task: 'Ship the thing', member: 'Ada Lovelace' })
    const result = rows(store, 'my_tasks', { member: 'Ada Lovelace' })
    expect(result).toHaveLength(1)
    expect(result[0].ticket).toBe('SITE-1')
  })

  it('hides completed work unless asked', () => {
    const store = seed()
    run(store, 'assign_task', { task: 'Ship the thing', member: 'Ada Lovelace' })
    const done = store.getState().columns.find((column) => column.isDone)!
    store.dispatch({ kind: 'bulk/move', ids: [store.getState().tasks[0].id], columnId: done.id })

    expect(rows(store, 'my_tasks', { member: 'Ada Lovelace' })).toHaveLength(0)
    expect(rows(store, 'my_tasks', { member: 'Ada Lovelace', includeDone: true })).toHaveLength(1)
  })
})

describe('duplication tool', () => {
  it('duplicates by ticket id and renames the copy', () => {
    const store = seed()
    const result = run(store, 'duplicate_task', { task: 'SITE-1', title: 'Ship it twice' })
    expect(result.mutated).toBe(true)
    expect(store.snapshot().tasks.map((t) => t.title)).toContain('Ship it twice')
  })

  it('reports an unknown column instead of guessing', () => {
    const result = run(seed(), 'duplicate_task', { task: 'SITE-1', column: 'Nowhere' })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('Nowhere')
  })
})

describe('bulk tool', () => {
  it('rejects an empty task list', () => {
    expect(run(seed(), 'bulk_update_tasks', { tasks: [] }).isError).toBe(true)
  })

  it('applies to the tasks that resolved and ignores the ones that did not', () => {
    const store = seed()
    const result = run(store, 'bulk_update_tasks', { tasks: ['Nope', 'SITE-1'], priority: 'high' })
    expect(result.isError).toBeUndefined()
    expect(store.snapshot().tasks[0].priority).toBe('high')
  })

  it('fails when nothing would change', () => {
    expect(run(seed(), 'bulk_update_tasks', { tasks: ['SITE-1'] }).isError).toBe(true)
  })

  it('moves a batch into a named column', () => {
    const store = seed()
    const result = run(store, 'bulk_update_tasks', { tasks: ['SITE-1'], column: 'In Progress' })
    expect(result.mutated).toBe(true)
    const target = store.getState().columns.find((c) => c.name === 'In Progress')!
    expect(store.snapshot().tasks[0].columnId).toBe(target.id)
  })

  it('archives a batch', () => {
    const store = seed()
    run(store, 'bulk_update_tasks', { tasks: ['SITE-1'], archive: true })
    expect(store.snapshot().tasks[0].archived).toBe(true)
  })
})

describe('external links', () => {
  it('adds, lists and removes a link', () => {
    const store = seed()
    const url = 'https://github.com/o/r/issues/9'
    const added = run(store, 'add_external_link', {
      task: 'SITE-1',
      url,
      type: 'issue',
      externalId: '9',
    })
    expect(added.mutated).toBe(true)
    expect(store.snapshot().externalLinks).toHaveLength(1)

    const listed = rows(store, 'list_external_links', { task: 'SITE-1' })
    expect(listed[0].url).toBe(url)
    expect(listed[0].type).toBe('issue')

    const removed = run(store, 'remove_external_link', { task: 'SITE-1', link: url })
    expect(removed.mutated).toBe(true)
    expect(store.snapshot().externalLinks).toHaveLength(0)
  })

  it('rejects an unknown link type', () => {
    expect(
      run(seed(), 'add_external_link', { task: 'SITE-1', url: 'x', type: 'nonsense' }).isError,
    ).toBe(true)
  })

  it('requires a task reference', () => {
    expect(run(seed(), 'add_external_link', { url: 'x' }).isError).toBe(true)
  })
})

describe('activity feed tool', () => {
  it('returns recent entries with ticket ids', () => {
    const store = seed()
    run(store, 'create_member', { name: 'Grace Hopper' })
    const result = run(store, 'activity_feed', { limit: 5 })
    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('Added member Grace Hopper')
  })

  it('clamps a silly limit rather than dumping the board', () => {
    const store = seed()
    expect(run(store, 'activity_feed', { limit: 0 }).isError).toBeUndefined()
    expect(run(store, 'activity_feed', { limit: 99999 }).isError).toBeUndefined()
    expect(rows(store, 'activity_feed', { limit: 99999 }).length).toBeLessThanOrEqual(200)
  })
})
