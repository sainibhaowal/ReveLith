import type { AgentToolDef } from '@revelith/agent-core'

import type { BoardState, ID, Project, RelationType, Task } from '../domain/types'
import {
  COLOR_NAMES,
  isColorName,
  isCustomFieldType,
  isPriority,
  isRelationType,
  PRIORITY_LABEL,
  RELATION_TYPES,
} from '../domain/types'
import { boardToMarkdown, boardToJson, compactTask, projectToCsv } from '../store/export'
import {
  EMPTY_FILTERS,
  filterTasks,
  getProject,
  isBlocked,
  isTaskDone,
  projectColumns,
  projectCustomFields,
  projectLabels,
  projectStats,
  sortTasks,
  subtasksOf,
  ticketId,
  totalLoggedMinutes,
} from '../store/selectors'
import {
  defaultColumn,
  doneColumn,
  resolveColumn,
  resolveLabel,
  resolveProject,
  resolveTask,
} from './resolve'
import { TEAM_TOOLS } from './team-tools'
import {
  bool,
  fail,
  json,
  num,
  ok,
  str,
  strArray,
  stringProp,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from './tool-helpers'

// Re-exported so the rest of the app can keep importing the primitives from here.
export { bool, fail, json, num, ok, str, strArray, stringProp }
export type { ToolContext, ToolDefinition, ToolResult } from './tool-helpers'

/**
 * The AI tool surface.
 *
 * Every tool is a pure function of (store, input) that dispatches ordinary board
 * actions — there is no privileged path for the agent. That keeps the UI and the
 * model operating on exactly the same invariants, and makes the whole surface
 * testable without a renderer.
 */

const PRIORITY_VALUES = ['urgent', 'high', 'medium', 'low'] as const
const RELATION_VALUES = RELATION_TYPES
const COLOR_VALUES = COLOR_NAMES

/** Either a resolved project or the ToolResult explaining why there isn't one. */
type ProjectScope = { project: Project } | { error: ToolResult }

/**
 * Resolve the project a call is about: an explicit `project`, else the task's
 * own project, else the currently selected project.
 */
function targetProject(
  ctx: ToolContext,
  input: Record<string, unknown>,
  fallbackTaskId?: string,
): Project | null {
  const explicit = str(input, 'project')
  if (explicit) {
    const resolved = resolveProject(ctx.getState(), explicit)
    if (resolved.value) return resolved.value
  }
  if (fallbackTaskId) {
    const task = ctx
      .getState()
      .tasks.find((entry) => entry.id === fallbackTaskId || entry.number === Number(fallbackTaskId))
    if (task) {
      const project = getProject(ctx.getState(), task.projectId)
      if (project) return project
    }
  }
  const state = ctx.getState()
  const selected = getProject(state, state.selectedProjectId)
  if (selected) return selected
  return state.projects[0] ?? null
}

function requireProject(
  ctx: ToolContext,
  input: Record<string, unknown>,
  fallbackTaskId?: string,
): ProjectScope {
  const project = targetProject(ctx, input, fallbackTaskId)
  if (!project) {
    return {
      error: fail(
        'No project available',
        'There are no projects yet. Create one with create_project first.',
      ),
    }
  }
  return { project }
}

/* ------------------------------------------------------------------ projects */

const listProjects: ToolDefinition = {
  name: 'list_projects',
  description: 'List every project with its ticket key, task counts and completion percentage.',
  inputSchema: json({
    includeArchived: { type: 'boolean', description: 'Include archived projects.' },
  }),
  run(ctx, input) {
    const state = ctx.getState()
    const includeArchived = bool(input, 'includeArchived') ?? false
    const rows = state.projects
      .filter((project) => includeArchived || !project.archived)
      .map((project) => {
        const stats = projectStats(state, project.id)
        return {
          id: project.id,
          key: project.key,
          name: project.name,
          description: project.description,
          archived: project.archived,
          columns: projectColumns(state, project.id).map((column) => column.name),
          ...stats,
        }
      })
    return ok(rows, `Listed ${rows.length} project(s)`)
  },
}

const createProject: ToolDefinition = {
  name: 'create_project',
  description:
    'Create a project. A project owns its columns, labels, custom fields and task numbering. If no key is given one is derived from the name.',
  inputSchema: json(
    {
      name: stringProp('Project name.'),
      key: stringProp('Ticket prefix, e.g. ENG. Max 6 letters or digits.'),
      description: stringProp('Optional project description.'),
      color: { type: 'string', enum: [...COLOR_VALUES], description: 'Accent colour name.' },
    },
    ['name'],
  ),
  run(ctx, input) {
    const name = str(input, 'name')
    if (!name) return fail('Project name is required')
    const color = str(input, 'color')
    ctx.dispatch({
      kind: 'project/create',
      name,
      key: str(input, 'key'),
      description: str(input, 'description') ?? '',
      color: isColorName(color) ? color : 'blue',
    })
    return ok({ name }, `Created project “${name}”`, true)
  },
}

const updateProject: ToolDefinition = {
  name: 'update_project',
  description: 'Rename a project, change its ticket key, colour or description.',
  inputSchema: json(
    {
      project: stringProp('Project id, key, or exact name.'),
      name: stringProp('New name.'),
      key: stringProp('New ticket key.'),
      description: stringProp('New description.'),
      color: { type: 'string', enum: [...COLOR_VALUES] },
    },
    ['project'],
  ),
  run(ctx, input) {
    const reference = str(input, 'project')
    const resolved = resolveProject(ctx.getState(), reference)
    if (!resolved.value) return fail(`No project matches “${reference}”`)
    const color = str(input, 'color')
    const patch: Record<string, unknown> = {}
    const name = str(input, 'name')
    const key = str(input, 'key')
    const description = str(input, 'description')
    if (name) patch.name = name
    if (key) patch.key = key
    if (description !== undefined) patch.description = description
    if (isColorName(color)) patch.color = color
    if (!Object.keys(patch).length)
      return fail('Nothing to update', 'Provide at least one field to change.')
    ctx.dispatch({ kind: 'project/update', id: resolved.value.id, patch: patch as never })
    return ok(
      { project: resolved.value.name, patch },
      `Updated project “${name ?? resolved.value.name}”`,
      true,
    )
  },
}

const archiveProject: ToolDefinition = {
  name: 'archive_project',
  description: 'Archive or restore a project. Archived projects stay on disk and can be restored.',
  inputSchema: json(
    { project: stringProp('Project id, key, or exact name.'), archived: { type: 'boolean' } },
    ['project'],
  ),
  run(ctx, input) {
    const reference = str(input, 'project')
    const resolved = resolveProject(ctx.getState(), reference)
    if (!resolved.value) return fail(`No project matches “${reference}”`)
    const archived = bool(input, 'archived') ?? true
    ctx.dispatch({ kind: 'project/setArchived', id: resolved.value.id, archived })
    return ok(
      { project: resolved.value.name, archived },
      `${archived ? 'Archived' : 'Restored'} “${resolved.value.name}”`,
      true,
    )
  },
}

const deleteProject: ToolDefinition = {
  name: 'delete_project',
  description:
    'Permanently delete a project and every task, comment and relation inside it. This cannot be undone — prefer archive_project unless the user explicitly asks to delete.',
  inputSchema: json({ project: stringProp('Project id, key, or exact name.') }, ['project']),
  run(ctx, input) {
    const reference = str(input, 'project')
    const resolved = resolveProject(ctx.getState(), reference)
    if (!resolved.value) return fail(`No project matches “${reference}”`)
    ctx.dispatch({ kind: 'project/delete', id: resolved.value.id })
    return ok({ deleted: resolved.value.name }, `Deleted project “${resolved.value.name}”`, true)
  },
}

/* ------------------------------------------------------------------- columns */

const listColumns: ToolDefinition = {
  name: 'list_columns',
  description: 'List the board columns of a project in display order.',
  inputSchema: json({
    project: stringProp('Project id, key, or name. Defaults to the selected project.'),
  }),
  run(ctx, input) {
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    const rows = projectColumns(ctx.getState(), scoped.project.id).map((column) => ({
      id: column.id,
      name: column.name,
      color: column.color,
      isDone: column.isDone,
      wipLimit: column.wipLimit,
      taskCount: ctx
        .getState()
        .tasks.filter((task) => task.columnId === column.id && !task.archived).length,
    }))
    return ok(rows, `Listed ${rows.length} column(s) for “${scoped.project.name}”`)
  },
}

const createColumn: ToolDefinition = {
  name: 'create_column',
  description: 'Add a column to a project board. Set isDone=true for a completion column.',
  inputSchema: json(
    {
      project: stringProp('Project id, key, or name.'),
      name: stringProp('Column name.'),
      color: { type: 'string', enum: [...COLOR_VALUES] },
      isDone: { type: 'boolean', description: 'Treat as a done column.' },
      wipLimit: { type: 'number', description: 'Soft work-in-progress limit.' },
    },
    ['name'],
  ),
  run(ctx, input) {
    const name = str(input, 'name')
    if (!name) return fail('Column name is required')
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    const color = str(input, 'color')
    ctx.dispatch({
      kind: 'column/create',
      projectId: scoped.project.id,
      name,
      color: isColorName(color) ? color : 'slate',
      isDone: bool(input, 'isDone') ?? false,
      wipLimit: num(input, 'wipLimit') ?? null,
    })
    return ok({ column: name }, `Added column “${name}”`, true)
  },
}

const updateColumn: ToolDefinition = {
  name: 'update_column',
  description: 'Rename a column, recolour it, toggle done status, or set a WIP limit.',
  inputSchema: json(
    {
      project: stringProp('Project id, key, or name.'),
      column: stringProp('Column id or exact name.'),
      name: stringProp('New name.'),
      color: { type: 'string', enum: [...COLOR_VALUES] },
      isDone: { type: 'boolean' },
      wipLimit: { type: 'number' },
    },
    ['column'],
  ),
  run(ctx, input) {
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    const reference = str(input, 'column')
    const resolved = resolveColumn(ctx.getState(), scoped.project.id, reference)
    if (!resolved.value) return fail(`No column matches “${reference}” in “${scoped.project.name}”`)
    const patch: Record<string, unknown> = {}
    const name = str(input, 'name')
    const color = str(input, 'color')
    if (name) patch.name = name
    if (isColorName(color)) patch.color = color
    const isDone = bool(input, 'isDone')
    if (isDone !== undefined) patch.isDone = isDone
    const wip = input['wipLimit']
    if (wip === null) patch.wipLimit = null
    else if (num(input, 'wipLimit') !== undefined) patch.wipLimit = num(input, 'wipLimit')
    if (!Object.keys(patch).length)
      return fail('Nothing to update', 'Provide at least one field to change.')
    ctx.dispatch({ kind: 'column/update', id: resolved.value.id, patch: patch as never })
    return ok(
      { column: name ?? resolved.value.name },
      `Updated column “${name ?? resolved.value.name}”`,
      true,
    )
  },
}

const reorderColumns: ToolDefinition = {
  name: 'reorder_columns',
  description: 'Reorder a project board. Pass the full list of column names in the order you want.',
  inputSchema: json(
    {
      project: stringProp('Project id, key, or name.'),
      order: { type: 'array', items: { type: 'string' } },
    },
    ['order'],
  ),
  run(ctx, input) {
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    const order = strArray(input, 'order')
    const columns = projectColumns(ctx.getState(), scoped.project.id)
    if (order.length !== columns.length) {
      return fail(
        'Column list length mismatch',
        `Expected all ${columns.length} columns (${columns.map((column) => column.name).join(', ')}), received ${order.length}.`,
      )
    }
    for (const [index, name] of order.entries()) {
      const resolved = resolveColumn(ctx.getState(), scoped.project.id, name)
      if (!resolved.value) return fail(`No column matches “${name}”`)
      ctx.dispatch({
        kind: 'column/update',
        id: resolved.value.id,
        patch: { position: (index + 1) * 1024 },
      })
    }
    return ok({ order }, `Reordered ${order.length} column(s)`, true)
  },
}

const deleteColumn: ToolDefinition = {
  name: 'delete_column',
  description:
    'Delete a column. Its tasks move to the project’s first remaining column, so no task is lost, but the column is permanently removed and cannot be restored. Refuses to delete the last column.',
  inputSchema: json(
    {
      project: stringProp('Project id, key, or name.'),
      column: stringProp('Column id or exact name.'),
    },
    ['column'],
  ),
  run(ctx, input) {
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    const reference = str(input, 'column')
    const resolved = resolveColumn(ctx.getState(), scoped.project.id, reference)
    if (!resolved.value) return fail(`No column matches “${reference}”`)
    ctx.dispatch({ kind: 'column/delete', id: resolved.value.id })
    return ok({ deleted: resolved.value.name }, `Deleted column “${resolved.value.name}”`, true)
  },
}

/* -------------------------------------------------------------------- labels */

const listLabels: ToolDefinition = {
  name: 'list_labels',
  description: 'List labels available in a project, including global labels.',
  inputSchema: json({ project: stringProp('Project id, key, or name.') }),
  run(ctx, input) {
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    const rows = projectLabels(ctx.getState(), scoped.project.id).map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      scope: label.projectId ? 'project' : 'global',
    }))
    return ok(rows, `Listed ${rows.length} label(s)`)
  },
}

