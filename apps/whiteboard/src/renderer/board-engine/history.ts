// ReveLith Drawboard — real undo/redo history over board snapshots.
// Snapshots are JSON clones capped by count; rapid streams (drawing) coalesce
// by time window while explicit tool calls force exact entries.

export interface BoardHistory {
  push(elements: readonly unknown[], force?: boolean): boolean
  undo(): readonly unknown[] | null
  redo(): readonly unknown[] | null
  canUndo(): boolean
  canRedo(): boolean
  reset(elements: readonly unknown[]): void
}

export function createBoardHistory(limit = 80, windowMs = 1200): BoardHistory {
  let stack: unknown[][] = []
  let index = -1
  let lastPush = 0
  const clone = (elements: readonly unknown[]): unknown[] =>
    JSON.parse(JSON.stringify(elements ?? []))

  return {
    push(elements, force = false) {
      const now = Date.now()
      if (!force && now - lastPush < windowMs) return false
      const snapshot = clone(elements)
      const current = index >= 0 ? stack[index] : undefined
      if (current !== undefined && JSON.stringify(current) === JSON.stringify(snapshot))
        return false
      stack = [...stack.slice(0, index + 1), snapshot].slice(-limit)
      index = stack.length - 1
      lastPush = now
      return true
    },
    undo() {
      if (index <= 0) return null
      index -= 1
      return clone(stack[index]!)
    },
    redo() {
      if (index < 0 || index >= stack.length - 1) return null
      index += 1
      return clone(stack[index]!)
    },
    canUndo() {
      return index > 0
    },
    canRedo() {
      return index >= 0 && index < stack.length - 1
    },
    reset(elements) {
      stack = [clone(elements)]
      index = 0
      lastPush = 0
    },
  }
}
