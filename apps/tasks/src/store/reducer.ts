import { nextId } from '../domain/ids'
import { positionAfter } from '../domain/position'
import type {
  ActivityKind,
  Attachment,
  BoardState,
  Column,
  CustomField,
  ExternalLink,
  ID,
  Label,
  Member,
  Priority,
  Project,
  SavedView,
  Task,
  TaskFilters,
} from '../domain/types'
import { EMPTY_FILTERS, RELATION_INVERSE } from '../domain/types'
import type { Action } from './actions'

const DEFAULT_COLUMNS: { name: string; color: string; isDone: boolean }[] = [
  { name: 'Backlog', color: 'slate', isDone: false },
  { name: 'In Progress', color: 'blue', isDone: false },
  { name: 'Review', color: 'amber', isDone: false },
  { name: 'Done', color: 'green', isDone: true },
]

/** Ticket keys are uppercase alphanumerics, at most 6 characters. */
export function normalizeProjectKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

/** Derive a key from a project name when the caller does not supply one. */
export function deriveProjectKey(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'PRJ'
  if (words.length === 1) return normalizeProjectKey(words[0]) || 'PRJ'
  return normalizeProjectKey(words.map((word) => word[0]).join('')) || 'PRJ'
}

function now(): number {
  return Date.now()
}

function logActivity(
  state: BoardState,
  entry: { projectId: ID; taskId?: ID | null; kind: ActivityKind; message: string },
): Activity_ {
  return {
    id: nextId('act'),
    projectId: entry.projectId,
    taskId: entry.taskId ?? null,
    kind: entry.kind,
    message: entry.message,
    createdAt: now(),
  }
}

// Local alias so the helper above stays readable without importing the domain type name twice.
type Activity_ = BoardState['activity'][number]

function touch(task: Task, patch: Partial<Task>): Task {
  return { ...task, ...patch, updatedAt: now() }
}

function normalizeKeyForCompare(key: string): string {
  return key.trim().toUpperCase()
}

/** True when `filters` and `sortMode` still match the given view. */
function patchMatchesView(state: BoardState, filters: TaskFilters, sortMode: string): boolean {
  if (!state.selectedViewId) return false
  const view = state.savedViews.find((entry) => entry.id === state.selectedViewId)
  if (!view) return false
  return JSON.stringify(view.filters) === JSON.stringify(filters) && view.sortMode === sortMode
}

function uniqueProjectKey(state: BoardState, key: string, ignoreId?: ID): string {
  const taken = new Set(
    state.projects
      .filter((project) => project.id !== ignoreId)
      .map((project) => normalizeKeyForCompare(project.key)),
  )
  let candidate = key
  let suffix = 2
  while (taken.has(normalizeKeyForCompare(candidate))) {
    candidate = `${key.slice(0, 5)}${suffix}`
    suffix += 1
  }
  return candidate
}

function tasksInGroup(state: BoardState, columnId: ID, parentId: ID | null): Task[] {
  return state.tasks
    .filter((task) => task.columnId === columnId && task.parentId === parentId && !task.archived)
    .sort((a, b) => a.position - b.position)
}

function nextPosition(state: BoardState, columnId: ID, parentId: ID | null): number {
  const group = tasksInGroup(state, columnId, parentId)
  return positionAfter(group.length ? group[group.length - 1].position : null)
}

function ensureDefaultColumns(state: BoardState, projectId: ID): Column[] {
  return DEFAULT_COLUMNS.map((seed, index) => ({
    id: nextId('col'),
    projectId,
    name: seed.name,
    color: seed.color,
    position: (index + 1) * 1024,
    wipLimit: null,
    isDone: seed.isDone,
  }))
}

/** Descendant task ids of `rootId`, breadth first. Used by cascade deletes. */
export function collectSubtaskIds(state: BoardState, rootId: ID): ID[] {
  const collected: ID[] = []
  const queue = [rootId]
  const seen = new Set<ID>([rootId])
  while (queue.length) {
    const current = queue.shift() as ID
    for (const task of state.tasks) {
      if (task.parentId === current && !seen.has(task.id)) {
        seen.add(task.id)
        collected.push(task.id)
        queue.push(task.id)
      }
    }
  }
  return collected
}