const createLabel: ToolDefinition = {
  name: 'create_label',
  description: 'Create a label. Omit project to create a global label available in every project.',
  inputSchema: json(
    {
      name: stringProp('Label name.'),
      color: { type: 'string', enum: [...COLOR_VALUES] },
      project: stringProp('Project to scope the label to. Omit for a global label.'),
    },
    ['name'],
  ),
  run(ctx, input) {
    const name = str(input, 'name')
    if (!name) return fail('Label name is required')
    const reference = str(input, 'project')
    let projectId: ID | null = null
    if (reference) {
      const resolved = resolveProject(ctx.getState(), reference)
      if (!resolved.value) return fail(`No project matches “${reference}”`)
      projectId = resolved.value.id
    }
    const color = str(input, 'color')
    ctx.dispatch({
      kind: 'label/create',
      name,
      color: isColorName(color) ? color : 'slate',
      projectId,
    })
    return ok(
      { label: name, scope: projectId ? 'project' : 'global' },
      `Created label “${name}”`,
      true,
    )
  },
}

const deleteLabel: ToolDefinition = {
  name: 'delete_label',
  description:
    'Delete a label and remove it from every task that carries it. This cannot be undone — there is no undo and no archive for labels, so confirm with the user first.',
  inputSchema: json({ label: stringProp('Label id or exact name.') }, ['label']),
  run(ctx, input) {
    const reference = str(input, 'label')
    const state = ctx.getState()
    const resolved = resolveLabel(
      state,
      state.selectedProjectId ?? state.projects[0]?.id ?? '',
      reference,
    )
    if (!resolved.value) return fail(`No label matches “${reference}”`)
    ctx.dispatch({ kind: 'label/delete', id: resolved.value.id })
    return ok({ deleted: resolved.value.name }, `Deleted label “${resolved.value.name}”`, true)
  },
}

