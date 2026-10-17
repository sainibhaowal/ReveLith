import type { ExternalLinkType, Priority } from '../domain/types'
import { EXTERNAL_LINK_TYPES, memberInitials } from '../domain/types'
import { getMember, isOverdue, isTaskDone, recentActivity, ticketId } from '../store/selectors'
import { resolveTask } from './resolve'
import {
  bool,
  fail,
  json,
  num,
  ok,
  str,
  stringProp,
  type ToolContext,
  type ToolDefinition,
} from './tool-helpers'

/**
 * Tools for people, duplication, bulk edits, external links and the activity feed.
 *
 * Split from `tools.ts` so neither file becomes the one place every capability
 * has to be added. Same contract as the rest of the surface: a pure function of
 * (store, input) that dispatches ordinary board actions.
 */

/** Resolve a member by id or exact (case-insensitive) name. */
function resolveMemberId(ctx: ToolContext, input: unknown): string | null | undefined {
  const state = ctx.getState()
  const reference = typeof input === 'string' ? input.trim() : ''
  if (!reference) return null
  const byId = state.members.find((member) => member.id === reference)
  if (byId) return byId.id
  const byName = state.members.find(
    (member) => member.name.toLowerCase() === reference.toLowerCase(),
  )
  if (byName) return byName.id
  const partial = state.members.find((member) =>
    member.name.toLowerCase().startsWith(reference.toLowerCase()),
  )
  return partial?.id
}

/* -------------------------------------------------------------------- members */

const listMembers: ToolDefinition = {
  name: 'list_members',
  description:
    'List the people on the board with their open, overdue and completed task counts. This is a local list of names, not accounts - nobody has to sign in.',
  inputSchema: json({}),
  run(ctx) {
    const state = ctx.getState()
    const today = new Date()
    const rows = state.members.map((member) => {
      const tasks = state.tasks.filter(
        (task) => task.assigneeId === member.id && !task.archived && !task.parentId,
      )
      return {
        name: member.name,
        initials: memberInitials(member.name),
        color: member.color,
        open: tasks.filter((task) => !isTaskDone(state, task)).length,
        overdue: tasks.filter((task) => !isTaskDone(state, task) && isOverdue(task, today)).length,
        done: tasks.filter((task) => isTaskDone(state, task)).length,
      }
    })
    return ok(rows, `Listed ${rows.length} member(s)`)
  },
}

const createMember: ToolDefinition = {
  name: 'create_member',
  description:
    'Add a person who can own tasks. Members are local names only - there are no logins and no accounts to create.',
  inputSchema: json(
    {
      name: stringProp('Display name, e.g. "Ada Lovelace".'),
      color: stringProp('Optional colour name.'),
    },
    ['name'],
  ),
  run(ctx, input) {
    const name = str(input, 'name')?.trim()
    if (!name) return fail('A member name is required')
    if (ctx.getState().members.some((member) => member.name.toLowerCase() === name.toLowerCase())) {
      return fail(`${name} is already on the board`)
    }
    const color = str(input, 'color')
    ctx.dispatch({ kind: 'member/create', name, ...(color ? { color } : {}) })
    return ok(`Added ${name} to the board.`, `Added member ${name}`, true)
  },
}

const deleteMember: ToolDefinition = {
  name: 'delete_member',
  description:
    'Remove a person from the board. Their tasks are kept and become unassigned. This cannot be undone.',
  inputSchema: json({ member: stringProp('Member name or id.') }, ['member']),
  run(ctx, input) {
    const id = resolveMemberId(ctx, str(input, 'member'))
    if (!id) return fail(`No member matches "${str(input, 'member') ?? ''}"`)
    const name = getMember(ctx.getState(), id)?.name ?? 'that member'
    ctx.dispatch({ kind: 'member/delete', id })
    return ok(`Removed ${name}. Their tasks are now unassigned.`, `Removed member ${name}`, true)
  },
}

/* ------------------------------------------------------------------ assignees */

