import { nextId } from '../domain/ids'
import type { BoardState, Priority, Task } from '../domain/types'
import { EMPTY_FILTERS, EMPTY_STATE } from '../domain/types'
import { deriveProjectKey } from '../store/reducer'

export const DOCUMENT_VERSION = 2

/** Shape written to disk. Unknown keys are ignored on read. */
export interface BoardDocument {
  version: number
  state: BoardState
}

interface LegacyTask {
  id?: unknown
  title?: unknown
  notes?: unknown
  status?: unknown
  priority?: unknown
  due?: unknown
  createdAt?: unknown
}

const LEGACY_STATUS: Record<string, string> = { todo: 'Backlog', doing: 'In Progress', done: 'Done' }

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asPriority(value: unknown): Priority {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return 'medium'
}

/**
 * Import a board written by the pre-2.0 single-project format:
 * `{ version: 1, tasks: [{ id, title, notes, status, priority, due }] }`.
 *
 * Those boards had one implicit board with three fixed columns, so they map onto
 * a single new project with the default column set.
 */
export function migrateLegacy(payload: { tasks?: unknown }): BoardState | null {
  if (!Array.isArray(payload.tasks)) return null

  const projectId = nextId('prj')
  const timestamp = Date.now()
  const project = {
    id: projectId,
    key: 'BOARD',
    name: 'Board',
    description: 'Imported from an earlier Tasks document.',
    color: 'blue',
    archived: false,
    lastTaskNumber: 0,
    createdAt: timestamp,
  }

  const columns = (['Backlog', 'In Progress', 'Review', 'Done'] as const).map((name, index) => ({
    id: nextId('col'),
    projectId,
    name,
    color: ['slate', 'blue', 'amber', 'green'][index],
    position: (index + 1) * 1024,
    wipLimit: null,
    isDone: name === 'Done',
  }))

  const tasks: Task[] = []
  const legacy = payload.tasks as LegacyTask[]
  for (const entry of legacy) {
    const title = asString(entry?.title).trim()
    if (!title) continue
    const columnName = LEGACY_STATUS[asString(entry?.status)] ?? 'Backlog'
    const column = columns.find((item) => item.name === columnName) ?? columns[0]
    const number = project.lastTaskNumber + 1
    project.lastTaskNumber = number
    tasks.push({
      id: asString(entry?.id) || nextId('task'),
      projectId,
      columnId: column.id,
      number,
      title,
      description: asString(entry?.notes),
      priority: asPriority(entry?.priority),
      dueDate: asString(entry?.due) || null,
      startDate: null,
      labelIds: [],
      customFields: {},
      assigneeId: null,
      parentId: null,
      position: (tasks.length + 1) * 1024,
      archived: false,
      createdAt: typeof entry?.createdAt === 'number' ? entry.createdAt : timestamp,
      updatedAt: typeof entry?.createdAt === 'number' ? entry.createdAt : timestamp,
      completedAt: column.isDone ? timestamp : null,
      estimateMinutes: null,
      timeEntries: [],
    })
  }

  return {
    ...EMPTY_STATE,
    projects: [project],
    columns,
    tasks,
    selectedProjectId: projectId,
  }
}

/**
 * Read any supported document shape into a `BoardState`.
 * Returns `null` when the payload is not a recognisable board.
 *
 * Three shapes are accepted, checked most-specific first:
 *   1. `{ version, state: BoardState }`  — the current envelope.
 *   2. A bare `BoardState`                — e.g. the output of `boardToJson`.
 *   3. `{ version: 1, tasks: [...] }`     — the pre-2.0 single-project format.
 */
export function parseDocument(payload: unknown): BoardState | null {
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  const state = record.state

  if (state && typeof state === 'object') {
    const candidate = state as Partial<BoardState>
    if (!Array.isArray(candidate.projects)) return null
    return withDefaults(candidate)
  }

  // A bare board. `projects` distinguishes it from the legacy shape, which has
  // `tasks` but never `projects`.
  if (Array.isArray(record.projects)) {
    return withDefaults(record as Partial<BoardState>)
  }

  if (Array.isArray(record.tasks)) return migrateLegacy(record as { tasks: unknown[] })

  return null
}

/**
 * Fill in fields added after a document was written.
 *
 * Boards saved before saved views, attachments or filter persistence existed
 * must still open, so every newer field gets a default rather than being
 * required at load time.
 */
export function withDefaults(partial: Partial<BoardState>): BoardState {
  return {
    ...EMPTY_STATE,
    ...partial,
    filters: { ...EMPTY_FILTERS, ...(partial.filters ?? {}) },
    sortMode: partial.sortMode ?? 'position',
    attachments: partial.attachments ?? [],
    savedViews: partial.savedViews ?? [],
    // Added after the first release; older documents simply have no members.
    members: partial.members ?? [],
    externalLinks: partial.externalLinks ?? [],
    // A task can only be assigned to a member the document still knows about.
    tasks: (partial.tasks ?? []).map((task) => {
      const valid = (partial.members ?? []).some((member) => member.id === task.assigneeId)
      return valid ? task : { ...task, assigneeId: null }
    }),
    selectedTaskIds: [],
    // A saved view only stays selected if it still exists in the document.
    selectedViewId:
      partial.selectedViewId && (partial.savedViews ?? []).some((view) => view.id === partial.selectedViewId)
        ? partial.selectedViewId
        : null,
    selectedTaskId: null,
  }
}

