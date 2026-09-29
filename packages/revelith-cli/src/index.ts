/**
 * Entry point.
 *
 * Two dispatch paths coexist on purpose:
 *   - the registry (src/registry.ts) owns every new command, so help, the tool
 *     list and dispatch are generated from one declaration.
 *   - the legacy handlers below own the commands that predate the registry.
 *     They are folded in as they gain tests; until then they keep the exact
 *     behaviour they had, so nothing existing changes shape.
 */
import { startMcpServer } from './mcp.js'
import {
  checkDocument,
  openDocumentAt,
  docsApply,
  sheetApply,
  slidesApply,
  formatError,
  guidedDeckBuilder,
} from './commands.js'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defaultRegistry, runCli, VERSION } from './cli.js'

/**
 * Read the version from the manifest rather than repeating it here. It was
 * '1.1.4' against a 0.10.100 package, which is the kind of drift nobody
 * notices until a bug report quotes a version that does not exist.
 */
function resolveVersion(): string {
  try {
    return createRequire(import.meta.url)('../package.json').version as string
  } catch {
    return VERSION
  }
}

/** Commands the legacy chain still handles, listed for help and dispatch. */
const LEGACY_USAGE: Array<[string, string]> = [
  ['mcp [--http <port>] [--token <tok>]', 'MCP server over stdio or Streamable HTTP'],
  ['check <file>', 'Quality issue report on a document'],
  ['open <file> [--slide N | --page N | --range R]', 'Point the editor at a slide, page or range'],
  ['docs apply <file>', 'Apply styles, fields, comments, tables'],
  ['sheet apply <file>', 'Apply formulas, styles, pivot tables, sparklines'],
  ['slides apply <file>', 'Apply animations, alignment, themes'],
  ['deck build --spec <file> --out <out.pptx>', 'Build a presentation from a spec'],
]

function printHelp(): void {
  const registry = defaultRegistry()
  const width = Math.max(
    ...registry.list().map((d) => d.name.length),
    ...LEGACY_USAGE.map(([u]) => u.length),
  )
  console.log(`revelith ${resolveVersion()} — local document tooling (nothing leaves this machine)`)
  console.log('')
  console.log('Usage:')
  console.log('  revelith <command> [options]')
  console.log('')
  console.log('Commands:')
  for (const d of registry.list()) {
    console.log(`  ${d.name.padEnd(width)}  ${d.summary}`)
  }
  for (const [usage, summary] of LEGACY_USAGE) {
    console.log(`  ${usage.padEnd(width)}  ${summary}`)
  }
  console.log('')
  console.log('Options:')
  console.log('  --json         Emit one JSON object on stdout instead of human-readable text')
  console.log('  -h, --help     Show help for a command, or this list when no command is given')
  console.log('  -v, --version  Show version')
  console.log('')
  console.log('Run `revelith <command> --help` for the options of one command.')
}

/**
 * Command names the legacy chain owns. Anything else is the registry's to
 * answer, which is what keeps a single --json error shape: without this, an
 * unknown command fell through to the legacy handler and came back in the old
 * {error: true, code: "ERR_..."} form, so a caller parsing --json had to handle
 * two unrelated schemas depending on the spelling of the command.
 */
const LEGACY_NAMES = new Set(['mcp', 'check', 'open', 'docs', 'sheet', 'slides', 'deck'])

/** Execute through the registry and print the outcome. Exits non-zero on failure. */
async function dispatchRegistry(argv: string[]): Promise<void> {
  const outcome = await runCli(argv, defaultRegistry())
  if (outcome.stdout) console.log(outcome.stdout)
  if (outcome.stderr) console.error(outcome.stderr)
  if (outcome.code !== 0) process.exit(outcome.code)
}

/** True when the registry actually owns this argv (so the legacy chain is skipped). */
function registryOwns(argv: string[]): boolean {
  const name = argv.find((a) => !a.startsWith('-'))
  return !!name && !!defaultRegistry().get(name)
}

