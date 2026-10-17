import type {
  Activity,
  BoardState,
  Column,
  CustomField,
  ExternalLink,
  ID,
  Label,
  Member,
  Project,
  Task,
} from '../domain/types'
import { type SortMode, type TaskFilters } from '../domain/types'

export { EMPTY_FILTERS, type SortMode, type TaskFilters } from '../domain/types'

/** Sort orders offered by the board toolbar. */
export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: 'position', label: 'Manual' },
  { id: 'priority', label: 'Priority' },
  { id: 'dueDate', label: 'Due date' },
  { id: 'title', label: 'Title' },
  { id: 'createdAt', label: 'Created' },
]

export function hasActiveFilters(filters: TaskFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.labelIds.length > 0 ||
    filters.priorities.length > 0 ||
    filters.columnIds.length > 0 ||
    filters.assigneeIds.length > 0 ||
    filters.dueWithinDays !== null ||
    filters.overdueOnly ||
    filters.unassignedOnly
  )
}

/** A member by id, or `null` when the task has no owner. */
export function getMember(state: BoardState, id: ID | null): Member | null {
  if (!id) return null
  return state.members.find((member) => member.id === id) ?? null
}

export function memberName(state: BoardState, id: ID | null): string {
  return getMember(state, id)?.name ?? 'Unassigned'
}

/** External links attached to a task. */
export function externalLinksOf(state: BoardState, taskId: ID): ExternalLink[] {
  return state.externalLinks.filter((link) => link.taskId === taskId)
}

