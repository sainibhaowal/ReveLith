import React from 'react'
import { createRoot } from 'react-dom/client'
import { htmlLang } from '@revelith/i18n'
import { AppFrame } from './AppFrame'
import { LocaleProvider } from './locale'
import '@revelith/ui/tokens.css'
import '@revelith/ui/screentip.css'
import './home.css'
import './tabbar.css'
import { installScreenTips } from '@revelith/ui'

installScreenTips()

// macOS shell window is created with vibrancy; a transparent body lets the
// editor views' translucent regions (e.g. slides thumbnail pane) show it
if (navigator.platform.toLowerCase().includes('mac')) document.body.classList.add('vib')

let mockTabs: Array<{ id: string; title: string; kind: string; active: boolean; closable: boolean }> = [
  { id: 'home', title: 'ReveLith', kind: 'home', active: true, closable: false },
]
let mockTabListeners: Array<(tabs: typeof mockTabs) => void> = []

function updateMockTabs(next: typeof mockTabs) {
  mockTabs = next
  mockTabListeners.forEach((fn) => fn([...mockTabs]))
}

function openMockTab(kind: string, title: string) {
  const id = `${kind}-${Date.now()}`
  const next = mockTabs.map((t) => ({ ...t, active: false }))
  next.push({ id, title, kind, active: true, closable: true })
  updateMockTabs(next)
}

// Browser-fallback mock so the UI renders in standard web browsers (Chrome/Brave/Edge) outside Electron
if (!window.aiOffice) {
  window.aiOffice = {
    getLanguage: async () => 'en',
    onboardingSeen: async () => true,
    getTheme: async () => {
      const stored = localStorage.getItem('revelith.theme')
      return (stored as any) || 'system'
    },
    setTheme: async (th: any) => {
      localStorage.setItem('revelith.theme', th)
    },
    onThemeChanged: () => () => {},
    recents: async () => ({ entries: [], total: 0, totalAll: 0 }),
    starred: async () => ({ entries: [], total: 0, totalAll: 0 }),
    statPaths: async () => [],
    toggleStar: async () => {},
    openPath: async () => openMockTab('docs', 'Document'),
    browse: async () => openMockTab('docs', 'Document'),
    newDoc: async () => openMockTab('docs', 'Untitled Document'),
    newSheet: async () => openMockTab('sheets', 'Untitled Spreadsheet'),
    newSlide: async () => openMockTab('slides', 'Untitled Presentation'),
    newMarkdown: async () => openMockTab('markdown', 'Untitled Markdown'),
    removeRecent: async () => {},
    revealPath: async () => {},
    renameFile: async () => ({ ok: true }),
    duplicateFile: async () => {},
    deleteFiles: async () => {},
    openTrash: async () => {},
    setLanguage: async () => {},
    getUpdateChannel: async () => 'stable',
    setUpdateChannel: async () => {},
    getAppVersion: async () => '1.1.4',
    getAiSettings: async () => {
      const stored = localStorage.getItem('revelith.aiSettings')
      if (stored) {
        try { return JSON.parse(stored) } catch {}
      }
      return {
        provider: 'ollama',
        providers: {
          ollama: { apiKey: '', model: 'llama3.2', baseUrl: 'http://localhost:11434/v1' },
          lmstudio: { apiKey: '', model: 'local-model', baseUrl: 'http://localhost:1234/v1' },
          openai: { apiKey: '', model: 'gpt-4o-mini' },
          anthropic: { apiKey: '', model: 'claude-sonnet-4-6' },
          gemini: { apiKey: '', model: 'gemini-2.5-flash' },
          deepseek: { apiKey: '', model: 'deepseek-chat' },
          custom: { apiKey: '', model: '', baseUrl: 'http://localhost:8080/v1' }
        }
      }
    },
    setAiSettings: async (settings: any) => {
      localStorage.setItem('revelith.aiSettings', JSON.stringify(settings))
    },
    setOnboardingSeen: async () => {},
    getDefaultSaveDir: async () => '',
    pickDefaultSaveDir: async () => null,
    openCommunity: async () => {},
  } as any
}

if (!window.aiOfficeProject) {
  window.aiOfficeProject = {
    listProjects: async () => [],
    listFiles: async () => [],
    createProject: async () => ({ id: '1', name: 'Demo Project', fileCount: 0, updatedAt: Date.now() }),
    renameProject: async () => {},
    deleteProject: async () => {},
    moveFile: async () => {},
    getTimeline: async () => [],
  } as any
}

if (!window.aiOfficeTabs) {
  window.aiOfficeTabs = {
    list: async () => [...mockTabs],
    activate: async (id: string) => {
      updateMockTabs(mockTabs.map((t) => ({ ...t, active: t.id === id })))
    },
    close: async (id: string) => {
      if (id === 'home') return
      let next = mockTabs.filter((t) => t.id !== id)
      if (!next.some((t) => t.active) && next.length > 0) {
        next[0].active = true
      }
      updateMockTabs(next)
    },
    reorder: async () => {},
    onChanged: (handler: (tabs: typeof mockTabs) => void) => {
      mockTabListeners.push(handler)
      return () => {
        mockTabListeners = mockTabListeners.filter((l) => l !== handler)
      }
    },
    notifyChromePressed: () => {},
  } as any
}

// resolve the persisted language, first-run flag, and theme before first paint
// so the UI never flashes (home showing briefly before the onboarding overlay)
void Promise.all([
  window.aiOffice.getLanguage().catch(() => 'en' as const),
  // if the flag is unreadable, skip onboarding rather than block the home screen
  window.aiOffice.onboardingSeen().catch(() => true),
  window.aiOffice.getTheme().catch(() => 'system' as const),
]).then(([lang, onboardingSeen, theme]) => {
  document.documentElement.lang = htmlLang(lang)
  // apply theme attribute before first paint to avoid flash
  if (theme !== 'system') {
    document.documentElement.setAttribute('data-theme', theme)
  }
  window.aiOffice.onThemeChanged((next) => {
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
  })
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <LocaleProvider initial={lang}>
        <AppFrame initialOnboardingSeen={onboardingSeen} />
      </LocaleProvider>
    </React.StrictMode>,
  )
})
