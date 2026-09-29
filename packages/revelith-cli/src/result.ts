/**
 * Exit codes and result envelopes shared by every command.
 *
 * Two rules make the CLI scriptable:
 *   - stdout carries exactly one JSON object in --json mode, so a caller can
 *     pipe it straight into a parser. Progress and diagnostics go to stderr.
 *   - the exit code is coarse (a shell can only branch on a few values) and
 *     `reason` is the fine-grained, stable string a program should branch on.
 *     Every reason a command can emit is listed in skills/revelith/SKILL.md, so
 *     the set is a published contract: add reasons sparingly, never rename one.
 */

/** Process exit code. The JSON error payload carries the same number. */
export const EXIT = {
  ok: 0,
  /** the command line itself was wrong: unknown command, missing operand */
  usage: 1,
  /** the file could not be read, or does not exist */
  file: 2,
  /** the file was read but could not be converted or rebuilt */
  conversion: 3,
  /** the desktop app was needed but unavailable (not running, no GUI) */
  app: 4,
} as const

export type ExitCode = (typeof EXIT)[keyof typeof EXIT]

/** Machine-readable failure reason; see the note on stability above. */
export type ErrorReason =
  | 'unknown_command'
  | 'unknown_option'
  | 'missing_argument'
  | 'invalid_argument'
  | 'invalid_json'
  | 'unsupported'
  | 'unknown_op'
  | 'op_rejected'
  | 'unresolved_placeholder'
  | 'target_not_found'
  | 'out_of_range'
  | 'sheet_not_found'
  | 'file_not_found'
  | 'resource_limit'
  | 'output_exists'
  | 'file_open_in_gui'
  | 'file_not_open_in_gui'
  | 'outside_allowed_roots'
  | 'conversion_failed'
  | 'app_unavailable'
  | 'invalid_usage'

/** Reason implied by an exit code when the caller did not name one. */
const DEFAULT_REASON: Record<ExitCode, ErrorReason> = {
  [EXIT.ok]: 'invalid_usage',
  [EXIT.usage]: 'invalid_usage',
  [EXIT.file]: 'file_not_found',
  [EXIT.conversion]: 'conversion_failed',
  [EXIT.app]: 'app_unavailable',
}

export interface ErrorHints {
  reason?: ErrorReason
  /** One imperative sentence, no trailing period: what to do next. */
  suggestion?: string
}

/** A failure a command reports deliberately, as opposed to a crash. */
export class CliError extends Error {
  readonly reason: ErrorReason
  readonly suggestion?: string

  constructor(
    readonly code: ExitCode,
    message: string,
    readonly detail?: Record<string, unknown>,
    hints: ErrorHints = {},
  ) {
    super(message)
    this.name = 'CliError'
    this.reason = hints.reason ?? DEFAULT_REASON[code]
    if (hints.suggestion) this.suggestion = hints.suggestion
  }
}

/** Something a program should know about a run that nonetheless succeeded. */
export interface Warning {
  code: string
  message: string
  suggestion?: string
}

export interface CommandResult {
  /**
   * `partial` means the output was written but part of the input was not
   * applied. The per-item breakdown lives in `detail.batch` / `detail.failures`
   * so a caller can tell a partial success from a clean one.
   */
  status?: 'ok' | 'partial'
  summary: string
  outputPath?: string
  detail?: Record<string, unknown>
  warnings?: Warning[]
}

export interface JsonOk {
  status: 'ok' | 'partial'
  command: string
  summary: string
  output_path?: string
  warnings?: Warning[]
  detail?: Record<string, unknown>
}

export interface JsonError {
  status: 'error'
  command: string | null
  code: ExitCode
  error: ErrorReason
  message: string
  suggestion?: string
  detail?: Record<string, unknown>
}

export function toJsonOk(command: string, r: CommandResult): JsonOk {
  return {
    status: r.status ?? 'ok',
    command,
    summary: r.summary,
    ...(r.outputPath ? { output_path: r.outputPath } : {}),
    ...(r.warnings?.length ? { warnings: r.warnings } : {}),
    ...(r.detail ? { detail: r.detail } : {}),
  }
}

export function toJsonError(command: string | null, err: CliError): JsonError {
  return {
    status: 'error',
    command,
    code: err.code,
    error: err.reason,
    message: err.message,
    ...(err.suggestion ? { suggestion: err.suggestion } : {}),
    ...(err.detail ? { detail: err.detail } : {}),
  }
}

/** Human output: summary first, then output path, warnings, then detail pairs. */
export function formatHuman(r: CommandResult): string {
  const lines = [r.summary]
  if (r.outputPath) lines.push(`  output: ${r.outputPath}`)
  for (const w of r.warnings ?? []) {
    lines.push(`  warning: ${w.message}${w.suggestion ? ` (${w.suggestion})` : ''}`)
  }
  if (r.detail) {
    for (const [key, value] of Object.entries(r.detail)) {
      if (key === 'batch') {
        lines.push(batchLine(value))
        continue
      }
      const text =
        value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)
      lines.push(`  ${key}: ${text}`)
    }
  }
  return lines.join('\n')
}

export function formatHumanError(err: CliError): string {
  const lines = [`revelith: ${err.message}`]
  if (err.suggestion) lines.push(`  hint: ${err.suggestion}`)
  if (err.detail) {
    const { batch, ...rest } = err.detail
    if (batch !== undefined) lines.push(batchLine(batch))
    if (Object.keys(rest).length) lines.push(`  ${JSON.stringify(rest)}`)
  }
  return lines.join('\n')
}

function batchLine(value: unknown): string {
  const b = value as { total: number; applied: number; failed: number; skipped: number }
  return `  batch: ${b.applied} of ${b.total} ops applied, ${b.failed} failed, ${b.skipped} skipped`
}
