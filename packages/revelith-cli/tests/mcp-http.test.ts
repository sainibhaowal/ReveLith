import { describe, expect, it, afterAll, beforeAll } from 'vitest'
import { startMcpHttpServer, type McpHttpServerHandle } from '../src/mcp-http.js'

describe('Streamable HTTP MCP Server', () => {
  let server: McpHttpServerHandle
  const port = 3949
  const token = 'secret-test-token-123'

  beforeAll(async () => {
    server = await startMcpHttpServer({
      port,
      token,
      host: '127.0.0.1',
    })
  })

  afterAll(async () => {
    await server.close()
  })

  it('responds with 401 Unauthorized when token is missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(401)
  })

  it('responds with 200 on health check without token', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.server).toBe('revelith-mcp-http')
  })

  it('authenticates with Bearer token and serves tools/list', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(200)
    const data = (await res.json()) as any
    expect(data.result.tools.some((t: any) => t.name === 'pdf_read_text')).toBe(true)
    expect(data.result.tools.some((t: any) => t.name === 'docs_edit_text')).toBe(true)
    expect(data.result.tools.some((t: any) => t.name === 'sheet_set_cells')).toBe(true)
  })

  it('uploads file via PUT /files/<name> and retrieves via GET /files/<name>', async () => {
    const uploadRes = await fetch(`http://127.0.0.1:${port}/files/test_remote.txt`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: 'Hello from remote MCP client!',
    })
    expect(uploadRes.status).toBe(201)
    const uploadJson = (await uploadRes.json()) as any
    expect(uploadJson.ok).toBe(true)
    expect(uploadJson.url).toContain('/files/test_remote.txt')

    const downloadRes = await fetch(uploadJson.url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    expect(downloadRes.status).toBe(200)
    const text = await downloadRes.text()
    expect(text).toBe('Hello from remote MCP client!')
  })

  it('auto-downloads http URL parameters passed to tools', async () => {
    // 1. Upload a markdown file
    const mdContent = '# Heading\n\nSample document content for tool check.\n'
    const uploadRes = await fetch(`http://127.0.0.1:${port}/files/sample.md`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: mdContent,
    })
    const { url } = (await uploadRes.json()) as any

    // 2. Call revelith_check pointing to the http(s) URL
    const callRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'revelith_check',
          arguments: {
            path: url, // Passing HTTP URL!
          },
        },
      }),
    })
    expect(callRes.status).toBe(200)
    const callJson = (await callRes.json()) as any
    const content = JSON.parse(callJson.result.content[0].text)
    expect(content.passed).toBe(true)
  })
})
