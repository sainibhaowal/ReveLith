import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { withImageSearch, withWebSearch } from '@revelith/app-chat'
import { DrawboardChatPanel } from './ai/DrawboardChatPanel'
import { DrawboardRibbon, type ThemeMode } from './ribbon/DrawboardRibbon'
import {
  alignElements,
  arrangeElements,
  deleteElements,
  distributeElements,
  duplicateElements,
  flipElements,
  groupElements,
  setFontFamily,
  setLocked,
  setOpacity,
  setStrokeWidth,
  setTextSize,
  ungroupElements,
  type Alignment,
  type ArrangeOp,
  type BoardEl,
} from './ribbon/board-actions'
import { createBoardHistory, type BoardHistory } from './board-engine/history'
import { useAutoSavePref } from '@revelith/ui'
import type { AgentToolCall } from '@revelith/agent-core'
import type { ExcalidrawElement as BoardElement } from '@excalidraw/excalidraw/element/types'
import { solveDraggedSketches, type LiveElement } from './board-engine/sketch-live'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI as BoardApi,
} from '@excalidraw/excalidraw/types'
import {
  loadInitialScene,
  persistSceneLocal,
  serializeScene,
  normalizePaperForTheme,
} from './board-engine/persistence'
import { executeBoardTool, summarizeScene, BOARD_TOOL_DEFS } from './board-engine/ai-tools'
import { selectBoardTools } from './ai/board-tool-routing'
import { buildDrawingGuidance } from './ai/drawing-skills'
import {
  exportBoardFile,
  exportScenePng,
  exportSceneSvg,
  copyScenePng,
  safeFilename,
} from './board-engine/exporters'
import { normalizeBoardElementPoints } from './board-engine/element-geometry'
import { loadLibraryItems, saveLibraryItems } from './board-engine/library'
import { readBoardImages, placeImagesOnBoard } from './board-engine/images'
import { migrateStorageKey, readMigratedStorageValue, sessionIdFromLocation } from '../shared/types'
import {
  diffBoardElements,
  rejectBoardRevision,
  type DrawboardRevision,
} from './board-engine/revisions'

const DrawboardHost = lazy(() => import('./board-engine/DrawboardHost'))

/** Single source of truth for light/dark: the document theme first, OS fallback. */
function effectiveTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return 'dark'
  if (attr === 'light') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const THEME_MODE_KEY = 'revelith-drawboard/theme-mode'
function loadThemeMode(): ThemeMode {
  try {
    const v = readMigratedStorageValue(THEME_MODE_KEY, 'revelith-whiteboard/theme-mode')
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // ignore — fall back to system
  }
  return 'system'
}

