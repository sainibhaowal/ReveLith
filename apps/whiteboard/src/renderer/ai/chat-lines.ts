/**
 * Pure helpers for the AI Draw chat panel's reply actions.
 *
 * These were inline in the component, where they could not be tested: the panel
 * needs a live board API and Excalidraw to render. Pulling the decision logic
 * out means regenerate and the tool labels are covered by ordinary unit tests,
 * and the component only supplies the effects.
 */

/** The minimum a line needs for these helpers; the panel's own type is richer. */
export interface ChatLineLike {
  role: 'user' | 'assistant'
  text: string
}

/**
 * The instruction to re-run when regenerating the reply at `index`.
 *
 * Returns null unless that reply is the newest line and has text — regenerating
 * an older reply, or one that produced no text at all, has nothing to replay.
 * The instruction is the nearest *preceding* user line, so a run whose reply
 * spans several tool turns still replays the request that started it.
 */
export function lastUserInstruction(lines: readonly ChatLineLike[], index: number): string | null {
  if (index < 0 || index >= lines.length) return null
  const line = lines[index]
  if (!line || line.role !== 'assistant') return null
  // only the newest reply can be regenerated
  if (index !== lines.length - 1) return null
  // a whitespace-only reply has nothing to replay (send() trims to nothing)
  if (!line.text.trim()) return null
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = lines[i]
    if (candidate?.role === 'user' && candidate.text.trim()) return candidate.text
  }
  return null
}

/** Human label for a board tool: routed name, underscored names spaced out. */
export function toolLabel(
  tool: { name: string },
  resolve?: (name: string) => string | null | undefined,
): string {
  if (tool.name === 'inspect_board_visual') return 'visually review drawing'
  const routed = resolve?.(tool.name) ?? null
  // The app is called AI Draw. The tools retain stable protocol IDs for
  // compatibility, but those IDs must never leak into the label the user reads.
  return (routed ?? tool.name).replaceAll('_', ' ').replace(/\bdrawboard\b/gi, 'drawboard')
}

/** Label for the collapsed tool group: "Working" while running, else the count. */
export function workedLabel(steps: number): string {
  return `Worked · ${steps} step${steps === 1 ? '' : 's'}`
}