/** True when the legacy chain below will handle this argv. */
function isLegacyCommand(argv: string[]): boolean {
  const name = argv.find((a) => !a.startsWith('-'))
  return !!name && LEGACY_NAMES.has(name)
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const jsonMode = args.includes('--json')
  const cleanArgs = args.filter((a) => a !== '--json')

  if (cleanArgs.length === 0 || cleanArgs.includes('-h') || cleanArgs.includes('--help')) {
    // `--help` for a specific registry command is handled by the registry so
    // the per-command options table is generated from the declaration.
    const name = cleanArgs.find((a) => !a.startsWith('-'))
    if (name && defaultRegistry().get(name)) {
      await dispatchRegistry(args)
      return
    }
    printHelp()
    return
  }

  if (cleanArgs.includes('-v') || cleanArgs.includes('--version')) {
    const version = resolveVersion()
    console.log(jsonMode ? JSON.stringify({ version }) : `revelith v${version}`)
    return
  }

  if (registryOwns(args)) {
    await dispatchRegistry(args)
    return
  }

  // Neither the registry nor the legacy chain owns this name. The registry
  // still phrases the failure, so every --json error has one shape.
  if (!isLegacyCommand(cleanArgs)) {
    await dispatchRegistry(args)
    return
  }

  const cmd = cleanArgs[0]

  try {
    if (cmd === 'mcp') {
      const httpIdx = cleanArgs.indexOf('--http')
      const tokenIdx = cleanArgs.indexOf('--token')
      const token = tokenIdx >= 0 ? cleanArgs[tokenIdx + 1] : undefined
      if (httpIdx >= 0) {
        const portStr = cleanArgs[httpIdx + 1]
        const port = Number(portStr)
        if (!port || Number.isNaN(port)) {
          throw new Error('Usage: revelith mcp --http <port> [--token <token>]')
        }
        const { startMcpHttpServer } = await import('./mcp-http.js')
        const server = await startMcpHttpServer({ port, token })
        console.log(
          `ReveLith MCP Streamable HTTP server listening on port ${server.port}${token ? ' (token-protected)' : ''}`,
        )
        return
      }
      startMcpServer()
      return
    }

    if (cmd === 'check') {
      const file = cleanArgs[1]
      if (!file) throw new Error('Usage: revelith check <file> [--json]')
      const report = await checkDocument(file)
      if (jsonMode) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        console.log(`Checked: ${report.file}`)
        console.log(`Status: ${report.passed ? 'PASSED' : 'FAILED'}`)
        if (report.issues.length > 0) {
          for (const iss of report.issues) {
            console.log(`  [${iss.severity.toUpperCase()}] ${iss.code}: ${iss.message}`)
            if (iss.suggestion) console.log(`    Suggestion: ${iss.suggestion}`)
          }
        } else {
          console.log('No issues detected.')
        }
      }
      return
    }

    if (cmd === 'open') {
      const file = cleanArgs[1]
      if (!file) throw new Error('Usage: revelith open <file> [--slide N] [--page N] [--range R]')
      const slideIdx = cleanArgs.indexOf('--slide')
      const pageIdx = cleanArgs.indexOf('--page')
      const rangeIdx = cleanArgs.indexOf('--range')

      const slide = slideIdx >= 0 ? Number(cleanArgs[slideIdx + 1]) : undefined
      const page = pageIdx >= 0 ? Number(cleanArgs[pageIdx + 1]) : undefined
      const range = rangeIdx >= 0 ? cleanArgs[rangeIdx + 1] : undefined

      const result = await openDocumentAt(file, { slide, page, range })
      if (jsonMode) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        console.log(`Opened ${result.path} at ${result.target}`)
      }
      return
    }

    if (cmd === 'docs' && cleanArgs[1] === 'apply') {
      const file = cleanArgs[2]
      if (!file) throw new Error('Usage: revelith docs apply <file>')
      const result = await docsApply(file, {})
      if (jsonMode) console.log(JSON.stringify(result, null, 2))
      else console.log(`Applied to ${file}: ${result.applied.join(', ') || 'OK'}`)
      return
    }

    if (cmd === 'sheet' && cleanArgs[1] === 'apply') {
      const file = cleanArgs[2]
      if (!file) throw new Error('Usage: revelith sheet apply <file>')
      const result = await sheetApply(file, {})
      if (jsonMode) console.log(JSON.stringify(result, null, 2))
      else console.log(`Applied to ${file}: ${result.applied.join(', ') || 'OK'}`)
      return
    }

    if (cmd === 'slides' && cleanArgs[1] === 'apply') {
      const file = cleanArgs[2]
      if (!file) throw new Error('Usage: revelith slides apply <file>')
      const result = await slidesApply(file, {})
      if (jsonMode) console.log(JSON.stringify(result, null, 2))
      else console.log(`Applied to ${file}: ${result.applied.join(', ') || 'OK'}`)
      return
    }

    if (cmd === 'deck' && cleanArgs[1] === 'build') {
      const specIdx = cleanArgs.indexOf('--spec')
      const outIdx = cleanArgs.indexOf('--out')
      if (specIdx < 0 || outIdx < 0) {
        throw new Error('Usage: revelith deck build --spec <file.json> --out <output.pptx>')
      }
      const specRaw = readFileSync(cleanArgs[specIdx + 1], 'utf-8')
      const spec = JSON.parse(specRaw)
      const result = await guidedDeckBuilder(spec, cleanArgs[outIdx + 1])
      if (jsonMode) console.log(JSON.stringify(result, null, 2))
      else console.log(`Built deck with ${result.slideCount} slides: ${result.path}`)
      return
    }

    throw new Error(`Unknown command: ${cmd}`)
  } catch (err) {
    console.error(formatError(err, jsonMode))
    process.exit(1)
  }
}

if (
  process.argv[1]?.endsWith('revelith.js') ||
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.endsWith('index.js')
) {
  void main()
}
