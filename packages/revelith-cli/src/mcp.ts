import * as readline from 'node:readline'
import {
  checkDocument,
  openDocumentAt,
  docsApply,
  sheetApply,
  slidesApply,
  guidedDeckBuilder,
  type DeckSpec,
} from './commands.js'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: any
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

export const MCP_TOOLS = [
  {
    name: 'revelith_info',
    description:
      'Inspect file metadata, format, and structure for documents, spreadsheets, and slides.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the document file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'revelith_check',
    description:
      'Run quality checks on a document (detecting broken links, empty elements, formatting issues).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the document to check' },
      },
      required: ['path'],
    },
  },
  {
    name: 'revelith_open',
    description: 'Point the ReveLith editor at a specific slide, range, or page in a document.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to open' },
        slide: { type: 'number', description: 'Slide number (for presentations)' },
        page: { type: 'number', description: 'Page number (for PDFs and Word documents)' },
        range: { type: 'string', description: 'Cell range e.g. A1:D10 (for spreadsheets)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'docs_apply',
    description:
      'Apply styles, fields, comments, table structure, or page setup to a Word (.docx) document.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the .docx file' },
        styles: { type: 'object', description: 'Style definitions' },
        fields: { type: 'array', description: 'Document fields to insert or update' },
        comments: { type: 'array', description: 'Comments to attach' },
        table: { type: 'object', description: 'Table structure changes' },
        pageSetup: { type: 'object', description: 'Page orientation and margins' },
      },
      required: ['path'],
    },
  },
  {
    name: 'sheet_apply',
    description:
      'Apply styles, formulas, pivot tables, or sparklines to a spreadsheet (.xlsx) file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the .xlsx file' },
        styles: { type: 'object', description: 'Cell styles and number formats' },
        formulas: { type: 'object', description: 'Formulas to insert keyed by cell coordinate' },
        pivotTable: { type: 'object', description: 'Pivot table specification' },
        sparklines: { type: 'array', description: 'Sparkline definitions' },
      },
      required: ['path'],
    },
  },
  {
    name: 'slides_apply',
    description:
      'Apply styles, align/distribute elements, animations, themes, or comments to a presentation (.pptx) file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the .pptx file' },
        styles: { type: 'object', description: 'Element styles' },
        align: { type: 'string', enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'] },
        distribute: { type: 'string', enum: ['horizontal', 'vertical'] },
        animations: { type: 'array', description: 'Slide animations' },
        theme: { type: 'string', description: 'Theme name or palette' },
        comments: { type: 'array', description: 'Slide comments' },
      },
      required: ['path'],
    },
  },
  {
    name: 'guided_deck_builder',
    description:
      'Guided flow for generating a complete multi-slide presentation deck with layout, styling, and speaker notes.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: {
          type: 'object',
          description:
            'Deck specification containing slides, titles, layouts, bullet points, and speaker notes',
          properties: {
            title: { type: 'string' },
            author: { type: 'string' },
            themeColor: { type: 'string' },
            slides: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  subtitle: { type: 'string' },
                  layout: {
                    type: 'string',
                    enum: [
                      'title',
                      'bullet_points',
                      'two_column',
                      'quote',
                      'stat_callout',
                      'conclusion',
                    ],
                  },
                  bulletPoints: { type: 'array', items: { type: 'string' } },
                  speakerNotes: { type: 'string' },
                },
                required: ['title', 'layout'],
              },
            },
          },
          required: ['title', 'slides'],
        },
        outputPath: { type: 'string', description: 'Target .pptx file path' },
      },
      required: ['spec', 'outputPath'],
    },
  },
  {
    name: 'live_word_edit',
    description: 'Edit the currently open Word document live inside running ReveLith application.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get_info', 'insert_text', 'replace_text', 'add_paragraph', 'apply_style'],
        },
        text: { type: 'string', description: 'Text to insert or replacement text' },
        targetText: { type: 'string', description: 'Target text to replace' },
        style: { type: 'object', description: 'Style to apply' },
      },
      required: ['action'],
    },
  },
  {
    name: 'docs_edit_text',
    description:
      'Edit the open Word document live inside ReveLith (insert text, replace text, add paragraph).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get_info', 'insert_text', 'replace_text', 'add_paragraph', 'apply_style'],
        },
        text: { type: 'string', description: 'Text to insert or replacement text' },
        targetText: { type: 'string', description: 'Target text to replace' },
        style: { type: 'object', description: 'Style to apply' },
      },
      required: ['action'],
    },
  },
  {
    name: 'pdf_read_text',
    description: 'Read text from a PDF document (supports entire document or a specific page).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the PDF file or downloaded URL' },
        page: { type: 'number', description: 'Optional 1-indexed page number' },
      },
      required: ['path'],
    },
  },
  {
    name: 'sheet_set_cells',
    description:
      'Drive the visible Sheets grid in ReveLith: update cell values, formulas, or range selection.',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: 'Target cell or range (e.g. A1, B2:D10)' },
        values: { description: 'Cell value or 2D array of values' },
        sheetId: { type: 'string', description: 'Optional sheet ID' },
        select: { type: 'boolean', description: 'Whether to scroll/select the target range' },
      },
      required: ['range'],
    },
  },
]

