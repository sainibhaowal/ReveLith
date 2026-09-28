import { describe, expect, it } from 'vitest'
import { checkDocument, formatError, openDocumentAt, guidedDeckBuilder } from '../src/commands.js'
import { MCP_TOOLS, handleToolCall } from '../src/mcp.js'
import { startMcpHttpServer } from '../src/mcp-http.js'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('@revelith/cli core commands', () => {
  it('formatError produces human-readable and structured json errors', () => {
    const err = new Error('Test failure')
    ;(err as any).code = 'ERR_TEST'

    const human = formatError(err, false)
    expect(human).toContain('ERR_TEST')
    expect(human).toContain('Test failure')

    const jsonStr = formatError(err, true)
    const parsed = JSON.parse(jsonStr)
    expect(parsed.error).toBe(true)
    expect(parsed.code).toBe('ERR_TEST')
    expect(parsed.message).toBe('Test failure')
  })

  it('checkDocument detects quality issues in documents', async () => {
    const tmp = join(tmpdir(), 'test_check.md')
    writeFileSync(tmp, '# Title\n\n[Broken Link]()\n', 'utf-8')
    try {
      const rep = await checkDocument(tmp)
      expect(rep.file).toBe(tmp)
      expect(rep.issues.some((i) => i.code === 'MD_EMPTY_LINK')).toBe(true)
    } finally {
      unlinkSync(tmp)
    }
  })

  it('openDocumentAt parses slide, range, and page targets', async () => {
    const tmp = join(tmpdir(), 'test_open.pptx')
    writeFileSync(tmp, 'dummy content', 'utf-8')
    try {
      const resSlide = await openDocumentAt(tmp, { slide: 3 })
      expect(resSlide.ok).toBe(true)
      expect(resSlide.target).toBe('slide 3')

      const resRange = await openDocumentAt(tmp, { range: 'B2:E10' })
      expect(resRange.ok).toBe(true)
      expect(resRange.target).toBe('range B2:E10')

      const resPage = await openDocumentAt(tmp, { page: 5 })
      expect(resPage.ok).toBe(true)
      expect(resPage.target).toBe('page 5')
    } finally {
      unlinkSync(tmp)
    }
  })

  it('MCP_TOOLS exposes required tools for AI agents', () => {
    const names = MCP_TOOLS.map((t) => t.name)
    expect(names).toContain('revelith_info')
    expect(names).toContain('revelith_check')
    expect(names).toContain('revelith_open')
    expect(names).toContain('docs_apply')
    expect(names).toContain('sheet_apply')
    expect(names).toContain('slides_apply')
    expect(names).toContain('guided_deck_builder')
    expect(names).toContain('live_word_edit')
    expect(names).toContain('docs_edit_text')
    expect(names).toContain('pdf_read_text')
    expect(names).toContain('sheet_set_cells')
  })

  it('guidedDeckBuilder produces deck specification', async () => {
    const tmp = join(tmpdir(), 'pitch_deck.pptx')
    const res = await guidedDeckBuilder(
      {
        title: 'Renewable Energy Trends',
        slides: [
          { title: 'Overview', layout: 'title' },
          {
            title: 'Solar Capacity Growth',
            layout: 'bullet_points',
            bulletPoints: ['30% YoY', 'Falling costs'],
          },
        ],
      },
      tmp,
    )
    expect(res.ok).toBe(true)
    expect(res.slideCount).toBe(2)
  })

  it('handleToolCall executes MCP tools', async () => {
    const tmp = join(tmpdir(), 'tool_test.md')
    writeFileSync(tmp, '# Test Doc\n', 'utf-8')
    try {
      const info = await handleToolCall('revelith_info', { path: tmp })
      expect(info.status).toBe('valid')

      const editRes = await handleToolCall('docs_edit_text', {
        action: 'insert_text',
        text: 'Hello',
      })
      expect(editRes).toBeDefined()

      const sheetRes = await handleToolCall('sheet_set_cells', { range: 'A1', values: 'Test' })
      expect(sheetRes).toBeDefined()
    } finally {
      unlinkSync(tmp)
    }
  })
})

describe('MCP over HTTP server', () => {
  it('starts and serves health check', async () => {
    const server = await startMcpHttpServer({ port: 0 })
    try {
      const res = await fetch(`http://localhost:${server.port}/health`)
      expect(res.ok).toBe(true)
      const data = (await res.json()) as { status: string; server: string }
      expect(data.status).toBe('ok')
      expect(data.server).toBe('revelith-mcp-http')
    } finally {
      await server.close()
    }
  })

  it('serves tools/list via POST /mcp', async () => {
    const server = await startMcpHttpServer({ port: 0 })
    try {
      const res = await fetch(`http://localhost:${server.port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      })
      expect(res.ok).toBe(true)
      const data = (await res.json()) as { result: { tools: { name: string }[] } }
      expect(Array.isArray(data.result.tools)).toBe(true)
      expect(data.result.tools.some((t) => t.name === 'pdf_read_text')).toBe(true)
      expect(data.result.tools.some((t) => t.name === 'docs_edit_text')).toBe(true)
      expect(data.result.tools.some((t) => t.name === 'sheet_set_cells')).toBe(true)
    } finally {
      await server.close()
    }
  })

  it('handles initialize handshake', async () => {
    const server = await startMcpHttpServer({ port: 0 })
    try {
      const res = await fetch(`http://localhost:${server.port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      })
      expect(res.ok).toBe(true)
      const data = (await res.json()) as { result: { protocolVersion: string } }
      expect(data.result.protocolVersion).toBe('2024-11-05')
    } finally {
      await server.close()
    }
  })

  it('rejects unauthorized requests when token is set', async () => {
    const server = await startMcpHttpServer({ port: 0, token: 'secret-tok' })
    try {
      const res = await fetch(`http://localhost:${server.port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      })
      expect(res.status).toBe(401)
    } finally {
      await server.close()
    }
  })

  it('accepts authorized requests with bearer token', async () => {
    const token = 'my-secret-token'
    const server = await startMcpHttpServer({ port: 0, token })
    try {
      const res = await fetch(`http://localhost:${server.port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      })
      expect(res.ok).toBe(true)
      const data = (await res.json()) as { result: { tools: unknown[] } }
      expect(Array.isArray(data.result.tools)).toBe(true)
    } finally {
      await server.close()
    }
  })

  it('PUT /files/<name> uploads a file and returns download URL', async () => {
    const server = await startMcpHttpServer({ port: 0 })
    try {
      const content = 'Hello MCP HTTP upload!'
      const res = await fetch(`http://localhost:${server.port}/files/test-upload.txt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: content,
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { ok: boolean; url: string; name: string }
      expect(data.ok).toBe(true)
      expect(data.name).toBe('test-upload.txt')
      expect(data.url).toContain('/files/test-upload.txt')

      // Verify file is downloadable
      const dlRes = await fetch(data.url)
      expect(dlRes.ok).toBe(true)
      const text = await dlRes.text()
      expect(text).toBe(content)
    } finally {
      await server.close()
    }
  })

  it('GET /files/<name> returns 404 for missing file', async () => {
    const server = await startMcpHttpServer({ port: 0 })
    try {
      const res = await fetch(`http://localhost:${server.port}/files/nonexistent.txt`)
      expect(res.status).toBe(404)
    } finally {
      await server.close()
    }
  })
})
