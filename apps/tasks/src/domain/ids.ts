/**
 * Monotonic, collision-resistant id generation.
 *
 * A counter plus a timestamp keeps ids sortable by creation order and unique
 * within a session, without pulling in a uuid dependency.
 */

let counter = 0

export function nextId(prefix = 'id'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`
}

/** Test seam: resets the counter so assertions can pin exact ids. */
export function resetIdCounter(): void {
  counter = 0
}
