import { describe, expect, it } from 'vitest'
import type { Action } from '../store/actions'
import { reduce } from '../store/reducer'
import { boardWithProject, buildBoard, firstColumnId, projectId } from '../test/fixtures'
import { BoardStore } from '../store/store'
import { buildBoardContext, createSkill } from './agent'
import { getTool, runTool, TOOLS, toolSchemas, type ToolResult } from './tools'
import { resolveColumn, resolveProject, resolveTask } from './resolve'

function storeWithBoard(): BoardStore {
  const base = boardWithProject()
  const id = projectId(base)
  const setup: Action[] = [
    { kind: 'customField/define', projectId: id, name: 'Points', type: 'number' },
    {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(base),
      title: 'Write the spec',
      priority: 'high',
    },
    {
      kind: 'task/create',
      projectId: id,
      columnId: firstColumnId(base),
      title: 'Ship the build',
      priority: 'urgent',
    },
  ]
  return new BoardStore(setup.reduce(reduce, base))
}

function call(store: BoardStore, name: string, input: Record<string, unknown> = {}): ToolResult {
  return runTool(store, name, input)
}

describe('saved view tools', () => {
  it('lists, creates, applies and deletes views', () => {
    const store = storeWithBoard()
    expect(JSON.parse(call(store, 'list_saved_views').output)).toEqual([])

    store.dispatch({ kind: 'filters/set', patch: { query: 'spec', priorities: ['high'] } })
    store.dispatch({ kind: 'sort/set', mode: 'priority' })
    const created = call(store, 'create_saved_view', { name: 'Urgent work' })
    expect(created.mutated).toBe(true)
    expect(store.getState().savedViews).toHaveLength(1)

    const listed = JSON.parse(call(store, 'list_saved_views').output)
    expect(listed[0].name).toBe('Urgent work')
    expect(listed[0].query).toBe('spec')
    expect(listed[0].applied).toBe(true)

    store.dispatch({ kind: 'filters/clear' })
    expect(store.getState().filters.query).toBe('')

    const applied = call(store, 'apply_saved_view', { view: 'Urgent work' })
    expect(applied.isError).toBeUndefined()
    expect(store.getState().filters.query).toBe('spec')

    expect(call(store, 'delete_saved_view', { view: 'Urgent work' }).mutated).toBe(true)
    expect(store.getState().savedViews).toHaveLength(0)
  })

  it('refuses a duplicate name and a missing name', () => {
    const store = storeWithBoard()
    call(store, 'create_saved_view', { name: 'Mine' })
    expect(call(store, 'create_saved_view', { name: 'mine' }).isError).toBe(true)
    expect(call(store, 'create_saved_view', { name: '   ' }).isError).toBe(true)
  })

  it('reports a helpful error for an unknown view', () => {
    const store = storeWithBoard()
    const result = call(store, 'apply_saved_view', { view: 'Nope' })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('none')
  })
})

describe('attachment tool', () => {
  it('lists metadata for a task', () => {
    const store = storeWithBoard()
    store.dispatch({
      kind: 'attachment/add',
      id: 'att_1',
      taskId: store.getState().tasks[0].id,
      name: 'spec.pdf',
      mime: 'application/pdf',
      size: 4096,
    })
    const rows = JSON.parse(call(store, 'list_attachments', { task: 'WEB-1' }).output)
    expect(rows).toEqual([
      { name: 'spec.pdf', type: 'application/pdf', bytes: 4096, addedAt: expect.any(String) },
    ])
  })

  it('lists every attachment in the project when no task is given', () => {
    const store = storeWithBoard()
    store.dispatch({
      kind: 'attachment/add',
      id: 'att_1',
      taskId: store.getState().tasks[0].id,
      name: 'a.png',
      mime: 'image/png',
      size: 10,
    })
    const rows = JSON.parse(call(store, 'list_attachments').output)
    expect(rows).toHaveLength(1)
    expect(rows[0].task).toBe('WEB-1')
  })

  it('errors for an unknown task', () => {
    expect(call(storeWithBoard(), 'list_attachments', { task: 'nope' }).isError).toBe(true)
  })
})

