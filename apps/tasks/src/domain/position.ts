/**
 * Fractional ordering.
 *
 * Tasks are ordered by a numeric `position` inside their (column, parent) group.
 * Reordering inserts the midpoint between two neighbours, which keeps a single
 * drag to a single write instead of renumbering the column. Positions are
 * renumbered only when the gap between neighbours collapses.
 */

/** Below this gap two neighbours are too close to split, so the group is renumbered. */
export const MIN_GAP = 1e-6

export const POSITION_STEP = 1024

/** Position for appending after every existing position in the group. */
export function positionAfter(lastPosition: number | null): number {
  return lastPosition === null ? POSITION_STEP : lastPosition + POSITION_STEP
}

/** Position for prepending before every existing position in the group. */
export function positionBefore(firstPosition: number | null): number {
  return firstPosition === null ? POSITION_STEP : firstPosition - POSITION_STEP
}

/**
 * Position between two neighbours. Pass `null` for an open end; passing `null`
 * for both means an empty group.
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return POSITION_STEP
  if (before === null) return after as number - POSITION_STEP
  if (after === null) return before + POSITION_STEP
  return before + (after - before) / 2
}

/** True when two neighbours are too close to split again. */
export function needsRebalance(before: number, after: number): boolean {
  return Math.abs(after - before) < MIN_GAP
}

/**
 * Evenly spaced positions for `count` items, used when a group is rebuilt.
 * Returns positions in ascending order starting at `POSITION_STEP`.
 */
export function spread(count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => (index + 1) * POSITION_STEP)
}
