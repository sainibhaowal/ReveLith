import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { TabManager } from './tab-manager'

const MCP_PORT = 3928
const MCP_HOST = '127.0.0.1'

export interface InAppMcpServerHandle {
  close: () => void
  port: number
}

export function startInAppMcpServer(getTabManager: () => TabManager | null): InAppMcpServerHandle {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for local loopback requests
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', name: 'revelith-in-app-mcp', version: '1.1.4' }))
      return
    }

    if (req.method !== 'POST' || (req.url !== '/mcp' && req.url !== '/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body)
        const { id, method, params } = payload
        const tabManager = getTabManager()
        const activeTab = tabManager?.getActiveTabRecord?.()

        if (method === 'initialize') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2024-11-05',
                serverInfo: { name: 'revelith-live-editor', version: '1.1.4' },
                capabilities: { tools: {} },
              },
            }),
          )
          return
        }

        if (method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                tools: [
                  {
                    name: 'get_active_document',
                    description:
                      'Get information about the currently open and active document in ReveLith.',
                    inputSchema: { type: 'object', properties: {} },
                  },
                  {
                    name: 'docs_edit_text',
                    description:
                      'Edit the active open Word document live inside ReveLith in real time.',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        action: {
                          type: 'string',
                          enum: ['insert_text', 'replace_text', 'add_paragraph', 'apply_style'],
                        },
                        text: { type: 'string' },
                        targetText: { type: 'string' },
                      },
                      required: ['action'],
                    },
                  },
                  {
                    name: 'live_word_edit',
                    description:
                      'Edit the active open Word document live inside ReveLith in real time.',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        action: {
                          type: 'string',
                          enum: ['insert_text', 'replace_text', 'add_paragraph', 'apply_style'],
                        },
                        text: { type: 'string' },
                        targetText: { type: 'string' },
                      },
                      required: ['action'],
                    },
                  },
                  {
                    name: 'sheet_set_cells',
                    description:
                      'Drive the visible Sheets grid in ReveLith: set cell values, formulas, or activate ranges.',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        range: {
                          type: 'string',
                          description: 'Target cell or range e.g. A1 or B2:C5',
                        },
                        values: { description: 'Cell value or 2D array of values' },
                        sheetId: { type: 'string' },
                        select: { type: 'boolean' },
                      },
                      required: ['range'],
                    },
                  },
                ],
              },
            }),
          )
          return
        }

        if (
          method === 'tools/call' ||
          method === 'live_word_edit' ||
          method === 'docs_edit_text' ||
          method === 'sheet_set_cells'
        ) {
          const toolName = method === 'tools/call' ? params?.name : method
          const toolArgs = method === 'tools/call' ? params?.arguments : params

          if (toolName === 'get_active_document') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  active: Boolean(activeTab),
                  id: activeTab?.id,
                  kind: activeTab?.kind,
                  title: activeTab?.title,
                  filePath: activeTab?.filePath,
                },
              }),
            )
            return
          }

          if (toolName === 'docs_edit_text' || toolName === 'live_word_edit') {
            if (
              !activeTab ||
              (activeTab.kind !== 'docs' && activeTab.kind !== 'markdown') ||
              !activeTab.view
            ) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    success: false,
                    error: 'No active Word or Markdown document open in ReveLith',
                  },
                }),
              )
              return
            }

            // Execute edit command directly inside the active Docs WebContentsView
            const action = toolArgs?.action || 'insert_text'
            const textToInsert = toolArgs?.text || ''

            try {
              await activeTab.view.webContents.executeJavaScript(`
                (function() {
                  try {
                    // TipTap or rich editor DOM dispatch
                    const activeEl = document.querySelector('.ProseMirror') || document.activeElement;
                    if (activeEl) {
                      document.execCommand('insertText', false, ${JSON.stringify(textToInsert)});
                      return { ok: true, applied: '${action}' };
                    }
                    return { ok: true, note: 'Applied text' };
                  } catch (e) {
                    return { ok: false, error: String(e) };
                  }
                })()
              `)

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    success: true,
                    action,
                    document: activeTab.title,
                  },
                }),
              )
            } catch (evalErr) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    success: false,
                    error: evalErr instanceof Error ? evalErr.message : String(evalErr),
                  },
                }),
              )
            }
            return
          }

          if (toolName === 'sheet_set_cells') {
            if (!activeTab || activeTab.kind !== 'sheets' || !activeTab.view) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    success: false,
                    error: 'No active spreadsheet open in ReveLith',
                  },
                }),
              )
              return
            }

            const targetRange = toolArgs?.range || 'A1'
            const targetValues = toolArgs?.values
            const targetSheetId = toolArgs?.sheetId || null
            const doSelect = Boolean(toolArgs?.select)

            try {
              const script = `
                (function() {
                  try {
                    const runtime = window.__univerRuntime;
                    if (!runtime) return { ok: false, error: 'Univer runtime is not ready in active sheet' };
                    const workbook = runtime.univerAPI.getActiveWorkbook();
                    if (!workbook) return { ok: false, error: 'No active workbook found' };
                    const sheet = ${JSON.stringify(targetSheetId)}
                      ? workbook.getSheetBySheetId(${JSON.stringify(targetSheetId)})
                      : workbook.getActiveSheet();
                    if (!sheet) return { ok: false, error: 'Sheet not found' };
                    const range = sheet.getRange(${JSON.stringify(targetRange)});
                    const val = ${JSON.stringify(targetValues)};
                    if (val !== undefined) {
                      if (Array.isArray(val)) {
                        if (Array.isArray(val[0])) {
                          range.setValues(val);
                        } else {
                          range.setValues([val]);
                        }
                      } else {
                        range.setValue(val);
                      }
                    }
                    if (${JSON.stringify(doSelect)}) {
                      range.activate();
                    }
                    return { ok: true, range: ${JSON.stringify(targetRange)}, applied: true };
                  } catch (e) {
                    return { ok: false, error: String(e) };
                  }
                })()
              `
              const scriptResult = await activeTab.view.webContents.executeJavaScript(script)

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: scriptResult,
                }),
              )
            } catch (evalErr) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    success: false,
                    error: evalErr instanceof Error ? evalErr.message : String(evalErr),
                  },
                }),
              )
            }
            return
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { status: 'acknowledged' } }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      }
    })
  })

  server.listen(MCP_PORT, MCP_HOST, () => {
    // console.log(`[mcp] In-app live editor server listening at http://${MCP_HOST}:${MCP_PORT}/mcp`)
  })

  // Prevent unhandled server listen collision if port 3928 is occupied
  server.on('error', (err) => {
    console.warn('[mcp] In-app server notice:', err.message)
  })

  return {
    close: () => {
      try {
        server.close()
      } catch {}
    },
    port: MCP_PORT,
  }
}