/** Every task owned by `assigneeId`, across every project, newest activity first. */
export function tasksAssignedTo(state: BoardState, assigneeId: ID): Task[] {
  return state.tasks
    .filter((task) => task.assigneeId === assigneeId && !task.archived && !task.parentId)
    .sort(
      (a, b) =>
        (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') ||
        b.updatedAt - a.updatedAt,
    )
}

/** Workload per assignee, for the members panel. */
export function memberWorkload(
  state: BoardState,
  projectId?: ID,
): { member: Member; open: number; overdue: number; done: number }[] {
  const today = new Date()
  return state.members.map((member) => {
    const tasks = state.tasks.filter(
      (task) => task.assigneeId === member.id && !task.archived && !task.parentId,
    )
    const scoped = projectId ? tasks.filter((task) => task.projectId === projectId) : tasks
    return {
      member,
      open: scoped.filter((task) => !isTaskDone(state, task)).length,
      overdue: scoped.filter((task) => !isTaskDone(state, task) && isOverdue(task, today)).length,
      done: scoped.filter((task) => isTaskDone(state, task)).length,
    }
  })
}

/** The cross-task activity feed shown on the home view. */
export function recentActivity(state: BoardState, limit = 30): Activity[] {
  return [...state.activity].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export function getProject(state: BoardState, id: ID | null): Project | null {
  if (!id) return null
  return state.projects.find((project) => project.id === id) ?? null
}

export function getColumn(state: BoardState, id: ID): Column | null {
  return state.columns.find((column) => column.id === id) ?? null
}

export function getTask(state: BoardState, id: ID | null): Task | null {
  if (!id) return null
  return state.tasks.find((task) => task.id === id) ?? null
}

/** `${project.key}-${number}`, e.g. `ENG-12`. */
export function ticketId(state: BoardState, task: Task): string {
  const project = getProject(state, task.projectId)
  return `${project?.key ?? '???'}-${task.number}`
}

/** Columns of a project in board order. */
export function projectColumns(state: BoardState, projectId: ID): Column[] {
  return state.columns
    .filter((column) => column.projectId === projectId)
    .sort((a, b) => a.position - b.position)
}

/** Labels available in a project: project-scoped labels plus global ones. */
export function projectLabels(state: BoardState, projectId: ID): Label[] {
  return state.labels
    .filter((label) => label.projectId === null || label.projectId === projectId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function projectCustomFields(state: BoardState, projectId: ID): CustomField[] {
  return state.customFields.filter((field) => field.projectId === projectId)
}

/** Direct children of a task, in manual order. */
export function subtasksOf(state: BoardState, taskId: ID): Task[] {
  return state.tasks
    .filter((task) => task.parentId === taskId && !task.archived)
    .sort((a, b) => a.position - b.position)
}

export function isTaskDone(state: BoardState, task: Task): boolean {
  return getColumn(state, task.columnId)?.isDone ?? false
}

/** True when a blocked-by target is not yet in a done column. */
export function isBlocked(state: BoardState, task: Task): boolean {
  return state.relations
    .filter((relation) => relation.fromTaskId === task.id && relation.type === 'blocked_by')
    .some((relation) => {
      const target = getTask(state, relation.toTaskId)
      return target ? !isTaskDone(state, target) : false
    })
}

export function tasksBlocking(state: BoardState, task: Task): Task[] {
  return state.relations
    .filter((relation) => relation.toTaskId === task.id && relation.type === 'blocked_by')
    .map((relation) => getTask(state, relation.toTaskId))
    .filter((task): task is Task => task !== null)
}

export function tasksBlockedBy(state: BoardState, task: Task): Task[] {
  return state.relations
    .filter((relation) => relation.fromTaskId === task.id && relation.type === 'blocked_by')
    .map((relation) => getTask(state, relation.toTaskId))
    .filter((task): task is Task => task !== null)
}

export function relatedTasks(state: BoardState, task: Task): Task[] {
  return state.relations
    .filter(
      (relation) =>
        (relation.type === 'relates_to' || relation.type === 'duplicates') &&
        (relation.fromTaskId === task.id || relation.toTaskId === task.id),
    )
    .map((relation) =>
      getTask(state, relation.fromTaskId === task.id ? relation.toTaskId : relation.fromTaskId),
    )
    .filter((entry): entry is Task => entry !== null)
}

export function totalLoggedMinutes(task: Task): number {
  return task.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0)
}

/** Minutes remaining against an estimate, negative when over. */
export function remainingMinutes(task: Task): number | null {
  if (task.estimateMinutes === null) return null
  return task.estimateMinutes - totalLoggedMinutes(task)
}

export function isOverdue(task: Task, today = new Date()): boolean {
  if (!task.dueDate) return false
  if (isDoneFlagSet(task)) return false
  return task.dueDate < today.toISOString().slice(0, 10)
}

function isDoneFlagSet(task: Task): boolean {
  return task.completedAt !== null
}

/** Days until due; negative when past, `null` when unset. */
export function daysUntilDue(task: Task, today = new Date()): number | null {
  if (!task.dueDate) return null
  const due = Date.parse(`${task.dueDate}T00:00:00`)
  const base = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00`)
  return Math.round((due - base) / 86_400_000)
}

/** Label names for a task, for search indexing and display. */
export function taskLabelNames(state: BoardState, task: Task): string[] {
  return task.labelIds
    .map((labelId) => state.labels.find((label) => label.id === labelId)?.name)
    .filter((name): name is string => typeof name === 'string')
}

function matchesQuery(state: BoardState, task: Task, needle: string): boolean {
  const haystack = [
    task.title,
    task.description,
    ticketId(state, task),
    ...taskLabelNames(state, task),
  ]
    .join('\n')
    .toLowerCase()
  return haystack.includes(needle)
}

/** Apply the toolbar filters to a task list. */
export function filterTasks(
  state: BoardState,
  tasks: Task[],
  filters: TaskFilters,
  today = new Date(),
): Task[] {
  const needle = filters.query.trim().toLowerCase()
  return tasks.filter((task) => {
    if (!filters.showArchived && task.archived) return false
    if (filters.showArchived && !task.archived) return false
    if (
      filters.labelIds.length &&
      !filters.labelIds.some((labelId) => task.labelIds.includes(labelId))
    )
      return false
    if (filters.priorities.length && !filters.priorities.includes(task.priority)) return false
    if (filters.columnIds.length && !filters.columnIds.includes(task.columnId)) return false
    if (filters.assigneeIds.length && !filters.assigneeIds.includes(task.assigneeId ?? ''))
      return false
    if (filters.unassignedOnly && task.assigneeId) return false
    if (filters.overdueOnly && !isOverdue(task, today)) return false
    if (filters.dueWithinDays !== null) {
      const days = daysUntilDue(task, today)
      // Overdue tasks always satisfy a "due within N days" filter.
      if (days === null || (days > filters.dueWithinDays && days >= 0)) return false
    }
    if (needle && !matchesQuery(state, task, needle)) return false
    return true
  })
}

export function sortTasks(tasks: Task[], mode: SortMode, _state: BoardState): Task[] {
  const copy = [...tasks]
  switch (mode) {
    case 'priority':
      return copy.sort((a, b) => {
        const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        return rank !== 0 ? rank : a.position - b.position
      })
    case 'dueDate':
      return copy.sort((a, b) => {
        // Undated tasks sort last, then manual order.
        if (!a.dueDate && !b.dueDate) return a.position - b.position
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate) || a.position - b.position
      })
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title))
    case 'createdAt':
      return copy.sort((a, b) => b.createdAt - a.createdAt)
    case 'position':
    default:
      return copy.sort((a, b) => a.position - b.position)
  }
}

/** Tasks visible on a board: active project, not archived, filters applied. */
export function boardTasks(
  state: BoardState,
  projectId: ID | null,
  filters: TaskFilters,
  sortMode: SortMode,
  today = new Date(),
): Task[] {
  if (!projectId) return []
  const scoped = state.tasks.filter((task) => task.projectId === projectId)
  const visible = filterTasks(state, scoped, filters, today)
  return sortTasks(visible, sortMode, state)
}

/** Counts for the project header. */
export interface ProjectStats {
  total: number
  done: number
  overdue: number
  dueSoon: number
  blocked: number
  completion: number
}

export function projectStats(state: BoardState, projectId: ID, today = new Date()): ProjectStats {
  const tasks = state.tasks.filter((task) => task.projectId === projectId && !task.archived)
  const done = tasks.filter((task) => isTaskDone(state, task)).length
  const overdue = tasks.filter((task) => isOverdue(task, today)).length
  const dueSoon = tasks.filter((task) => {
    const days = daysUntilDue(task, today)
    return days !== null && days >= 0 && days <= 3 && !isTaskDone(state, task)
  }).length
  const blocked = tasks.filter((task) => isBlocked(state, task)).length
  return {
    total: tasks.length,
    done,
    overdue,
    dueSoon,
    blocked,
    completion: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  }
}

/** Work-in-progress load per column, for the WIP limit badge. */
export function columnLoad(state: BoardState, columnId: ID): number {
  return state.tasks.filter(
    (task) => task.columnId === columnId && !task.archived && !task.parentId,
  ).length
}

/** Recent activity for a project, newest first. */
export function projectActivity(state: BoardState, projectId: ID, limit = 50) {
  return state.activity
    .filter((entry) => entry.projectId === projectId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}

/** All labels used anywhere, for the manage-labels dialog. */
export function allLabels(state: BoardState): Label[] {
  return [...state.labels].sort((a, b) => a.name.localeCompare(b.name))
}
