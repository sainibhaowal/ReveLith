// ReveLith Drawboard — board host (ReveLith skin, full drawboard functionality).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Excalidraw, MainMenu, WelcomeScreen } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawElement as BoardElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI as BoardApi } from '@excalidraw/excalidraw/types'
import { installLinkPolicy, REVELITH_ISSUES, REVELITH_REPO } from './link-policy'
import { installDropdownFit } from './dropdown-fit'
import './drawboard-host.css'

if (typeof window !== 'undefined' && !(window as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH) {
  // Board engine assets resolve relative to the bundle; Vite inlines font URLs from CSS.
  ;(window as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = './'
}

export interface DrawboardHostProps {
  initialElements: readonly BoardElement[]
  initialAppState: Partial<AppState>
  initialFiles: BinaryFiles
  theme: 'light' | 'dark'
  langCode: string
  onSceneChange: (elements: readonly BoardElement[], appState: Partial<AppState>, files: BinaryFiles) => void
  onApiReady: (api: BoardApi) => void
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onExportPng: () => void
  onExportSvg: () => void
  onExportJson: () => void
  onImport: () => void
  onClear: () => void
  onCycleTheme: () => void
  themeModeLabel: string
  elementCount: number
}

export default function DrawboardHost(props: DrawboardHostProps) {
  const [api, setApi] = useState<BoardApi | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (api) props.onApiReady(api)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  // ReveLith link policy: no third-party destination is reachable from the board.
  // Dialogs render outside the host element, so the policy watches the document.
  useEffect(() => installLinkPolicy(), [])
  // Keep engine dropdown menus inside the viewport (narrow/scrolled layouts).
  useEffect(() => installDropdownFit(), [])

  const initialData = useMemo(
    () => ({
      elements: [...props.initialElements],
      appState: { ...props.initialAppState },
      files: { ...props.initialFiles },
    }),
    // boot only — live updates go through updateScene/onChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <div ref={hostRef} className="revelith-board-host" data-theme={props.theme}>
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        onChange={(elements, appState, files) => props.onSceneChange(elements, appState, files)}
        theme={props.theme}
        langCode={props.langCode as never}
        autoFocus
        handleKeyboardGlobally
        validateEmbeddable={() => false}
        onLinkOpen={(element, event) => {
          const link = (element as { link?: string }).link
          if (link && /^https?:\/\//.test(link)) {
            event.preventDefault()
            window.open(link, '_blank', 'noopener')
          }
        }}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: true,
            clearCanvas: true,
            export: { saveFileToDisk: true },
            loadScene: true,
            saveToActiveFile: false,
            // The built-in toggle writes internal state that fights the
            // controlled theme prop (mixed light/dark UI). ReveLith owns the
            // theme via the "Canvas theme" item below, so this stays off.
            toggleTheme: false,
            saveAsImage: true,
          },
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.Separator />
          <MainMenu.Group title="ReveLith Draw">
            <MainMenu.Item onSelect={props.onCycleTheme}>{props.themeModeLabel}</MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.Item onSelect={() => window.open(REVELITH_REPO, '_blank', 'noopener')}>Documentation</MainMenu.Item>
            <MainMenu.Item onSelect={() => window.open(REVELITH_ISSUES, '_blank', 'noopener')}>Report an issue</MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.Item onSelect={props.onNew}>New board</MainMenu.Item>
            <MainMenu.Item onSelect={props.onOpen}>Open…</MainMenu.Item>
            <MainMenu.Item onSelect={props.onSave}>Save</MainMenu.Item>
            <MainMenu.Item onSelect={props.onSaveAs}>Save as…</MainMenu.Item>
            <MainMenu.Item onSelect={props.onImport}>Import board file…</MainMenu.Item>
            <MainMenu.Item onSelect={props.onExportPng}>Export PNG</MainMenu.Item>
            <MainMenu.Item onSelect={props.onExportSvg}>Export SVG</MainMenu.Item>
            <MainMenu.Item onSelect={props.onExportJson}>Export board file</MainMenu.Item>
            <MainMenu.Item onSelect={props.onClear}>Clear board</MainMenu.Item>
          </MainMenu.Group>
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Hints.MenuHint />
          <WelcomeScreen.Hints.ToolbarHint />
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo>ReveLith Draw</WelcomeScreen.Center.Logo>
            <WelcomeScreen.Center.Heading>Sketch, diagram, and brainstorm — autosaves to your .draw file.</WelcomeScreen.Center.Heading>
          </WelcomeScreen.Center>
        </WelcomeScreen>
      </Excalidraw>
    </div>
  )
}
