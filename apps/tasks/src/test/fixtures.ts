import type { Action } from '../store/actions'
import { reduce } from '../store/reducer'
import type { BoardState } from '../domain/types'
import { EMPTY_STATE } from '../domain/types'

/**
 * Build a board by applying actions to the empty state. Keeps tests focused on
 * the behaviour under test instead of hand-writing fixtures.
 */
export function buildBoard(...actions: Action[]): BoardState {
  return actions.reduce(reduce, EMPTY_STATE)
}

/** A board with one project, its default columns, and a couple of labels. */
export function boardWithProject(): BoardState {
  return buildBoard(
    { kind: 'project/create', name: 'Website Redesign', key: 'WEB' },
    { kind: 'label/create', name: 'Bug', color: 'red', projectId: null },
    { kind: 'label/create', name: 'Feature', color: 'blue', projectId: null },
  )
}

export function firstColumnId(state: BoardState, name = 'Backlog'): string {
  const column = state.columns.find((entry) => entry.name === name)
  if (!column) throw new Error(`No column named ${name}`)
  return column.id
}

export function projectId(state: BoardState): string {
  if (!state.selectedProjectId) throw new Error('No project selected')
  return state.selectedProjectId
}

export function taskTitles(state: BoardState): string[] {
  return state.tasks.map((task) => task.title)
}
