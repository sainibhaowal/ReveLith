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

void (async () => {
  if (!window.pdfApi) {
    const noProject = async () => {
      throw new Error('project store unavailable in browser dev')
    }
    ;(window as Window & { projectApi?: unknown }).projectApi = {
      resolveChat: async ({ tempChatId }: { tempChatId?: string }) => ({
        projectId: 'browser',
        chatId: tempChatId ?? `unsaved-${Date.now()}`,
      }),
      appendChat: async () => {},
      loadChat: async () => [],
      rebindChat: async ({ projectId, newFilePath }: { projectId: string; newFilePath?: string }) => ({
        projectId,
        chatId: newFilePath ?? `unsaved-${Date.now()}`,
      }),
      listProjects: async () => [],
      createProject: noProject,
      renameProject: noProject,
      deleteProject: noProject,
      moveFile: noProject,
      getTimeline: async () => [],
    }
    window.pdfApi = {
      getLanguage: async () => 'en',
      onLanguageChanged: () => () => {},
      getTheme: async () => 'dark',
      onThemeChanged: () => () => {},
      consumePending: async () => null,
      readFile: async () => null,
      save: async () => ({ ok: true }),
      validateTextEdits: async () => [],
      listEditFonts: async () => [],
      listPageImages: async () => [],
      listStaticFormFills: async () => [],
      pageImagePng: async () => null,
      pagePreviewPng: async () => null,
      extractPages: async () => null,
      insertPdf: async () => null,
      exportImages: async () => null,
      insertBlankPage: async () => ({ ok: false, error: 'unavailable in browser dev' }),
      setPageSize: async () => ({ ok: false, error: 'unavailable in browser dev' }),
      cropPages: async () => ({ ok: false, error: 'unavailable in browser dev' }),
      replacePages: async () => ({ ok: false, error: 'unavailable in browser dev' }),
      createDocument: async () => ({ ok: false, error: 'unavailable in browser dev' }),
      webSearch: async () => ({ results: [], method: 'web' }),
      imageSearch: async () => [],
      fetchImage: async () => null,
      generateImage: async () => null,
      setDirty: () => {},
      onCloseSaveRequest: () => () => {},
      sendCloseSaveResult: () => {},
      onSaveAsRequest: () => () => {},
      sendSaveAsResult: () => {},
      onSaveAsFlow: () => () => {},
      getAiSettings: async () => ({ provider: 'custom', providers: {} }),
      aiStream: async () => {},
      aiStreamCancel: async () => {},
      onAiStream: () => () => {},
      getPathForFile: (file: File) => file.name,
      ipcRenderer: { invoke: async () => {}, on: () => {}, removeListener: () => {} },
    } as any
  }
  const urlParams = new URLSearchParams(window.location.search)
  const paramTheme = urlParams.get('theme') as UiTheme | null
  const [lang, theme] = await Promise.all([
    window.pdfApi.getLanguage().catch(() => 'en' as const),
    paramTheme
      ? Promise.resolve(paramTheme)
      : window.pdfApi.getTheme().catch(() => 'system' as const),
  ])
  document.documentElement.lang = htmlLang(lang as Lang)
  applyTheme(theme)
  window.pdfApi.onThemeChanged(applyTheme)
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