const assignTask: ToolDefinition = {
  name: 'assign_task',
  description: 'Assign a task to a member, or pass an empty member to unassign it.',
  inputSchema: json(
    {
      task: stringProp('Task id, ticket id, or exact title.'),
      member: stringProp('Member name or id. Omit or leave blank to unassign.'),
    },
    ['task'],
  ),
  run(ctx, input) {
    const state = ctx.getState()
    const resolved = resolveTask(state, str(input, 'task'))
    if (!resolved.value) return fail(`No task matches "${str(input, 'task') ?? ''}"`)
    const reference = str(input, 'member')?.trim()
    if (!reference) {
      ctx.dispatch({ kind: 'task/setAssignee', id: resolved.value.id, assigneeId: null })
      return ok(`Unassigned ${ticketId(state, resolved.value)}.`, 'Unassigned task', true)
    }
    const id = resolveMemberId(ctx, reference)
    if (!id) return fail(`No member matches "${reference}". Use list_members to see who exists.`)
    const name = getMember(state, id)?.name ?? reference
    ctx.dispatch({ kind: 'task/setAssignee', id: resolved.value.id, assigneeId: id })
    return ok(
      `Assigned ${ticketId(state, resolved.value)} to ${name}.`,
      `Assigned to ${name}`,
      true,
    )
  },
}

const myTasks: ToolDefinition = {
  name: 'my_tasks',
  description:
    "List the tasks assigned to a member across every project, soonest due first. This is the 'My tasks' view.",
  inputSchema: json({
    member: stringProp('Member name or id. Omit for every member.'),
    includeDone: { type: 'boolean', description: 'Include completed tasks.' },
  }),
  run(ctx, input) {
    const state = ctx.getState()
    const includeDone = bool(input, 'includeDone') ?? false
    const reference = str(input, 'member')?.trim()
    const members = reference
      ? [resolveMemberId(ctx, reference)].filter((id): id is string => Boolean(id))
      : state.members.map((member) => member.id)
    if (reference && !members.length) {
      return fail(`No member matches "${reference}". Use list_members to see who exists.`)
    }

    const rows = state.tasks
      .filter(
        (task) =>
          !task.archived &&
          !task.parentId &&
          task.assigneeId !== null &&
          members.includes(task.assigneeId) &&
          (includeDone || !isTaskDone(state, task)),
      )
      .sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'))
      .map((task) => ({
        ticket: ticketId(state, task),
        title: task.title,
        assignee: getMember(state, task.assigneeId)?.name ?? 'Unassigned',
        due: task.dueDate,
        overdue: isOverdue(task, new Date()),
        priority: task.priority,
      }))
    return ok(rows, `Found ${rows.length} assigned task(s)`)
  },
}

/* -------------------------------------------------------------- duplication */

const duplicateTask: ToolDefinition = {
  name: 'duplicate_task',
  description:
    'Copy a task and its sub-tasks. The copy gets a fresh ticket number. Comments, relations and logged time stay with the original.',
  inputSchema: json({
    task: stringProp('Task id, ticket id, or exact title.'),
    title: stringProp('Optional new title for the copy.'),
    column: stringProp('Optional column to drop the copy into.'),
  }),
  run(ctx, input) {
    const state = ctx.getState()
    const resolved = resolveTask(state, str(input, 'task'))
    if (!resolved.value) return fail(`No task matches "${str(input, 'task') ?? ''}"`)
    const columnName = str(input, 'column')?.trim()
    let columnId: string | undefined
    if (columnName) {
      const column = state.columns.find(
        (entry) =>
          entry.projectId === resolved.value!.projectId &&
          entry.name.toLowerCase() === columnName.toLowerCase(),
      )
      if (!column) return fail(`No column named "${columnName}" in this project`)
      columnId = column.id
    }
    const title = str(input, 'title')?.trim()
    ctx.dispatch({
      kind: 'task/duplicate',
      id: resolved.value.id,
      ...(columnId ? { columnId } : {}),
      ...(title ? { title } : {}),
    })
    return ok(
      `Duplicated ${ticketId(state, resolved.value)}.`,
      `Duplicated ${resolved.value.title}`,
      true,
    )
  },
}