describe('tool registry', () => {
  it('exposes a unique name per tool', () => {
    const names = TOOLS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every tool a description and an object schema', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(10)
      expect(tool.inputSchema.type).toBe('object')
    }
  })

  it('exports schemas in the shape a chat model expects', () => {
    const schemas = toolSchemas()
    expect(schemas).toHaveLength(TOOLS.length)
    expect(schemas[0]).toHaveProperty('inputSchema')
  })

  it('fails cleanly on an unknown tool instead of throwing', () => {
    const store = storeWithBoard()
    const result = call(store, 'does_not_exist')
    expect(result.isError).toBe(true)
    expect(result.output).toContain('Available tools')
  })

  it('wraps a throwing tool as an error result', () => {
    const store = storeWithBoard()
    const tool = getTool('list_tasks')!
    const original = tool.run
    tool.run = () => {
      throw new Error('boom')
    }
    const result = call(store, 'list_tasks')
    tool.run = original
    expect(result.isError).toBe(true)
    expect(result.output).toContain('boom')
  })
})

describe('resolvers', () => {
  it('resolves a project by id, key and name', () => {
    const store = storeWithBoard()
    const state = store.getState()
    const project = state.projects[0]
    expect(resolveProject(state, project.id).via).toBe('id')
    expect(resolveProject(state, 'WEB').via).toBe('key')
    expect(resolveProject(state, 'website redesign').via).toBe('name')
    expect(resolveProject(state, 'website').via).toBe('name')
    expect(resolveProject(state, 'nothing').value).toBeNull()
  })

  it('resolves a task by ticket id and title', () => {
    const store = storeWithBoard()
    const state = store.getState()
    expect(resolveTask(state, 'WEB-1').via).toBe('ticket')
    expect(resolveTask(state, 'web-2').via).toBe('ticket')
    expect(resolveTask(state, 'Write the spec').via).toBe('name')
    expect(resolveTask(state, 'spec').via).toBe('name')
    expect(resolveTask(state, 'missing').value).toBeNull()
  })

  it('resolves a column by id and name', () => {
    const store = storeWithBoard()
    const state = store.getState()
    const id = projectId(state)
    expect(resolveColumn(state, id, 'In Progress').via).toBe('name')
    expect(resolveColumn(state, id, 'progress').via).toBe('name')

    const review = state.columns.find((column) => column.name === 'Review')!
    expect(resolveColumn(state, id, review.id).via).toBe('id')
    expect(resolveColumn(state, id, 'Nonexistent').value).toBeNull()
  })

  it('rejects an ambiguous partial title', () => {
    const store = storeWithBoard()
    const state = store.getState()
    const id = projectId(state)
    const setup: Action[] = [
      { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'Spec draft' },
      { kind: 'task/create', projectId: id, columnId: firstColumnId(state), title: 'Spec final' },
    ]
    const more = new BoardStore(setup.reduce(reduce, state))
    expect(resolveTask(more.getState(), 'Spec').value).toBeNull()
  })
})

