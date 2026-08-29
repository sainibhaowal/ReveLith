import React from 'react'
import { createRoot } from 'react-dom/client'
import { htmlLang, type Lang } from '@revelith/i18n'
import { App } from './App'
import { AudienceView } from './components/AudienceView'
import { LocaleProvider, setModuleLang } from './i18n/locale'
import type { UiTheme } from '../shared/ipc'
import '@revelith/ui/tokens.css'
import '@revelith/ui/screentip.css'
import './styles.css'
import { installScreenTips } from '@revelith/ui'

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

// ?mode=audience: the presenter view's external-screen audience show window (created by the main process)
const mode = new URLSearchParams(window.location.search).get('mode')

// macOS windows are created with vibrancy; let the thumbnail pane show it
// (the audience show window stays fully opaque)
if (mode !== 'audience' && navigator.platform.toLowerCase().includes('mac'))
  document.body.classList.add('vib')

function applyTheme(theme: UiTheme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

async function bootstrap(): Promise<void> {
  let lang: Lang = 'zh'
  let theme: UiTheme = 'system'
  if (!window.slidesApi) {
    window.slidesApi = {
      getLanguage: async () => 'en',
      onLanguageChanged: () => () => {},
      getTheme: async () => 'dark',
      onThemeChanged: () => () => {},
      openPptx: async () => null,
      openPptxPath: async () => null,
      consumePendingOpen: async () => null,
      newBlank: async () => ({
        path: '',
        slides: [
          {
            widthPx: 960,
            heightPx: 540,
            scale: 1,
            background: { kind: 'solid', color: '#1e1e1e' },
            nodes: [
              {
                id: 'shape-title',
                sourceId: 'shape-title',
                type: 'shape',
                shapeKind: 'rect',
                box: { left: 100, top: 150, width: 760, height: 100, rotation: 0 },
                text: {
                  paragraphs: [
                    {
                      align: 'center',
                      runs: [
                        {
                          text: 'Untitled Presentation',
                          fontBold: true,
                          fontSizePt: 36,
                          colorRgb: 'FFFFFF',
                        },
                      ],
                    },
                  ],
                },
              } as any,
              {
                id: 'shape-subtitle',
                sourceId: 'shape-subtitle',
                type: 'shape',
                shapeKind: 'rect',
                box: { left: 100, top: 270, width: 760, height: 60, rotation: 0 },
                text: {
                  paragraphs: [
                    {
                      align: 'center',
                      runs: [
                        {
                          text: 'Click to add subtitle',
                          fontSizePt: 20,
                          colorRgb: 'A0A0A0',
                        },
                      ],
                    },
                  ],
                },
              } as any,
            ],
          },
        ],
        size: { cx: 9144000, cy: 5143500 },
        defaultFont: 'Arial',
      }),
      htmlToPptx: async () => null,
      cloudGenStatus: async () => null,
      cloudGeneratePage: async () => null,
      editText: async () => null,
      setElementFont: async () => null,
      setElementParagraphFormat: async () => null,
      findReplace: async () => null,
      setSlideLayout: async () => null,
      setSlideSize: async () => null,
      getSlideSize: async () => ({ width: 10, height: 7.5 }),
      editTransform: async () => null,
      editConnectorEndpoints: async () => null,
      editPictureSrcRect: async () => null,
      editPictureOpacity: async () => null,
      editImageFill: async () => null,
      setTextAnchor: async () => null,
      clipboardExternal: async () => null,
      groupElements: async () => null,
      ungroupElement: async () => null,
      batchEditTransform: async () => null,
      getRenderSlides: async () => [],
      addElement: async () => null,
      deleteElement: async () => null,
      addSlide: async () => null,
      addBlankSlide: async () => null,
      addSlideWithLayout: async () => null,
      getLayouts: async () => [],
      masterEnter: async () => null,
      masterOpen: async () => null,
      masterClose: async () => null,
      masterEditText: async () => null,
      masterEditTransform: async () => null,
      masterEditFill: async () => null,
      masterEditStroke: async () => null,
      masterDeleteElement: async () => null,
      editFill: async () => null,
      editStroke: async () => null,
      flipElements: async () => null,
      editBackground: async () => null,
      insertImage: async () => null,
      copySlide: async () => null,
      pasteSlide: async () => null,
      repasteSlide: async () => null,
      hasSlideClipboard: async () => false,
      deleteSlide: async () => null,
      reorderElement: async () => null,
      editTableCell: async () => null,
      tableStructure: async () => null,
      tableMerge: async () => null,
      setTableColWidth: async () => null,
      setTableRowHeight: async () => null,
      setTableCellAnchor: async () => null,
      editTableStyle: async () => null,
      editChart: async () => null,
      getChartColorSchemes: async () => [],
      getChartData: async () => null,
      copyElements: async () => null,
      pasteElements: async () => null,
      duplicateElements: async () => null,
      addTable: async () => null,
      addInk: async () => null,
      addChart: async () => null,
      addSmartArt: async () => null,
      addImageBytes: async () => null,
      replacePictureBytes: async () => null,
      insertMedia: async () => null,
      addMediaBytes: async () => null,
      getMediaData: async () => null,
      insertModel3d: async () => null,
      setLink: async () => null,
      getLink: async () => null,
      getSlideLinks: async () => [],
      getRunLinks: async () => [],
      applyHeaderFooter: async () => null,
      getHeaderFooter: async () => null,
      applyTheme: async () => null,
      setTransition: async () => null,
      getTransition: async () => null,
      setAdvanceTimes: async () => null,
      getAnimations: async () => [],
      getShapeKeys: async () => [],
      setAnimations: async () => null,
      setSlideHidden: async () => null,
      getSections: async () => [],
      setSections: async () => null,
      addSection: async () => null,
      renameSection: async () => null,
      removeSection: async () => null,
      moveSection: async () => null,
      moveSlide: async () => null,
      getNotes: async () => '',
      setNotes: async () => null,
      getComments: async () => [],
      addComment: async () => null,
      deleteComment: async () => null,
      nativeClipboard: async () => null,
      beginHistoryBatch: async () => null,
      endHistoryBatch: async () => null,
      aiSnapshotRestore: async () => null,
      undo: async () => null,
      redo: async () => null,
      pickExportDir: async () => null,
      exportImages: async () => null,
      pickExportPdfPath: async () => null,
      exportPdf: async () => null,
      printSlides: async () => null,
      save: async () => null,
      saveAs: async () => null,
      onCloseSaveRequest: () => () => {},
      onHistoryChanged: () => () => {},
      reportCloseSaveResult: () => {},
      setAutoSavePref: () => {},
      isDirty: async () => false,
      getRecentFiles: async () => [],
      onMenuCommand: () => () => {},
      onOpened: () => () => {},
      onRenamed: () => () => {},
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
      webSearch: async () => [],
      imageSearch: async () => [],
      insertImageUrl: async () => null,
      replacePictureUrl: async () => null,
      generateImage: async () => null,
      analyzeMedia: async () => null,
      accountStatus: async () => ({ loggedIn: false }),
      onAiStream: (listener: (chunk: any) => void) => {
        devStreamListeners.push(listener)
        return () => {
          devStreamListeners = devStreamListeners.filter((l) => l !== listener)
        }
      },
      saveStyleSidecar: async () => null,
      saveStyleTemplate: async () => null,
      listStyleTemplates: async () => [],
      loadStyleTemplate: async () => null,
      presenterStart: async () => null,
      presenterSync: () => {},
      presenterInk: () => {},
      presenterSwap: async () => null,
      presenterEnd: async () => null,
      audienceReady: async () => null,
      audienceNav: () => {},
      onShowSync: () => () => {},
      onShowInk: () => () => {},
      onAudienceNav: () => () => {},
      getPathForFile: (file: File) => file.name,
      ipcRenderer: { invoke: async () => {}, on: () => {}, removeListener: () => {} },
    } as any
  }
  if (!(window as any).desktop) {
    ;(window as any).desktop = {
      pickAttachments: async () => null,
      addAttachmentPaths: async () => ({ accepted: [], rejected: [] }),
      addPastedImage: async () => ({ accepted: [], rejected: [] }),
      readAttachment: async () => ({ ok: true }),
      readAttachmentImage: async () => ({ ok: true }),
      getPathForFile: (file: File) => file.name,
    }
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
      window.slidesApi.getLanguage().catch(() => 'en' as const),
      paramTheme
        ? Promise.resolve(paramTheme)
        : window.slidesApi.getTheme().catch(() => 'system' as const),
    ])
  } catch {
    /* dev renderer without the preload bridge */
  }
  setModuleLang(lang)
  document.documentElement.lang = htmlLang(lang)
  // the audience show window renders slide content only : it never themes
  if (mode !== 'audience') {
    applyTheme(theme)
    window.slidesApi?.onThemeChanged(applyTheme)
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'theme-change' && e.data.theme) {
        applyTheme(e.data.theme as UiTheme)
      }
    })
  }
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <LocaleProvider initial={lang}>
        {mode === 'audience' ? <AudienceView /> : <App />}
      </LocaleProvider>
    </React.StrictMode>,
  )
}

void bootstrap()