function removeTasksCascade(state: BoardState, taskIds: ID[]): BoardState {
  const gone = new Set(taskIds)
  return {
    ...state,
    tasks: state.tasks
      .filter((task) => !gone.has(task.id))
      // Orphaned sub-tasks are promoted to top level rather than deleted with
      // their parent, so a delete never silently destroys unrelated work.
      .map((task) => (task.parentId && gone.has(task.parentId) ? { ...task, parentId: null } : task)),
    comments: state.comments.filter((comment) => !gone.has(comment.taskId)),
    relations: state.relations.filter(
      (relation) => !gone.has(relation.fromTaskId) && !gone.has(relation.toTaskId),
    ),
    // Orphaned attachment records would point at a task that no longer exists;
    // the bytes are dropped from IndexedDB by the caller that deletes a task.
    attachments: state.attachments.filter((attachment) => !gone.has(attachment.taskId)),
    externalLinks: state.externalLinks.filter((link) => !gone.has(link.taskId)),
    selectedTaskId: state.selectedTaskId && gone.has(state.selectedTaskId) ? null : state.selectedTaskId,
    selectedTaskIds: state.selectedTaskIds.filter((taskId) => !gone.has(taskId)),
  }
}

function applyProjectCreate(state: BoardState, action: Extract<Action, { kind: 'project/create' }>): BoardState {
  const key = uniqueProjectKey(state, normalizeProjectKey(action.key || '') || deriveProjectKey(action.name))
  const project: Project = {
    id: nextId('prj'),
    key,
    name: action.name.trim() || 'Untitled project',
    description: action.description ?? '',
    color: action.color ?? 'blue',
    archived: false,
    lastTaskNumber: 0,
    createdAt: now(),
  }
  const columns = ensureDefaultColumns(state, project.id)
  return {
    ...state,
    projects: [...state.projects, project],
    columns: [...state.columns, ...columns],
    activity: [
      ...state.activity,
      logActivity(state, { projectId: project.id, kind: 'created', message: `Created project ${project.name}` }),
    ],
    selectedProjectId: project.id,
  }
}

function applyTaskCreate(state: BoardState, action: Extract<Action, { kind: 'task/create' }>): BoardState {
  const project = state.projects.find((entry) => entry.id === action.projectId)
  const column = state.columns.find((entry) => entry.id === action.columnId)
  if (!project || !column) return state

  const number = project.lastTaskNumber + 1
  const parentId = action.parentId ?? null
  const task: Task = {
    id: nextId('task'),
    projectId: project.id,
    columnId: column.id,
    number,
    title: action.title.trim(),
    description: action.description ?? '',
    priority: (action.priority ?? 'medium') as Priority,
    dueDate: action.dueDate ?? null,
    startDate: action.startDate ?? null,
    labelIds: action.labelIds ?? [],
    customFields: {},
    assigneeId: null,
    parentId,
    position: action.position ?? nextPosition(state, column.id, parentId),
    archived: false,
    createdAt: now(),
    updatedAt: now(),
    completedAt: column.isDone ? now() : null,
    estimateMinutes: action.estimateMinutes ?? null,
    timeEntries: [],
  }

  return {
    ...state,
    tasks: [...state.tasks, task],
    projects: state.projects.map((entry) =>
      entry.id === project.id ? { ...entry, lastTaskNumber: number } : entry,
    ),
    activity: [
      ...state.activity,
      logActivity(state, {
        projectId: project.id,
        taskId: task.id,
        kind: 'created',
        message: `Created ${project.key}-${task.number}`,
      }),
    ],
  }
}