describe('task tools', () => {
  it('lists tasks as compact lines by default', () => {
    const store = storeWithBoard()
    const result = call(store, 'list_tasks')
    expect(result.isError).toBeUndefined()
    expect(result.output).toContain('WEB-1')
    expect(result.output).toContain('Write the spec')
  })

  it('returns full objects when ticket=true', () => {
    const store = storeWithBoard()
    const result = call(store, 'list_tasks', { ticket: true })
    const rows = JSON.parse(result.output)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveProperty('customFields')
    expect(rows[0]).toHaveProperty('subtasks')
  })

  it('filters by column name, priority and label', () => {
    const store = storeWithBoard()
    expect(
      JSON.parse(call(store, 'list_tasks', { ticket: true, priority: 'urgent' }).output),
    ).toHaveLength(1)
    expect(
      JSON.parse(call(store, 'list_tasks', { ticket: true, column: 'In Progress' }).output),
    ).toHaveLength(0)
    expect(call(store, 'list_tasks', { column: 'Nope' }).isError).toBe(true)
  })

  it('creates a task and assigns its ticket number', () => {
    const store = storeWithBoard()
    const result = call(store, 'create_task', {
      title: 'New work',
      column: 'Review',
      priority: 'high',
    })
    expect(result.mutated).toBe(true)
    expect(store.getState().tasks.at(-1)?.title).toBe('New work')
    expect(result.output).toContain('WEB-3')
  })

  it('rejects a create with no title', () => {
    const store = storeWithBoard()
    expect(call(store, 'create_task', { title: '  ' }).isError).toBe(true)
  })

  it('reports an unknown column rather than guessing', () => {
    const store = storeWithBoard()
    const result = call(store, 'create_task', { title: 'X', column: 'Nonexistent' })
    expect(result.isError).toBe(true)
    expect(store.getState().tasks).toHaveLength(2)
  })

  it('updates only the fields it is given', () => {
    const store = storeWithBoard()
    const before = store.getState().tasks[0]
    call(store, 'update_task', { task: 'WEB-1', priority: 'low' })
    const after = store.getState().tasks.find((task) => task.id === before.id)!
    expect(after.priority).toBe('low')
    expect(after.title).toBe(before.title)
    expect(after.description).toBe(before.description)
  })

  it('clears a due date on an empty string but leaves it when omitted', () => {
    const store = storeWithBoard()
    store.dispatch({
      kind: 'task/update',
      id: store.getState().tasks[0].id,
      patch: { dueDate: '2026-06-01' },
    })
    call(store, 'update_task', { task: 'WEB-1', title: 'Renamed' })
    expect(store.getState().tasks[0].dueDate).toBe('2026-06-01')
    call(store, 'update_task', { task: 'WEB-1', dueDate: '' })
    expect(store.getState().tasks[0].dueDate).toBeNull()
  })

  it('errors when asked to update nothing', () => {
    const store = storeWithBoard()
    expect(call(store, 'update_task', { task: 'WEB-1' }).isError).toBe(true)
  })

  it('completes a task via status=done', () => {
    const store = storeWithBoard()
    const result = call(store, 'move_task', { task: 'WEB-1', status: 'done' })
    expect(result.isError).toBeUndefined()
    expect(store.getState().tasks[0].completedAt).not.toBeNull()
  })

  it('moves a task to a named column', () => {
    const store = storeWithBoard()
    call(store, 'move_task', { task: 'WEB-1', column: 'Review' })
    const column = store
      .getState()
      .columns.find((entry) => entry.id === store.getState().tasks[0].columnId)
    expect(column?.name).toBe('Review')
  })

  it('archives and restores', () => {
    const store = storeWithBoard()
    call(store, 'archive_task', { task: 'WEB-1' })
    expect(store.getState().tasks[0].archived).toBe(true)
    call(store, 'archive_task', { task: 'WEB-1', archived: false })
    expect(store.getState().tasks[0].archived).toBe(false)
  })

  it('deletes a task permanently', () => {
    const store = storeWithBoard()
    call(store, 'delete_task', { task: 'WEB-1' })
    expect(store.getState().tasks).toHaveLength(1)
  })

  it('fetches one task with comments, relations and sub-tasks', () => {
    const store = storeWithBoard()
    call(store, 'add_comment', { task: 'WEB-1', body: 'looks good' })
    call(store, 'add_subtask', { task: 'WEB-1', title: 'Draft' })
    call(store, 'link_tasks', { task: 'WEB-2', target: 'WEB-1', type: 'blocked_by' })

    const commented = JSON.parse(call(store, 'get_task', { task: 'WEB-1' }).output)
    expect(commented.comments).toHaveLength(1)
    expect(commented.comments[0].body).toBe('looks good')
    expect(commented.subtasks).toHaveLength(1)

    const linked = JSON.parse(call(store, 'get_task', { task: 'WEB-2' }).output)
    expect(linked.relations).toHaveLength(1)
    expect(linked.relations[0].ticket).toBe('WEB-1')
  })
})

