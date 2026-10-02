import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { MCP_TOOLS, handleToolCall } from './mcp.js'

export interface McpHttpServerOptions {
  port: number
  host?: string
  token?: string
  filesDir?: string
}

export interface McpHttpServerHandle {
  close: () => Promise<void>
  port: number
  filesDir: string
}

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

/**
 * Downloads a remote HTTP/HTTPS URL to a local file in filesDir so CLI tools
 * can process it like a local path.
 */
async function downloadRemoteUrl(url: string, destDir: string, token?: string): Promise<string> {
  const parsed = new URL(url)
  const base = basename(parsed.pathname) || `download-${Date.now()}.bin`
  const localDirect = join(destDir, base)
  if (parsed.pathname.startsWith('/files/') && existsSync(localDirect)) {
    return localDirect
  }

  const destPath = join(destDir, base)
  const headers: Record<string, string> = {}
  if (
    token &&
    (parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '0.0.0.0')
  ) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status} ${res.statusText}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(destPath, buf)
  return destPath
}

/** Recursively inspect tool arguments: download any http(s) URL to local filesDir */
async function resolveFileParameters(args: any, destDir: string, token?: string): Promise<any> {
  if (typeof args === 'string') {
    if (/^https?:\/\//i.test(args)) {
      return await downloadRemoteUrl(args, destDir, token)
    }
    return args
  }
  if (Array.isArray(args)) {
    return Promise.all(args.map((item) => resolveFileParameters(item, destDir, token)))
  }
  if (args && typeof args === 'object') {
    const out: Record<string, any> = {}
    for (const [key, val] of Object.entries(args)) {
      out[key] = await resolveFileParameters(val, destDir, token)
    }
    return out
  }
  return args
}

/**
 * Start a Streamable HTTP MCP server for agents on other machines / containers.
 */
export function startMcpHttpServer(options: McpHttpServerOptions): Promise<McpHttpServerHandle> {
  const port = options.port
  const host = options.host || '0.0.0.0'
  const token = options.token?.trim() || undefined
  const filesDir = options.filesDir || join(tmpdir(), 'revelith-mcp-files')

  if (!existsSync(filesDir)) {
    mkdirSync(filesDir, { recursive: true })
  }

  return new Promise((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // CORS headers for cross-origin agent calls
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS, HEAD')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
      const pathname = parsedUrl.pathname

      // Health check (always open for liveness probes)
      if (req.method === 'GET' && (pathname === '/health' || pathname === '/ping')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', server: 'revelith-mcp-http', version: '1.1.4' }))
        return
      }

      // Token authentication guard
      if (token) {
        const authHeader = req.headers.authorization
        const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
        const queryToken = parsedUrl.searchParams.get('token')
        if (bearer !== token && queryToken !== token) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'Unauthorized: invalid or missing authentication token' }),
          )
          return
        }
      }

      // File upload: PUT /files/<name>
      if (req.method === 'PUT' && pathname.startsWith('/files/')) {
        const fileName = basename(pathname.slice('/files/'.length))
        if (!fileName) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Filename missing in path /files/<name>' }))
          return
        }

        const filePath = join(filesDir, fileName)
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(Buffer.from(c)))
        req.on('end', () => {
          try {
            const buf = Buffer.concat(chunks)
            writeFileSync(filePath, buf)
            const hostHeader = req.headers.host || `localhost:${port}`
            const protocol = 'http'
            const fileUrl = `${protocol}://${hostHeader}/files/${encodeURIComponent(fileName)}`
            res.writeHead(201, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                ok: true,
                name: fileName,
                path: filePath,
                url: fileUrl,
                size: buf.length,
              }),
            )
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
          }
        })
        return
      }

      // File download: GET /files/<name>
      if (req.method === 'GET' && pathname.startsWith('/files/')) {
        const fileName = basename(pathname.slice('/files/'.length))
        const filePath = join(filesDir, fileName)
        if (!existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `File not found: ${fileName}` }))
          return
        }
        try {
          const content = readFileSync(filePath)
          const ext = ('.' + (fileName.split('.').pop() || '')).toLowerCase()
          const contentType = MIME_TYPES[ext] || 'application/octet-stream'
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': content.length,
            'Content-Disposition': `inline; filename="${fileName}"`,
          })
          res.end(content)
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
        }
        return
      }

      // Streamable HTTP MCP (POST /mcp or POST /)
      if (
        req.method === 'POST' &&
        (pathname === '/mcp' || pathname === '/' || pathname === '/rpc')
      ) {
        const isSse = req.headers.accept?.includes('text/event-stream')
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', async () => {
          try {
            const jsonReq = JSON.parse(body || '{}')
            const { id = null, method, params } = jsonReq

            if (method === 'initialize') {
              const result = {
                protocolVersion: '2024-11-05',
                serverInfo: {
                  name: 'revelith-mcp-http',
                  version: '1.1.4',
                },
                capabilities: {
                  tools: {},
                  resources: {},
                  streaming: true,
                },
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ jsonrpc: '2.0', id, result }))
              return
            }

            if (method === 'notifications/initialized') {
              res.writeHead(204)
              res.end()
              return
            }

            if (method === 'tools/list') {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } }))
              return
            }

            if (method === 'tools/call') {
              const { name, arguments: rawArgs } = params || {}
              // Automatically download any http(s) URL parameter into local storage
              const resolvedArgs = await resolveFileParameters(rawArgs || {}, filesDir, token)

              const toolResult = await handleToolCall(name, resolvedArgs)

              // If tool returned or created a local file, make it available via download URL
              const hostHeader = req.headers.host || `localhost:${port}`
              const protocol = 'http'
              let resultPayload = toolResult

              if (toolResult && typeof toolResult === 'object') {
                const outPath = toolResult.path || toolResult.outputPath || resolvedArgs?.outputPath
                if (typeof outPath === 'string' && existsSync(outPath)) {
                  const outName = basename(outPath)
                  const targetCopy = join(filesDir, outName)
                  if (outPath !== targetCopy) {
                    try {
                      writeFileSync(targetCopy, readFileSync(outPath))
                    } catch {}
                  }
                  resultPayload = {
                    ...toolResult,
                    download_url: `${protocol}://${hostHeader}/files/${encodeURIComponent(outName)}`,
                  }
                }
              }

              const responseData = {
                jsonrpc: '2.0',
                id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(resultPayload, null, 2),
                    },
                  ],
                },
              }

              if (isSse) {
                res.writeHead(200, {
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache',
                  Connection: 'keep-alive',
                })
                res.write(`data: ${JSON.stringify(responseData)}\n\n`)
                res.end()
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(responseData))
              }
              return
            }

            if (method === 'ping') {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ jsonrpc: '2.0', id, result: {} }))
              return
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `Method not found: ${method}` },
              }),
            )
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: err instanceof Error ? err.message : String(err) },
              }),
            )
          }
        })
        return
      }

      // SSE connection on GET /mcp
      if (req.method === 'GET' && pathname === '/mcp') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        res.write(`event: endpoint\ndata: /mcp\n\n`)
        res.write(`data: ${JSON.stringify({ status: 'connected', version: '1.1.4' })}\n\n`)
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Not found: ${req.method} ${pathname}` }))
    })

    server.listen(port, host, () => {
      const addr = server.address()
      const boundPort = typeof addr === 'object' && addr !== null ? addr.port : port
      resolve({
        close: () =>
          new Promise<void>((resClose) => {
            server.close(() => resClose())
          }),
        port: boundPort,
        filesDir,
      })
    })

    server.on('error', (err) => {
      reject(err)
    })
  })
}
