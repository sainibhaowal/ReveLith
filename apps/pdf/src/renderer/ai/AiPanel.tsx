import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import { AgentLoop } from '@revelith/agent-core'
import type { AiSettings } from '@revelith/ai-provider'
import type { ProjectApi } from '@revelith/project-store'
import { AiComposer, AiTypingIndicator, QuickModelSelector } from '@revelith/ui'
import { aiLangDirective, t as tGlobal, useI18n } from '../i18n/locale'
import { Markdown } from '@revelith/ui'
import sendEnterOn from '../assets/send-enter-on.png'
import sendEnterOff from '../assets/send-enter-off.png'
import sendStop from '../assets/send-stop.png'
import { createPdfSkill } from './pdf-skill'
import { createElectronTransport } from './transport'
import type { PdfAiDeps } from './tools'

const PANEL_WIDTH_KEY = 'pdf-ai-panel-width'
const PANEL_WIDTH_DEFAULT = 360
const PANEL_WIDTH_MIN = 280

function clampPanelWidth(w: number): number {
  // The viewport can be transiently tiny (a WebContentsView is 0×0 until the
  // shell lays it out), so never let the ceiling drop below the minimum
  const max = Math.max(PANEL_WIDTH_MIN, Math.min(720, Math.round(window.innerWidth * 0.6)))
  return Math.min(Math.max(w, PANEL_WIDTH_MIN), max)
}

function loadPanelWidth(): number {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  // static bounds only : clamping against the window here would bake a
  // transiently small viewport into the restored preference
  return Number.isFinite(saved) && saved > 0
    ? Math.min(Math.max(saved, PANEL_WIDTH_MIN), 720)
    : PANEL_WIDTH_DEFAULT
}

interface ToolActivity {
  name: string
  summary: string
  isError?: boolean
  output?: string
}

interface ChatEntry {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  isError?: boolean
  /** the run failed and this user message was rolled back out of the model context */
  undelivered?: boolean
  tools?: ToolActivity[]
}

type Phase = 'thinking' | 'replying' | 'working'