/* -------------------------------------------------------------- bulk editing */

const bulkUpdateTasks: ToolDefinition = {
  name: 'bulk_update_tasks',
  description:
    'Apply one change to several tasks at once: move them to a column, set priority, owner, due date or labels, or archive them.',
  inputSchema: json(
    {
      tasks: {
        type: 'array',
        items: { type: 'string' },
        description: 'Task ids, ticket ids or titles.',
      },
      column: stringProp('Move every task to this column.'),
      priority: {
        type: 'string',
        enum: ['urgent', 'high', 'medium', 'low'],
        description: 'Set priority.',
      },
      member: stringProp('Assign every task to this member.'),
      unassign: { type: 'boolean', description: 'Unassign instead of assigning.' },
      dueDate: stringProp('Set the due date, YYYY-MM-DD. Pass "none" to clear it.'),
      archive: { type: 'boolean', description: 'Archive every task.' },
    },
    ['tasks'],
  ),
  run(ctx, input) {
    const state = ctx.getState()
    const raw = Array.isArray(input['tasks']) ? (input['tasks'] as unknown[]) : []
    if (!raw.length) return fail('Provide at least one task in "tasks"')

    const targets: string[] = []
    const missing: string[] = []
    for (const entry of raw) {
      const resolved = resolveTask(state, entry)
      if (resolved.value) targets.push(resolved.value.id)
      else missing.push(String(entry))
    }
    if (!targets.length) {
      return fail(`No task matched: ${missing.join(', ')}`)
    }

    const columnName = str(input, 'column')?.trim()
    if (columnName) {
      const projectId = state.tasks.find((task) => task.id === targets[0])?.projectId
      const column = state.columns.find(
        (entry) =>
          entry.projectId === projectId && entry.name.toLowerCase() === columnName.toLowerCase(),
      )
      if (!column) return fail(`No column named "${columnName}" in this project`)
      ctx.dispatch({ kind: 'bulk/move', ids: targets, columnId: column.id })
      return ok(
        `Moved ${targets.length} task(s) to ${column.name}.`,
        `Moved ${targets.length} task(s) to ${column.name}`,
        true,
      )
    }

    const patch: Parameters<typeof ctx.dispatch>[0] extends never
      ? never
      : Record<string, unknown> = {}
    const priority = str(input, 'priority') as Priority | undefined
    if (priority) patch['priority'] = priority
    const dueDate = str(input, 'dueDate')?.trim()
    if (dueDate) patch['dueDate'] = dueDate.toLowerCase() === 'none' ? null : dueDate
    if (bool(input, 'unassign')) patch['assigneeId'] = null
    else {
      const member = str(input, 'member')?.trim()
      if (member) {
        const id = resolveMemberId(ctx, member)
        if (!id) return fail(`No member matches "${member}". Use list_members to see who exists.`)
        patch['assigneeId'] = id
      }
    }
    const archive = bool(input, 'archive')
    if (archive !== undefined) patch['archived'] = archive

    if (!Object.keys(patch).length) {
      return fail('Nothing to change. Pass column, priority, member, dueDate or archive.')
    }
    ctx.dispatch({
      kind: 'bulk/update',
      ids: targets,
      patch,
    } as Parameters<typeof ctx.dispatch>[0])
    const fields = Object.keys(patch).join(', ')
    return ok(
      `Updated ${targets.length} task(s): ${fields}.`,
      `Bulk updated ${targets.length} task(s)`,
      true,
    )
  },
}

/* ------------------------------------------------------------ external links */

const listExternalLinks: ToolDefinition = {
  name: 'list_external_links',
  description: 'List the issue, pull request, branch or URL links attached to a task.',
  inputSchema: json({ task: stringProp('Task id, ticket id, or exact title.') }, ['task']),
  run(ctx, input) {
    const state = ctx.getState()
    const resolved = resolveTask(state, str(input, 'task'))
    if (!resolved.value) return fail(`No task matches "${str(input, 'task') ?? ''}"`)
    const rows = state.externalLinks
      .filter((link) => link.taskId === resolved.value!.id)
      .map((link) => ({
        type: link.type,
        url: link.url,
        title: link.title,
        externalId: link.externalId,
      }))
    return ok(rows, `Found ${rows.length} external link(s)`)
  },
}

