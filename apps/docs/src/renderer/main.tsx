import { createRoot } from 'react-dom/client'
import { htmlLang, type Lang } from '@revelith/i18n'
import { App } from './App'
import { LocaleProvider, setModuleLang } from './i18n/locale'
import type { UiTheme } from '../shared/ipc'
import '@revelith/ui/tokens.css'
import './styles.css'
import './fonts/fonts.css'

function applyTheme(theme: UiTheme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

let devStreamListeners: Array<(chunk: any) => void> = []

function dispatchDevStreamChunk(chunk: any) {
  devStreamListeners.forEach((fn) => fn(chunk))
}

async function handleDevAiStream(request: any) {
  let settings = request.settings
  if (!settings) {
    try {
      const stored =
        localStorage.getItem('revelith.aiSettings') ||
        window.parent?.localStorage?.getItem?.('revelith.aiSettings')
      if (stored) settings = JSON.parse(stored)
    } catch {}
  }
  if (!settings) {
    settings = {
      provider: 'lmstudio',
      providers: {
        lmstudio: { apiKey: '', model: 'google/gemma-4-e4b', baseUrl: 'http://127.0.0.1:1234/v1' },
        ollama: { apiKey: '', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434/v1' },
      },
    }
  }

  const payload = { ...request, settings }
  try {
    const response = await fetch('http://localhost:5199/api/proxy-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.body) return
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const chunk = JSON.parse(line.slice(6))
            dispatchDevStreamChunk(chunk)
          } catch {}
        }
      }
    }
  } catch (err: any) {
    dispatchDevStreamChunk({
      requestId: request.requestId,
      type: 'error',
      error: err?.message || String(err),
    })
  }
}