describe('label tools', () => {
  it('creates global and project-scoped labels', () => {
    const store = storeWithBoard()
    call(store, 'create_label', { name: 'Urgent', color: 'red' })
    expect(store.getState().labels.at(-1)?.projectId).toBeNull()
    call(store, 'create_label', { name: 'Scoped', project: 'WEB' })
    expect(store.getState().labels.at(-1)?.projectId).toBe(projectId(store.getState()))
  })

  it('rejects an unknown project', () => {
    const store = storeWithBoard()
    expect(call(store, 'create_label', { name: 'X', project: 'Nope' }).isError).toBe(true)
  })

  it('sets and clears task labels', () => {
    const store = storeWithBoard()
    call(store, 'set_task_labels', { task: 'WEB-1', labels: ['Bug'] })
    expect(store.getState().tasks[0].labelIds).toHaveLength(1)
    call(store, 'set_task_labels', { task: 'WEB-1', labels: [] })
    expect(store.getState().tasks[0].labelIds).toHaveLength(0)
  })

  it('errors on an unknown label name', () => {
    const store = storeWithBoard()
    expect(call(store, 'set_task_labels', { task: 'WEB-1', labels: ['Nope'] }).isError).toBe(true)
  })
})

describe('column tools', () => {
  it('creates, updates and reorders columns', () => {
    const store = storeWithBoard()
    call(store, 'create_column', { name: 'QA', color: 'teal' })
    expect(store.getState().columns.some((column) => column.name === 'QA')).toBe(true)

    call(store, 'update_column', { column: 'QA', wipLimit: 3 })
    expect(store.getState().columns.find((column) => column.name === 'QA')?.wipLimit).toBe(3)

    call(store, 'reorder_columns', { order: ['Done', 'QA', 'Review', 'In Progress', 'Backlog'] })
    const names = store
      .getState()
      .columns.filter((column) => column.projectId === projectId(store.getState()))
      .sort((a, b) => a.position - b.position)
      .map((column) => column.name)
    expect(names).toEqual(['Done', 'QA', 'Review', 'In Progress', 'Backlog'])
  })

  it('refuses a reorder with the wrong number of columns', () => {
    const store = storeWithBoard()
    const result = call(store, 'reorder_columns', { order: ['Done', 'Backlog'] })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('Backlog')
  })

  it('refuses to delete the last column', () => {
    const store = storeWithBoard()
    const state = store.getState()
    const id = projectId(state)
    let current = state
    for (const column of state.columns.filter((entry) => entry.projectId === id).slice(1)) {
      current = reduce(current, { kind: 'column/delete', id: column.id })
    }
    store.dispatch({ kind: 'project/select', id })
    // Re-seed the store from the reduced state.
    const fresh = new BoardStore(current)
    const result = runTool(fresh, 'delete_column', { column: current.columns[0].name })
    expect(result.isError).toBeUndefined()
    expect(fresh.getState().columns).toHaveLength(1)
  })
})

describe('custom field tools', () => {
  it('defines a field and coerces values by type', () => {
    const store = storeWithBoard()
    call(store, 'set_custom_field_value', { task: 'WEB-1', field: 'Points', value: '8' })
    const task = store.getState().tasks[0]
    expect(Object.values(task.customFields)).toEqual([8])
  })

  it('rejects a non-numeric value for a number field', () => {
    const store = storeWithBoard()
    expect(
      call(store, 'set_custom_field_value', { task: 'WEB-1', field: 'Points', value: 'abc' })
        .isError,
    ).toBe(true)
  })

  it('requires options for a select field', () => {
    const store = storeWithBoard()
    expect(call(store, 'define_custom_field', { name: 'Stage', type: 'select' }).isError).toBe(true)
    expect(
      call(store, 'define_custom_field', { name: 'Stage', type: 'select', options: ['A', 'B'] })
        .isError,
    ).toBeUndefined()
  })

  it('validates select options and clears with null', () => {
    const store = storeWithBoard()
    call(store, 'define_custom_field', { name: 'Stage', type: 'select', options: ['A', 'B'] })
    expect(
      call(store, 'set_custom_field_value', { task: 'WEB-1', field: 'Stage', value: 'C' }).isError,
    ).toBe(true)
    expect(
      call(store, 'set_custom_field_value', { task: 'WEB-1', field: 'Stage', value: 'A' }).isError,
    ).toBeUndefined()
    call(store, 'set_custom_field_value', { task: 'WEB-1', field: 'Stage', value: null })
    const field = store.getState().customFields.find((entry) => entry.name === 'Stage')!
    expect(store.getState().tasks[0].customFields[field.id]).toBeNull()
  })

  it('rejects an unknown field type', () => {
    const store = storeWithBoard()
    expect(call(store, 'define_custom_field', { name: 'X', type: 'colour' }).isError).toBe(true)
  })
})