export default function App() {
  const [booted, setBooted] = useState(false)
  const [initialElements, setInitialElements] = useState<readonly BoardElement[]>([])
  const [initialAppState, setInitialAppState] = useState<Partial<AppState>>({})
  const [initialFiles, setInitialFiles] = useState<BinaryFiles>({})
  const [elementCount, setElementCount] = useState(0)
  const [selectionIds, setSelectionIds] = useState<string[]>([])
  const [shortcutCount, setShortcutCount] = useState<number | null>(null)
  const [aiOpen, setAiOpen] = useState(() => {
    try {
      return (
        readMigratedStorageValue(
          'revelith-drawboard/chat-open',
          'revelith-whiteboard/chat-open',
        ) !== '0'
      )
    } catch {
      return true
    }
  })
  const [themeMode, setThemeMode] = useState<ThemeMode>(loadThemeMode)
  const [observedTheme, setObservedTheme] = useState<'light' | 'dark'>(() => effectiveTheme())
  // Explicit choice wins; otherwise the canvas mirrors the ReveLith/system theme.
  const theme = themeMode === 'system' ? observedTheme : themeMode
  const themeRef = useRef(theme)
  themeRef.current = theme
  const [lang, setLang] = useState('en')
  const [documentTitle, setDocumentTitle] = useState('Untitled Drawing')
  const [fileName, setFileName] = useState('Untitled Drawing')
  const [shellFilePath, setShellFilePath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [viewState, setViewState] = useState({
    grid: false,
    snap: false,
    presenting: false,
    zoom: 1,
  })
  const [suggestion, setSuggestion] = useState<{ id: number; text: string } | null>(null)
  const [autosaveEnabled, setAutosaveEnabled] = useAutoSavePref(
    migrateStorageKey('drawboard.autoSave', 'whiteboard.autoSave'),
    window.electronAPI,
  )
  const [trackingEnabled, setTrackingEnabled] = useState(false)
  const [revisions, setRevisions] = useState<DrawboardRevision[]>([])
  const trackingEnabledRef = useRef(false)
  const revisionsRef = useRef<DrawboardRevision[]>([])
  const trackingBaselineRef = useRef<readonly BoardElement[]>([])
  const saveInFlightRef = useRef<Promise<boolean> | null>(null)
  const [, setHistTick] = useState(0)
  const historyBox = useRef<BoardHistory | null>(null)
  if (historyBox.current === null) historyBox.current = createBoardHistory()
  const history: BoardHistory = historyBox.current

  const apiRef = useRef<BoardApi | null>(null)
  const latestRef = useRef<{
    elements: readonly BoardElement[]
    appState: Partial<AppState>
    files: BinaryFiles
  }>({
    elements: [],
    appState: {},
    files: {},
  })
  const savedSnapshotRef = useRef('')
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  /** Record a history entry and refresh undo/redo buttons when it sticks. */
  const pushHistory = useCallback((elements: readonly BoardElement[], force = false) => {
    if (history.push(elements, force)) setHistTick((t) => t + 1)
  }, [])

  /** Apply a scene change from the ribbon: update engine + exact history entry. */
  const applyScene = useCallback(
    (elements: readonly BoardEl[], appState?: Record<string, unknown>) => {
      const api = apiRef.current
      if (!api) return
      api.updateScene({
        elements: normalizeBoardElementPoints(elements as unknown as BoardElement[]),
        ...(appState ? { appState: appState as never } : {}),
      })
      pushHistory(api.getSceneElements(), true)
    },
    [pushHistory],
  )

  const liveElements = useCallback((): BoardEl[] => {
    const api = apiRef.current
    try {
      if (api) return [...(api.getSceneElements() as unknown as BoardEl[])]
    } catch {
      // fall through to last known scene
    }
    return [...(latestRef.current.elements as unknown as BoardEl[])]
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('revelith-drawboard/chat-open', aiOpen ? '1' : '0')
    } catch {
      // ignore
    }
  }, [aiOpen])

  // Board-engine theme always mirrors the effective ReveLith theme end to end:
  // document theme attribute (set by the shell/bridge) with OS fallback.
  // A MutationObserver covers every path — bridge, shell installer, or system.
  const themeModeRef = useRef(themeMode)
  themeModeRef.current = themeMode
  useEffect(() => {
    setObservedTheme(effectiveTheme())
    const observer = new MutationObserver(() => {
      // An explicit canvas choice is never overridden by document changes.
      if (themeModeRef.current === 'system') setObservedTheme(effectiveTheme())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onMq = () => {
      if (themeModeRef.current === 'system') setObservedTheme(effectiveTheme())
    }
    mq?.addEventListener?.('change', onMq)
    return () => {
      observer.disconnect()
      mq?.removeEventListener?.('change', onMq)
    }
  }, [])

  // Board language from the bridge when available; defaults to 'en'.
  useEffect(() => {
    let live = true
    void (window.electronAPI as { getLanguage?: () => Promise<string> } | undefined)
      ?.getLanguage?.()
      .then((l) => {
        if (live && typeof l === 'string' && l) setLang(l.slice(0, 2))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  // Explicit canvas theme choice (ribbon buttons + board menu). Stored locally
  // so the canvas keeps following the system when set back to Auto.
  const setExplicitThemeMode = useCallback((mode: ThemeMode) => {
    try {
      localStorage.setItem(THEME_MODE_KEY, mode)
    } catch {
      // ignore — choice still applies for this session
    }
    setThemeMode(mode)
  }, [])

  const cycleThemeMode = useCallback(() => {
    const order: ThemeMode[] = ['system', 'light', 'dark']
    const next = order[(order.indexOf(themeModeRef.current) + 1) % order.length]!
    setExplicitThemeMode(next)
  }, [setExplicitThemeMode])

  const themeModeLabel =
    themeMode === 'system' ? `Auto (${theme})` : themeMode === 'light' ? 'Light' : 'Dark'

  // Keep the paper readable whenever the UI theme changes: a dark paper is
  // black-on-black (blank canvas) in light mode.
  useEffect(() => {
    if (booted && apiRef.current) normalizePaperForTheme(apiRef.current as never, theme)
  }, [theme, booted])

  // Boot scene (shell document -> local v2 cache -> legacy ops migration).
  useEffect(() => {
    let live = true
    const startsNewDocument = new URLSearchParams(window.location.search).get('newDocument') === '1'
    void loadInitialScene({ recoverLocal: !startsNewDocument }).then((scene) => {
      if (!live) return
      setInitialElements(scene.elements)
      setInitialAppState(scene.appState)
      setInitialFiles(scene.files)
      setDocumentTitle(scene.title)
      setFileName(scene.title)
      setShellFilePath(scene.filePath)
      setTrackingEnabled(scene.trackingEnabled)
      trackingEnabledRef.current = scene.trackingEnabled
      setRevisions(scene.revisions)
      revisionsRef.current = scene.revisions
      trackingBaselineRef.current = scene.elements
      latestRef.current = { elements: scene.elements, appState: scene.appState, files: scene.files }
      savedSnapshotRef.current = JSON.stringify(
        serializeScene(
          scene.elements,
          scene.appState,
          scene.files,
          scene.trackingEnabled,
          scene.revisions,
        ),
      )
      setElementCount(scene.elements.length)
      history.reset(scene.elements)
      setHistTick((t) => t + 1)
      setBooted(true)
      void window.electronAPI?.setDocumentState(false, scene.title).catch(() => {})
    })
    return () => {
      live = false
    }
  }, [])

  const markDirtyIfChanged = useCallback(() => {
    const snap = JSON.stringify(
      serializeScene(
        latestRef.current.elements,
        latestRef.current.appState,
        latestRef.current.files,
        trackingEnabledRef.current,
        revisionsRef.current,
      ),
    )
    const isDirty = snap !== savedSnapshotRef.current
    setDirty((prev) => (prev === isDirty ? prev : isDirty))
    void window.electronAPI?.setDocumentState(isDirty, documentTitleRef.current).catch(() => {})
  }, [])

  const documentTitleRef = useRef(documentTitle)
  documentTitleRef.current = documentTitle

  const debounceRef = useRef<number | undefined>(undefined)
  const selectionSigRef = useRef('')
  const viewSigRef = useRef('')
  const onSceneChange = useCallback(
    (elements: readonly BoardElement[], appState: Partial<AppState>, files: BinaryFiles) => {
      const safeElements = normalizeBoardElementPoints(elements)
      // Live parametric sketches: when the user drags constrained geometry,
      // re-solve it and write the corrected result back in place. Nothing
      // happens unless a sketch actually moved, and the pass is idempotent, so
      // the updateScene below cannot feed itself.
      const resolved = solveDraggedSketches(safeElements as unknown as LiveElement[])
      if (resolved) {
        const next = normalizeBoardElementPoints(resolved as unknown as BoardElement[])
        latestRef.current = { elements: next, appState, files }
        setElementCount(next.length)
        markDirtyIfChanged()
        pushHistory(next, false)
        apiRef.current?.updateScene({ elements: [...next] })
        return
      }
      latestRef.current = { elements: safeElements, appState, files }
      setElementCount(safeElements.length)
      // Publish the close-guard state immediately. If this waits for the local
      // recovery debounce, closing the tab just after a stroke can skip the
      // Save/Discard/Cancel prompt entirely.
      markDirtyIfChanged()
      pushHistory(safeElements, false)
      const ids = Object.keys(
        (appState as { selectedElementIds?: Record<string, unknown> } | undefined)
          ?.selectedElementIds ?? {},
      ).sort()
      const sig = ids.join(',')
      if (sig !== selectionSigRef.current) {
        selectionSigRef.current = sig
        setSelectionIds(ids)
      }
      const st = appState as {
        gridModeEnabled?: boolean
        gridSize?: number | null
        objectsSnapModeEnabled?: boolean
        viewModeEnabled?: boolean
        zoom?: { value?: number }
      }
      const viewSig = `${st.gridModeEnabled ? 1 : 0}|${st.objectsSnapModeEnabled ? 1 : 0}|${st.viewModeEnabled ? 1 : 0}|${Math.round((st.zoom?.value ?? 1) * 100)}`
      if (viewSig !== viewSigRef.current) {
        viewSigRef.current = viewSig
        setViewState({
          grid: !!st.gridModeEnabled,
          snap: !!st.objectsSnapModeEnabled,
          presenting: !!st.viewModeEnabled,
          zoom: st.zoom?.value ?? 1,
        })
      }
      window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        if (trackingEnabledRef.current) {
          const added = diffBoardElements(trackingBaselineRef.current, elements)
          if (added.length) {
            const next = [...revisionsRef.current, ...added]
            revisionsRef.current = next
            setRevisions(next)
          }
        }
        trackingBaselineRef.current = elements
        persistSceneLocal(
          elements,
          sessionIdFromLocation(),
          trackingEnabledRef.current,
          revisionsRef.current,
        )
        markDirtyIfChanged()
      }, 400)
    },
    [markDirtyIfChanged, pushHistory],
  )

  const clearSelection = useCallback(() => {
    apiRef.current?.updateScene({ appState: { selectedElementIds: {} } as never })
  }, [])

  const saveNative = useCallback(async (saveAs = false, prompt = true): Promise<boolean> => {
    const pending = saveInFlightRef.current
    if (pending) {
      const saved = await pending.catch(() => false)
      if (!saved) return false
      const current = JSON.stringify(
        serializeScene(
          latestRef.current.elements,
          latestRef.current.appState,
          latestRef.current.files,
          trackingEnabledRef.current,
          revisionsRef.current,
        ),
      )
      if (!saveAs && current === savedSnapshotRef.current) return true
    }
    if (!window.electronAPI) return false
    const operation = (async () => {
      for (let pass = 0; pass < 3; pass += 1) {
        const payload = serializeScene(
          latestRef.current.elements,
          latestRef.current.appState,
          latestRef.current.files,
          trackingEnabledRef.current,
          revisionsRef.current,
        )
        const result = await window.electronAPI!.saveDocument(
          payload,
          documentTitleRef.current,
          saveAs && pass === 0,
          prompt,
        )
        if (result.canceled) return false
        if (result.error) {
          window.alert(`Could not save the drawing: ${result.error}`)
          return false
        }
        if (result.filePath) setShellFilePath(result.filePath)
        if (result.title) {
          setFileName(result.title)
          setDocumentTitle(result.title)
          documentTitleRef.current = result.title
        }
        savedSnapshotRef.current = JSON.stringify(payload)
        const current = JSON.stringify(
          serializeScene(
            latestRef.current.elements,
            latestRef.current.appState,
            latestRef.current.files,
            trackingEnabledRef.current,
            revisionsRef.current,
          ),
        )
        if (current === savedSnapshotRef.current) {
          setDirty(false)
          void window.electronAPI!.setDocumentState(false, documentTitleRef.current).catch(() => {})
          return true
        }
        setDirty(true)
        void window.electronAPI!.setDocumentState(true, documentTitleRef.current).catch(() => {})
      }
      return false
    })()
    saveInFlightRef.current = operation
    try {
      return await operation
    } finally {
      if (saveInFlightRef.current === operation) saveInFlightRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!shellFilePath || !autosaveEnabled) return
    const saveIfDirty = () => {
      if (dirty) void saveNative(false, false)
    }
    const timer = window.setInterval(saveIfDirty, 30_000)
    window.addEventListener('blur', saveIfDirty)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('blur', saveIfDirty)
    }
  }, [shellFilePath, saveNative, autosaveEnabled, dirty])

  useEffect(() => {
    if (!window.electronAPI) return
    window.revelithSaveDocument = () => saveNative()
    return () => {
      delete window.revelithSaveDocument
    }
  }, [saveNative])

  const newDrawboard = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved drawing changes?')) return
    apiRef.current?.updateScene({ elements: [], appState: {}, collaborators: new Map() })
    window.clearTimeout(debounceRef.current)
    latestRef.current = { elements: [], appState: {}, files: {} }
    trackingBaselineRef.current = []
    trackingEnabledRef.current = false
    setTrackingEnabled(false)
    revisionsRef.current = []
    setRevisions([])
    savedSnapshotRef.current = JSON.stringify(serializeScene([], {}, {}, false, []))
    history.reset([])
    setHistTick((t) => t + 1)
    setElementCount(0)
    setDirty(false)
    setDocumentTitle('Untitled Drawing')
    setFileName('Untitled Drawing')
    documentTitleRef.current = 'Untitled Drawing'
    setShellFilePath(null)
    void window.electronAPI?.newDocument('Untitled Drawing').catch(() => {})
  }, [dirty])

  const openDrawboard = useCallback(async () => {
    if (!window.electronAPI) return
    if (dirty && !window.confirm('Discard unsaved changes before opening another drawing?')) return
    try {
      const doc = await window.electronAPI.openDocument()
      if (!doc || 'error' in doc || !doc.content) return
      const { loadInitialSceneFromContent } = await import('./board-engine/open-content')
      const scene = loadInitialSceneFromContent(doc.content)
      const safeElements = normalizeBoardElementPoints(scene.elements)
      window.clearTimeout(debounceRef.current)
      apiRef.current?.updateScene({
        elements: [...safeElements],
        appState: scene.appState as never,
      })
      latestRef.current = { elements: safeElements, appState: scene.appState, files: scene.files }
      trackingBaselineRef.current = safeElements
      trackingEnabledRef.current = scene.trackingEnabled
      setTrackingEnabled(scene.trackingEnabled)
      revisionsRef.current = scene.revisions
      setRevisions(scene.revisions)
      savedSnapshotRef.current = JSON.stringify(
        serializeScene(
          safeElements,
          scene.appState,
          scene.files,
          scene.trackingEnabled,
          scene.revisions,
        ),
      )
      history.reset(safeElements)
      setHistTick((t) => t + 1)
      setElementCount(safeElements.length)
      setDirty(false)
      setFileName(doc.title)
      setDocumentTitle(doc.title)
      documentTitleRef.current = doc.title
      setShellFilePath(doc.filePath ?? null)
      if (doc.filePath)
        void window.electronAPI.setDocumentPath(doc.filePath, doc.title).catch(() => {})
      void window.electronAPI.setDocumentState(false, doc.title).catch(() => {})
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    }
  }, [dirty])

  const currentScene = useCallback(() => {
    const api = apiRef.current
    if (!api) return latestRef.current
    try {
      return {
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
      }
    } catch {
      return latestRef.current
    }
  }, [])

  const exportPng = useCallback(async () => {
    try {
      const s = currentScene()
      await exportScenePng(
        s.elements,
        s.appState,
        s.files,
        safeFilename(documentTitleRef.current, '.png'),
      )
    } catch (error) {
      window.alert(`PNG export failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [currentScene])

  const exportSvg = useCallback(async () => {
    try {
      const s = currentScene()
      await exportSceneSvg(
        s.elements,
        s.appState,
        s.files,
        safeFilename(documentTitleRef.current, '.svg'),
      )
    } catch (error) {
      window.alert(`SVG export failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [currentScene])

  const exportJson = useCallback(async () => {
    try {
      const s = currentScene()
      await exportBoardFile(
        s.elements,
        s.appState,
        s.files,
        safeFilename(documentTitleRef.current, '.draw'),
      )
    } catch (error) {
      window.alert(
        `Draw file export failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }, [currentScene])

  const importFile = useCallback(
    async (file: File) => {
      try {
        const { loadInitialSceneFromContent } = await import('./board-engine/open-content')
        const text = await file.text()
        const parsed = JSON.parse(text)
        const scene = loadInitialSceneFromContent(parsed)
        const safeElements = normalizeBoardElementPoints(scene.elements)
        window.clearTimeout(debounceRef.current)
        apiRef.current?.updateScene({ elements: safeElements, appState: scene.appState as never })
        latestRef.current = { elements: safeElements, appState: scene.appState, files: scene.files }
        trackingBaselineRef.current = safeElements
        trackingEnabledRef.current = scene.trackingEnabled
        setTrackingEnabled(scene.trackingEnabled)
        revisionsRef.current = scene.revisions
        setRevisions(scene.revisions)
        history.reset(safeElements)
        setHistTick((t) => t + 1)
        setElementCount(safeElements.length)
        markDirtyIfChanged()
      } catch (error) {
        window.alert(
          `Could not import that file: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
    [markDirtyIfChanged],
  )

  const clearBoard = useCallback(() => {
    const api = apiRef.current
    const count = api ? api.getSceneElements().length : latestRef.current.elements.length
    if (count === 0) return
    if (!window.confirm(`Clear all ${count} element(s)?`)) return
    api?.updateScene({ elements: [] })
    latestRef.current = {
      elements: [],
      appState: latestRef.current.appState,
      files: latestRef.current.files,
    }
    pushHistory([], true)
    setElementCount(0)
    markDirtyIfChanged()
  }, [markDirtyIfChanged, pushHistory])

  const toggleTrackChanges = useCallback(() => {
    const enabled = !trackingEnabledRef.current
    trackingEnabledRef.current = enabled
    trackingBaselineRef.current = latestRef.current.elements
    setTrackingEnabled(enabled)
    persistSceneLocal(
      latestRef.current.elements,
      sessionIdFromLocation(),
      enabled,
      revisionsRef.current,
    )
    markDirtyIfChanged()
  }, [markDirtyIfChanged])

  const acceptRevision = useCallback(
    (id: string) => {
      const next = revisionsRef.current.map((revision) =>
        revision.id === id && revision.status === 'pending'
          ? { ...revision, status: 'accepted' as const }
          : revision,
      )
      revisionsRef.current = next
      setRevisions(next)
      markDirtyIfChanged()
    },
    [markDirtyIfChanged],
  )

  const rejectRevision = useCallback(
    (id: string) => {
      const revision = revisionsRef.current.find(
        (item) => item.id === id && item.status === 'pending',
      )
      if (!revision) return
      const elements = rejectBoardRevision(latestRef.current.elements, revision)
      if (!elements) {
        window.alert(
          'This change has been modified since it was recorded, so it cannot be rejected safely.',
        )
        return
      }
      const safeElements = normalizeBoardElementPoints(elements)
      apiRef.current?.updateScene({ elements: safeElements })
      latestRef.current = { ...latestRef.current, elements: safeElements }
      trackingBaselineRef.current = safeElements
      pushHistory(safeElements, true)
      const next = revisionsRef.current.map((item) =>
        item.id === id ? { ...item, status: 'rejected' as const } : item,
      )
      revisionsRef.current = next
      setRevisions(next)
      setElementCount(safeElements.length)
      persistSceneLocal(safeElements, sessionIdFromLocation(), trackingEnabledRef.current, next)
      markDirtyIfChanged()
    },
    [markDirtyIfChanged, pushHistory],
  )

  const toggleGrid = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const current = !!(api.getAppState() as { gridModeEnabled?: boolean }).gridModeEnabled
    api.updateScene({ appState: { gridModeEnabled: !current } as never })
    setViewState((state) => ({ ...state, grid: !current }))
  }, [])

  // ---- Rich ribbon actions (manual tools). Element ops share board-actions
  // with the agent executor, so ribbon and chat do exactly the same thing. ----
  const selectedSet = useCallback(() => new Set(selectionIds), [selectionIds])

  const undoBoard = useCallback(() => {
    const api = apiRef.current
    const prev = history.undo()
    if (!api || !prev) return
    api.updateScene({ elements: normalizeBoardElementPoints(prev as unknown as BoardElement[]) })
    setHistTick((t) => t + 1)
  }, [])

  const redoBoard = useCallback(() => {
    const api = apiRef.current
    const next = history.redo()
    if (!api || !next) return
    api.updateScene({ elements: normalizeBoardElementPoints(next as unknown as BoardElement[]) })
    setHistTick((t) => t + 1)
  }, [])

  const selectAllBoard = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const ids: Record<string, true> = {}
    for (const el of api.getSceneElements()) ids[el.id] = true
    api.updateScene({ appState: { selectedElementIds: ids } as never })
  }, [])

  const showShortcutReference = useCallback(() => {
    apiRef.current?.updateScene({ appState: { openDialog: { name: 'help' } } as never })
    // Read the rows from the pinned drawing engine's own help dialog so the
    // displayed count follows its actual shortcut reference, not a duplicate list.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const count = document.querySelectorAll('.excalidraw .HelpDialog__shortcut').length
        if (count > 0) setShortcutCount(count)
      }),
    )
  }, [])

  const duplicateSelected = useCallback(() => {
    const ids = selectedSet()
    if (ids.size === 0) return
    const { elements } = duplicateElements(liveElements(), ids, 32, 32)
    applyScene(elements)
  }, [selectedSet, liveElements, applyScene])

  const deleteSelected = useCallback(() => {
    const ids = selectedSet()
    if (ids.size === 0) return
    const { elements, deleted } = deleteElements(liveElements(), ids)
    if (deleted === 0) return
    applyScene(elements)
  }, [selectedSet, liveElements, applyScene])

  const arrangeSelected = useCallback(
    (op: ArrangeOp) => {
      const ids = selectedSet()
      if (ids.size === 0) return
      applyScene(arrangeElements(liveElements(), ids, op))
    },
    [selectedSet, liveElements, applyScene],
  )

  const alignSelected = useCallback(
    (alignment: Alignment) => {
      const ids = selectedSet()
      if (ids.size === 0) return
      const { elements, moved } = alignElements(liveElements(), ids, alignment)
      if (moved === 0) return
      applyScene(elements)
    },
    [selectedSet, liveElements, applyScene],
  )

  const distributeSelected = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      const ids = selectedSet()
      if (ids.size < 3) return
      const { elements, moved } = distributeElements(liveElements(), ids, axis)
      if (moved === 0) return
      applyScene(elements)
    },
    [selectedSet, liveElements, applyScene],
  )

  const groupSelected = useCallback(() => {
    const ids = selectedSet()
    if (ids.size < 2) return
    const { elements, grouped } = groupElements(liveElements(), ids)
    if (grouped === 0) return
    applyScene(elements)
  }, [selectedSet, liveElements, applyScene])

  const ungroupSelected = useCallback(() => {
    const ids = selectedSet()
    if (ids.size === 0) return
    const { elements, ungrouped } = ungroupElements(liveElements(), ids)
    if (ungrouped === 0) return
    applyScene(elements)
  }, [selectedSet, liveElements, applyScene])

  const lockSelected = useCallback(
    (locked: boolean) => {
      const ids = selectedSet()
      if (ids.size === 0) return
      const { elements, changed } = setLocked(liveElements(), ids, locked)
      if (changed === 0) return
      applyScene(elements)
    },
    [selectedSet, liveElements, applyScene],
  )

  const flipSelected = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      const ids = selectedSet()
      if (ids.size === 0) return
      const { elements, flipped } = flipElements(liveElements(), ids, direction)
      if (flipped === 0) return
      applyScene(elements)
    },
    [selectedSet, liveElements, applyScene],
  )

  const strokeWidthSelected = useCallback(
    (width: number) => {
      const ids = selectedSet()
      if (ids.size === 0) return
      const { elements, applied } = setStrokeWidth(liveElements(), ids, width)
      if (applied === 0) return
      applyScene(elements)
    },
    [selectedSet, liveElements, applyScene],
  )

  const opacitySelected = useCallback(
    (opacity: number) => {
      const ids = selectedSet()
      if (ids.size === 0) return
      const { elements, applied } = setOpacity(liveElements(), ids, opacity)
      if (applied === 0) return
      applyScene(elements)
    },
    [selectedSet, liveElements, applyScene],
  )

  const textSizeSelected = useCallback(
    (size: number) => {
      const ids = selectedSet()
      if (ids.size === 0) return
      const { elements, applied } = setTextSize(liveElements(), ids, size)
      if (applied === 0) return
      applyScene(elements)
    },
    [selectedSet, liveElements, applyScene],
  )

  const fontFamilySelected = useCallback(
    (family: number) => {
      const ids = selectedSet()
      if (ids.size === 0) return
      const { elements, applied } = setFontFamily(liveElements(), ids, family)
      if (applied === 0) return
      applyScene(elements)
    },
    [selectedSet, liveElements, applyScene],
  )

  const zoomBy = useCallback((factor: number) => {
    const api = apiRef.current
    if (!api) return
    const current = (api.getAppState() as { zoom?: { value?: number } }).zoom?.value ?? 1
    const value = Math.max(0.1, Math.min(30, current * factor))
    api.updateScene({ appState: { zoom: { value } } as never })
  }, [])

  const zoomReset = useCallback(() => {
    apiRef.current?.updateScene({ appState: { zoom: { value: 1 } } as never })
  }, [])

  const zoomFit = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    try {
      api.scrollToContent(api.getSceneElements(), {
        fitToViewport: true,
        viewportZoomFactor: 0.9,
      } as never)
    } catch {
      // older engine shape — ignore
    }
  }, [])

  const toggleSnap = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const current = !!(api.getAppState() as { objectsSnapModeEnabled?: boolean })
      .objectsSnapModeEnabled
    api.updateScene({ appState: { objectsSnapModeEnabled: !current } as never })
  }, [])

  const togglePresent = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const current = !!(api.getAppState() as { viewModeEnabled?: boolean }).viewModeEnabled
    api.updateScene({ appState: { viewModeEnabled: !current } as never })
  }, [])

  const pickBackground = useCallback((color: string) => {
    apiRef.current?.updateScene({ appState: { viewBackgroundColor: color } as never })
  }, [])

  const copyPng = useCallback(async () => {
    const s = currentScene()
    const copied = await copyScenePng(s.elements, s.appState, s.files)
    if (!copied)
      window.alert('Could not copy the board image. Check clipboard access and try again.')
  }, [currentScene])

  const onBoardMutated = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    const elements = api.getSceneElements()
    latestRef.current = { elements, appState: api.getAppState(), files: api.getFiles() }
    setElementCount(elements.length)
    if (trackingEnabledRef.current) {
      const added = diffBoardElements(trackingBaselineRef.current, elements)
      if (added.length) {
        const next = [...revisionsRef.current, ...added]
        revisionsRef.current = next
        setRevisions(next)
      }
    }
    trackingBaselineRef.current = elements
    pushHistory(elements, true)
    persistSceneLocal(
      elements,
      sessionIdFromLocation(),
      trackingEnabledRef.current,
      revisionsRef.current,
    )
    markDirtyIfChanged()
  }, [markDirtyIfChanged, pushHistory])

  const insertImageFiles = useCallback(
    async (files: FileList | File[]) => {
      const api = apiRef.current
      if (!api) return
      const { images, notice } = await readBoardImages(files)
      if (images.length === 0) {
        if (notice) window.alert(notice)
        return
      }
      const previousCount = api.getSceneElements().length
      const placement = placeImagesOnBoard(api, images)
      if (placement.placed !== images.length) {
        window.alert(placement.summary)
        return
      }
      const elements = api.getSceneElements()
      if (elements.length < previousCount + images.length) {
        window.alert('The image was read but the drawing engine did not place it on the board.')
        return
      }
      onBoardMutated()
    },
    [onBoardMutated],
  )

  const promptAi = useCallback((text: string) => {
    setSuggestion({ id: Date.now(), text })
    setAiOpen(true)
  }, [])

  const chatSkill = useMemo(
    () =>
      withImageSearch(
        withWebSearch({
          id: 'drawboard',
          systemPrompt:
            'You are ReveLith Draw, an agent that creates and edits the active visual board end to end from natural language. ' +
            'Coordinate system: canvas CSS pixels. Preserve existing work and never place new art over it. Dedicated diagram tools automatically lay out a new diagram and place it below existing board content; use their optional position only when the user specifies placement. On an empty board, compositions start near 80,80. ' +
            'Tool discipline: use only exact tool names from the supplied tool list; do not invent tool names or report unsupported tools as if they ran. If a tool returns an error, correct the call and retry with a listed tool. Pure questions get a text answer with no calls. ' +
            'Use web_search for current facts and image_search when the user requests real photos or source imagery. To place a search result, call add_board_image_from_url with its image URL; add_board_image is only for user attachments. For a finished illustration, landscape, portrait, or realistic/painterly scene, use generate_image as the primary art tool whenever it is listed: write a precise English brief with subject, viewpoint, composition, materials, lighting, depth, and requested style, then place one complete image. Make hero artwork large enough to show detail (usually maxWidth 800-1000 canvas pixels, within available space); avoid reducing it to a small thumbnail. Do not approximate finished artwork with dozens of primitive shapes. Use add_vector_artwork for crisp artwork the user wants editable, or as the best available fallback if generate_image is unavailable. ' +
            'Inspect first: call read_drawboard (or get_board_element for one id) before editing, moving, or deleting existing content. ' +
            'Content integrity: the current user brief is authoritative. Never reuse examples, facts, roadmaps, labels, or data from an earlier request unless the user explicitly asks to continue or edit it. If a request supplies only a title and no subject content, ask one concise question instead of inventing a poster. For a multi-section infographic, study guide, roadmap, or poster, use build_infographic as one coordinated native composition; use standalone typed diagram builders only for one standalone notation. ' +
            'For cleanup, use erase_board_elements on identified unwanted whole elements (including complete freehand strokes); it does not partially erase pixels or clear the board. Use delete_board_elements for explicit deletion requests, and clear_drawboard only when the user explicitly asks to clear everything. ' +
            'For diagrams, use the listed native, editable Drawboard builders (build_sequence_diagram, build_use_case_diagram, build_requirement_diagram, build_uml_class_diagram, build_er_diagram, build_state_diagram, build_mind_map, build_flow_diagram, build_chart_diagram, build_heatmap_chart, build_gantt_diagram, or build_text_diagram) instead of Mermaid or pasted JSON/SVG. Mermaid is opt-in only when the user affirmatively asks for Mermaid source/rendering; a mention, comparison, or explicit instruction not to use Mermaid is not consent. If the user asks for several diagram types, call each matching native builder and keep going until every requested type is done. Supply every required id/reference and meaningful labels; the local compiler checks references, layout bounds, and item budgets before committing editable board shapes. For charts, use only values supplied by the user or reliable tool results; never invent data. Reserve build_drawboard_scene for custom compositions these typed builders do not express. ' +
            'When calling build_drawboard_scene, include kind on every element (use kind:"text" for every label) and encode polygon/path/freedraw points as coordinate pairs like [[0,800],[1400,800],[1000,600]], never as a flat number list. Send a structured tool call; never print pseudo tool-call markup or internal control tokens in your reply. If the scene tool returns an error, correct the call and retry before reporting completion. ' +
            'For an editable illustration, call add_vector_artwork once with a complete, compositionally finished SVG in a generous viewBox. Use deliberate silhouette design, multiple depth planes, controlled perspective, coherent light and shadow, material-specific detail, refined curves, and a restrained but intentional palette. Avoid generic clip-art shapes, flat wall/roof/window cutouts, repeated identical details, and unrelated labels. These are different media choices: a request for a 3D-looking scene does not by itself mean the user wants editable scene primitives. ' +
            'Scene extras: kind:"dimension" draws a measured span with witness lines, arrowheads and an auto-computed value label (set scale = drawing units per canvas pixel, and units); kind:"leader" points a labelled callout at a feature; kind:"scene3d" projects genuine isometric, dimetric or perspective 3D from world-space box/prism/plane primitives - use it instead of computing 3D coordinates by hand; rect/ellipse/diamond accept hatch (hachure, cross-hatch, zigzag, dots) for section hatching. ' +
            'SVG capabilities for add_vector_artwork: path curves, linear/radial gradients, pattern, mask, clipPath, use/symbol reuse, marker arrowheads, filters (feGaussianBlur, feDropShadow, feTurbulence, feColorMatrix, feBlend, feComposite), embedded base64 raster through <image>, an inline style attribute, and rgb()/rgba()/hsl() colours. ' +
            'When image generation is unavailable, say so plainly if the request depends on painterly or photorealistic rendering; you may offer a polished vector interpretation, but do not describe it as photorealistic or professional fine art. For vector scenes, create intentional foreground, middle-ground, and background depth with overlap, scale, perspective, gradients, cast shadows, material texture, and carefully drawn details. Do not add a title, labels, border, or unrelated content unless requested. Never claim a visual quality check you could not perform. ' +
            'For every nontrivial diagram or multi-element drawing, finish the creation turn, then use read_drawboard and inspect_board_layout on a follow-up model turn to verify expected elements, labels, connections, bounds, overlap, and readable text. When inspect_board_visual is listed, also use it to review visual hierarchy. If any review identifies a problem, repair it with native Drawboard tools and inspect again before finishing; never append a second generic diagram as a repair. Do not stop after the first successful build call or claim a visual check you could not perform. Use read_drawboard before editing, moving, or deleting existing elements. ' +
            'Do not zoom_to_fit an unrelated existing board if that would turn new content into a thumbnail; zoom only when requested or needed to reveal the work. If a tool returns a concrete issue, correct it with the available tools before reporting completion. ' +
            'Text defaults: dark blue #1e1b4b at size 20 unless the design calls for another readable color or size. ' +
            'Never clear the board unless the user explicitly said so, and then only via clear_drawboard with confirm=true. ' +
            'Attached images are sent to you directly for visual analysis. Use add_board_image only when the user asks to place an attachment on the board; match by filename and never invent image content. ' +
            'Export only when asked, with the requested format. After acting, briefly say what changed.',
          tools: BOARD_TOOL_DEFS,
          toolsForRequest: (instruction: string) => selectBoardTools(instruction, BOARD_TOOL_DEFS),
          buildContext: (instruction?: string) => {
            const scene = summarizeScene(apiRef.current)
            // Craft guidance is selected per request; agent-core appends
            // buildContext output to the user message.
            const guidance = buildDrawingGuidance(instruction ?? '')
            return guidance ? `${scene}\n\n${guidance}` : scene
          },
          executeTool: (call: AgentToolCall) => executeBoardTool(apiRef, call, () => []),
        }),
      ),
    [],
  )

  const selectedLocked =
    selectionIds.length > 0 &&
    selectionIds.every((id) => {
      const el = latestRef.current.elements.find((e) => e.id === id) as
        { locked?: boolean } | undefined
      return el?.locked === true
    })

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
        background: 'var(--surface-subtle)',
      }}
    >
      <DrawboardRibbon
        title={documentTitle}
        status={`${fileName}${dirty ? ' · Unsaved changes' : ''} · ${elementCount} element(s)`}
        quick={{
          onSave: () => void saveNative(),
          canUndo: history.canUndo(),
          onUndo: undoBoard,
          canRedo: history.canRedo(),
          onRedo: redoBoard,
          autosave: autosaveEnabled,
          onToggleAutosave: () => setAutosaveEnabled(!autosaveEnabled),
        }}
        file={{
          onNew: newDrawboard,
          onOpen: () => void openDrawboard(),
          onSave: () => void saveNative(),
          onSaveAs: () => void saveNative(true),
          onImport: () => importInputRef.current?.click(),
        }}
        edit={{
          canUndo: history.canUndo(),
          canRedo: history.canRedo(),
          onUndo: undoBoard,
          onRedo: redoBoard,
          hasSelection: selectionIds.length > 0,
          hasContent: elementCount > 0,
          onSelectAll: selectAllBoard,
          onDeselect: clearSelection,
          onDuplicate: duplicateSelected,
          onDelete: deleteSelected,
          onClear: clearBoard,
          shortcutCount,
          onShowShortcuts: showShortcutReference,
        }}
        arrange={{
          canArrange: selectionIds.length > 0,
          canAlign: selectionIds.length >= 2,
          canDistribute: selectionIds.length >= 3,
          isLocked: selectedLocked,
          onArrange: arrangeSelected,
          onAlign: alignSelected,
          onDistribute: distributeSelected,
          onGroup: groupSelected,
          onUngroup: ungroupSelected,
          onLock: lockSelected,
          onFlip: flipSelected,
        }}
        style={{
          canStyle: selectionIds.length > 0,
          onStrokeWidth: strokeWidthSelected,
          onOpacity: opacitySelected,
          onTextSize: textSizeSelected,
          onFontFamily: fontFamilySelected,
        }}
        view={{
          onZoomIn: () => zoomBy(1.25),
          onZoomOut: () => zoomBy(1 / 1.25),
          onZoomReset: zoomReset,
          onZoomFit: zoomFit,
          grid: viewState.grid,
          onToggleGrid: toggleGrid,
          snap: viewState.snap,
          onToggleSnap: toggleSnap,
          presenting: viewState.presenting,
          onTogglePresent: togglePresent,
          themeMode,
          onThemeMode: setExplicitThemeMode,
          onPickBackground: pickBackground,
          onToggleSettings: () => setShowSettings((v) => !v),
        }}
        exp={{
          onExportPng: () => void exportPng(),
          onExportSvg: () => void exportSvg(),
          onExportBoard: exportJson,
          onCopyPng: () => void copyPng(),
        }}
        ai={{
          aiOpen,
          onToggleAi: () => setAiOpen((v) => !v),
          onPrompt: promptAi,
        }}
        review={{
          enabled: trackingEnabled,
          revisions,
          onToggle: toggleTrackChanges,
          onAccept: acceptRevision,
          onReject: rejectRevision,
        }}
      />

      {showSettings ? (
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            padding: '8px 12px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Title
            <input
              value={documentTitle}
              onChange={(e) => {
                setDocumentTitle(e.target.value)
                documentTitleRef.current = e.target.value
                void window.electronAPI?.setDocumentState(true, e.target.value).catch(() => {})
              }}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
              }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Language
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
            >
              {['en', 'zh', 'es', 'fr', 'de', 'ja', 'hi'].map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <span>{theme} theme · grid via canvas · embeddables blocked for safety</span>
        </div>
      ) : null}

      <div className="wb-workspace">
        <section className="wb-content-column" aria-label="Drawing canvas">
          {!booted ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              Loading drawing engine…
            </div>
          ) : (
            <Suspense
              fallback={
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  Loading editor…
                </div>
              }
            >
              <DrawboardHost
                initialElements={initialElements}
                initialAppState={initialAppState}
                initialFiles={initialFiles}
                theme={theme}
                langCode={lang}
                elementCount={elementCount}
                onSceneChange={onSceneChange}
                onApiReady={(api) => {
                  apiRef.current = api
                  // A dark paper saved earlier would render black-on-black in
                  // light mode — correct it once the engine is ready.
                  normalizePaperForTheme(api as never, themeRef.current)
                }}
                onNew={newDrawboard}
                onOpen={() => void openDrawboard()}
                onSave={() => void saveNative()}
                onSaveAs={() => void saveNative(true)}
                onExportPng={() => void exportPng()}
                onExportSvg={() => void exportSvg()}
                onExportJson={exportJson}
                onImport={() => importInputRef.current?.click()}
                onClear={clearBoard}
                onCycleTheme={cycleThemeMode}
                themeModeLabel={`Canvas theme: ${themeModeLabel}`}
              />
            </Suspense>
          )}
          <footer className="wb-statusbar" aria-label="Drawboard status">
            <span>{elementCount} element(s)</span>
            <span className="wb-statusbar-sep" aria-hidden="true" />
            <span>
              {selectionIds.length ? `${selectionIds.length} selected` : 'Nothing selected'}
            </span>
            <span className="wb-statusbar-sep" aria-hidden="true" />
            <span>{dirty ? 'Unsaved changes' : 'Saved'}</span>
          </footer>
        </section>
        <DrawboardChatPanel
          skill={chatSkill}
          apiRef={apiRef}
          history={history}
          selectionIds={selectionIds}
          onClearSelection={clearSelection}
          onBoardMutated={onBoardMutated}
          suggestion={suggestion}
          onSuggestionConsumed={() => setSuggestion(null)}
          open={aiOpen}
          onExpand={() => setAiOpen(true)}
          onCollapse={() => setAiOpen(false)}
        />
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".draw,.drawboard,.whiteboard,.excalidraw,.json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void importFile(file)
        }}
      />
      <input
        id="wb-insert-image"
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length > 0) void insertImageFiles(files)
        }}
      />
    </div>
  )
}

// Re-export for tests that import library helpers through App module graph.
export { loadLibraryItems, saveLibraryItems }
