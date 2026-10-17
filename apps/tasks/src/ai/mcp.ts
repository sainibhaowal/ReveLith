import { readFileSync, writeFileSync } from 'node:fs'
import { runTool, toolSchemas } from './tools'
import { reduce } from '../store/reducer'
import { parseDocument, serializeDocument } from '../store/migrate'

/**
 * Model Context Protocol server for the board.
 *
 * Speaks JSON-RPC 2.0 over stdio, so it runs as a child process with no port,
 * no server and no authentication — the same guarantee as the app itself. Every
 * call is dispatched through the ordinary reducer, so an MCP client has exactly
 * the capabilities the UI has and no privileged path.
 *
 * The board is supplied by the caller: `runServer` takes a context, and
 * `serveFile` is the convenience wrapper used by the CLI entry point.
 */
export interface McpContext {
  getState(): unknown
  dispatch(action: unknown): void
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

const SERVER_INFO = {
  name: 'revelith-tasks',
  version: '0.1.0',
}

/** MCP error codes used here. */
const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602

/**
 * Handle one JSON-RPC message.
 *
 * Returns `null` for notifications (requests without an `id`), which per the
 * JSON-RPC spec must not be answered.
 */
export function handleRpc(ctx: McpContext, request: JsonRpcRequest): JsonRpcResponse | null {
  const id = request.id ?? null
  const isNotification = request.id === undefined

  const fail = (code: number, message: string): JsonRpcResponse | null =>
    isNotification ? null : { jsonrpc: '2.0', id, error: { code, message } }

  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return fail(INVALID_REQUEST, 'Expected a JSON-RPC 2.0 request')
  }

  switch (request.method) {
    // ---- lifecycle ------------------------------------------------------
    case 'initialize':
      return isNotification
        ? null
        : {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: { listChanged: false } },
              serverInfo: SERVER_INFO,
            },
          }

    case 'notifications/initialized':
    case 'initialized':
      return null

    case 'ping':
      return isNotification ? null : { jsonrpc: '2.0', id, result: {} }

    // ---- tools ----------------------------------------------------------
    case 'tools/list':
      return isNotification
        ? null
        : {
            jsonrpc: '2.0',
            id,
            result: {
              tools: toolSchemas().map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              })),
            },
          }

    case 'tools/call': {
      const name = request.params?.name
      const args = request.params?.arguments
      if (typeof name !== 'string') return fail(INVALID_PARAMS, 'tools/call needs a tool name')
      if (
        args !== undefined &&
        (typeof args !== 'object' || args === null || Array.isArray(args))
      ) {
        return fail(INVALID_PARAMS, 'tools/call arguments must be an object')
      }
      const result = runTool(ctx as never, name, (args ?? {}) as Record<string, unknown>)
      return isNotification
        ? null
        : {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: result.output }],
              isError: result.isError === true,
              _meta: { summary: result.summary, mutated: result.mutated === true },
            },
          }
    }

    default:
      return fail(METHOD_NOT_FOUND, `Unknown method: ${request.method}`)
  }
}

/**
 * Serve MCP on stdin/stdout.
 *
 * Messages are newline-delimited JSON, which is what MCP clients send over
 * stdio. Writes go to stdout only; anything diagnostic belongs on stderr, or it
 * would corrupt the protocol stream.
 */
export function runServer(ctx: McpContext): void {
  let buffer = ''

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return

    let request: JsonRpcRequest
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest
    } catch {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Invalid JSON' } })}\n`,
      )
      return
    }

    // A batch is an array of requests; answer each independently.
    const batch = Array.isArray(request) ? (request as JsonRpcRequest[]) : null
    if (batch) {
      const responses = batch
        .map((entry) => handleRpc(ctx, entry))
        .filter((entry): entry is JsonRpcResponse => entry !== null)
      if (responses.length) process.stdout.write(`${JSON.stringify(responses)}\n`)
      return
    }

    const response = handleRpc(ctx, request)
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
  }

  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      handleLine(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
  })
  process.stdin.on('end', () => {
    if (buffer.trim()) handleLine(buffer)
  })
}

/** Build a context over a board loaded from a JSON document on disk. */
export function serveFile(path: string): McpContext {
  const payload = JSON.parse(readFileSync(path, 'utf8')) as unknown
  let state = parseDocument(payload)
  if (!state) throw new Error(`The board file is not a valid ReveLith Tasks document: ${path}`)
  return {
    getState: () => state,
    dispatch: (action) => {
      state = reduce(state as never, action as never)
      writeFileSync(path, JSON.stringify(serializeDocument(state as never), null, 2), 'utf8')
    },
  }
}