function applyTaskMove(state: BoardState, action: Extract<Action, { kind: 'task/move' }>): BoardState {
  const task = state.tasks.find((entry) => entry.id === action.id)
  if (!task) return state
  const column = state.columns.find((entry) => entry.id === action.columnId)
  if (!column) return state

  const parentId = action.parentId === undefined ? task.parentId : action.parentId
  // A task cannot be its own parent.
  const safeParent = parentId === task.id ? null : parentId
  const sameGroup = task.columnId === column.id && task.parentId === safeParent
  const position = action.position ?? (sameGroup ? task.position : nextPosition(state, column.id, safeParent))

  const next = touch(task, {
    columnId: column.id,
    parentId: safeParent,
    position,
    completedAt: column.isDone ? (task.completedAt ?? now()) : null,
  })

  const moved = task.columnId !== column.id
  return {
    ...state,
    tasks: state.tasks.map((entry) => (entry.id === task.id ? next : entry)),
    activity: moved
      ? [
          ...state.activity,
          logActivity(state, {
            projectId: task.projectId,
            taskId: task.id,
            kind: 'moved',
            message: `Moved to ${column.name}`,
          }),
        ]
      : state.activity,
  }
}

function applyRelationLink(
  state: BoardState,
  action: Extract<Action, { kind: 'relation/link' }>,
): BoardState {
  const { fromTaskId, toTaskId, type } = action
  if (fromTaskId === toTaskId) return state
  if (!state.tasks.some((task) => task.id === fromTaskId)) return state
  if (!state.tasks.some((task) => task.id === toTaskId)) return state

  const inverse = RELATION_INVERSE[type]
  const exists = state.relations.some(
    (relation) =>
      relation.fromTaskId === fromTaskId &&
      relation.toTaskId === toTaskId &&
      relation.type === type,
  )
  if (exists) return state

  const duplicateInverse = state.relations.some(
    (relation) =>
      relation.fromTaskId === toTaskId &&
      relation.toTaskId === fromTaskId &&
      relation.type === inverse &&
      // Symmetric relations would produce a duplicate edge if stored twice.
      inverse !== type,
  )
  if (duplicateInverse) return state

  const relation = { id: nextId('rel'), fromTaskId, toTaskId, type, createdAt: now() }
  const projectId = state.tasks.find((task) => task.id === fromTaskId)?.projectId ?? ''
  return {
    ...state,
    relations: [...state.relations, relation],
    activity: [
      ...state.activity,
      logActivity(state, {
        projectId,
        taskId: fromTaskId,
        kind: 'linked',
        message: `Linked task (${type.replace('_', ' ')})`,
      }),
    ],
  }
}

function applyCustomFieldDelete(state: BoardState, id: ID): BoardState {
  return {
    ...state,
    customFields: state.customFields.filter((field) => field.id !== id),
    // Drop the value from every task so no orphan keys linger in saved documents.
    tasks: state.tasks.map((task) => {
      if (!(id in task.customFields)) return task
      const nextFields = { ...task.customFields }
      delete nextFields[id]
      return { ...task, customFields: nextFields }
    }),
  }
}

function applyTaskDelete(state: BoardState, id: ID): BoardState {
  const task = state.tasks.find((entry) => entry.id === id)
  if (!task) return state
  const ids = [id, ...collectSubtaskIds(state, id)]
  const cleaned = removeTasksCascade(state, ids)
  return {
    ...cleaned,
    activity: [
      ...cleaned.activity,
      logActivity(state, {
        projectId: task.projectId,
        kind: 'deleted',
        message: `Deleted ${ids.length} task(s)`,
      }),
    ],
  }
}

function applyColumnDelete(state: BoardState, id: ID): BoardState {
  const column = state.columns.find((entry) => entry.id === id)
  if (!column) return state
  const siblings = state.columns
    .filter((entry) => entry.projectId === column.projectId)
    .sort((a, b) => a.position - b.position)
  // Refuse to remove the last column; a board with nowhere to put a task is broken.
  if (siblings.length <= 1) return state

  const fallback = siblings.find((entry) => entry.id !== id) as Column

  // Append the orphaned tasks to the fallback column, preserving their relative
  // order and recomputing each position against the tasks already placed.
  let working = state
  const orphans = state.tasks
    .filter((task) => task.columnId === id)
    .sort((a, b) => a.position - b.position)
  for (const orphan of orphans) {
    working = {
      ...working,
      tasks: working.tasks.map((task) =>
        task.id === orphan.id
          ? touch(task, { columnId: fallback.id, position: nextPosition(working, fallback.id, task.parentId) })
          : task,
      ),
    }
  }

  return {
    ...working,
    columns: working.columns
      .filter((entry) => entry.id !== id)
      .map((entry) =>
        entry.projectId === column.projectId && entry.position > column.position
          ? { ...entry, position: entry.position - 1 }
          : entry,
      ),
  }
}

