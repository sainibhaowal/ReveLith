import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface GhostCompletionState {
  ghostText: string
  pos: number
  active: boolean
}

export const ghostCompletionPluginKey = new PluginKey<GhostCompletionState>('ghostCompletion')

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let activeAbortController: AbortController | null = null

export const GhostCompletionExtension = Extension.create({
  name: 'ghostCompletion',

  addProseMirrorPlugins() {
    return [
      new Plugin<GhostCompletionState>({
        key: ghostCompletionPluginKey,
        state: {
          init: () => ({ ghostText: '', pos: 0, active: false }),
          apply(tr, prev) {
            const meta = tr.getMeta(ghostCompletionPluginKey) as
              Partial<GhostCompletionState> | undefined
            if (meta) {
              return { ...prev, ...meta }
            }
            if (tr.docChanged && prev.active) {
              // Dismiss ghost text on doc mutation if not explicitly updated
              return { ghostText: '', pos: 0, active: false }
            }
            return prev
          },
        },
        props: {
          decorations(state) {
            const pluginState = ghostCompletionPluginKey.getState(state)
            if (!pluginState || !pluginState.active || !pluginState.ghostText) {
              return DecorationSet.empty
            }

            const { ghostText, pos } = pluginState
            if (pos > state.doc.content.size) return DecorationSet.empty

            const widget = Decoration.widget(
              pos,
              () => {
                const span = document.createElement('span')
                span.className = 'revelith-ghost-text'
                span.textContent = ghostText
                span.setAttribute('aria-hidden', 'true')
                return span
              },
              { side: 1 },
            )

            return DecorationSet.create(state.doc, [widget])
          },
          handleKeyDown(view, event) {
            const state = ghostCompletionPluginKey.getState(view.state)
            if (!state || !state.active || !state.ghostText) return false

            // 1. Tab: Accept full completion
            if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
              event.preventDefault()
              const { ghostText, pos } = state
              const tr = view.state.tr
                .insertText(ghostText, pos)
                .setMeta(ghostCompletionPluginKey, { ghostText: '', pos: 0, active: false })
              view.dispatch(tr)
              return true
            }

            // 2. Ctrl + ArrowRight (or Cmd + ArrowRight on Mac): Accept next word
            const isWordAccept =
              event.key === 'ArrowRight' &&
              (event.ctrlKey || event.metaKey) &&
              !event.shiftKey &&
              !event.altKey

            if (isWordAccept) {
              event.preventDefault()
              const { ghostText, pos } = state
              // Extract first word + trailing whitespace
              const match = ghostText.match(/^(\S+\s*)/)
              if (match && match[1]) {
                const word = match[1]
                const remaining = ghostText.slice(word.length)
                const nextPos = pos + word.length
                const tr = view.state.tr.insertText(word, pos).setMeta(ghostCompletionPluginKey, {
                  ghostText: remaining,
                  pos: nextPos,
                  active: remaining.length > 0,
                })
                view.dispatch(tr)
                return true
              }
            }

            // 3. Escape: Dismiss
            if (event.key === 'Escape') {
              event.preventDefault()
              view.dispatch(
                view.state.tr.setMeta(ghostCompletionPluginKey, {
                  ghostText: '',
                  pos: 0,
                  active: false,
                }),
              )
              return true
            }

            return false
          },
        },
      }),
    ]
  },
})

/** Calls the main process for a one-shot inline completion */
export async function fetchInlineCompletion(
  before: string,
  after: string,
  groundedContext?: string,
): Promise<string> {
  try {
    const result = await window.desktop.inlineComplete({ before, after, groundedContext })
    return result?.text ?? ''
  } catch {
    return ''
  }
}

/** First whitespace-delimited word (plus trailing space) of ghost text. */
export function takeFirstWord(ghostText: string): { word: string; remaining: string } | null {
  const match = ghostText.match(/^(\S+\s*)/)
  if (!match || !match[1]) return null
  const word = match[1]
  return { word, remaining: ghostText.slice(word.length) }
}

export type GhostMode = 'short' | 'auto'

/** System prompt per mode. Auto mode writes multi-paragraph continuations. */
export function buildGhostSystemPrompt(mode: GhostMode, grounded: boolean): string {
  const base =
    'You are an inline text completion engine for a document editor. ' +
    'Output ONLY the continuation text, no explanations, no formatting, no markdown. ' +
    'Match the user language, tone, and style.'
  if (mode === 'auto') {
    return (
      `${base} Continue the document with the next paragraphs (2-5 short paragraphs, ` +
      'blank line between paragraphs). Decide the structure yourself: new idea = new paragraph. ' +
      'Plain prose only, no headings markers, no bullet characters.' +
      (grounded ? ' Use ONLY facts from the provided sources.' : '')
    )
  }
  return (
    `${base} Keep it concise: 1-3 sentences or a single formula.` +
    (grounded ? ' Use ONLY facts from the provided sources.' : '')
  )
}

export interface GhostStreamContext {
  before: string
  after: string
  outline: string[]
  grounded: string
  web: string
}

