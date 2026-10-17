import type { BoardState } from '../domain/types'
import { isMutatingAction, type Action } from './actions'
import { reduce } from './reducer'

/** How many edits deep undo goes. Old snapshots beyond this are discarded. */
export const UNDO_LIMIT = 50

/**
 * Minimal observable store with undo/redo. Framework-free on purpose so the AI
 * layer and the tests can drive a board without React.
 *
 * Undo works on whole-state snapshots rather than inverse actions. Boards are
 * small (kilobytes), so the simplicity is worth far more than the memory, and
 * an inverse action per case would be a second place for the same invariant to
 * drift.
 */
export class BoardStore {
  private state: BoardState

  private past: BoardState[] = []

  private future: BoardState[] = []

  private listeners = new Set<(state: BoardState) => void>()

  constructor(initial: BoardState) {
    this.state = initial
  }

  getState(): BoardState {
    return this.state
  }

  dispatch(action: Action): BoardState {
    const next = reduce(this.state, action)
    // The reducer returns the same reference for no-ops; skipping both the
    // history push and the notify keeps React from re-rendering on every
    // selection change, and keeps undo meaningful.
    if (next === this.state) return this.state

    if (isMutatingAction(action)) {
      this.past.push(this.state)
      if (this.past.length > UNDO_LIMIT) this.past.shift()
      // Any new edit invalidates the redo branch.
      this.future = []
    }

    this.state = next
    this.emit()
    return this.state
  }

  canUndo(): boolean {
    return this.past.length > 0
  }

  canRedo(): boolean {
    return this.future.length > 0
  }

  undo(): boolean {
    const previous = this.past.pop()
    if (!previous) return false
    this.future.push(this.state)
    this.state = previous
    this.emit()
    return true
  }

  redo(): boolean {
    const next = this.future.pop()
    if (!next) return false
    this.past.push(this.state)
    this.state = next
    this.emit()
    return true
  }

  /** Number of edits available to undo. */
  undoDepth(): number {
    return this.past.length
  }

  subscribe(listener: (state: BoardState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state)
  }
}