/* ---------------------------------------------------------------------- tasks */

function taskView(state: BoardState, task: Task) {
  const column = state.columns.find((entry) => entry.id === task.columnId)
  const labels = projectLabels(state, task.projectId).filter((label) =>
    task.labelIds.includes(label.id),
  )
  const subtasks = subtasksOf(state, task.id)
  const customFields = projectCustomFields(state, task.projectId)
  return {
    id: task.id,
    ticket: ticketId(state, task),
    title: task.title,
    description: task.description,
    column: column?.name ?? null,
    columnId: task.columnId,
    priority: task.priority,
    dueDate: task.dueDate,
    startDate: task.startDate,
    labels: labels.map((label) => label.name),
    parentId: task.parentId,
    archived: task.archived,
    blocked: isBlocked(state, task),
    done: isTaskDone(state, task),
    estimateMinutes: task.estimateMinutes,
    timeLoggedMinutes: totalLoggedMinutes(task),
    subtasks: subtasks.map((sub) => ({
      ticket: ticketId(state, sub),
      title: sub.title,
      done: isTaskDone(state, sub),
    })),
    customFields: Object.fromEntries(
      customFields
        .filter(
          (field) =>
            task.customFields[field.id] !== undefined && task.customFields[field.id] !== null,
        )
        .map((field) => [field.name, task.customFields[field.id]]),
    ),
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.updatedAt).toISOString(),
  }
}

const listTasks: ToolDefinition = {
  name: 'list_tasks',
  description:
    'List tasks. Filter by project, column name, priority, label, or free text. Use ticket=true to get exact ticket ids instead of a compact list.',
  inputSchema: json({
    project: stringProp('Project id, key, or name. Defaults to the selected project.'),
    column: stringProp('Only tasks in this column.'),
    priority: { type: 'string', enum: [...PRIORITY_VALUES] },
    label: stringProp('Only tasks with this label.'),
    query: stringProp('Free-text match on title and description.'),
    includeArchived: { type: 'boolean' },
    subtasks: { type: 'boolean', description: 'Include sub-tasks. Defaults to false.' },
    ticket: { type: 'boolean', description: 'Return full task objects instead of compact lines.' },
    limit: { type: 'number' },
  }),
  run(ctx, input) {
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    const state = ctx.getState()
    const includeArchived = bool(input, 'includeArchived') ?? false
    const includeSubtasks = bool(input, 'subtasks') ?? false

    let tasks = state.tasks.filter((task) => task.projectId === scoped.project.id)
    if (!includeArchived) tasks = tasks.filter((task) => !task.archived)
    if (!includeSubtasks) tasks = tasks.filter((task) => !task.parentId)

    const columnRef = str(input, 'column')
    if (columnRef) {
      const resolved = resolveColumn(state, scoped.project.id, columnRef)
      if (!resolved.value) return fail(`No column matches “${columnRef}”`)
      tasks = tasks.filter((task) => task.columnId === resolved.value!.id)
    }
    const priority = str(input, 'priority')
    if (priority && isPriority(priority)) tasks = tasks.filter((task) => task.priority === priority)
    const labelRef = str(input, 'label')
    if (labelRef) {
      const resolved = resolveLabel(state, scoped.project.id, labelRef)
      if (!resolved.value) return fail(`No label matches “${labelRef}”`)
      const labelId = resolved.value.id
      tasks = tasks.filter((task) => task.labelIds.includes(labelId))
    }
    const query = str(input, 'query')
    if (query) {
      tasks = filterTasks(state, tasks, { ...EMPTY_FILTERS, query, showArchived: includeArchived })
    }

    tasks = sortTasks(tasks, 'position', state)
    const limit = num(input, 'limit')
    if (limit !== undefined && limit > 0) tasks = tasks.slice(0, limit)

    if (bool(input, 'ticket')) {
      return ok(
        tasks.map((task) => taskView(state, task)),
        `Listed ${tasks.length} task(s)`,
      )
    }
    const lines = tasks.map((task) => compactTask(state, task))
    return ok(
      lines.length ? lines.join('\n') : 'No matching tasks.',
      `Listed ${tasks.length} task(s)`,
    )
  },
}

