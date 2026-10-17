import type { BoardState, Column, ID, Label, Project, Task } from '../domain/types'
import { getProject, ticketId } from '../store/selectors'

/**
 * Reference resolution for AI tools.
 *
 * A model will hand back whatever it has to hand: a raw id, a ticket reference
 * like `ENG-12`, or a human name. Resolving all three the same way means the
 * tools stay forgiving without needing the model to guess id formats.
 */

export interface Resolved<T> {
  value: T | null
  /** How the input was matched, for a useful error message. */
  via: 'id' | 'ticket' | 'name' | 'key' | 'none'
}

const MISS: Resolved<never> = { value: null, via: 'none' }

export function resolveProject(state: BoardState, input: unknown): Resolved<Project> {
  if (typeof input !== 'string' || !input.trim()) return MISS
  const needle = input.trim()
  const lowered = needle.toLowerCase()

  const byId = state.projects.find((project) => project.id === needle)
  if (byId) return { value: byId, via: 'id' }

  // Ticket form: `ENG-12` or `eng-12`.
  const ticket = /^([A-Za-z0-9]+)-(\d+)$/.exec(needle)
  if (ticket) {
    const key = ticket[1].toUpperCase()
    const number = Number(ticket[2])
    const project = state.projects.find((entry) => entry.key.toUpperCase() === key)
    if (project) return { value: project, via: 'ticket' }
    const task = state.tasks.find((entry) => entry.number === number)
    if (task) {
      const owner = getProject(state, task.projectId)
      if (owner) return { value: owner, via: 'ticket' }
    }
  }

  const byKey = state.projects.find((project) => project.key.toLowerCase() === lowered)
  if (byKey) return { value: byKey, via: 'key' }

  const byName = state.projects.find((project) => project.name.toLowerCase() === lowered)
  if (byName) return { value: byName, via: 'name' }

  const partial = state.projects.filter((project) => project.name.toLowerCase().includes(lowered))
  if (partial.length === 1) return { value: partial[0], via: 'name' }

  return MISS
}

export function resolveTask(state: BoardState, input: unknown): Resolved<Task> {
  if (typeof input !== 'string' || !input.trim()) return MISS
  const needle = input.trim()
  const lowered = needle.toLowerCase()

  const byId = state.tasks.find((task) => task.id === needle)
  if (byId) return { value: byId, via: 'id' }

  // Ticket form, scoped to the whole board. Prefer an exact ticket match.
  const ticket = /^([A-Za-z0-9]+)-(\d+)$/.exec(needle)
  if (ticket) {
    const key = ticket[1].toUpperCase()
    const number = Number(ticket[2])
    const match = state.tasks.find((task) => {
      const project = getProject(state, task.projectId)
      return task.number === number && project?.key.toUpperCase() === key
    })
    if (match) return { value: match, via: 'ticket' }
  }

  const byTitle = state.tasks.filter((task) => task.title.toLowerCase() === lowered)
  if (byTitle.length === 1) return { value: byTitle[0], via: 'name' }

  const partial = state.tasks.filter((task) => task.title.toLowerCase().includes(lowered))
  if (partial.length === 1) return { value: partial[0], via: 'name' }

  return MISS
}

export function resolveColumn(state: BoardState, projectId: ID, input: unknown): Resolved<Column> {
  if (typeof input !== 'string' || !input.trim()) return MISS
  const needle = input.trim()
  const lowered = needle.toLowerCase()
  const columns = state.columns.filter((column) => column.projectId === projectId)

  const byId = columns.find((column) => column.id === needle)
  if (byId) return { value: byId, via: 'id' }

  const exact = columns.filter((column) => column.name.toLowerCase() === lowered)
  if (exact.length === 1) return { value: exact[0], via: 'name' }

  const partial = columns.filter((column) => column.name.toLowerCase().includes(lowered))
  if (partial.length === 1) return { value: partial[0], via: 'name' }

  return MISS
}

export function resolveLabel(state: BoardState, projectId: ID, input: unknown): Resolved<Label> {
  if (typeof input !== 'string' || !input.trim()) return MISS
  const needle = input.trim()
  const lowered = needle.toLowerCase()
  const labels = state.labels.filter((label) => label.projectId === null || label.projectId === projectId)

  const byId = labels.find((label) => label.id === needle)
  if (byId) return { value: byId, via: 'id' }

  const exact = labels.filter((label) => label.name.toLowerCase() === lowered)
  if (exact.length === 1) return { value: exact[0], via: 'name' }

  const partial = labels.filter((label) => label.name.toLowerCase().includes(lowered))
  if (partial.length === 1) return { value: partial[0], via: 'name' }

  return MISS
}

/** Look up a column by `isDone`, used when a tool omits an explicit column. */
export function defaultColumn(state: BoardState, projectId: ID): Column | null {
  const columns = state.columns
    .filter((column) => column.projectId === projectId)
    .sort((a, b) => a.position - b.position)
  return columns[0] ?? null
}

/** Look up the done column so `move_task` can complete a task. */
export function doneColumn(state: BoardState, projectId: ID): Column | null {
  const columns = state.columns.filter((column) => column.projectId === projectId)
  return columns.find((column) => column.isDone) ?? null
}

/** Human-facing description of a task, used in every tool response. */
export function describeTask(state: BoardState, task: Task): string {
  return `${ticketId(state, task)} — ${task.title}`
}
