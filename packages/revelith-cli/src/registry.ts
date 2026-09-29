/**
 * Command registry: the single place a command is declared, so `--help`, the
 * MCP tool list and the dispatch table cannot drift apart.
 */
import type { ParsedArgs } from './args.js'
import type { CommandResult, Warning } from './result.js'

export interface CommandContext {
  cwd: string
  env: NodeJS.ProcessEnv
  /** Progress and diagnostics. Never part of the machine-readable result. */
  log: (message: string) => void
  /** Advisories that belong in the result; merged into `warnings` on return. */
  warn: (warning: Warning) => void
}

export interface OptionDef {
  name: string
  description: string
  /** Placeholder for the option's value. Absent for boolean switches. */
  value?: string
}

export interface CommandDef {
  name: string
  summary: string
  usage: string
  options?: OptionDef[]
  /**
   * The command owns stdout for its whole run (an MCP server on stdio would be
   * corrupted by anything printed after it). A function lets a command decide
   * per invocation, e.g. only when it is actually serving.
   */
  quiet?: boolean | ((args: ParsedArgs) => boolean)
  run(args: ParsedArgs, ctx: CommandContext): Promise<CommandResult>
}

export class CommandRegistry {
  private readonly defs = new Map<string, CommandDef>()

  register(def: CommandDef): this {
    this.defs.set(def.name, def)
    return this
  }

  get(name: string): CommandDef | undefined {
    return this.defs.get(name)
  }

  list(): CommandDef[] {
    return [...this.defs.values()]
  }
}

export function optionLabel(o: OptionDef): string {
  return o.value ? `--${o.name} <${o.value}>` : `--${o.name}`
}

/** Help for one command. `--help` for an unknown name is the caller's problem. */
export function commandHelp(def: CommandDef): string {
  const lines = [`Usage: revelith ${def.usage}`, '', def.summary]
  if (def.options?.length) {
    lines.push('', 'Options:')
    const width = Math.max(...def.options.map((o) => optionLabel(o).length))
    for (const o of def.options) lines.push(`  ${optionLabel(o).padEnd(width)}  ${o.description}`)
  }
  return lines.join('\n')
}