const getTask: ToolDefinition = {
  name: 'get_task',
  description:
    'Get one task in full, including sub-tasks, relations, comments and custom field values.',
  inputSchema: json({ task: stringProp('Task id, ticket id (ENG-12), or exact title.') }, ['task']),
  run(ctx, input) {
    const reference = str(input, 'task')
    const resolved = resolveTask(ctx.getState(), reference)
    if (!resolved.value) return fail(`No task matches “${reference}”`)
    const state = ctx.getState()
    const task = resolved.value
    return ok(
      {
        ...taskView(state, task),
        comments: state.comments
          .filter((comment) => comment.taskId === task.id)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((comment) => ({
            author: comment.author,
            body: comment.body,
            createdAt: new Date(comment.createdAt).toISOString(),
          })),
        relations: state.relations
          .filter((relation) => relation.fromTaskId === task.id || relation.toTaskId === task.id)
          .map((relation) => {
            const otherId =
              relation.fromTaskId === task.id ? relation.toTaskId : relation.fromTaskId
            const other = state.tasks.find((entry) => entry.id === otherId)
            return {
              type: relation.type,
              ticket: other ? ticketId(state, other) : null,
              title: other?.title ?? null,
            }
          }),
      },
      `Fetched ${ticketId(state, task)}`,
    )
  },
}

const createTask: ToolDefinition = {
  name: 'create_task',
  description: 'Create a task. Accepts a project, column, labels, priority and dates.',
  inputSchema: json(
    {
      title: stringProp('Task title.'),
      project: stringProp('Project id, key, or name.'),
      column: stringProp('Column id or name. Defaults to the first column.'),
      description: stringProp('Longer description, markdown allowed.'),
      priority: { type: 'string', enum: [...PRIORITY_VALUES] },
      dueDate: stringProp('ISO date, YYYY-MM-DD.'),
      startDate: stringProp('ISO date, YYYY-MM-DD.'),
      labels: { type: 'array', items: { type: 'string' }, description: 'Label names to assign.' },
      estimateMinutes: { type: 'number' },
    },
    ['title'],
  ),
  run(ctx, input) {
    const title = str(input, 'title')
    if (!title) return fail('Task title is required')
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    const state = ctx.getState()

    let column: ReturnType<typeof resolveColumn>['value']
    const columnRef = str(input, 'column')
    if (columnRef) {
      const resolved = resolveColumn(state, scoped.project.id, columnRef)
      if (!resolved.value)
        return fail(`No column matches “${columnRef}” in “${scoped.project.name}”`)
      column = resolved.value
    } else {
      column = defaultColumn(state, scoped.project.id)
    }
    if (!column) return fail(`Project “${scoped.project.name}” has no columns`)

    const labelIds: ID[] = []
    for (const name of strArray(input, 'labels')) {
      const resolved = resolveLabel(state, scoped.project.id, name)
      if (!resolved.value) return fail(`No label matches “${name}”`)
      labelIds.push(resolved.value.id)
    }

    const priority = str(input, 'priority')
    ctx.dispatch({
      kind: 'task/create',
      projectId: scoped.project.id,
      columnId: column.id,
      title,
      description: str(input, 'description') ?? '',
      priority: isPriority(priority) ? priority : 'medium',
      dueDate: str(input, 'dueDate') ?? null,
      startDate: str(input, 'startDate') ?? null,
      labelIds,
      estimateMinutes: num(input, 'estimateMinutes') ?? null,
    })

    const created = ctx.getState().tasks[ctx.getState().tasks.length - 1]
    return ok(taskView(ctx.getState(), created), `Created “${title}” in ${column.name}`, true)
  },
}

const updateTask: ToolDefinition = {
  name: 'update_task',
  description: 'Update task fields. Only the fields you provide are changed.',
  inputSchema: json(
    {
      task: stringProp('Task id, ticket id, or exact title.'),
      title: stringProp('New title.'),
      description: stringProp('New description.'),
      priority: { type: 'string', enum: [...PRIORITY_VALUES] },
      dueDate: stringProp('ISO date, or an empty string to clear.'),
      startDate: stringProp('ISO date, or an empty string to clear.'),
      estimateMinutes: { type: 'number' },
    },
    ['task'],
  ),
  run(ctx, input) {
    const reference = str(input, 'task')
    const resolved = resolveTask(ctx.getState(), reference)
    if (!resolved.value) return fail(`No task matches “${reference}”`)

    const patch: Record<string, unknown> = {}
    const title = str(input, 'title')
    const description = str(input, 'description')
    const priority = str(input, 'priority')
    if (title) patch.title = title
    if (description !== undefined) patch.description = description
    if (isPriority(priority)) patch.priority = priority
    // An explicit empty string clears the date; omitting the key leaves it alone.
    if (input['dueDate'] === '') patch.dueDate = null
    else if (str(input, 'dueDate')) patch.dueDate = str(input, 'dueDate')
    if (input['startDate'] === '') patch.startDate = null
    else if (str(input, 'startDate')) patch.startDate = str(input, 'startDate')
    const estimate = num(input, 'estimateMinutes')
    if (estimate !== undefined) patch.estimateMinutes = estimate
    else if (input['estimateMinutes'] === null) patch.estimateMinutes = null

    if (!Object.keys(patch).length)
      return fail('Nothing to update', 'Provide at least one field to change.')
    ctx.dispatch({ kind: 'task/update', id: resolved.value.id, patch: patch as never })
    return ok(
      { task: ticketId(ctx.getState(), resolved.value), patch },
      `Updated ${ticketId(ctx.getState(), resolved.value)}`,
      true,
    )
  },
}

