import ReactDOM from 'react-dom/client'
import { htmlLang, type Lang } from '@revelith/i18n'
import { installScreenTips } from '@revelith/ui'

import '@revelith/ui/tokens.css'
import '@revelith/ui/screentip.css'
import '@univerjs/preset-sheets-core/lib/index.css'

import { App } from './App'
import { LocaleProvider, setModuleLang } from './i18n/locale'
import type { UiTheme } from '../shared/desktop-api'
import './styles.css'

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', ({ updates }) => {
    const replacesUniverRuntime = updates.some(
      ({ path }) => path.endsWith('/App.tsx') || path.endsWith('/univer-sync.ts'),
    )
    if (replacesUniverRuntime) window.location.reload()
  })
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing application root.')

installScreenTips()

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

function applyTheme(theme: UiTheme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

async function bootstrap(): Promise<void> {
  let lang: Lang = 'zh'
  let theme: UiTheme = 'system'
  if (!window.desktopApi) {
    ;(window as any).desktopApi = {
      getLanguage: async () => 'en',
      onLanguageChanged: () => () => {},
      getTheme: async () => 'dark',
      onThemeChanged: () => () => {},
      onChromePressed: () => () => {},
      selectWorkbook: async () => null,
      readWorkbookRange: async () => ({ cells: [], rows: [], merges: [], hyperlinks: [], conditionalRules: [], indexedThroughRow: null, indexingComplete: true }),
      readWorkbookFormulas: async () => ({ cells: [], indexingComplete: true, truncated: false }),
      recalcWorkbook: async () => ({ cells: [] }),
      readWorkbookMedia: async () => ({ media: [] }),
      readLocalImage: async () => ({ mediaType: 'image/png', base64: '' }),
      captureScreenSources: async () => ({ status: 'denied', sources: [] }),
      captureScreenSource: async () => null,
      readPivotDefinition: async () => ({ pivotTables: [] }),
      saveWorkbookEdits: async () => ({ ok: true }),
      writeWorkbookRecovery: async () => ({ ok: true }),
      autoRenameWorkbook: async () => ({ renamed: false }),
      exportPdf: async () => ({ canceled: true }),
      closeWorkbook: async () => {},
      openExternal: async () => {},
      onMenuAction: () => () => {},
      onWorkbookRenamed: () => () => {},
      notifyPendingEdits: () => {},
      onCloseSaveRequest: () => () => {},
      reportCloseSaveResult: () => {},
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
      aiChat: async () => ({ ok: true, message: '' }),
      aiStream: async (request: any) => {
        void handleDevAiStream(request)
      },
      aiStreamCancel: async () => {},
      webSearch: async () => ({ results: [], method: 'web' }),
      onAiStream: (listener: (chunk: any) => void) => {
        devStreamListeners.push(listener)
        return () => {
          devStreamListeners = devStreamListeners.filter((l) => l !== listener)
        }
      },
      consumeNewBlankWorkbook: async () => false,
      hasQueuedWorkbook: async () => false,
      pickAttachments: async () => null,
      addAttachmentPaths: async () => ({ accepted: [], rejected: [] }),
      addPastedImage: async () => ({ accepted: [], rejected: [] }),
      readAttachment: async () => ({ ok: true }),
      readAttachmentImage: async () => ({ ok: true }),
      getPathForFile: (file: File) => file.name,
      ipcRenderer: { invoke: async () => {}, on: () => {}, removeListener: () => {} },
    } as any
  }
  if (!(window as any).projectApi) {
    ;(window as any).projectApi = {
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
    }
  }
  try {
    const urlParams = new URLSearchParams(window.location.search)
    const paramTheme = urlParams.get('theme') as UiTheme | null
    ;[lang, theme] = await Promise.all([
      window.desktopApi.getLanguage().catch(() => 'en' as const),
      paramTheme
        ? Promise.resolve(paramTheme)
        : window.desktopApi.getTheme().catch(() => 'system' as const),
    ])
  } catch {
    /* dev renderer without the preload bridge */
  }
  setModuleLang(lang)
  document.documentElement.lang = htmlLang(lang)
  applyTheme(theme)
  window.desktopApi?.onThemeChanged(applyTheme)
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'theme-change' && e.data.theme) {
      applyTheme(e.data.theme as UiTheme)
    }
  })
  ReactDOM.createRoot(root!).render(
    <LocaleProvider initial={lang}>
      <App />
    </LocaleProvider>,
  )
}

void bootstrap()