describe('sub-task and relation tools', () => {
  it('adds and lists sub-tasks', () => {
    const store = storeWithBoard()
    call(store, 'add_subtask', { task: 'WEB-1', title: 'Draft outline' })
    const rows = JSON.parse(call(store, 'list_subtasks', { task: 'WEB-1' }).output)
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Draft outline')
  })

  it('links and unlinks tasks, and reports an existing link', () => {
    const store = storeWithBoard()
    expect(
      call(store, 'link_tasks', { task: 'WEB-2', target: 'WEB-1', type: 'blocked_by' }).mutated,
    ).toBe(true)
    const repeat = call(store, 'link_tasks', { task: 'WEB-2', target: 'WEB-1', type: 'blocked_by' })
    expect(repeat.mutated).toBe(false)
    expect(repeat.summary).toContain('already')

    expect(call(store, 'unlink_task', { task: 'WEB-1', target: 'WEB-2' }).mutated).toBe(true)
    expect(call(store, 'unlink_task', { task: 'WEB-1', target: 'WEB-2' }).isError).toBe(true)
  })

  it('reports a blocked task in its view', () => {
    const store = storeWithBoard()
    call(store, 'link_tasks', { task: 'WEB-2', target: 'WEB-1', type: 'blocked_by' })
    const data = JSON.parse(call(store, 'get_task', { task: 'WEB-2' }).output)
    expect(data.blocked).toBe(true)
  })
})

describe('project tools', () => {
  it('lists projects with stats', () => {
    const store = storeWithBoard()
    const rows = JSON.parse(call(store, 'list_projects').output)
    expect(rows[0].key).toBe('WEB')
    expect(rows[0].total).toBe(2)
  })

  it('creates, updates, archives and deletes a project', () => {
    const store = storeWithBoard()
    call(store, 'create_project', { name: 'Mobile App', key: 'MOB' })
    expect(store.getState().projects).toHaveLength(2)
    // The new project becomes selected.
    expect(store.getState().selectedProjectId).toBe(store.getState().projects[1].id)

    call(store, 'update_project', { project: 'MOB', name: 'Mobile', description: 'Desc' })
    expect(store.getState().projects[1].name).toBe('Mobile')

    call(store, 'archive_project', { project: 'MOB' })
    expect(store.getState().projects[1].archived).toBe(true)

    call(store, 'delete_project', { project: 'MOB' })
    expect(store.getState().projects).toHaveLength(1)
  })

  it('errors when updating with nothing to change', () => {
    const store = storeWithBoard()
    expect(call(store, 'update_project', { project: 'WEB' }).isError).toBe(true)
  })
})