const moveTask: ToolDefinition = {
  name: 'move_task',
  description: 'Move a task to a column, or complete it with status="done".',
  inputSchema: json(
    {
      task: stringProp('Task id, ticket id, or exact title.'),
      column: stringProp('Destination column id or name.'),
      status: {
        type: 'string',
        enum: ['done', 'open'],
        description: 'done moves to the done column; open moves to the first column.',
      },
    },
    ['task'],
  ),
  run(ctx, input) {
    const reference = str(input, 'task')
    const resolved = resolveTask(ctx.getState(), reference)
    if (!resolved.value) return fail(`No task matches “${reference}”`)
    const state = ctx.getState()
    const task = resolved.value

    const status = str(input, 'status')
    let column: ReturnType<typeof resolveColumn>['value']
    if (status === 'done') {
      column = doneColumn(state, task.projectId)
      if (!column) return fail(`Project has no done column for “${task.title}”`)
    } else if (status === 'open') {
      column = defaultColumn(state, task.projectId)
    } else {
      const columnRef = str(input, 'column')
      if (!columnRef) return fail('Nothing to do', 'Provide a column or a status.')
      const found = resolveColumn(state, task.projectId, columnRef)
      if (!found.value) return fail(`No column matches “${columnRef}”`)
      column = found.value
    }
    if (!column) return fail('Destination column not found')

    ctx.dispatch({ kind: 'task/move', id: task.id, columnId: column.id })
    return ok(
      { task: ticketId(state, task), column: column.name },
      `Moved ${ticketId(state, task)} to ${column.name}`,
      true,
    )
  },
}

const archiveTask: ToolDefinition = {
  name: 'archive_task',
  description:
    'Archive or restore a task. Archived tasks are hidden from the board but kept on disk.',
  inputSchema: json(
    { task: stringProp('Task id, ticket id, or exact title.'), archived: { type: 'boolean' } },
    ['task'],
  ),
  run(ctx, input) {
    const reference = str(input, 'task')
    const resolved = resolveTask(ctx.getState(), reference)
    if (!resolved.value) return fail(`No task matches “${reference}”`)
    const archived = bool(input, 'archived') ?? true
    ctx.dispatch({ kind: 'task/setArchived', id: resolved.value.id, archived })
    return ok(
      { task: ticketId(ctx.getState(), resolved.value), archived },
      `${archived ? 'Archived' : 'Restored'} ${ticketId(ctx.getState(), resolved.value)}`,
      true,
    )
  },
}

const deleteTask: ToolDefinition = {
  name: 'delete_task',
  description:
    'Permanently delete a task, its comments, and its relations. Sub-tasks are promoted to top level rather than deleted. Prefer archive_task unless the user asks to delete.',
  inputSchema: json({ task: stringProp('Task id, ticket id, or exact title.') }, ['task']),
  run(ctx, input) {
    const reference = str(input, 'task')
    const resolved = resolveTask(ctx.getState(), reference)
    if (!resolved.value) return fail(`No task matches “${reference}”`)
    const ticket = ticketId(ctx.getState(), resolved.value)
    ctx.dispatch({ kind: 'task/delete', id: resolved.value.id })
    return ok({ deleted: ticket }, `Deleted ${ticket}`, true)
  },
}

const setTaskLabels: ToolDefinition = {
  name: 'set_task_labels',
  description: 'Replace the labels on a task. Pass an empty array to clear them.',
  inputSchema: json(
    {
      task: stringProp('Task id, ticket id, or exact title.'),
      labels: { type: 'array', items: { type: 'string' }, description: 'Label names.' },
    },
    ['task', 'labels'],
  ),
  run(ctx, input) {
    const reference = str(input, 'task')
    const resolved = resolveTask(ctx.getState(), reference)
    if (!resolved.value) return fail(`No task matches “${reference}”`)
    const state = ctx.getState()
    const labelIds: ID[] = []
    for (const name of strArray(input, 'labels')) {
      const found = resolveLabel(state, resolved.value.projectId, name)
      if (!found.value) return fail(`No label matches “${name}”`)
      labelIds.push(found.value.id)
    }
    ctx.dispatch({ kind: 'task/setLabels', id: resolved.value.id, labelIds })
    return ok(
      { task: ticketId(state, resolved.value), labels: strArray(input, 'labels') },
      `Updated labels on ${ticketId(state, resolved.value)}`,
      true,
    )
  },
}

/* ------------------------------------------------------- comments & relations */

const addComment: ToolDefinition = {
  name: 'add_comment',
  description: 'Add a comment to a task.',
  inputSchema: json(
    {
      task: stringProp('Task id, ticket id, or exact title.'),
      body: stringProp('Comment text.'),
      author: stringProp('Comment author.'),
    },
    ['task', 'body'],
  ),
  run(ctx, input) {
    const body = str(input, 'body')
    if (!body) return fail('Comment body is required')
    const resolved = resolveTask(ctx.getState(), str(input, 'task'))
    if (!resolved.value) return fail(`No task matches “${str(input, 'task')}”`)
    ctx.dispatch({
      kind: 'comment/add',
      taskId: resolved.value.id,
      body,
      author: str(input, 'author') ?? 'Assistant',
    })
    return ok(
      { task: ticketId(ctx.getState(), resolved.value) },
      `Commented on ${ticketId(ctx.getState(), resolved.value)}`,
      true,
    )
  },
}

