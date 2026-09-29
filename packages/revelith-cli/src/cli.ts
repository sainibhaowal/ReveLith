/**
 * Dispatch: turn argv into exactly one command run and one line of output.
 *
 * A command owns stdout for the whole run (an MCP server on stdio would be
 * corrupted by anything printed after it), so `quiet` commands suppress the
 * result entirely rather than having it interleaved.
 */
import { parseArgs } from './args.js'
import type { ParsedArgs } from './args.js'
import { infoCommand } from './commands/info.js'
import { CommandRegistry, commandHelp } from './registry.js'
import type { CommandDef } from './registry.js'
import { CliError, EXIT, formatHuman, formatHumanError, toJsonError, toJsonOk } from './result.js'
import type { CommandResult, Warning } from './result.js'

/** Flags that never take a value, so the next token stays a positional. */
const BOOLEAN_FLAGS = new Set(['json', 'help', 'version', 'quiet', 'force', 'dry-run'])

export const VERSION = '0.10.100'

export function defaultRegistry(): CommandRegistry {
  return new CommandRegistry().register(infoCommand)
}

export function topLevelHelp(registry: CommandRegistry): string {
  const defs = registry.list()
  const width = Math.max(...defs.map((d) => d.name.length))
  return [
    `revelith ${VERSION} — local document tooling (nothing leaves this machine)`,
    '',
    'Usage:',
    '  revelith <command> [options]',
    '',
    'Commands:',
    ...defs.map((d) => `  ${d.name.padEnd(width)}  ${d.summary}`),
    '',
    'Options:',
    '  --json     Emit one JSON object on stdout instead of human-readable text',
    '  -h, --help Show help for a command, or this list when no command is given',
    '  -v, --version  Show version',
    '',
    'Run `revelith <command> --help` for the options of one command.',
  ].join('\n')
}

export interface RunOutcome {
  code: number
  /** What to print on stdout. Empty for quiet commands and for errors. */
  stdout: string
  /** What to print on stderr, or '' for a clean run. */
  stderr: string
}

/**
 * Parse and execute. Returns what to print rather than printing it, so a test
 * can assert on the output and the MCP layer can forward it.
 */
export async function runCli(
  argv: readonly string[],
  registry: CommandRegistry = defaultRegistry(),
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunOutcome> {
  const args = parseArgs(argv, BOOLEAN_FLAGS)
  const json = args.flags.json === true

  if (argv.length === 0) {
    return { code: EXIT.ok, stdout: topLevelHelp(registry), stderr: '' }
  }

  const name = args.positionals[0]
  const def = name ? registry.get(name) : undefined

  if (!def) {
    // No `detail`: the name is already the message and, in --json, the
    // top-level `command` field. Repeating it just prints a bare object.
    const err = new CliError(
      EXIT.usage,
      name ? `unknown command: ${name}` : 'no command given',
      undefined,
      {
        reason: 'unknown_command',
        suggestion: 'run `revelith --help` for the command list',
      },
    )
    return { code: err.code, stdout: '', stderr: renderError(err, json, name ?? null) }
  }

  if (args.flags.help) {
    return { code: EXIT.ok, stdout: commandHelp(def), stderr: '' }
  }

  const warnings: Warning[] = []
  // The command name is argv[0] and belongs to the dispatcher, not the
  // command: a command's first positional is its first operand, so a file
  // argument must not be off by one.
  const operands: ParsedArgs = { positionals: args.positionals.slice(1), flags: args.flags }
  const ctx = {
    cwd,
    env,
    // Progress belongs on stderr: stdout is reserved for the single result
    // object, and a caller parsing it must not trip over a status line.
    log: (message: string) => {
      if (!json) process.stderr.write(`${message}\n`)
    },
    warn: (warning: Warning) => {
      warnings.push(warning)
    },
  }

  try {
    const result: CommandResult = await def.run(operands, ctx)
    // Context warnings come first, then the command's own. The key is omitted
    // entirely when empty so the JSON does not carry a bare [] on every run.
    const allWarnings = [...warnings, ...(result.warnings ?? [])]
    const merged: CommandResult = { ...result }
    if (allWarnings.length > 0) merged.warnings = allWarnings
    if (isQuiet(def, operands)) return { code: EXIT.ok, stdout: '', stderr: '' }
    return { code: EXIT.ok, stdout: renderOk(def.name, merged, json), stderr: '' }
  } catch (err) {
    if (err instanceof CliError) {
      return { code: err.code, stdout: '', stderr: renderError(err, json, def.name) }
    }
    // An unexpected throw is a bug, not a user error: report it as such rather
    // than dressing it as a bad argument, but still keep stdout clean.
    const wrapped = new CliError(EXIT.app, (err as Error).message ?? String(err), undefined, {
      reason: 'app_unavailable',
    })
    return { code: wrapped.code, stdout: '', stderr: renderError(wrapped, json, def.name) }
  }
}

function isQuiet(def: CommandDef, args: ReturnType<typeof parseArgs>): boolean {
  if (typeof def.quiet === 'function') return def.quiet(args)
  return def.quiet === true
}

function renderOk(name: string, result: CommandResult, json: boolean): string {
  if (json) return JSON.stringify(toJsonOk(name, result), null, 2)
  // A partial run must be visible without reading the JSON: the exit code is
  // still 0 (the file was written) but the human must not miss the losses.
  const body = formatHuman(result)
  return result.status === 'partial' ? `${body}\n  (partial: some input was not applied)` : body
}

function renderError(err: CliError, json: boolean, command: string | null): string {
  return json ? JSON.stringify(toJsonError(command, err), null, 2) : formatHumanError(err)
}
