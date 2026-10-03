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
    const { ipcRenderer } = await import('electron')
    const result = await ipcRenderer.invoke('ai:inline-complete', {
      before,
      after,
      ...(groundedContext ? { groundedContext } : {}),
    })
    return result?.text ?? ''
  } catch {
    return ''
  }
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
