/**
 * Filesystem helpers shared by the commands.
 *
 * Paths are resolved against the command context's cwd rather than
 * process.cwd(), so a command behaves the same whether it was invoked from the
 * repo root, from the app bundle, or from a test with a temporary directory.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { CliError, EXIT } from './result.js'
import type { CommandContext } from './registry.js'

/** Lowercased extension without the dot, or '' when the name has none. */
export function extension(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  // A leading dot is a dotfile, not an extension (".gitignore" has none)
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
}

/** Resolve a user-supplied path against the command's cwd. */
export function resolveInput(input: string | undefined, ctx: CommandContext): string {
  if (!input) {
    throw new CliError(EXIT.usage, 'no input file given', undefined, {
      reason: 'missing_argument',
      suggestion: 'pass the file to operate on',
    })
  }
  return isAbsolute(input) ? input : resolve(ctx.cwd, input)
}

/** Like resolveInput, but fails early and specifically when the file is absent. */
export function requireFile(input: string | undefined, ctx: CommandContext): string {
  const path = resolveInput(input, ctx)
  if (!existsSync(path)) {
    throw new CliError(EXIT.file, `file not found: ${path}`, { path }, { reason: 'file_not_found' })
  }
  if (!statSync(path).isFile()) {
    throw new CliError(EXIT.file, `not a file: ${path}`, { path }, { reason: 'file_not_found' })
  }
  return path
}

export function readInput(path: string): Uint8Array {
  try {
    return readFileSync(path)
  } catch (err) {
    throw new CliError(
      EXIT.file,
      `cannot read ${path}: ${(err as Error).message}`,
      { path },
      {
        reason: 'file_not_found',
      },
    )
  }
}

export { existsSync, readFileSync, statSync }