async function bootstrap(): Promise<void> {
  let lang: Lang = 'zh'
  let theme: UiTheme = 'system'
  if (!window.desktop) {
    window.desktop = {
      getLanguage: async () => 'en',
      onLanguageChanged: () => () => {},
      getTheme: async () => 'dark',
      onThemeChanged: () => () => {},
      openDocx: async () => null,
      openDocxPath: async () => null,
      consumePendingOpenDocx: async () => null,
      consumeNewBlankDoc: async () => false,
      onOpenDocx: () => () => {},
      onRenamedDocx: () => () => {},
      saveDocx: async () => ({ ok: true }),
      writeRecoveryCopy: async () => {},
      onTeardown: () => () => {},
      saveDocxAs: async (name: string) => ({ ok: true, path: `/mock/${name || 'Document.docx'}` }),
      saveDocxNew: async (name: string) => ({ ok: true, path: `/mock/${name || 'Document.docx'}` }),
      getRecentFiles: async () => [],
      pickImage: async () => null,
      fontMetrics: async () => null,
      print: async () => {},
      exportPdf: async () => null,
      printPdfBuffer: async () => null,
      saveMergedPdf: async () => null,
      getAiSettings: async () => {
        const stored = localStorage.getItem('revelith.aiSettings')
        if (stored) {
          try { return JSON.parse(stored) } catch {}
        }
        return {
          providers: {
            lmstudio: { apiKey: '', model: 'local-model', baseUrl: 'http://localhost:1234/v1' },
            ollama: { apiKey: '', model: 'llama3.2', baseUrl: 'http://localhost:11434/v1' },
          },
        }
      },
      setAiSettings: async (settings: any) => {
        localStorage.setItem('revelith.aiSettings', JSON.stringify(settings))
      },
      aiChat: async () => ({ content: '' }),
      aiStream: async (request: any) => {
        void handleDevAiStream(request)
      },
      aiStreamCancel: async () => {},
      webSearch: async (query: string, maxResults = 6) => {
        try {
          const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`
          const resp = await fetch(searchUrl)
          if (resp.ok) {
            const data = await resp.json()
            const searchItems = data.query?.search || []
            const results = searchItems.slice(0, maxResults).map((item: any) => ({
              title: item.title,
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
              snippet: (item.snippet || '').replace(/<[^>]*>/g, ''),
            }))
            return { results, method: 'web' }
          }
        } catch {}
        return {
          results: [
            {
              title: `Search results for: ${query}`,
              url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
              snippet: `Live search results for "${query}".`,
            },
          ],
          method: 'web',
        }
      },
      imageSearch: async (query: string, maxResults = 8) => {
        try {
          const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${maxResults}&prop=pageimages&piprop=thumbnail&pithumbsize=600&format=json&origin=*`
          const resp = await fetch(searchUrl)
          if (resp.ok) {
            const data = await resp.json()
            const pages = data.query?.pages || {}
            const images = Object.values(pages)
              .filter((p: any) => p.thumbnail?.source)
              .map((p: any) => ({
                title: p.title,
                imageUrl: p.thumbnail.source,
                width: p.thumbnail.width,
                height: p.thumbnail.height,
              }))
            if (images.length > 0) return { images, method: 'web' }
          }
        } catch {}
        return { images: [], method: 'web' }
      },
      fetchImage: async (url: string) => {
        try {
          // 1. Dev proxy endpoint (bypasses CORS)
          const proxyUrl = `http://localhost:5199/api/proxy-image?url=${encodeURIComponent(url)}`
          const proxyResp = await fetch(proxyUrl).catch(() => null)
          if (proxyResp && proxyResp.ok) {
            const data = await proxyResp.json().catch(() => null)
            if (data && data.base64) {
              return { mime: data.mime || 'image/png', base64: data.base64 }
            }
          }

          // 2. Direct fetch fallback
          const resp = await fetch(url, { mode: 'cors' }).catch(() => null)
          if (resp && resp.ok) {
            const blob = await resp.blob()
            const mime = blob.type || 'image/png'
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => {
                const res = reader.result as string
                const b64 = res.split(',')[1] || ''
                resolve(b64)
              }
              reader.onerror = reject
              reader.readAsDataURL(blob)
            })
            return { mime, base64 }
          }
        } catch {}
        const label = (url || 'image').slice(0, 35)
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="#2a2a2a"/><text x="50%" y="50%" fill="#888888" font-family="sans-serif" font-size="20" text-anchor="middle">Image: ${label}</text></svg>`
        const base64 = btoa(unescape(encodeURIComponent(svg)))
        return { mime: 'image/svg+xml', base64 }
      },
      pickAttachments: async () => [],
      addAttachmentPaths: async () => [],
      addPastedImage: async () => null,
      readAttachment: async () => '',
      readAttachmentImage: async () => null,
      getPathForFile: (file: File) => file.name,
      openNewTab: async () => {},
      listDocsTabs: async () => [],
      focusDocsTab: async () => {},
      onAiStream: (listener: (chunk: any) => void) => {
        devStreamListeners.push(listener)
        return () => {
          devStreamListeners = devStreamListeners.filter((l) => l !== listener)
        }
      },
      onMenuCommand: () => () => {},
      onCloseCheck: () => () => {},
      reportViewMenuState: () => {},
      reportCloseCheck: () => {},
      onCloseSaveRequest: () => () => {},
      reportCloseSaveResult: () => {},
      ipcRenderer: { invoke: async () => {}, on: () => {}, removeListener: () => {} },
    } as any
  }
  if (!window.projectApi) {
    window.projectApi = {
      resolveChat: async () => null,
      appendChat: async () => {},
      loadChat: async () => [],
      rebindChat: async () => {},
      listProjects: async () => [],
      createProject: async () => ({ id: '1', name: 'Demo', fileCount: 0, updatedAt: Date.now() }),
      renameProject: async () => {},
      deleteProject: async () => {},
      moveFile: async () => {},
      getTimeline: async () => [],
    } as any
  }
  try {
    const urlParams = new URLSearchParams(window.location.search)
    const paramTheme = urlParams.get('theme') as UiTheme | null
    ;[lang, theme] = await Promise.all([
      window.desktop.getLanguage().catch(() => 'en' as const),
      paramTheme
        ? Promise.resolve(paramTheme)
        : window.desktop.getTheme().catch(() => 'system' as const),
    ])
  } catch {
    /* dev renderer without the preload bridge */
  }
  setModuleLang(lang)
  document.documentElement.lang = htmlLang(lang)
  applyTheme(theme)
  window.desktop?.onThemeChanged(applyTheme)
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'theme-change' && e.data.theme) {
      applyTheme(e.data.theme as UiTheme)
    }
  })
  createRoot(document.getElementById('root')!).render(
    <LocaleProvider initial={lang}>
      <App />
    </LocaleProvider>,
  )
}

void bootstrap()