const listComments: ToolDefinition = {
  name: 'list_comments',
  description: 'List the comments on a task, oldest first.',
  inputSchema: json({ task: stringProp('Task id, ticket id, or exact title.') }, ['task']),
  run(ctx, input) {
    const resolved = resolveTask(ctx.getState(), str(input, 'task'))
    if (!resolved.value) return fail(`No task matches “${str(input, 'task')}”`)
    const state = ctx.getState()
    const rows = state.comments
      .filter((comment) => comment.taskId === resolved.value!.id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((comment) => ({
        author: comment.author,
        body: comment.body,
        createdAt: new Date(comment.createdAt).toISOString(),
      }))
    return ok(rows, `Listed ${rows.length} comment(s)`)
  },
}

const linkTasks: ToolDefinition = {
  name: 'link_tasks',
  description:
    'Relate two tasks. type=blocked_by means the first task waits on the second. Also supports blocks, relates_to and duplicates.',
  inputSchema: json(
    {
      task: stringProp('The task that holds the relation.'),
      target: stringProp('The other task.'),
      type: { type: 'string', enum: [...RELATION_VALUES] },
    },
    ['task', 'target'],
  ),
  run(ctx, input) {
    const from = resolveTask(ctx.getState(), str(input, 'task'))
    if (!from.value) return fail(`No task matches “${str(input, 'task')}”`)
    const to = resolveTask(ctx.getState(), str(input, 'target'))
    if (!to.value) return fail(`No task matches “${str(input, 'target')}”`)
    const type = str(input, 'type')
    const relationType: RelationType = isRelationType(type) ? type : 'blocked_by'
    // Check before dispatching: the reducer silently ignores duplicates, so
    // inspecting afterwards could never tell a fresh link from an existing one.
    const alreadyLinked = ctx
      .getState()
      .relations.some(
        (relation) =>
          relation.fromTaskId === from.value!.id &&
          relation.toTaskId === to.value!.id &&
          relation.type === relationType,
      )
    ctx.dispatch({
      kind: 'relation/link',
      fromTaskId: from.value.id,
      toTaskId: to.value.id,
      type: relationType,
    })
    const state = ctx.getState()
    return ok(
      { from: ticketId(state, from.value), to: ticketId(state, to.value), type: relationType },
      alreadyLinked
        ? 'Relation already existed'
        : `Linked ${ticketId(state, from.value)} → ${ticketId(state, to.value)}`,
      !alreadyLinked,
    )
  },
}

const unlinkTask: ToolDefinition = {
  name: 'unlink_task',
  description: 'Remove a relation between two tasks.',
  inputSchema: json({ task: stringProp('One task.'), target: stringProp('The other task.') }, [
    'task',
    'target',
  ]),
  run(ctx, input) {
    const from = resolveTask(ctx.getState(), str(input, 'task'))
    if (!from.value) return fail(`No task matches “${str(input, 'task')}”`)
    const to = resolveTask(ctx.getState(), str(input, 'target'))
    if (!to.value) return fail(`No task matches “${str(input, 'target')}”`)
    const state = ctx.getState()
    const relation = state.relations.find(
      (entry) =>
        (entry.fromTaskId === from.value!.id && entry.toTaskId === to.value!.id) ||
        (entry.fromTaskId === to.value!.id && entry.toTaskId === from.value!.id),
    )
    if (!relation) return fail('No relation between those tasks')
    ctx.dispatch({ kind: 'relation/unlink', id: relation.id })
    return ok({ removed: true }, 'Removed relation', true)
  },
}

/* -------------------------------------------------------- custom fields & subs */

const defineCustomField: ToolDefinition = {
  name: 'define_custom_field',
  description: 'Add a custom field to a project. select fields require options.',
  inputSchema: json(
    {
      project: stringProp('Project id, key, or name.'),
      name: stringProp('Field name.'),
      type: { type: 'string', enum: ['text', 'number', 'date', 'select', 'checkbox'] },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Choices for a select field.',
      },
      required: { type: 'boolean' },
    },
    ['name', 'type'],
  ),
  run(ctx, input) {
    const name = str(input, 'name')
    if (!name) return fail('Field name is required')
    const type = str(input, 'type')
    if (!isCustomFieldType(type))
      return fail('Invalid field type', `Use one of: text, number, date, select, checkbox.`)
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    if (type === 'select' && strArray(input, 'options').length === 0) {
      return fail('Select fields need options', 'Pass at least one entry in options.')
    }
    ctx.dispatch({
      kind: 'customField/define',
      projectId: scoped.project.id,
      name,
      type,
      options: strArray(input, 'options'),
      required: bool(input, 'required') ?? false,
    })
    return ok({ field: name, type }, `Added custom field “${name}”`, true)
  },
}

const setCustomFieldValue: ToolDefinition = {
  name: 'set_custom_field_value',
  description: 'Set a custom field value on a task. Send null to clear it.',
  inputSchema: json(
    {
      task: stringProp('Task id, ticket id, or exact title.'),
      field: stringProp('Custom field name.'),
      value: { description: 'Value matching the field type. Null clears it.' },
    },
    ['task', 'field', 'value'],
  ),
  run(ctx, input) {
    const resolved = resolveTask(ctx.getState(), str(input, 'task'))
    if (!resolved.value) return fail(`No task matches “${str(input, 'task')}”`)
    const state = ctx.getState()
    const fieldName = str(input, 'field')
    const field = projectCustomFields(state, resolved.value.projectId).find(
      (entry) => entry.name.toLowerCase() === fieldName?.toLowerCase(),
    )
    if (!field) return fail(`No custom field “${fieldName}” on this project`)

    const raw = input['value']
    let value: string | number | boolean | null
    if (raw === null || raw === undefined) {
      value = null
    } else if (field.type === 'number') {
      const parsed = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(parsed)) return fail('Invalid value', 'This field expects a number.')
      value = parsed
    } else if (field.type === 'checkbox') {
      value = Boolean(raw)
    } else if (field.type === 'select') {
      const choice = String(raw)
      if (!field.options.includes(choice)) {
        return fail('Invalid option', `Allowed values: ${field.options.join(', ')}`)
      }
      value = choice
    } else {
      value = String(raw)
    }

    ctx.dispatch({
      kind: 'task/setCustomField',
      taskId: resolved.value.id,
      fieldId: field.id,
      value,
    })
    return ok(
      { task: ticketId(state, resolved.value), field: field.name, value },
      `Set ${field.name} on ${ticketId(state, resolved.value)}`,
      true,
    )
  },
}

