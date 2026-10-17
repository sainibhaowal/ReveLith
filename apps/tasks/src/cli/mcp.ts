/**
 * MCP stdio entry point.
 *
 * Reads the board from `--file` (default `board.json`), serves the tool surface
 * over JSON-RPC, and writes any mutation straight back to that file. No port, no
 * server, no login — the same local file the app uses.
 */
import { runServer, serveFile } from '../ai/mcp'

const argv = process.argv.slice(2)
const fileIndex = argv.indexOf('--file')
const boardPath = fileIndex !== -1 ? argv[fileIndex + 1] : 'board.json'

if (!boardPath) {
  process.stderr.write('Usage: revelith-tasks-mcp [--file <board.json>]\n')
  process.exit(2)
}

runServer(serveFile(boardPath))