describe('search, summary and export', () => {
  it('searches across the board', () => {
    const store = storeWithBoard()
    expect(JSON.parse(call(store, 'search_tasks', { query: 'spec' }).output)).toHaveLength(1)
    expect(JSON.parse(call(store, 'search_tasks', { query: 'zzz' }).output)).toHaveLength(0)
    expect(call(store, 'search_tasks', {}).isError).toBe(true)
  })

  it('summarises a project', () => {
    const store = storeWithBoard()
    const data = JSON.parse(call(store, 'board_summary', { project: 'WEB' }).output)
    expect(data.key).toBe('WEB')
    expect(data.total).toBe(2)
    expect(Array.isArray(data.byColumn)).toBe(true)
  })

  it('exports markdown, csv and json', () => {
    const store = storeWithBoard()
    const markdown = call(store, 'export_board', { project: 'WEB', format: 'markdown' }).output
    expect(markdown).toContain('# Website Redesign')
    expect(markdown).toContain('WEB-1')

    const csv = call(store, 'export_board', { project: 'WEB', format: 'csv' }).output
    expect(csv.split('\n')[0]).toContain('ticket,title,column')
    expect(csv).toContain('WEB-1')

    const json = call(store, 'export_board', { project: 'WEB', format: 'json' }).output
    expect(JSON.parse(json).projects).toHaveLength(1)
  })

  it('quotes csv cells containing commas and quotes', () => {
    const store = storeWithBoard()
    store.dispatch({
      kind: 'task/update',
      id: store.getState().tasks[0].id,
      patch: { title: 'A, B "quoted"' },
    })
    const csv = call(store, 'export_board', { project: 'WEB', format: 'csv' }).output
    expect(csv).toContain('"A, B ""quoted"""')
  })

  it('logs time against a task', () => {
    const store = storeWithBoard()
    expect(call(store, 'log_time', { task: 'WEB-1', minutes: 30 }).mutated).toBe(true)
    expect(call(store, 'log_time', { task: 'WEB-1', minutes: 0 }).isError).toBe(true)
  })
})

describe('empty board behaviour', () => {
  it('asks for a project before mutating anything', () => {
    const store = new BoardStore(buildBoard())
    expect(call(store, 'list_tasks').isError).toBe(true)
    expect(call(store, 'create_task', { title: 'X' }).isError).toBe(true)
  })

  it('creates a project into an empty board', () => {
    const store = new BoardStore(buildBoard())
    expect(call(store, 'create_project', { name: 'Fresh' }).mutated).toBe(true)
    expect(store.getState().columns).toHaveLength(4)
  })
})