const addSubtask: ToolDefinition = {
  name: 'add_subtask',
  description: 'Add a sub-task under a parent task.',
  inputSchema: json(
    {
      task: stringProp('Parent task id, ticket id, or exact title.'),
      title: stringProp('Sub-task title.'),
    },
    ['task', 'title'],
  ),
  run(ctx, input) {
    const parent = resolveTask(ctx.getState(), str(input, 'task'))
    if (!parent.value) return fail(`No task matches “${str(input, 'task')}”`)
    const title = str(input, 'title')
    if (!title) return fail('Sub-task title is required')
    const state = ctx.getState()
    ctx.dispatch({
      kind: 'task/create',
      projectId: parent.value.projectId,
      columnId: parent.value.columnId,
      title,
      parentId: parent.value.id,
    })
    return ok(
      { parent: ticketId(state, parent.value), subtask: title },
      `Added sub-task to ${ticketId(state, parent.value)}`,
      true,
    )
  },
}

const listSubtasks: ToolDefinition = {
  name: 'list_subtasks',
  description: 'List the sub-tasks of a task with their completion state.',
  inputSchema: json({ task: stringProp('Parent task id, ticket id, or exact title.') }, ['task']),
  run(ctx, input) {
    const parent = resolveTask(ctx.getState(), str(input, 'task'))
    if (!parent.value) return fail(`No task matches “${str(input, 'task')}”`)
    const state = ctx.getState()
    const rows = subtasksOf(state, parent.value.id).map((sub) => ({
      ticket: ticketId(state, sub),
      title: sub.title,
      done: isTaskDone(state, sub),
    }))
    return ok(rows, `Listed ${rows.length} sub-task(s)`)
  },
}

/* ------------------------------------------------------------ search & insight */

const searchTasks: ToolDefinition = {
  name: 'search_tasks',
  description: 'Search across every project by title, description, ticket id or label name.',
  inputSchema: json({ query: stringProp('Search text.'), limit: { type: 'number' } }, ['query']),
  run(ctx, input) {
    const query = str(input, 'query')
    if (!query) return fail('Query is required')
    const state = ctx.getState()
    const matches = filterTasks(state, state.tasks, {
      ...EMPTY_FILTERS,
      query,
      showArchived: false,
    })
    const limit = num(input, 'limit') ?? 25
    const rows = matches.slice(0, limit > 0 ? limit : undefined).map((task) => {
      const project = getProject(state, task.projectId)
      return {
        ticket: ticketId(state, task),
        title: task.title,
        project: project?.name ?? '',
        column: state.columns.find((column) => column.id === task.columnId)?.name ?? '',
      }
    })
    return ok(rows, `Found ${matches.length} match(es)`)
  },
}

const boardSummary: ToolDefinition = {
  name: 'board_summary',
  description:
    'Summarise a project: counts per column, priorities, overdue and blocked work, and labels in use.',
  inputSchema: json({ project: stringProp('Project id, key, or name.') }),
  run(ctx, input) {
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    const state = ctx.getState()
    const project = scoped.project
    const stats = projectStats(state, project.id)
    const tasks = state.tasks.filter((task) => task.projectId === project.id && !task.archived)
    const byColumn = projectColumns(state, project.id).map((column) => ({
      column: column.name,
      count: tasks.filter((task) => task.columnId === column.id).length,
    }))
    const byPriority = PRIORITY_VALUES.map((priority) => ({
      priority,
      label: PRIORITY_LABEL[priority],
      count: tasks.filter((task) => task.priority === priority).length,
    }))
    const labels = projectLabels(state, project.id)
      .map((label) => ({
        label: label.name,
        count: tasks.filter((task) => task.labelIds.includes(label.id)).length,
      }))
      .filter((entry) => entry.count > 0)
    return ok(
      { project: project.name, key: project.key, ...stats, byColumn, byPriority, labels },
      `Summarised “${project.name}”`,
    )
  },
}

const logTime: ToolDefinition = {
  name: 'log_time',
  description: 'Log time against a task.',
  inputSchema: json(
    { task: stringProp('Task id, ticket id, or exact title.'), minutes: { type: 'number' } },
    ['task', 'minutes'],
  ),
  run(ctx, input) {
    const minutes = num(input, 'minutes')
    if (!minutes || minutes <= 0) return fail('Minutes must be a positive number')
    const resolved = resolveTask(ctx.getState(), str(input, 'task'))
    if (!resolved.value) return fail(`No task matches “${str(input, 'task')}”`)
    ctx.dispatch({ kind: 'task/logTime', id: resolved.value.id, minutes })
    return ok(
      { task: ticketId(ctx.getState(), resolved.value), minutes },
      `Logged ${minutes}m on ${ticketId(ctx.getState(), resolved.value)}`,
      true,
    )
  },
}

const exportBoard: ToolDefinition = {
  name: 'export_board',
  description: 'Render the board as markdown, csv or json so it can be pasted elsewhere.',
  inputSchema: json(
    {
      project: stringProp('Project id, key, or name.'),
      format: { type: 'string', enum: ['markdown', 'csv', 'json'] },
    },
    ['format'],
  ),
  run(ctx, input) {
    const scoped = requireProject(ctx, input)
    if ('error' in scoped) return scoped.error
    const format = (str(input, 'format') ?? 'markdown').toLowerCase()
    const state = ctx.getState()
    if (format === 'csv')
      return ok(projectToCsv(state, scoped.project.id), `Exported “${scoped.project.name}” as CSV`)
    if (format === 'json') return ok(boardToJson(state), 'Exported board as JSON')
    return ok(
      boardToMarkdown(state, scoped.project.id),
      `Exported “${scoped.project.name}” as Markdown`,
    )
  },
}

/* ---------------------------------------------------- saved views & attachments */

const listSavedViews: ToolDefinition = {
  name: 'list_saved_views',
  description:
    'List the saved views — named filter and sort presets — and report which one is currently applied.',
  inputSchema: json({}),
  run(ctx) {
    const state = ctx.getState()
    const rows = state.savedViews.map((view) => ({
      id: view.id,
      name: view.name,
      sortMode: view.sortMode,
      query: view.filters.query,
      priorities: view.filters.priorities,
      labelIds: view.filters.labelIds,
      overdueOnly: view.filters.overdueOnly,
      showArchived: view.filters.showArchived,
      applied: state.selectedViewId === view.id,
    }))
    return ok(rows, `Listed ${rows.length} saved view(s)`)
  },
}