function applyProjectDelete(state: BoardState, id: ID): BoardState {
  const project = state.projects.find((entry) => entry.id === id)
  if (!project) return state
  const taskIds = new Set(state.tasks.filter((task) => task.projectId === id).map((task) => task.id))
  const remainingProjects = state.projects.filter((entry) => entry.id !== id)
  return {
    ...state,
    projects: remainingProjects,
    columns: state.columns.filter((column) => column.projectId !== id),
    labels: state.labels.filter((label) => label.projectId !== id),
    customFields: state.customFields.filter((field) => field.projectId !== id),
    activity: state.activity.filter((entry) => entry.projectId !== id),
    tasks: state.tasks.filter((task) => !taskIds.has(task.id)),
    comments: state.comments.filter((comment) => !taskIds.has(comment.taskId)),
    externalLinks: state.externalLinks.filter((link) => !taskIds.has(link.taskId)),
    relations: state.relations.filter(
      (relation) => !taskIds.has(relation.fromTaskId) && !taskIds.has(relation.toTaskId),
    ),
    selectedProjectId: state.selectedProjectId === id ? (remainingProjects[0]?.id ?? null) : state.selectedProjectId,
    selectedTaskId: state.selectedTaskId && taskIds.has(state.selectedTaskId) ? null : state.selectedTaskId,
  }
}

function applyLabelDelete(state: BoardState, id: ID): BoardState {
  return {
    ...state,
    labels: state.labels.filter((label) => label.id !== id),
    tasks: state.tasks.map((task) =>
      task.labelIds.includes(id) ? { ...task, labelIds: task.labelIds.filter((labelId) => labelId !== id) } : task,
    ),
  }
}

/**
 * Copy a task, and its sub-tasks, into the same or a given column.
 *
 * Comments, relations, external links, attachments and logged time stay with
 * the original: a duplicate is a fresh piece of work, not a fork of the
 * discussion that led to the first one.
 */
function applyTaskDuplicate(
  state: BoardState,
  id: ID,
  columnId?: ID,
  titleOverride?: string,
): BoardState {
  const source = state.tasks.find((entry) => entry.id === id)
  if (!source) return state
  const targetColumnId = columnId ?? source.columnId
  const targetColumn = state.columns.find((entry) => entry.id === targetColumnId)
  if (!targetColumn) return state

  const project = state.projects.find((entry) => entry.id === source.projectId)
  if (!project) return state

  // Copy the whole subtree so sub-task progress survives the duplicate.
  const subtree = [source, ...collectSubtaskIds(state, source.id).map((sid) => state.tasks.find((t) => t.id === sid)!)]
  let nextNumber = project.lastTaskNumber
  const created: Task[] = []
  const idMap = new Map<ID, ID>()

  for (const original of subtree) {
    const id = nextId('task')
    idMap.set(original.id, id)
    nextNumber += 1
    const destinationColumn = original.id === source.id ? targetColumnId : original.columnId
    created.push({
      ...original,
      id,
      number: nextNumber,
      title: original.id === source.id && titleOverride?.trim() ? titleOverride.trim() : original.title,
      columnId: destinationColumn,
      // A duplicated parent is a root task, so sub-tasks cannot stay attached.
      parentId: original.parentId === source.id ? idMap.get(source.id)! : null,
      position: nextPosition(state, destinationColumn, null),
      archived: false,
      completedAt: null,
      createdAt: now(),
      updatedAt: now(),
      timeEntries: [],
    })
  }

  return {
    ...state,
    tasks: [...state.tasks, ...created],
    projects: state.projects.map((entry) =>
      entry.id === project.id ? { ...entry, lastTaskNumber: nextNumber } : entry,
    ),
    activity: [
      ...state.activity,
      logActivity(state, {
        projectId: source.projectId,
        taskId: idMap.get(source.id)!,
        kind: 'duplicated',
        message:
          subtree.length > 1
            ? `Duplicated task and ${subtree.length - 1} sub-task(s)`
            : 'Duplicated task',
      }),
    ],
  }
}