describe('skill wiring', () => {
  const call = (
    skill: ReturnType<typeof createSkill>,
    name: string,
    input: Record<string, unknown> = {},
  ) => ({
    id: `call_${name}`,
    name,
    input,
  })

  it('exposes schemas and executes tools through the skill', () => {
    const store = storeWithBoard()
    const skill = createSkill(store)
    expect(skill.id).toBe('tasks')
    expect(skill.tools.length).toBe(TOOLS.length)

    const result = skill.executeTool(call(skill, 'list_projects'))
    expect(result instanceof Promise).toBe(false)
    expect((result as { isError?: boolean }).isError).toBeUndefined()
  })

  it('feeds a malformed-argument error back instead of aborting', () => {
    const store = storeWithBoard()
    const skill = createSkill(store)
    const result = skill.executeTool({
      id: 'call_bad',
      name: 'list_projects',
      input: {},
      inputError: 'Unexpected token',
    }) as { isError?: boolean; output: string }
    expect(result.isError).toBe(true)
    expect(result.output).toContain('not valid JSON')
  })

  it('narrows the tool set per turn and always keeps a fallback', () => {
    const store = storeWithBoard()
    const skill = createSkill(store)

    const narrow = skill.toolsForRequest!('what is overdue?')
    expect(narrow.length).toBeGreaterThan(0)
    expect(narrow.length).toBeLessThanOrEqual(skill.tools.length)

    // An ambiguous writable request must not silently drop tools.
    const wide = skill.toolsForRequest!('make it better')
    expect(wide.length).toBe(skill.tools.length)

    // An explicit tool pin overrides the keyword rules.
    const pinned = skill.toolsForRequest!('RUN_TASK_TOOL:board_summary do it')
    expect(pinned.map((tool) => tool.name)).toEqual(['board_summary'])
  })

  it('expands a tool-using run with every safe native repair tool', () => {
    const skill = createSkill(storeWithBoard())
    const names = new Set(skill.continuationTools?.map((tool) => tool.name))
    expect(names).toContain('get_task')
    expect(names).toContain('board_summary')
    expect(names).toContain('bulk_update_tasks')
    expect(names).toContain('activity_feed')
    expect(names).not.toContain('delete_task')
    expect(names.size).toBeGreaterThan(30)
  })

  it('routes and performs a checklist end to end on a blank board', () => {
    const store = new BoardStore(buildBoard())
    const skill = createSkill(store)
    const request =
      'Create a launch checklist: put each task in Backlog, In Progress, or Review, set priorities, and link blockers.'
    const names = skill.toolsForRequest!(request).map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(['create_project', 'create_task', 'move_task', 'link_tasks']),
    )

    const execute = (name: string, input: Record<string, unknown> = {}) =>
      skill.executeTool({ id: `test_${name}`, name, input }) as ToolResult
    expect(
      execute('create_project', { name: '0.10.100 Release', key: 'REL' }).isError,
    ).toBeUndefined()
    for (const task of [
      { title: 'Prepare release notes', column: 'Backlog', priority: 'high' },
      { title: 'Build artifacts', column: 'In Progress', priority: 'urgent' },
      { title: 'Release approval', column: 'Review', priority: 'medium' },
    ]) {
      expect(execute('create_task', { ...task, project: 'REL' }).isError).toBeUndefined()
    }
    expect(
      execute('link_tasks', {
        task: 'Release approval',
        target: 'Build artifacts',
        type: 'blocked_by',
      }).isError,
    ).toBeUndefined()

    const rows = JSON.parse(
      execute('list_tasks', { project: 'REL', ticket: true }).output,
    ) as Array<{
      title: string
      column: string
      priority: string
      blocked: boolean
    }>
    expect(rows.map(({ title, column, priority }) => ({ title, column, priority }))).toEqual([
      { title: 'Prepare release notes', column: 'Backlog', priority: 'high' },
      { title: 'Build artifacts', column: 'In Progress', priority: 'urgent' },
      { title: 'Release approval', column: 'Review', priority: 'medium' },
    ])
    expect(rows.find((row) => row.title === 'Release approval')?.blocked).toBe(true)
    expect(store.getState().relations).toHaveLength(1)
  })

  it('builds a context describing projects, columns and tickets', () => {
    const store = storeWithBoard()
    const context = buildBoardContext(store.getState())
    expect(context).toContain('Website Redesign')
    expect(context).toContain('key WEB')
    expect(context).toContain('WEB-1')
  })

  it('limits selected-task analysis to the selected items, includes visible card bounds, and offers no board tools', () => {
    const store = storeWithBoard()
    const [selected, other] = store.getState().tasks
    expect(selected).toBeTruthy()
    expect(other).toBeTruthy()
    const bounds = { x: 18, y: 42, width: 260, height: 96 }
    const context = buildBoardContext(store.getState(), [selected!.id], { [selected!.id]: bounds })
    expect(context).toContain(selected!.title)
    expect(context).not.toContain(other!.title)
    expect(context).toContain('x=18, y=42, width=260, height=96')
    const skill = createSkill(store)
    expect(
      skill.toolsForRequest!(
        `[revelith-task-selection:v1 ids=${encodeURIComponent(selected!.id)}]`,
      ),
    ).toEqual([])
  })

  it('reports an empty board plainly', () => {
    expect(buildBoardContext(buildBoard())).toContain('empty')
  })
})

describe('destructive tools are explicit', () => {
  it('describes the risk in the tool description', () => {
    for (const name of [
      'delete_task',
      'delete_project',
      'delete_label',
      'delete_column',
      'delete_saved_view',
    ]) {
      expect(getTool(name)!.description).toMatch(/undo|permanent|instead/i)
    }
  })
})

describe('actions are dispatched through the reducer', () => {
  it('never mutates the previous state object', () => {
    const store = storeWithBoard()
    const before = store.getState()
    const snapshot = JSON.stringify(before)
    const actions: Action[] = [
      {
        kind: 'task/create',
        projectId: projectId(before),
        columnId: firstColumnId(before),
        title: 'New',
      },
    ]
    for (const action of actions) store.dispatch(action)
    expect(JSON.stringify(before)).toBe(snapshot)
    expect(store.getState()).not.toBe(before)
  })
})
