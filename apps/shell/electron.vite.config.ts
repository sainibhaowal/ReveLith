import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

function liveModelProxyPlugin() {
  return {
    name: 'live-model-proxy',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/api/proxy-stream') && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: any) => {
            body += chunk
          })
          req.on('end', async () => {
            let request: any = null
            try {
              request = JSON.parse(body)
              const { streamForProvider } = await server.ssrLoadModule(
                resolve(__dirname, '../../packages/ai-provider/src/index.ts'),
              )
              const { requestId, settings, system, messages } = request
              const tools = request.tools ?? []
              const maxTokens = request.maxTokens ?? 8192
              const provider = settings?.provider || 'ollama'
              let config = settings?.providers?.[provider] || {}
              if (
                !config.apiKey &&
                (provider === 'lmstudio' ||
                  provider === 'ollama' ||
                  provider === 'custom')
              ) {
                config = { ...config, apiKey: 'local-key' }
              }

              // Smart endpoint fallback for local AI
              if (provider === 'lmstudio' || provider === 'ollama') {
                const targetUrl = (
                  config.baseUrl ||
                  (provider === 'lmstudio'
                    ? 'http://127.0.0.1:1234/v1'
                    : 'http://127.0.0.1:11434/v1')
                ).replace(/\/$/, '')

                const isTargetOk = await fetch(`${targetUrl}/models`, { signal: AbortSignal.timeout(800) })
                  .then((r) => r.ok)
                  .catch(() => false)

                if (!isTargetOk) {
                  const lmOk = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(800) })
                    .then((r) => r.ok)
                    .catch(() => false)
                  if (lmOk) {
                    let liveModel = config.model
                    if (!liveModel || liveModel === 'local-model') {
                      const modelsJson = await fetch('http://127.0.0.1:1234/v1/models')
                        .then((r) => r.json())
                        .catch(() => null)
                      liveModel = modelsJson?.data?.[0]?.id || 'google/gemma-4-e4b'
                    }
                    config = { ...config, baseUrl: 'http://127.0.0.1:1234/v1', model: liveModel }
                  } else {
                    const ollamaOk = await fetch('http://127.0.0.1:11434/v1/models', { signal: AbortSignal.timeout(800) })
                      .then((r) => r.ok)
                      .catch(() => false)
                    if (ollamaOk) {
                      config = { ...config, baseUrl: 'http://127.0.0.1:11434/v1', model: config.model || 'llama3.2' }
                    }
                  }
                }
              }

              res.setHeader('Content-Type', 'text/event-stream')
              res.setHeader('Cache-Control', 'no-cache')
              res.setHeader('Connection', 'keep-alive')
              res.setHeader('Access-Control-Allow-Origin', '*')

              const send = (chunk: any) => {
                res.write(`data: ${JSON.stringify(chunk)}\n\n`)
              }

              const formattedMessages = (messages || []).map((m: any) => ({
                role: m.role || m.type || 'user',
                text: m.text || m.content || m.message || '',
                images: m.images,
                toolCalls: m.toolCalls,
                results: m.results,
              }))

              const controller = new AbortController()
              let stopReason: string | undefined
              await streamForProvider(provider, config, system || '', formattedMessages, tools, maxTokens, {
                signal: controller.signal,
                onDelta: (text: string) => send({ requestId, type: 'delta', text }),
                onToolCall: (toolCall: any) => send({ requestId, type: 'tool-call', toolCall }),
                onActivity: () => send({ requestId, type: 'ping' }),
                onStopReason: (reason?: string) => {
                  stopReason = reason
                },
              })
              send({ requestId, type: 'done', stopReason })
              res.end()
            } catch (err: any) {
              if (!res.headersSent) {
                res.setHeader('Content-Type', 'text/event-stream')
                res.setHeader('Access-Control-Allow-Origin', '*')
              }
              res.write(
                `data: ${JSON.stringify({ requestId: request?.requestId, type: 'error', error: err?.message || String(err) })}\n\n`,
              )
              res.end()
            }
          })
          return
        }

        if (!req.url || !req.url.startsWith('/api/proxy-models')) {
          return next()
        }
        try {
          const urlObj = new URL(req.url, 'http://localhost:5199')
          const target = urlObj.searchParams.get('target')
          const apiKey = urlObj.searchParams.get('apiKey')
          const provider = urlObj.searchParams.get('provider') || ''

          if (!target) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(JSON.stringify({ error: 'Missing target parameter' }))
            return
          }

          const cleanTarget = target.replace(/\/$/, '')
          const rootTarget = cleanTarget.replace(/\/v1$/, '')

          // Handle Anthropic / Claude
          if (provider === 'anthropic' || cleanTarget.includes('anthropic.com')) {
            try {
              const anthropicResp = await fetch('https://api.anthropic.com/v1/models', {
                headers: {
                  'x-api-key': apiKey || '',
                  'anthropic-version': '2023-06-01',
                  Accept: 'application/json',
                },
              }).catch(() => null)

              if (anthropicResp && anthropicResp.ok) {
                const data = await anthropicResp.json().catch(() => null)
                res.setHeader('Content-Type', 'application/json')
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.end(JSON.stringify(data || { data: [] }))
                return
              } else if (anthropicResp && anthropicResp.status === 401) {
                res.statusCode = 401
                res.setHeader('Content-Type', 'application/json')
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.end(JSON.stringify({ error: 'Invalid Anthropic API Key' }))
                return
              }
            } catch {}

            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(
              JSON.stringify({
                data: [
                  { id: 'claude-3-7-sonnet-20250219' },
                  { id: 'claude-3-5-sonnet-20241022' },
                  { id: 'claude-3-5-haiku-20241022' },
                  { id: 'claude-3-opus-20240229' },
                ],
              }),
            )
            return
          }

          // Handle Google Gemini
          if (provider === 'gemini' || cleanTarget.includes('googleapis.com')) {
            try {
              const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey || '')}`
              const geminiResp = await fetch(geminiUrl).catch(() => null)
              if (geminiResp && geminiResp.ok) {
                const data = await geminiResp.json().catch(() => null)
                res.setHeader('Content-Type', 'application/json')
                res.setHeader('Access-Control-Allow-Origin', '*')
                res.end(JSON.stringify(data || { models: [] }))
                return
              }
            } catch {}
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(
              JSON.stringify({
                models: [
                  { name: 'models/gemini-2.5-flash' },
                  { name: 'models/gemini-2.5-pro' },
                  { name: 'models/gemini-2.0-flash' },
                ],
              }),
            )
            return
          }

          const headers: Record<string, string> = { Accept: 'application/json' }
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

          const candidateUrls = [
            `${cleanTarget}/models`,
            `${rootTarget}/v1/models`,
            `${rootTarget}/api/tags`,
            `${cleanTarget}/tags`,
            cleanTarget.includes('localhost')
              ? cleanTarget.replace('localhost', '127.0.0.1') + '/models'
              : null,
            cleanTarget.includes('127.0.0.1')
              ? cleanTarget.replace('127.0.0.1', 'localhost') + '/models'
              : null,
            cleanTarget.includes('localhost')
              ? cleanTarget.replace('localhost', '127.0.0.1') + '/api/tags'
              : null,
            cleanTarget.includes('127.0.0.1')
              ? cleanTarget.replace('127.0.0.1', 'localhost') + '/api/tags'
              : null,
          ].filter(Boolean) as string[]

          let data: any = null
          for (const cUrl of candidateUrls) {
            try {
              const resp = await fetch(cUrl, { headers, signal: AbortSignal.timeout(3000) }).catch(() => null)
              if (resp && resp.ok) {
                data = await resp.json().catch(() => null)
                if (data) break
              }
            } catch {}
          }

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          if (data) {
            res.end(JSON.stringify(data))
          } else {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'Endpoint unreachable' }))
          }
        } catch (e: any) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ error: e?.message || 'Proxy error' }))
        }
      })

      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url || !req.url.startsWith('/api/proxy-image')) {
          return next()
        }
        try {
          const urlObj = new URL(req.url, 'http://localhost:5199')
          const imgUrl = urlObj.searchParams.get('url')
          if (!imgUrl) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Missing url parameter' }))
            return
          }
          const resp = await fetch(imgUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
          }).catch(() => null)

          if (!resp || !resp.ok) {
            res.statusCode = resp?.status || 500
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(JSON.stringify({ error: `Image fetch failed: HTTP ${resp?.status || 500}` }))
            return
          }
          const mime = resp.headers.get('content-type') || 'image/png'
          const arrayBuffer = await resp.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ mime, base64 }))
        } catch (e: any) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ error: e?.message || 'Proxy error' }))
        }
      })
    },
  }
}

export default defineConfig({
  // Bundle everything into the shell main (same policy as apps/docs): the
  // imported docs/sheets main modules are TS source with no build artifacts,
  // so externalizing them would break Node ESM resolution at runtime.
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          // dedicated preload for the auto-update window
          update: resolve(__dirname, 'src/preload/update.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react(), liveModelProxyPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // strong-guidance update window (see src/main/update-window.ts)
          update: resolve(__dirname, 'src/renderer/update.html'),
        },
      },
    },
    server: {
      port: Number(process.env.SHELL_DEV_PORT) || 5199,
      strictPort: Boolean(process.env.SHELL_DEV_PORT),
    },
  },
})