/** User message per mode, with optional outline / grounded / web context. */
export function buildGhostUserMessage(ctx: GhostStreamContext, mode: GhostMode): string {
  const parts: string[] = []
  if (ctx.outline.length > 0) {
    parts.push(`Document outline so far:\n${ctx.outline.slice(-12).join('\n')}`)
  }
  if (ctx.grounded) {
    parts.push(`Grounded sources (only use these facts):\n${ctx.grounded.slice(0, 4000)}`)
  }
  if (ctx.web) {
    parts.push(`Fresh web context (may help, never quote blindly):\n${ctx.web.slice(0, 2000)}`)
  }
  parts.push(`Text before cursor:\n${ctx.before.slice(-1200)}`)
  parts.push(`Text after cursor:\n${ctx.after.slice(0, 300)}`)
  parts.push(
    mode === 'auto'
      ? 'Continue naturally from the cursor position.'
      : 'Continue naturally from the cursor position with a short completion.',
  )
  return parts.join('\n\n')
}

/** Headings already in the document (for structure-aware continuation). */
export function extractDocOutline(headings: Array<{ level: number; text: string }>): string[] {
  return headings
    .map((h) => `${'#'.repeat(Math.min(Math.max(h.level, 1), 3))} ${h.text.trim()}`.trim())
    .filter((line) => line.replace(/#+\s*/, '').length > 0)
    .slice(-20)
}

export interface GhostStreamOptions {
  delayMs?: number
  mode?: GhostMode
  /** Returns grounded source text when Grounded Write is on (else undefined). */
  getGroundedContext?: () => string | undefined
  /** When true (auto mode), race a web search for factual context (capped wait). */
  webSearch?: boolean
  /** Auto-insert the finished suggestion after this many idle ms (0 = manual Tab only). */
  autoAcceptMs?: number
}

interface ActiveStream {
  readonly requestId: string
  readonly pos: number
  offChunk: () => void
  settled: boolean
  done: boolean
  autoTimer: ReturnType<typeof setTimeout> | null
  text: string
}

let activeStream: ActiveStream | null = null

function teardownStream(cancelRemote: boolean): void {
  const stream = activeStream
  activeStream = null
  if (!stream) return
  stream.settled = true
  if (stream.autoTimer) clearTimeout(stream.autoTimer)
  try {
    stream.offChunk()
  } catch {
    /* listener already gone */
  }
  if (cancelRemote) {
    try {
      void window.desktop.aiStreamCancel(stream.requestId)
    } catch {
      /* remote already finished */
    }
  }
}

/** Accept whatever ghost text is currently shown (full Tab semantics). */
export function acceptGhostText(editor: any): boolean {
  if (!editor || editor.isDestroyed) return false
  const state = ghostCompletionPluginKey.getState(editor.state)
  if (!state || !state.active || !state.ghostText) return false
  const { ghostText, pos } = state
  editor.view.dispatch(
    editor.state.tr
      .insertText(ghostText, pos)
      .setMeta(ghostCompletionPluginKey, { ghostText: '', pos: 0, active: false }),
  )
  return true
}

function setGhostText(editor: any, pos: number, text: string): void {
  if (editor.isDestroyed) return
  editor.view.dispatch(
    editor.state.tr.setMeta(ghostCompletionPluginKey, {
      ghostText: text,
      pos,
      active: text.length > 0,
    }),
  )
}

/**
 * Live-streaming ghost completion: tokens render as they arrive (~1s to
 * first token) instead of waiting for the full response. Typing, cursor
 * moves, and Escape abort the stream; Tab accepts whatever has streamed.
 */
export function requestGhostStream(editor: any, opts: GhostStreamOptions = {}): void {
  if (!editor || editor.isDestroyed) return
  const { delayMs = 320 } = opts

  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  teardownStream(true)

  debounceTimer = setTimeout(() => {
    void runGhostStream(editor, opts).catch(() => {})
  }, delayMs)
}

async function runGhostStream(editor: any, opts: GhostStreamOptions): Promise<void> {
  const mode = opts.mode ?? 'short'
  const state = editor.state
  const { selection } = state
  if (!selection.empty || editor.isDestroyed) return

  const pos = selection.from
  const textBefore = state.doc.textBetween(Math.max(0, pos - 1200), pos, '\n', '\n')
  const textAfter = state.doc.textBetween(
    pos,
    Math.min(state.doc.content.size, pos + 300),
    '\n',
    '\n',
  )
  if (textBefore.trim().length < 3) return

  // Document outline for structure-aware continuation (cheap, synchronous).
  const outline: string[] = []
  try {
    state.doc.descendants((node: any) => {
      if (node.type?.name === 'docHeading') {
        outline.push(node.textContent ?? '')
      }
      return true
    })
  } catch {
    /* outline is best-effort */
  }

  const grounded = opts.getGroundedContext?.() ?? ''

  // Optional web context: capped race so a slow search never delays tokens.
  let web = ''
  if (opts.webSearch) {
    try {
      const keywords = textBefore.trim().split(/\s+/).slice(-12).join(' ')
      const search = await Promise.race([
        window.desktop.webSearch(keywords, 3).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 800)),
      ])
      const results = (search as { results?: Array<{ title: string; snippet: string }> } | null)
        ?.results
      if (results && results.length > 0) {
        web = results
          .slice(0, 3)
          .map((r) => `- ${r.title}: ${r.snippet}`)
          .join('\n')
      }
    } catch {
      /* search is advisory only */
    }
    if (
      editor.isDestroyed ||
      editor.state.selection.from !== pos ||
      !editor.state.selection.empty
    ) {
      return
    }
  }

  let settings: any
  try {
    settings = await window.desktop.getAiSettings()
  } catch {
    return
  }
  if (editor.isDestroyed || editor.state.selection.from !== pos || !editor.state.selection.empty) {
    return
  }

  const system = buildGhostSystemPrompt(mode, grounded.length > 0)
  const user = buildGhostUserMessage(
    {
      before: textBefore,
      after: textAfter,
      outline: extractDocOutline(outline.map((text) => ({ level: 1, text }))),
      grounded,
      web,
    },
    mode,
  )
  const requestId = crypto.randomUUID()
  const stream: ActiveStream = {
    requestId,
    pos,
    offChunk: () => {},
    settled: false,
    done: false,
    autoTimer: null,
    text: '',
  }

  const offChunk = window.desktop.onAiStream((chunk: any) => {
    if (!chunk || chunk.requestId !== requestId || stream.settled) return
    if (editor.isDestroyed) {
      teardownStream(true)
      return
    }
    // Cursor moved or text selected mid-stream: abort, keep nothing.
    if (editor.state.selection.from !== pos || !editor.state.selection.empty) {
      clearGhostCompletion(editor)
      teardownStream(true)
      return
    }
    if (chunk.type === 'delta' && typeof chunk.text === 'string' && chunk.text) {
      stream.text += chunk.text
      setGhostText(editor, pos, stream.text)
    } else if (chunk.type === 'done') {
      stream.done = true
      stream.offChunk()
      activeStream = null
      stream.settled = true
      if ((opts.autoAcceptMs ?? 0) > 0 && stream.text.trim().length > 0) {
        stream.autoTimer = setTimeout(() => {
          acceptGhostText(editor)
        }, opts.autoAcceptMs)
        // Re-arm teardown visibility without cancelling remote (already done).
        activeStream = { ...stream, offChunk: () => {}, autoTimer: stream.autoTimer }
      }
    } else if (chunk.type === 'error') {
      teardownStream(false)
      clearGhostCompletion(editor)
    }
  })
  stream.offChunk = offChunk
  activeStream = stream

  try {
    await window.desktop.aiStream({
      requestId,
      settings,
      system,
      messages: [{ role: 'user', text: user }],
      maxTokens: mode === 'auto' ? 600 : 80,
    })
  } catch {
    teardownStream(false)
    clearGhostCompletion(editor)
  }
}