/** Removing a member unassigns their work rather than deleting it. */
function applyMemberDelete(state: BoardState, id: ID): BoardState {
  if (!state.members.some((member) => member.id === id)) return state
  return {
    ...state,
    members: state.members.filter((member) => member.id !== id),
    tasks: state.tasks.map((task) => (task.assigneeId === id ? { ...task, assigneeId: null } : task)),
    filters: {
      ...state.filters,
      assigneeIds: state.filters.assigneeIds.filter((entry) => entry !== id),
    },
  }
}

function apply(state: BoardState, action: Action): BoardState {
  switch (action.kind) {
    case 'board/replace':
      // Opening a file replaces the board wholesale; transient UI state resets.
      return { ...action.state, selectedTaskId: null }
    case 'filters/set': {
      const filters = { ...state.filters, ...action.patch }
      // Hand-editing filters takes the board off any saved view, because the
      // view no longer describes what is on screen.
      return { ...state, filters, selectedViewId: patchMatchesView(state, filters, state.sortMode) ? state.selectedViewId : null }
    }
    case 'filters/clear':
      return { ...state, filters: { ...EMPTY_FILTERS }, selectedViewId: null }
    case 'sort/set': {
      const view = state.selectedViewId ? state.savedViews.find((entry) => entry.id === state.selectedViewId) : null
      return { ...state, sortMode: action.mode, selectedViewId: view && view.sortMode === action.mode ? view.id : null }
    }
    case 'view/create': {
      const name = action.name.trim()
      if (!name) return state
      const view: SavedView = {
        id: nextId('view'),
        name,
        // Snapshot the filters as they are right now.
        filters: { ...state.filters },
        sortMode: state.sortMode,
        createdAt: now(),
      }
      return { ...state, savedViews: [...state.savedViews, view], selectedViewId: view.id }
    }
    case 'view/apply': {
      if (!action.id) return { ...state, selectedViewId: null }
      const view = state.savedViews.find((entry) => entry.id === action.id)
      if (!view) return state
      return { ...state, selectedViewId: view.id, filters: { ...view.filters }, sortMode: view.sortMode }
    }
    case 'view/rename': {
      const name = action.name.trim()
      if (!name) return state
      return {
        ...state,
        savedViews: state.savedViews.map((view) => (view.id === action.id ? { ...view, name } : view)),
      }
    }
    case 'view/delete':
      return {
        ...state,
        savedViews: state.savedViews.filter((view) => view.id !== action.id),
        selectedViewId: state.selectedViewId === action.id ? null : state.selectedViewId,
      }
    case 'attachment/add': {
      const task = state.tasks.find((entry) => entry.id === action.taskId)
      if (!task) return state
      const attachment: Attachment = {
        id: action.id,
        taskId: action.taskId,
        name: action.name,
        mime: action.mime,
        size: action.size,
        createdAt: now(),
      }
      return {
        ...state,
        attachments: [...state.attachments, attachment],
        activity: [
          ...state.activity,
          logActivity(state, { projectId: task.projectId, taskId: task.id, kind: 'updated', message: `Attached ${action.name}` }),
        ],
      }
    }
    case 'attachment/remove':
      return { ...state, attachments: state.attachments.filter((entry) => entry.id !== action.id) }
    case 'project/create':
      return applyProjectCreate(state, action)
    case 'project/update': {
      const project = state.projects.find((entry) => entry.id === action.id)
      if (!project) return state
      const patch = { ...action.patch }
      if (typeof patch.key === 'string') {
        patch.key = uniqueProjectKey(state, normalizeProjectKey(patch.key) || project.key, project.id)
      }
      return {
        ...state,
        projects: state.projects.map((entry) => (entry.id === project.id ? { ...entry, ...patch } : entry)),
      }
    }
    case 'project/setArchived':
      return {
        ...state,
        projects: state.projects.map((entry) =>
          entry.id === action.id ? { ...entry, archived: action.archived } : entry,
        ),
      }
    case 'project/delete':
      return applyProjectDelete(state, action.id)
    case 'project/select':
      return { ...state, selectedProjectId: action.id, selectedTaskId: null }
    case 'column/create': {
      const siblings = state.columns.filter((column) => column.projectId === action.projectId)
      const column: Column = {
        id: nextId('col'),
        projectId: action.projectId,
        name: action.name.trim() || 'New column',
        color: action.color ?? 'slate',
        position: positionAfter(siblings.length ? Math.max(...siblings.map((c) => c.position)) : null),
        wipLimit: action.wipLimit ?? null,
        isDone: action.isDone ?? false,
      }
      return { ...state, columns: [...state.columns, column] }
    }
    case 'column/update':
      return {
        ...state,
        columns: state.columns.map((column) =>
          column.id === action.id ? { ...column, ...action.patch } : column,
        ),
      }
    case 'column/delete':
      return applyColumnDelete(state, action.id)
    case 'label/create': {
      const label: Label = {
        id: nextId('lbl'),
        projectId: action.projectId ?? null,
        name: action.name.trim(),
        color: action.color,
      }
      return { ...state, labels: [...state.labels, label] }
    }
    case 'label/update':
      return {
        ...state,
        labels: state.labels.map((label) => (label.id === action.id ? { ...label, ...action.patch } : label)),
      }
    case 'label/delete':
      return applyLabelDelete(state, action.id)
    case 'task/create':
      return applyTaskCreate(state, action)
    case 'task/update': {
      const task = state.tasks.find((entry) => entry.id === action.id)
      if (!task) return state
      const patch = { ...action.patch }
      // Guard against a task being reparented under itself.
      if (patch.parentId === task.id) patch.parentId = null
      const next = touch(task, patch)
      const titleChanged = typeof patch.title === 'string' && patch.title !== task.title
      return {
        ...state,
        tasks: state.tasks.map((entry) => (entry.id === task.id ? next : entry)),
        activity: titleChanged
          ? [
              ...state.activity,
              logActivity(state, { projectId: task.projectId, taskId: task.id, kind: 'updated', message: 'Renamed task' }),
            ]
          : state.activity,
      }
    }
    case 'task/move':
      return applyTaskMove(state, action)
    case 'task/setArchived': {
      const task = state.tasks.find((entry) => entry.id === action.id)
      if (!task) return state
      return {
        ...state,
        tasks: state.tasks.map((entry) =>
          entry.id === task.id ? touch(entry, { archived: action.archived }) : entry,
        ),
        activity: [
          ...state.activity,
          logActivity(state, {
            projectId: task.projectId,
            taskId: task.id,
            kind: action.archived ? 'archived' : 'restored',
            message: action.archived ? 'Archived task' : 'Restored task',
          }),
        ],
      }
    }
    case 'task/delete':
      return applyTaskDelete(state, action.id)
    case 'task/setAssignee': {
      const task = state.tasks.find((entry) => entry.id === action.id)
      if (!task) return state
      if (task.assigneeId === action.assigneeId) return state
      const member = action.assigneeId
        ? state.members.find((entry) => entry.id === action.assigneeId)
        : undefined
      // A reference to a member that no longer exists would render as a blank
      // avatar, so treat it as unassigned rather than storing a dangling id.
      const nextAssigneeId = action.assigneeId && member ? action.assigneeId : null
      return {
        ...state,
        tasks: state.tasks.map((entry) =>
          entry.id === task.id ? touch(entry, { assigneeId: nextAssigneeId }) : entry,
        ),
        activity: [
          ...state.activity,
          logActivity(state, {
            projectId: task.projectId,
            taskId: task.id,
            kind: nextAssigneeId ? 'assigned' : 'unassigned',
            message: nextAssigneeId ? `Assigned to ${member?.name ?? 'someone'}` : 'Unassigned task',
          }),
        ],
      }
    }
    case 'task/duplicate':
      return applyTaskDuplicate(state, action.id, action.columnId, action.title)
    case 'task/setLabels': {
      const task = state.tasks.find((entry) => entry.id === action.id)
      if (!task) return state
      const unique = Array.from(new Set(action.labelIds))
      const added = unique.filter((labelId) => !task.labelIds.includes(labelId))
      const removed = task.labelIds.filter((labelId) => !unique.includes(labelId))
      let activity = state.activity
      if (added.length) {
        activity = [
          ...activity,
          logActivity(state, {
            projectId: task.projectId,
            taskId: task.id,
            kind: 'labeled',
            message: `Added ${added.length} label(s)`,
          }),
        ]
      }
      if (removed.length) {
        activity = [
          ...activity,
          logActivity(state, {
            projectId: task.projectId,
            taskId: task.id,
            kind: 'unlabeled',
            message: `Removed ${removed.length} label(s)`,
          }),
        ]
      }
      return { ...state, tasks: state.tasks.map((entry) => (entry.id === task.id ? touch(entry, { labelIds: unique }) : entry)), activity }
    }
    case 'task/setCustomField': {
      const task = state.tasks.find((entry) => entry.id === action.taskId)
      if (!task) return state
      return {
        ...state,
        tasks: state.tasks.map((entry) =>
          entry.id === task.id
            ? touch(entry, { customFields: { ...entry.customFields, [action.fieldId]: action.value } })
            : entry,
        ),
      }
    }
    case 'task/logTime': {
      const task = state.tasks.find((entry) => entry.id === action.id)
      if (!task || action.minutes <= 0) return state
      return {
        ...state,
        tasks: state.tasks.map((entry) =>
          entry.id === task.id
            ? touch(entry, { timeEntries: [...entry.timeEntries, { id: nextId('time'), minutes: action.minutes, loggedAt: now() }] })
            : entry,
        ),
        activity: [
          ...state.activity,
          logActivity(state, {
            projectId: task.projectId,
            taskId: task.id,
            kind: 'logged_time',
            message: `Logged ${action.minutes}m`,
          }),
        ],
      }
    }
    case 'comment/add': {
      const task = state.tasks.find((entry) => entry.id === action.taskId)
      if (!task || !action.body.trim()) return state
      return {
        ...state,
        comments: [
          ...state.comments,
          { id: nextId('cmt'), taskId: task.id, author: action.author ?? 'You', body: action.body.trim(), createdAt: now() },
        ],
        activity: [
          ...state.activity,
          logActivity(state, { projectId: task.projectId, taskId: task.id, kind: 'commented', message: 'Added a comment' }),
        ],
      }
    }
    case 'comment/update':
      return {
        ...state,
        comments: state.comments.map((comment) =>
          comment.id === action.id ? { ...comment, body: action.body.trim() } : comment,
        ),
      }
    case 'comment/delete':
      return { ...state, comments: state.comments.filter((comment) => comment.id !== action.id) }
    case 'relation/link':
      return applyRelationLink(state, action)
    case 'relation/unlink':
      return { ...state, relations: state.relations.filter((relation) => relation.id !== action.id) }
    case 'customField/define': {
      const field: CustomField = {
        id: nextId('cf'),
        projectId: action.projectId,
        name: action.name.trim(),
        type: action.type,
        options: action.options ?? [],
        required: action.required ?? false,
      }
      return { ...state, customFields: [...state.customFields, field] }
    }
    case 'customField/update':
      return {
        ...state,
        customFields: state.customFields.map((field) =>
          field.id === action.id ? { ...field, ...action.patch } : field,
        ),
      }
    case 'customField/delete':
      return applyCustomFieldDelete(state, action.id)
    // ---- members -----------------------------------------------------------
    case 'member/create': {
      const name = action.name.trim()
      if (!name) return state
      const color = action.color ?? state.members[state.members.length % 8]?.color ?? 'blue'
      const member: Member = { id: nextId('mem'), name, color }
      return {
        ...state,
        members: [...state.members, member],
        activity: [
          ...state.activity,
          logActivity(state, {
            projectId: state.projects[0]?.id ?? '',
            kind: 'updated',
            message: `Added member ${name}`,
          }),
        ],
      }
    }
    case 'member/update':
      return {
        ...state,
        members: state.members.map((member) =>
          member.id === action.id ? { ...member, ...action.patch } : member,
        ),
      }
    case 'member/delete':
      return applyMemberDelete(state, action.id)
    // ---- external links ----------------------------------------------------
    case 'externalLink/add': {
      const task = state.tasks.find((entry) => entry.id === action.taskId)
      if (!task) return state
      const url = action.url.trim()
      if (!url) return state
      const link: ExternalLink = {
        id: nextId('ext'),
        taskId: task.id,
        type: action.type,
        url,
        title: action.title?.trim() || url,
        externalId: action.externalId?.trim() ?? '',
        createdAt: now(),
      }
      return {
        ...state,
        externalLinks: [...state.externalLinks, link],
        activity: [
          ...state.activity,
          logActivity(state, {
            projectId: task.projectId,
            taskId: task.id,
            kind: 'link_added',
            message: `Linked ${action.type.replace('_', ' ')} ${link.externalId || link.url}`,
          }),
        ],
      }
    }
    case 'externalLink/remove': {
      const link = state.externalLinks.find((entry) => entry.id === action.id)
      if (!link) return state
      const task = state.tasks.find((entry) => entry.id === link.taskId)
      return {
        ...state,
        externalLinks: state.externalLinks.filter((entry) => entry.id !== action.id),
        activity: task
          ? [
              ...state.activity,
              logActivity(state, {
                projectId: task.projectId,
                taskId: task.id,
                kind: 'link_removed',
                message: 'Removed an external link',
              }),
            ]
          : state.activity,
      }
    }
    // ---- bulk selection ----------------------------------------------------
    case 'selection/set':
      return { ...state, selectedTaskIds: Array.from(new Set(action.ids)) }
    case 'selection/toggle':
      return {
        ...state,
        selectedTaskIds: state.selectedTaskIds.includes(action.id)
          ? state.selectedTaskIds.filter((id) => id !== action.id)
          : [...state.selectedTaskIds, action.id],
      }
    case 'selection/clear':
      return state.selectedTaskIds.length ? { ...state, selectedTaskIds: [] } : state
    case 'bulk/update': {
      const ids = new Set(action.ids)
      const targets = state.tasks.filter((task) => ids.has(task.id))
      if (!targets.length) return state
      const patch = { ...action.patch }
      if (patch.parentId !== undefined) {
        // Re-parenting under one of the selected tasks would build a cycle.
        if (patch.parentId && ids.has(patch.parentId)) delete patch.parentId
      }
      const touched = new Set(targets.map((task) => task.id))
      return {
        ...state,
        tasks: state.tasks.map((task) => (touched.has(task.id) ? touch(task, patch) : task)),
        activity: [
          ...state.activity,
          ...targets.map((task) =>
            logActivity(state, {
              projectId: task.projectId,
              taskId: task.id,
              kind: 'bulk_updated',
              message: `Bulk updated ${targets.length} task(s)`,
            }),
          ),
        ],
        selectedTaskIds: state.selectedTaskIds.filter((id) => touched.has(id)),
      }
    }
    case 'bulk/move': {
      const ids = new Set(action.ids)
      const column = state.columns.find((entry) => entry.id === action.columnId)
      if (!column) return state
      const targets = state.tasks.filter((task) => ids.has(task.id))
      if (!targets.length) return state
      const touched = new Set(targets.map((task) => task.id))
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          touched.has(task.id)
            ? touch(task, {
                columnId: column.id,
                parentId: null,
                position: nextPosition(state, column.id, null),
                completedAt: column.isDone ? now() : null,
              })
            : task,
        ),
        activity: [
          ...state.activity,
          ...targets.map((task) =>
            logActivity(state, {
              projectId: task.projectId,
              taskId: task.id,
              kind: 'moved',
              message: `Moved ${targets.length} task(s) to ${column.name}`,
            }),
          ),
        ],
      }
    }
    case 'bulk/delete': {
      if (!action.ids.length) return state
      const ids = new Set(action.ids)
      // Deleting a task promotes its sub-tasks, so the cascade has to see the
      // whole selected set at once rather than one task at a time.
      let next = state
      for (const id of action.ids) next = applyTaskDelete(next, id)
      return { ...next, selectedTaskIds: next.selectedTaskIds.filter((id) => !ids.has(id)) }
    }
    case 'ui/selectTask':
      return { ...state, selectedTaskId: action.id }
    default:
      return state
  }
}

/** Pure reducer. Returns the same reference when an action is a no-op. */
export function reduce(state: BoardState, action: Action): BoardState {
  return apply(state, action)
}

export { tasksInGroup, nextPosition }
