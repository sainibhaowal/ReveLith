import { createRoot } from 'react-dom/client'
import { htmlLang, type Lang } from '@revelith/i18n'
import App from './App'
import { LocaleProvider } from './i18n/locale'
import type { UiTheme } from '../shared/ipc'
import '@revelith/ui/tokens.css'
import '@revelith/ui/screentip.css'
import './styles.css'
import { installScreenTips } from '@revelith/ui'

installScreenTips()

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
          const dataStr = line.slice(6).trim()
          if (dataStr === '[DONE]') break
          try {
            const parsed = JSON.parse(dataStr)
            dispatchDevStreamChunk(parsed)
          } catch {}
        }
      }
    }
  } catch (err: any) {
    dispatchDevStreamChunk({ type: 'error', error: err?.message || 'AI streaming error' })
  }
}

void (async () => {
  if (!window.markdownApi) {
    window.markdownApi = {
      getLanguage: async () => 'en',
      onLanguageChanged: () => () => {},
      getTheme: async () => 'dark',
      onThemeChanged: () => () => {},
      consumePending: async () => null,
      readFile: async () => null,
      save: async () => ({ ok: true }),
      setDirty: () => {},
      onSaveRequest: () => () => {},
      onCloseSaveRequest: () => () => {},
      sendCloseSaveResult: () => {},
      sendSaveRequestAck: () => {},
      onFileRenamed: () => () => {},
      pickImage: async () => null,
      saveImage: async () => null,
      readImage: async () => null,
      onExportRequest: () => () => {},
      exportDocx: async () => null,
      exportPdf: async () => null,
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
      aiStream: async (request: any) => {
        void handleDevAiStream(request)
      },
      aiStreamCancel: async () => {},
      onAiStream: (listener: (chunk: any) => void) => {
        devStreamListeners.push(listener)
        return () => {
          devStreamListeners = devStreamListeners.filter((l) => l !== listener)
        }
      },
      webSearch: async () => [],
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
  const urlParams = new URLSearchParams(window.location.search)
  const paramTheme = urlParams.get('theme') as UiTheme | null
  const [lang, theme] = await Promise.all([
    window.markdownApi.getLanguage().catch(() => 'en' as const),
    paramTheme
      ? Promise.resolve(paramTheme)
      : window.markdownApi.getTheme().catch(() => 'system' as const),
  ])
  document.documentElement.lang = htmlLang(lang as Lang)
  applyTheme(theme)
  window.markdownApi.onThemeChanged(applyTheme)
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
})()