/** Abort any live ghost stream (typing, cursor move, pause toggle). */
export function clearGhostStream(cancelRemote = true): void {
  teardownStream(cancelRemote)
}

/** Triggers inline completion request with debouncing */
export function requestGhostCompletion(
  editor: any,
  delayMs = 320,
  getGroundedContext?: () => string | undefined,
): void {
  if (!editor || editor.isDestroyed) return

  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (activeAbortController) {
    activeAbortController.abort()
    activeAbortController = null
  }

  debounceTimer = setTimeout(async () => {
    try {
      const state = editor.state
      const { selection } = state
      if (!selection.empty) return

      const pos = selection.from
      const textBefore = state.doc.textBetween(Math.max(0, pos - 1200), pos, '\n', '\n')
      const textAfter = state.doc.textBetween(
        pos,
        Math.min(state.doc.content.size, pos + 300),
        '\n',
        '\n',
      )

      if (textBefore.trim().length < 3) return

      const controller = new AbortController()
      activeAbortController = controller

      const grounded = getGroundedContext?.()
      const suggestion = await fetchInlineCompletion(textBefore, textAfter, grounded)
      if (controller.signal.aborted) return

      if (suggestion && suggestion.trim().length > 0) {
        // Ensure cursor hasn't moved
        if (editor.state.selection.from === pos) {
          editor.view.dispatch(
            editor.state.tr.setMeta(ghostCompletionPluginKey, {
              ghostText: suggestion,
              pos,
              active: true,
            }),
          )
        }
      }
    } catch {
      // Quietly ignore completion network or abort errors
    }
  }, delayMs)
}

/** Clears any active ghost text */
export function clearGhostCompletion(editor: any): void {
  if (!editor || editor.isDestroyed) return
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  const state = ghostCompletionPluginKey.getState(editor.state)
  if (state?.active) {
    editor.view.dispatch(
      editor.state.tr.setMeta(ghostCompletionPluginKey, {
        ghostText: '',
        pos: 0,
        active: false,
      }),
    )
  }
}
