import type { BoardState } from '../domain/types'
import type { Action } from '../store/actions'

/**
 * Shared primitives for the tool surface.
 *
 * Kept separate from `tools.ts` so tool modules can depend on the helpers
 * without importing the registry — otherwise the registry's own `TOOLS` array
 * reads an uninitialised binding during module evaluation.
 */

export interface ToolResult {
  output: string
  summary: string
  mutated?: boolean
  isError?: boolean
}

export interface ToolContext {
  getState(): BoardState
  dispatch(action: Action): void
}

export interface ToolDefinition {
  name: string
  description: string
  /** JSON Schema for the tool input, handed to the model verbatim. */
  inputSchema: Record<string, unknown>
  run(ctx: ToolContext, input: Record<string, unknown>): ToolResult
}

export const json = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
})

export const stringProp = (description: string) => ({ type: 'string', description })

export function ok(output: unknown, summary: string, mutated = false): ToolResult {
  return {
    output: typeof output === 'string' ? output : JSON.stringify(output, null, 2),
    summary,
    mutated,
  }
}

export function fail(summary: string, detail?: string): ToolResult {
  return { output: detail ?? summary, summary, isError: true }
}

export function str(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function num(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)))
    return Number(value)
  return undefined
}

export function bool(input: Record<string, unknown>, key: string): boolean | undefined {
  return typeof input[key] === 'boolean' ? (input[key] as boolean) : undefined
}

export function strArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key]
  if (Array.isArray(value))
    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim() !== '',
    )
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}