/** Wrap state in the current document envelope. */
export function serializeDocument(state: BoardState): BoardDocument {
  return {
    version: DOCUMENT_VERSION,
    // A saved file should reopen exactly as it was left, minus the open task.
    state: { ...state, selectedTaskId: null, version: DOCUMENT_VERSION },
  }
}

/** Legacy synthetic fixture retained for migration and UI tests only. */
export function seedBoard(): BoardState {
  const projectId = nextId('prj')
  const timestamp = Date.now()
  const project = {
    id: projectId,
    key: 'DEMO',
    name: 'Demo Project',
    description: 'Synthetic test project; not used for a new board.',
    color: 'violet',
    archived: false,
    lastTaskNumber: 0,
    createdAt: timestamp,
  }

  const columns = [
    { name: 'Backlog', color: 'slate', isDone: false },
    { name: 'In Progress', color: 'blue', isDone: false },
    { name: 'Review', color: 'amber', isDone: false },
    { name: 'Done', color: 'green', isDone: true },
  ].map((seed, index) => ({
    id: nextId('col'),
    projectId,
    name: seed.name,
    color: seed.color,
    position: (index + 1) * 1024,
    wipLimit: null,
    isDone: seed.isDone,
  }))

  const labels = [
    { name: 'Bug', color: 'red' },
    { name: 'Feature', color: 'blue' },
    { name: 'Chore', color: 'slate' },
  ].map((seed) => ({ id: nextId('lbl'), projectId, name: seed.name, color: seed.color }))

  const customFields = [
    { id: nextId('cf'), projectId, name: 'Story points', type: 'number' as const, options: [], required: false },
  ]

  const members = [
    { id: nextId('mem'), name: 'Ada Lovelace', color: 'violet' },
    { id: nextId('mem'), name: 'Grace Hopper', color: 'teal' },
  ]

  const plan: { title: string; description: string; column: number; priority: Priority; labels: number[] }[] = [
    {
      title: 'Welcome to ReveLith Tasks',
      description:
        'Drag cards between columns, double-click to edit, and use the AI panel on the right to plan work.\n\nEverything is stored locally — no server, no account.',
      column: 0,
      priority: 'medium',
      labels: [],
    },
    {
      title: 'Create a project',
      description: 'Projects hold their own columns, labels and task numbering (DEMO-1, DEMO-2, …).',
      column: 0,
      priority: 'high',
      labels: [1],
    },
    {
      title: 'Link two tasks',
      description: 'Open a task and use Relations to mark one as blocking another.',
      column: 1,
      priority: 'medium',
      labels: [],
    },
    {
      title: 'Customise your columns',
      description: 'Rename, recolour, reorder, or add columns from the Organize tab.',
      column: 1,
      priority: 'low',
      labels: [2],
    },
    {
      title: 'Try a global search',
      description: 'The search box matches titles, descriptions, ticket ids and label names.',
      column: 2,
      priority: 'low',
      labels: [],
    },
  ]

  const tasks: Task[] = plan.map((item, index) => {
    const number = project.lastTaskNumber + 1
    project.lastTaskNumber = number
    const column = columns[item.column]
    return {
      id: nextId('task'),
      projectId,
      columnId: column.id,
      number,
      title: item.title,
      description: item.description,
      priority: item.priority,
      dueDate: index === 0 ? new Date(timestamp + 2 * 86_400_000).toISOString().slice(0, 10) : null,
      startDate: null,
      labelIds: item.labels.map((labelIndex) => labels[labelIndex].id),
      customFields: {},
      assigneeId: index % 2 === 0 ? members[index % members.length].id : null,
      parentId: null,
      position: (index + 1) * 1024,
      archived: false,
      createdAt: timestamp + index,
      updatedAt: timestamp + index,
      completedAt: column.isDone ? timestamp : null,
      estimateMinutes: null,
      timeEntries: [],
    }
  })

  // The welcome task blocks the "link two tasks" task so the Relations panel
  // has something to show on a fresh install.
  const relations = [
    {
      id: nextId('rel'),
      fromTaskId: tasks[2].id,
      toTaskId: tasks[0].id,
      type: 'blocked_by' as const,
      createdAt: timestamp,
    },
  ]

  return {
    ...EMPTY_STATE,
    projects: [project],
    columns,
    labels,
    members,
    tasks,
    relations,
    customFields,
    selectedProjectId: projectId,
  }
}

/** Create a genuinely empty board for new documents and first-run storage. */
export function emptyBoard(): BoardState {
  return {
    ...EMPTY_STATE,
    projects: [],
    columns: [],
    labels: [],
    members: [],
    tasks: [],
    comments: [],
    relations: [],
    externalLinks: [],
    activity: [],
    customFields: [],
    attachments: [],
    savedViews: [],
    filters: { ...EMPTY_FILTERS, labelIds: [], priorities: [], columnIds: [], assigneeIds: [] },
    selectedProjectId: null,
    selectedTaskId: null,
    selectedTaskIds: [],
  }
}

export { deriveProjectKey }