export async function handleToolCall(name: string, args: any): Promise<any> {
  switch (name) {
    case 'revelith_info': {
      const res = await checkDocument(args.path)
      return { file: res.file, format: args.path.split('.').pop(), status: 'valid' }
    }
    case 'revelith_check': {
      return await checkDocument(args.path)
    }
    case 'revelith_open': {
      return await openDocumentAt(args.path, {
        slide: args.slide,
        page: args.page,
        range: args.range,
      })
    }
    case 'docs_apply': {
      return await docsApply(args.path, args)
    }
    case 'sheet_apply': {
      return await sheetApply(args.path, args)
    }
    case 'slides_apply': {
      return await slidesApply(args.path, args)
    }
    case 'guided_deck_builder': {
      return await guidedDeckBuilder(args.spec as DeckSpec, args.outputPath)
    }
    case 'pdf_read_text': {
      const { readFileSync } = await import('node:fs')
      const { pdfToText } = await import('@revelith/file-parse')
      const bytes = readFileSync(args.path)
      const fullText = await pdfToText(new Uint8Array(bytes))
      if (typeof args.page === 'number' && args.page > 0) {
        const pages = fullText.split(/\n\n(?=## Page|\n\n)/)
        const targetPage = pages[args.page - 1] ?? fullText
        return {
          file: args.path,
          page: args.page,
          text: targetPage,
        }
      }
      return {
        file: args.path,
        text: fullText,
      }
    }
    case 'docs_edit_text':
    case 'live_word_edit': {
      // Connect to the in-app server if running
      try {
        const resp = await fetch('http://127.0.0.1:3928/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'docs_edit_text',
            params: args,
          }),
        })
        if (resp.ok) {
          return await resp.json()
        }
      } catch {
        return {
          error:
            'ReveLith app is not currently open or in-app live server is offline (http://127.0.0.1:3928/mcp)',
        }
      }
      return { status: 'applied', action: args.action }
    }
    case 'sheet_set_cells': {
      try {
        const resp = await fetch('http://127.0.0.1:3928/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'sheet_set_cells',
            params: args,
          }),
        })
        if (resp.ok) {
          return await resp.json()
        }
      } catch {
        return {
          error:
            'ReveLith app is not currently open or in-app live server is offline (http://127.0.0.1:3928/mcp)',
        }
      }
      return { status: 'applied', range: args.range }
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

/** Run the MCP JSON-RPC stdio server */
export function startMcpServer(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  })

  const send = (resp: JsonRpcResponse) => {
    process.stdout.write(JSON.stringify(resp) + '\n')
  }

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    let req: JsonRpcRequest
    try {
      req = JSON.parse(trimmed)
    } catch {
      send({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      })
      return
    }

    const id = req.id ?? null

    try {
      if (req.method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'revelith-mcp',
              version: '1.1.4',
            },
            capabilities: {
              tools: {},
              resources: {},
            },
          },
        })
      } else if (req.method === 'notifications/initialized') {
        // Notification: no response needed
      } else if (req.method === 'tools/list') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS,
          },
        })
      } else if (req.method === 'tools/call') {
        const { name, arguments: args } = req.params || {}
        const result = await handleToolCall(name, args || {})
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        })
      } else if (req.method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} })
      } else {
        send({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${req.method}`,
          },
        })
      }
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        },
      })
    }
  })
}
