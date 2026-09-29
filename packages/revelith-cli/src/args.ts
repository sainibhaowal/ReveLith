/**
 * Argument parsing.
 *
 * Deliberately not a dependency: the CLI ships inside the app bundle, where a
 * few hundred lines of parser is cheaper than another package to resolve at
 * startup. It supports exactly the forms the documented commands need.
 */

export interface ParsedArgs {
  positionals: string[]
  flags: Record<string, string | true>
}

/**
 * `--key value`, `--key=value`, `--flag`, `-h`; a lone `--` ends flag parsing.
 *
 * Names listed in `booleans` never consume the next token, so
 * `revelith --json info a.docx` keeps `info` as the command rather than
 * swallowing it as the value of `--json`. Anything after `--` is positional,
 * which is how a filename beginning with a dash is passed.
 */
export function parseArgs(
  argv: readonly string[],
  booleans: ReadonlySet<string> = new Set(),
): ParsedArgs {
  const positionals: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (arg === '-h') {
      flags.help = true
      continue
    }
    // A bare "-" is a filename convention (stdin), and "--x" is a flag, so
    // anything else that is not a long option is positional.
    if (!arg.startsWith('--') || arg.length === 2) {
      positionals.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1)
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!booleans.has(key) && next !== undefined && !next.startsWith('--')) {
      flags[key] = next
      i++
    } else {
      flags[key] = true
    }
  }
  return { positionals, flags }
}

/** The flag's value, or undefined when it was absent or used as a boolean. */
export function flagString(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[name]
  return typeof v === 'string' ? v : undefined
}

/** Present-and-used. `--dry-run` and `--dry-run=false` are both true here. */
export function flagBool(args: ParsedArgs, name: string): boolean {
  return args.flags[name] !== undefined
}

/** Set of flag names used as switches, for parseArgs. */
export function booleanFlags(...names: string[]): ReadonlySet<string> {
  return new Set(names)
}
