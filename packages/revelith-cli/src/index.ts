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

const VERSION = '1.1.4'

function printHelp(): void {
  console.log(`
ReveLith CLI & MCP Server (v${VERSION})
Modern office automation and Model Context Protocol integration.

Usage:
  revelith mcp [--http <port>] [--token <tok>] Start MCP server over stdio or Streamable HTTP
  revelith check <file> [--json]               Run quality issue report on a document
  revelith open <file> [options]               Point editor at slide, range, or page
      --slide <n>                               Target slide number
      --page <n>                                Target page number
      --range <cells>                           Target spreadsheet range (e.g. A1:D10)
  revelith docs apply <file> [options]         Apply styles, fields, comments, tables
  revelith sheet apply <file> [options]        Apply formulas, styles, pivot tables, sparklines
  revelith slides apply <file> [options]       Apply animations, alignment, themes
  revelith deck build --spec <file> --out <out.pptx>  Build presentation from spec

Options:
  --http <port>                                Streamable HTTP server for remote agents
  --token <tok>                                Secret authentication token for HTTP MCP
  --json                                       Output results/errors as structured JSON
  -v, --version                                Show version
  -h, --help                                   Show help
`)
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const jsonMode = args.includes('--json')
  const cleanArgs = args.filter((a) => a !== '--json')

  if (cleanArgs.length === 0 || cleanArgs.includes('-h') || cleanArgs.includes('--help')) {
    printHelp()
    return
  }

  if (cleanArgs.includes('-v') || cleanArgs.includes('--version')) {
    console.log(jsonMode ? JSON.stringify({ version: VERSION }) : `revelith v${VERSION}`)
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
    if (jsonMode) {
      console.error(formatError(err, true))
    } else {
      console.error(formatError(err, false))
    }
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