export function AiPanel({
  api,
  onCollapse,
  preset,
  filePath,
}: {
  api: PdfAiDeps
  onCollapse: () => void
  /** Ribbon AI buttons push a one-shot prompt; a new nonce triggers an auto-run */
  preset?: { text: string; nonce: number } | null
  /** Absolute path of the open file (chat history is keyed by it; null while untitled) */
  filePath?: string | null
}): ReactElement {
  const { lang, t } = useI18n()
  const [chat, setChat] = useState<ChatEntry[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('thinking')
  const chatRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  // preferred = the user's chosen width (the only value persisted); panelWidth =
  // what fits the current window. Deriving the display width from the preference
  // means a transiently small window never permanently shrinks the panel.
  const preferredWidthRef = useRef(loadPanelWidth())
  const [panelWidth, setPanelWidth] = useState(() => clampPanelWidth(preferredWidthRef.current))
  const [resizing, setResizing] = useState(false)
  const asideRef = useRef<HTMLElement>(null)

  // The .ai-dock wrapper owns the animated width (docs-style 180ms slide);
  // it tracks the resizable panel width through this variable
  useEffect(() => {
    const dock = asideRef.current?.closest('.ai-dock') as HTMLElement | null
    dock?.style.setProperty('--ai-panel-width', `${panelWidth}px`)
  }, [panelWidth])
  const settingsRef = useRef<AiSettings | null>(null)
  const langRef = useRef(lang)
  langRef.current = lang
  const apiRef = useRef(api)
  apiRef.current = api

  // ── Chat-history persistence (same shared store Docs/Slides use) ──
  const chatRefIds = useRef<{ projectId: string; chatId: string } | null>(null)
  const runToolsRef = useRef<ToolActivity[]>([])
  const storeApi = () =>
    (window as Window & { projectApi?: ProjectApi }).projectApi ?? null

  useEffect(() => {
    const store = storeApi()
    if (!store) return
    const tempChatId = `unsaved-${Date.now()}`
    void store
      .resolveChat({ filePath: filePath ?? null, tempChatId })
      .then((ids) => {
        chatRefIds.current = ids
        return store.loadChat({ projectId: ids.projectId, chatId: ids.chatId, limit: 200 })
      })
      .then((msgs) => {
        if (msgs.length === 0) return
        setChat(
          msgs.map((m) => ({
            role: m.role,
            text: m.text,
            tools: m.tools?.map((tool) => ({
              name: tool.name,
              summary: tool.summary,
              isError: tool.isError,
              output: tool.output ? tool.output.slice(0, 2000) : undefined,
            })),
          })),
        )
        // Follow-ups after reopening continue the previous conversation (idle loop only)
        if (!loopRef.current?.busy) {
          loopRef.current?.restore(msgs.map((m) => ({ role: m.role, text: m.text })))
        }
      })
      .catch(() => {
        /* history load failures are silent */
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** After an untitled document's first save yields a real path, bind its history to that file */
  useEffect(() => {
    const ids = chatRefIds.current
    const store = storeApi()
    if (!store || !ids || !filePath || !ids.chatId.startsWith('unsaved-')) return
    void store
      .rebindChat({ projectId: ids.projectId, tempChatId: ids.chatId, newFilePath: filePath })
      .then((r) => {
        if (r?.chatId) chatRefIds.current = r
      })
      .catch(() => {
        /* silent */
      })
  }, [filePath])

  const persistMessage = (role: 'user' | 'assistant', text: string, tools?: ToolActivity[]) => {
    const ids = chatRefIds.current
    const store = storeApi()
    if (!ids || !store) return
    void store
      .appendChat({
        projectId: ids.projectId,
        chatId: ids.chatId,
        role,
        text,
        ...(tools && tools.length > 0 ? { tools } : {}),
      })
      .catch(() => {
        /* silent */
      })
  }

  const patchLast = (patch: Partial<ChatEntry> | ((last: ChatEntry) => Partial<ChatEntry>)) => {
    setChat((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (!last || last.role !== 'assistant') return prev
      next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) }
      return next
    })
  }

  // The loop is built once; every mutable value goes through a ref getter
  const loopRef = useRef<AgentLoop | null>(null)
  if (!loopRef.current) {
    const deps: PdfAiDeps = {
      doc: () => apiRef.current.doc(),
      fileName: () => apiRef.current.fileName(),
      pageCount: () => apiRef.current.pageCount(),
      currentPage: () => apiRef.current.currentPage(),
      readOnly: () => apiRef.current.readOnly(),
      outline: () => apiRef.current.outline(),
      searchIndex: () => apiRef.current.searchIndex(),
      isDeleted: (i) => apiRef.current.isDeleted(i),
      gotoPage: (p) => apiRef.current.gotoPage(p),
      addMarkup: (type, idx, rects) => apiRef.current.addMarkup(type, idx, rects),
      editText: (input) => apiRef.current.editText(input),
      editFonts: () => apiRef.current.editFonts(),
      formEdits: () => apiRef.current.formEdits(),
      applyFormEdit: (v) => apiRef.current.applyFormEdit(v),
      rotatePage: (idx, dir) => apiRef.current.rotatePage(idx, dir),
      deletePage: (idx) => apiRef.current.deletePage(idx),
      pageGeom: (idx) => apiRef.current.pageGeom(idx),
      listImages: () => apiRef.current.listImages(),
      isImageClaimed: (ref) => apiRef.current.isImageClaimed(ref),
      insertImage: (idx, png, rect, layer) => apiRef.current.insertImage(idx, png, rect, layer),
      transformImage: (ref, rect, layer, quarterTurns) =>
        apiRef.current.transformImage(ref, rect, layer, quarterTurns),
      replaceImage: (ref, png) => apiRef.current.replaceImage(ref, png),
      deleteImage: (ref) => apiRef.current.deleteImage(ref),
      searchImages: (query, max) => apiRef.current.searchImages(query, max),
      searchWeb: (query, max) => apiRef.current.searchWeb(query, max),
      listPendingMarkups: () => apiRef.current.listPendingMarkups(),
      listPendingNotes: () => apiRef.current.listPendingNotes(),
      addNote: (page, at, contents) => apiRef.current.addNote(page, at, contents),
      replyNote: (id, author, text) => apiRef.current.replyNote(id, author, text),
      editNote: (id, contents) => apiRef.current.editNote(id, contents),
      deleteNote: (id) => apiRef.current.deleteNote(id),
      deletePendingMarkup: (id) => apiRef.current.deletePendingMarkup(id),
      deleteSavedMarkup: (page, objNum) => apiRef.current.deleteSavedMarkup(page, objNum),
      listTextInserts: () => apiRef.current.listTextInserts(),
      insertTextBlock: (input) => apiRef.current.insertTextBlock(input),
      editTextInsert: (id, patch) => apiRef.current.editTextInsert(id, patch),
      moveTextInsert: (id, dx, dy) => apiRef.current.moveTextInsert(id, dx, dy),
      deleteTextInsert: (id) => apiRef.current.deleteTextInsert(id),
      bakeImagePixels: (page, rect) => apiRef.current.bakeImagePixels(page, rect),
      bakeReplace: (ref, png, crop) => apiRef.current.bakeReplace(ref, png, crop),
      visiblePages: () => apiRef.current.visiblePages(),
      applyPageOps: (ops) => apiRef.current.applyPageOps(ops),
      stampConfig: () => apiRef.current.stampConfig(),
      setWatermark: (wm) => apiRef.current.setWatermark(wm),
      setHeaderFooter: (hf) => apiRef.current.setHeaderFooter(hf),
      filePath: () => apiRef.current.filePath(),
      selectionText: () => apiRef.current.selectionText(),
      flushSave: () => apiRef.current.flushSave(),
      reloadAfterFileOp: () => apiRef.current.reloadAfterFileOp(),
      fileInsertBlankPage: (afterPage, width, height) =>
        apiRef.current.fileInsertBlankPage(afterPage, width, height),
      fileSetPageSize: (pages, width, height) => apiRef.current.fileSetPageSize(pages, width, height),
      fileCropPages: (pages, box) => apiRef.current.fileCropPages(pages, box),
      extractFilePages: (pages, suggestedName) => apiRef.current.extractFilePages(pages, suggestedName),
      mergeFile: (afterPage) => apiRef.current.mergeFile(afterPage),
      replaceFilePages: (pages) => apiRef.current.replaceFilePages(pages),
      createFileDocument: (pages, title, text, suggestedName) =>
        apiRef.current.createFileDocument(pages, title, text, suggestedName),
      generateImage: (op) => apiRef.current.generateImage(op),
      fetchImage: (url) => apiRef.current.fetchImage(url),
    }
    loopRef.current = new AgentLoop({
      transport: createElectronTransport(() => settingsRef.current!),
      skill: createPdfSkill(deps),
      systemSuffix: () => aiLangDirective(langRef.current),
      events: {
        onText: (text) => {
          setPhase('replying')
          patchLast({ text })
        },
        onToolExecuted: ({ call, execution }) => {
          setPhase('working')
          const activity = {
            name: call.name,
            summary: execution.summary,
            isError: execution.isError,
            output: execution.output?.slice(0, 2000),
          }
          runToolsRef.current.push(activity)
          patchLast((last) => ({
            tools: [...(last.tools ?? []), activity],
          }))
        },
        onTurnEnd: () => {
          setPhase('thinking')
          patchLast({ streaming: false })
          setChat((prev) => [...prev, { role: 'assistant', text: '', streaming: true }])
        },
        onDone: ({ text, cancelled, turnLimit }) => {
          const final = turnLimit
            ? [text, tGlobal('aiTurnLimit')].filter(Boolean).join('\n\n')
            : text || (cancelled ? tGlobal('aiStopped') : '')
          const tools = runToolsRef.current
          runToolsRef.current = []
          patchLast((last) => {
            const message = final || (last.tools?.length ? last.text : tGlobal('aiNoReply'))
            persistMessage('assistant', message, tools.length > 0 ? tools : undefined)
            return {
              streaming: false,
              text: message,
            }
          })
          setBusy(false)
        },
        onError: (error) => {
          setChat((prev) => {
            const next = [...prev]
            // the loop rolled this run's user message out of the model context : surface that
            for (let i = next.length - 1; i >= 0; i--) {
              const entry = next[i]!
              if (entry.role === 'user') {
                next[i] = { ...entry, undelivered: true }
                break
              }
            }
            const last = next.at(-1)
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, streaming: false, text: error, isError: true }
            }
            return next
          })
          setBusy(false)
        },
      },
    })
  }

  useEffect(() => {
    if (stickToBottomRef.current) {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight })
    }
  }, [chat, busy])

  const onChatScroll = (): void => {
    const el = chatRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  const send = (text: string): void => {
    const instruction = text.trim()
    const loop = loopRef.current
    if (!instruction || !loop || loop.busy) return
    stickToBottomRef.current = true
    setChat((prev) => [
      ...prev,
      { role: 'user', text: instruction },
      { role: 'assistant', text: '', streaming: true },
    ])
    persistMessage('user', instruction)
    setPrompt('')
    setBusy(true)
    setPhase('thinking')
    void (async () => {
      try {
        settingsRef.current = await window.pdfApi.getAiSettings()
        await loop.run(instruction)
      } catch (err) {
        patchLast({
          streaming: false,
          text: err instanceof Error ? err.message : String(err),
          isError: true,
        })
        setBusy(false)
      }
    })()
  }

  const stop = (): void => loopRef.current?.cancel()

  // One-click AI actions from the ribbon (same pattern as the docs ribbon presets).
  // While a run is active the preset lands in the composer instead of being dropped silently.
  useEffect(() => {
    if (!preset) return
    if (loopRef.current?.busy) setPrompt(preset.text)
    else send(preset.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per nonce
  }, [preset?.nonce])

  /** Live document selection for the scope chip (page content only, not panel text) */
  const [scopeText, setScopeText] = useState<string | null>(null)
  useEffect(() => {
    const update = () => {
      const sel = window.getSelection()
      const body = document.querySelector('.pdf-body')
      const text =
        sel && !sel.isCollapsed && body?.contains(sel.anchorNode) ? sel.toString().trim() : ''
      setScopeText(text ? text.slice(0, 2000) : null)
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  // Re-derive the display width on window resize (max is 60% of the window);
  // growing the window back restores the preferred width
  useEffect(() => {
    const onResize = (): void => setPanelWidth(clampPanelWidth(preferredWidthRef.current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanupRef.current?.(), [])

  /** Drag the right edge to resize: the panel is flush with the window's left edge, so width = clientX */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const resizer = e.currentTarget
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: PointerEvent): void => {
      const w = clampPanelWidth(ev.clientX)
      preferredWidthRef.current = w
      setPanelWidth(w)
    }
    let done = false
    const cleanup = (): void => {
      if (done) return
      done = true
      resizeCleanupRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      resizer.removeEventListener('lostpointercapture', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
      localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(preferredWidthRef.current)))
    }
    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
    // lostpointercapture also fires if the resizer is unmounted mid-drag (panel collapse)
    resizer.addEventListener('lostpointercapture', cleanup)
    resizer.setPointerCapture(e.pointerId)
  }

  const typingLabel =
    phase === 'replying' ? t('aiReplying') : phase === 'working' ? t('aiWorking') : t('aiThinking')

  return (
    <aside
      ref={asideRef}
      className={`copilot${resizing ? ' ai-panel-resizing' : ''}`}
      style={{ width: '100%' }}
    >
      <div
        className="ai-panel-resizer"
        onPointerDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="ReveLith"
      />
      <header className="ai-panel-header">
        <span className="ai-panel-title">
          <ReveLithAiMark size={22} />
          ReveLith AI
        </span>
        <div className="ai-panel-header-actions">
          <QuickModelSelector
            getSettings={() => window.pdfApi.getAiSettings()}
            setSettings={(settings) => window.pdfApi.setAiSettings(settings as AiSettings)}
          />
          {chat.length > 0 && (
            <button
              className="ai-header-btn"
              onClick={() => {
                stop()
                loopRef.current?.reset()
                setBusy(false)
                setChat([])
              }}
              data-tip={t('aiNewChat')}
              aria-label={t('aiNewChat')}
            >
              <IconNewChat />
            </button>
          )}
          <button
            className="ai-header-btn"
            onClick={onCollapse}
            data-tip={t('aiCollapsePanel')}
            aria-label={t('aiCollapsePanel')}
          >
            <IconCollapse />
          </button>
        </div>
      </header>

      <div className="ai-chat" ref={chatRef} onScroll={onChatScroll}>
        {chat.length === 0 && (
          <div className="ai-chat-empty">
            <div className="ai-chat-empty-title">{t('aiEmptyTitle')}</div>
            <div className="ai-chat-empty-body">{t('aiEmptyBody')}</div>
            <div className="ai-quick-actions">
              <button className="ai-quick-btn" onClick={() => send(t('aiQuickSummaryPrompt'))}>
                {t('aiQuickSummary')}
              </button>
              <button className="ai-quick-btn" onClick={() => send(t('aiQuickKeyPointsPrompt'))}>
                {t('aiQuickKeyPoints')}
              </button>
            </div>
          </div>
        )}
        {chat.map((entry, i) => {
          if (entry.role === 'user') {
            return (
              <div key={i} className="ai-msg ai-msg-user">
                {entry.text}
                {entry.undelivered && (
                  <div className="ai-msg-undelivered">
                    {t('aiUndelivered')}
                    {!busy && (
                      <button className="ai-retry-btn" onClick={() => send(entry.text)}>
                        {t('aiRetry')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          }
          const hasTools = (entry.tools?.length ?? 0) > 0
          if (!entry.text && !hasTools) return null
          return (
            <div
              key={i}
              className={`ai-msg ai-msg-assistant${entry.isError ? ' ai-msg-error' : ''}`}
            >
              {hasTools && <ToolChipList tools={entry.tools!} />}
              {entry.text && <Markdown text={entry.text} />}
            </div>
          )
        })}
        {/* In-progress state: a standalone three-dot row at the end of the stream, kept until done */}
        {busy && <AiTypingIndicator label={typingLabel} />}
      </div>

      <div className="ai-composer">
        {scopeText && (
          <div className="ai-scope-chip" title={scopeText}>
            <span className="ai-scope-chip-label">{t('aiScopeSelection')}</span>
            <span className="ai-scope-chip-text">
              {scopeText.length > 80 ? `${scopeText.slice(0, 80)}…` : scopeText}
            </span>
            <button
              className="ai-scope-chip-clear"
              onClick={() => window.getSelection()?.removeAllRanges()}
              aria-label={t('aiScopeClear')}
              title={t('aiScopeClear')}
            >
              ×
            </button>
          </div>
        )}
        <AiComposer
          value={prompt}
          busy={busy}
          placeholder={t('aiComposerPlaceholder')}
          hintIdle={t('aiHintIdle')}
          hintBusy={t('aiHintBusy')}
          sendLabel={t('aiSend')}
          stopLabel={t('aiStop')}
          iconOnly
          sendIconEnabled={<img src={sendEnterOn} alt="" aria-hidden />}
          sendIconDisabled={<img src={sendEnterOff} alt="" aria-hidden />}
          stopIcon={<img src={sendStop} alt="" aria-hidden />}
          onChange={setPrompt}
          onSend={() => send(prompt)}
          onStop={stop}
        />
      </div>
    </aside>
  )
}

/** Tool row list (unified with docs/slides/sheets): dot + summary, expandable details when there's output */
/** Step-row status icons (timeline glyphs: 14px in a 20px slot, 1.6 stroke) */
function StepIcon({ status }: { status: 'running' | 'done' | 'error' }) {
  if (status === 'running') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6.5 3.5h11M6.5 20.5h11M8 3.5v3.2c0 2.6 4 4.2 4 5.3 0 1.1 4 2.7 4 5.3v3.2M16 3.5v3.2c0 2.6-4 4.2-4 5.3 0 1.1-4 2.7-4 5.3v3.2" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.4 2.4 2.4 4.6-5" />
    </svg>
  )
}

/** Tool activity group: a single quiet summary row
 *  that auto-opens while tools run, auto-collapses into "Worked · N steps" when they finish,
 *  and a manual toggle that always wins. Rows inside are step rows with 1px connectors. */
function ToolChipList({ tools }: { tools: ToolActivity[] }) {
  const { t: tr } = useI18n()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [userOpen, setUserOpen] = useState<boolean | null>(null)

  const toggle = (j: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(j)) next.delete(j)
      else next.add(j)
      return next
    })
  }

  const open = userOpen ?? false
  const label = tr('aiWorkedSteps', { n: tools.length })

  return (
    <div className="ai-work-group">
      <button
        type="button"
        className={`ai-work-group-summary`}
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
      >
        <span className="ai-work-group-label">{label}</span>
        <span className={`ai-tool-chip-caret${open ? ' open' : ''}`} aria-hidden>
          ›
        </span>
      </button>
      <div className={`ai-work-group-body${open ? ' open' : ''}`}>
        <div className="ai-work-group-body-inner">
          {tools.map((tool, j) => {
            const hasOutput = !!tool.output
            const isOpen = expanded.has(j)
            const stepStatus = tool.isError ? 'error' : 'done'
            return (
              <div key={j} className="ai-step-row">
                <span className={`ai-step-icon ${stepStatus}`} aria-hidden>
                  <StepIcon status={stepStatus} />
                </span>
                <div className="ai-step-content">
                  {hasOutput ? (
                    <button
                      type="button"
                      className="ai-step-title clickable"
                      data-tip={tool.name}
                      aria-expanded={isOpen}
                      onClick={() => toggle(j)}
                    >
                      {tool.summary}
                    </button>
                  ) : (
                    <span className="ai-step-title" data-tip={tool.name}>
                      {tool.summary}
                    </span>
                  )}
                  {hasOutput && isOpen && (
                    <div className="ai-step-detail">
                      <div className="ai-tool-output">
                        <div className="ai-tool-output-pre">{tool.output}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Svg({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function IconNewChat(): ReactElement {
  return (
    <Svg>
      <path
        d="M13.5 7.2v-3A1.7 1.7 0 0 0 11.8 2.5H4.2a1.7 1.7 0 0 0-1.7 1.7v6.1a1.7 1.7 0 0 0 1.7 1.7h1.1v2l2.6-2h1.3"
        strokeLinejoin="round"
      />
      <path d="M12.2 9.4v4M10.2 11.4h4" />
    </Svg>
  )
}

/* Same glyph as the sheets IconCollapse (16×16 viewBox, 1.2/1.3 stroke), rendered at 15px */
function IconCollapse(): ReactElement {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden
    >
      {/* Mirrored: the AI panel docks on the LEFT, so the divider and arrow point left */}
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M5.5 2.5v11" />
      <path d="M12.5 8H8.1M9.8 5.9 7.7 8l2.1 2.1" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

/** ReveLith AI brand mark (orbital glyph) */
export function ReveLithAiMark({ size = 18 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="16" cy="16" r="2.2" fill="#38bdf8" />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="5.5"
        stroke="#38bdf8"
        strokeWidth="2"
        transform="rotate(0 16 16)"
      />
      <circle cx="28" cy="16" r="2" fill="#67e8f9" />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="5.5"
        stroke="#60a5fa"
        strokeWidth="2"
        transform="rotate(60 16 16)"
      />
      <circle cx="10" cy="5.6" r="2" fill="#93c5fd" />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="5.5"
        stroke="#818cf8"
        strokeWidth="2"
        transform="rotate(120 16 16)"
      />
      <circle cx="10" cy="26.4" r="2" fill="#c7d2fe" />
    </svg>
  )
}
