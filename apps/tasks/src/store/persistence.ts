import type { BoardState } from '../domain/types'
import { EMPTY_FILTERS } from '../domain/types'
import { emptyBoard, parseDocument, serializeDocument } from './migrate'

/**
 * Persistence. Two sinks, one envelope format:
 *  - `localStorage` keeps the working board across reloads and renderer restarts.
 *  - The Electron document bridge writes the same JSON to a real file.
 *
 * Both go through `parseDocument` on read, so a legacy or hand-edited file is
 * repaired on load rather than crashing the app.
 */

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function defaultStorageKey(): string {
  const session = new URLSearchParams(window.location.search).get('session') ?? 'browser'
  return `revelith-tasks/board-v2/${session}`
}

export function loadFromStorage(storage: StorageLike, key: string): BoardState | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    return parseDocument(JSON.parse(raw))
  } catch {
    // A corrupt or foreign value must not stop the app from opening.
    return null
  }
}

export function saveToStorage(storage: StorageLike, key: string, state: BoardState): boolean {
  try {
    storage.setItem(key, JSON.stringify(serializeDocument(state)))
    return true
  } catch {
    // Quota exceeded, private mode, or a serialisation cycle. Losing the write is
    // preferable to crashing mid-session.
    return false
  }
}

/**
 * Identify only the untouched first-run sample shipped by older Tasks builds.
 * Never wipe a board that has been edited or contains user-created records.
 */
function isUntouchedStarterBoard(state: BoardState): boolean {
  const project = state.projects[0]
  const titles = [
    'Welcome to ReveLith Tasks',
    'Create a project',
    'Link two tasks',
    'Customise your columns',
    'Try a global search',
  ]
  if (
    state.projects.length !== 1 ||
    !project ||
    project.key !== 'DEMO' ||
    project.name !== 'Demo Project' ||
    project.description !== 'A sample project. Rename it, or delete it and start fresh.' ||
    project.color !== 'violet' ||
    project.archived ||
    project.lastTaskNumber !== titles.length ||
    state.tasks.length !== titles.length ||
    state.columns.length !== 4 ||
    state.labels.length !== 3 ||
    state.members.length !== 2 ||
    state.customFields.length !== 1 ||
    state.relations.length !== 1 ||
    state.comments.length ||
    state.externalLinks.length ||
    state.activity.length ||
    state.attachments.length ||
    state.savedViews.length ||
    state.selectedViewId ||
    state.selectedTaskIds.length ||
    state.sortMode !== 'position' ||
    JSON.stringify(state.filters) !== JSON.stringify(EMPTY_FILTERS)
  )
    return false

  const columns = ['Backlog', 'In Progress', 'Review', 'Done'].map((name) =>
    state.columns.find((column) => column.projectId === project.id && column.name === name),
  )
  if (columns.some((column) => !column)) return false
  const expectedColumnColors = ['slate', 'blue', 'amber', 'green']
  if (
    columns.some(
      (column, index) =>
        column!.color !== expectedColumnColors[index] ||
        column!.position !== (index + 1) * 1024 ||
        column!.wipLimit !== null ||
        column!.isDone !== (index === 3),
    )
  )
    return false
  const expectedDescriptions = [
    'Drag cards between columns, double-click to edit, and use the AI panel on the right to plan work.\n\nEverything is stored locally — no server, no account.',
    'Projects hold their own columns, labels and task numbering (DEMO-1, DEMO-2, …).',
    'Open a task and use Relations to mark one as blocking another.',
    'Rename, recolour, reorder, or add columns from the Organize tab.',
    'The search box matches titles, descriptions, ticket ids and label names.',
  ]
  const expectedPriorities = ['medium', 'high', 'medium', 'low', 'low']
  const expectedTaskLabels = [[], ['Feature'], [], ['Chore'], []]
  const orderedTasks = [...state.tasks].sort((a, b) => a.number - b.number)
  if (
    orderedTasks.some(
      (task, index) =>
        task.projectId !== project.id ||
        task.number !== index + 1 ||
        task.title !== titles[index] ||
        task.description !== expectedDescriptions[index] ||
        task.priority !== expectedPriorities[index] ||
        task.archived ||
        task.parentId ||
        Object.keys(task.customFields).length ||
        task.timeEntries.length ||
        task.columnId !== columns[[0, 0, 1, 1, 2][index]]!.id ||
        task.labelIds.length !== expectedTaskLabels[index]!.length ||
        task.labelIds.some(
          (id) =>
            !expectedTaskLabels[index]!.includes(
              state.labels.find((label) => label.id === id)?.name ?? '',
            ),
        ) ||
        task.assigneeId !==
          (index % 2 === 0 ? state.members[index % state.members.length]!.id : null) ||
        (index === 0
          ? task.dueDate !== new Date(task.createdAt + 2 * 86_400_000).toISOString().slice(0, 10)
          : task.dueDate !== null) ||
        task.startDate !== null ||
        task.estimateMinutes !== null ||
        task.position !== (index + 1) * 1024,
    )
  )
    return false

  const expectedLabels = [
    ['Bug', 'red'],
    ['Feature', 'blue'],
    ['Chore', 'slate'],
  ]
  if (
    expectedLabels.some(
      ([name, color]) =>
        !state.labels.some(
          (label) => label.projectId === project.id && label.name === name && label.color === color,
        ),
    )
  )
    return false
  if (
    state.customFields[0]?.projectId !== project.id ||
    state.customFields[0]?.name !== 'Story points' ||
    state.customFields[0]?.type !== 'number' ||
    state.customFields[0]?.required ||
    state.customFields[0]?.options.length
  )
    return false
  if (
    !state.members.some((member) => member.name === 'Ada Lovelace' && member.color === 'violet') ||
    !state.members.some((member) => member.name === 'Grace Hopper' && member.color === 'teal')
  )
    return false

  const relation = state.relations[0]!
  return (
    relation.type === 'blocked_by' &&
    relation.fromTaskId === orderedTasks[2]!.id &&
    relation.toTaskId === orderedTasks[0]!.id
  )
}

/**
 * Load the board for a session, falling back to an empty board.
 * `startsNewDocument` forces a genuinely blank document (the shell uses this for
 * File > New).
 */
export function loadBoard(
  storage: StorageLike,
  key: string,
  startsNewDocument = false,
): BoardState {
  if (startsNewDocument) return emptyBoard()
  const loaded = loadFromStorage(storage, key)
  if (!loaded) return emptyBoard()
  if (isUntouchedStarterBoard(loaded)) {
    const clean = emptyBoard()
    saveToStorage(storage, key, clean)
    return clean
  }
  return loaded
}

export { emptyBoard, parseDocument, serializeDocument }