const addExternalLink: ToolDefinition = {
  name: 'add_external_link',
  description: 'Attach a link to an issue, pull request, branch or any URL on a task.',
  inputSchema: json(
    {
      task: stringProp('Task id, ticket id, or exact title.'),
      url: stringProp('The full URL.'),
      type: {
        type: 'string',
        enum: [...EXTERNAL_LINK_TYPES],
        description: 'What the link points at.',
      },
      externalId: stringProp('The provider id, e.g. "482".'),
    },
    ['task', 'url'],
  ),
  run(ctx, input) {
    const state = ctx.getState()
    const resolved = resolveTask(state, str(input, 'task'))
    if (!resolved.value) return fail(`No task matches "${str(input, 'task') ?? ''}"`)
    const url = str(input, 'url')?.trim()
    if (!url) return fail('A url is required')
    const type = (str(input, 'type') ?? 'url') as ExternalLinkType
    if (!EXTERNAL_LINK_TYPES.includes(type)) {
      return fail(`type must be one of: ${EXTERNAL_LINK_TYPES.join(', ')}`)
    }
    ctx.dispatch({
      kind: 'externalLink/add',
      taskId: resolved.value.id,
      type,
      url,
      ...(str(input, 'externalId') ? { externalId: str(input, 'externalId')! } : {}),
    })
    return ok(
      `Linked ${url} to ${ticketId(state, resolved.value)}.`,
      `Added a ${type.replace('_', ' ')} link`,
      true,
    )
  },
}

const removeExternalLink: ToolDefinition = {
  name: 'remove_external_link',
  description: 'Remove an external link from a task by its url or external id.',
  inputSchema: json(
    {
      task: stringProp('Task id, ticket id, or exact title.'),
      link: stringProp('The url or external id to remove.'),
    },
    ['task', 'link'],
  ),
  run(ctx, input) {
    const state = ctx.getState()
    const resolved = resolveTask(state, str(input, 'task'))
    if (!resolved.value) return fail(`No task matches "${str(input, 'task') ?? ''}"`)
    const needle = str(input, 'link')?.trim().toLowerCase()
    const link = state.externalLinks.find(
      (entry) =>
        entry.taskId === resolved.value!.id &&
        (entry.url.toLowerCase() === needle || entry.externalId.toLowerCase() === needle),
    )
    if (!link) return fail(`No link matching "${str(input, 'link') ?? ''}" on that task`)
    ctx.dispatch({ kind: 'externalLink/remove', id: link.id })
    return ok(`Removed ${link.url}.`, 'Removed an external link', true)
  },
}

/* ------------------------------------------------------------- activity feed */

const activityFeed: ToolDefinition = {
  name: 'activity_feed',
  description:
    'Show recent activity across every task and project, newest first. Use this instead of reading each task history when the user asks "what changed".',
  inputSchema: json({ limit: { type: 'number', description: 'How many entries, default 30.' } }),
  run(ctx, input) {
    const state = ctx.getState()
    const limit = num(input, 'limit') ?? 30
    const rows = recentActivity(state, Math.min(Math.max(limit, 1), 200)).map((entry) => ({
      at: new Date(entry.createdAt).toISOString(),
      kind: entry.kind,
      message: entry.message,
      task: entry.taskId
        ? (() => {
            const task = state.tasks.find((candidate) => candidate.id === entry.taskId)
            return task ? ticketId(state, task) : null
          })()
        : null,
    }))
    return ok(rows, `Showed ${rows.length} activity entries`)
  },
}

/** Tools covering people, duplication, bulk edits, links and activity. */
export const TEAM_TOOLS: ToolDefinition[] = [
  listMembers,
  createMember,
  deleteMember,
  assignTask,
  myTasks,
  duplicateTask,
  bulkUpdateTasks,
  listExternalLinks,
  addExternalLink,
  removeExternalLink,
  activityFeed,
]