const createSavedView: ToolDefinition = {
  name: 'create_saved_view',
  description:
    'Save the current search, filters and sort order as a named view so the user can return to it in one click.',
  inputSchema: json({ name: stringProp('Name for the view, e.g. "Overdue and urgent".') }, [
    'name',
  ]),
  run(ctx, input) {
    const name = str(input, 'name')
    if (!name) return fail('View name is required')
    const state = ctx.getState()
    if (state.savedViews.some((view) => view.name.toLowerCase() === name.toLowerCase())) {
      return fail(`A view named “${name}” already exists`)
    }
    ctx.dispatch({ kind: 'view/create', name })
    return ok(
      {
        name,
        query: state.filters.query,
        priorities: state.filters.priorities,
        sortMode: state.sortMode,
      },
      `Saved view “${name}”`,
      true,
    )
  },
}

const applySavedView: ToolDefinition = {
  name: 'apply_saved_view',
  description: 'Apply a saved view to the board, restoring its search, filters and sort order.',
  inputSchema: json({ view: stringProp('Saved view name or id.') }, ['view']),
  run(ctx, input) {
    const reference = str(input, 'view')
    const state = ctx.getState()
    const view = state.savedViews.find(
      (entry) => entry.id === reference || entry.name.toLowerCase() === reference?.toLowerCase(),
    )
    if (!view) {
      return fail(
        `No saved view named “${reference}”`,
        `Available: ${state.savedViews.map((entry) => entry.name).join(', ') || 'none'}`,
      )
    }
    ctx.dispatch({ kind: 'view/apply', id: view.id })
    return ok(
      { view: view.name, query: view.filters.query, sortMode: view.sortMode },
      `Applied view “${view.name}”`,
    )
  },
}

const deleteSavedView: ToolDefinition = {
  name: 'delete_saved_view',
  description: 'Delete a saved view. This cannot be undone.',
  inputSchema: json({ view: stringProp('Saved view name or id.') }, ['view']),
  run(ctx, input) {
    const reference = str(input, 'view')
    const state = ctx.getState()
    const view = state.savedViews.find(
      (entry) => entry.id === reference || entry.name.toLowerCase() === reference?.toLowerCase(),
    )
    if (!view) return fail(`No saved view named “${reference}”`)
    ctx.dispatch({ kind: 'view/delete', id: view.id })
    return ok({ deleted: view.name }, `Deleted view “${view.name}”`, true)
  },
}

const listAttachments: ToolDefinition = {
  name: 'list_attachments',
  description:
    'List the files attached to a task. Returns metadata only — this tool cannot read or write file contents.',
  inputSchema: json({
    task: stringProp(
      'Task id, ticket id, or exact title. Omit to list every attachment in the project.',
    ),
  }),
  run(ctx, input) {
    const state = ctx.getState()
    const reference = str(input, 'task')

    if (reference) {
      const resolved = resolveTask(state, reference)
      if (!resolved.value) return fail(`No task matches “${reference}”`)
      const rows = state.attachments
        .filter((entry) => entry.taskId === resolved.value!.id)
        .map((entry) => ({
          name: entry.name,
          type: entry.mime,
          bytes: entry.size,
          addedAt: new Date(entry.createdAt).toISOString(),
        }))
      return ok(rows, `Listed ${rows.length} attachment(s) on ${ticketId(state, resolved.value)}`)
    }

    const project = getProject(state, state.selectedProjectId)
    const taskIds = new Set(
      state.tasks.filter((task) => task.projectId === project?.id).map((task) => task.id),
    )
    const rows = state.attachments
      .filter((entry) => taskIds.has(entry.taskId))
      .map((entry) => {
        const task = state.tasks.find((candidate) => candidate.id === entry.taskId)
        return {
          name: entry.name,
          type: entry.mime,
          bytes: entry.size,
          task: task ? ticketId(state, task) : null,
        }
      })
    return ok(rows, `Listed ${rows.length} attachment(s)`)
  },
}

export const TOOLS: ToolDefinition[] = [
  listProjects,
  createProject,
  updateProject,
  archiveProject,
  deleteProject,
  listColumns,
  createColumn,
  updateColumn,
  reorderColumns,
  deleteColumn,
  listLabels,
  createLabel,
  deleteLabel,
  listTasks,
  getTask,
  createTask,
  updateTask,
  moveTask,
  archiveTask,
  deleteTask,
  setTaskLabels,
  addComment,
  listComments,
  linkTasks,
  unlinkTask,
  defineCustomField,
  setCustomFieldValue,
  addSubtask,
  listSubtasks,
  searchTasks,
  boardSummary,
  logTime,
  exportBoard,
  listSavedViews,
  createSavedView,
  applySavedView,
  deleteSavedView,
  listAttachments,
  // People, duplication, bulk edits, external links and the activity feed.
  ...TEAM_TOOLS,
]

const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]))

export function getTool(name: string): ToolDefinition | null {
  return TOOLS_BY_NAME.get(name) ?? null
}

/**
 * Tool schemas in the shape a chat model expects.
 *
 * Uses the shared `AgentToolDef` field name (`inputSchema`) so ReveLith's own
 * agent loop can consume the task tools directly, alongside its native tools.
 */
export function toolSchemas(): AgentToolDef[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))
}

/** Execute a tool call by name. Unknown tools fail rather than throw. */
export function runTool(
  ctx: ToolContext,
  name: string,
  input: Record<string, unknown> = {},
): ToolResult {
  const tool = getTool(name)
  if (!tool)
    return fail(
      `Unknown tool: ${name}`,
      `Available tools: ${TOOLS.map((entry) => entry.name).join(', ')}`,
    )
  try {
    return tool.run(ctx, input)
  } catch (error) {
    // A tool bug must surface as a readable message to the model, not crash the panel.
    return fail(`Tool ${name} failed`, error instanceof Error ? error.message : String(error))
  }
}
