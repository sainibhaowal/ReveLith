/**
 * Shared AI-panel chrome for the editor modules: the persisted panel
 * preferences the shell Settings writes, the collapsed-panel side button, the
 * scope-quote chip, and the auto-save preference the editor toggles.
 *
 * The preferences live in the main process (the Settings window is a different
 * WebContents from every editor), so the renderers read them over IPC and
 * apply them here.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

// ── persisted preferences ───────────────────────────────────────────────

/** AI panel text size + chat-input spellcheck + dock side (Settings → General). */
export interface AiPanelPrefs {
  /** CSS length, e.g. '14px' */
  fontSize: string
  spellcheck: boolean
  side: 'left' | 'right'
}

export const DEFAULT_AI_PANEL_PREFS: AiPanelPrefs = {
  fontSize: '14px',
  spellcheck: true,
  side: 'right',
}

/** Coerce whatever came over IPC into a usable prefs object. */
export function normalizeAiPanelPrefs(raw: unknown): AiPanelPrefs {
  const value = (raw ?? {}) as Partial<AiPanelPrefs>
  return {
    fontSize: typeof value.fontSize === 'string' && value.fontSize ? value.fontSize : '14px',
    spellcheck: typeof value.spellcheck === 'boolean' ? value.spellcheck : true,
    side: value.side === 'left' ? 'left' : 'right',
  }
}

/**
 * Apply prefs to the document: the CSS variable every panel styles against, a
 * data attribute for the dock side, and the native spellcheck flag on the AI
 * composer. A second call (from the prefs-changed event) re-applies them, so a
 * Settings change reaches every open editor without a reload.
 */
export function applyAiPanelPrefs(prefs: unknown): void {
  const value = normalizeAiPanelPrefs(prefs)
  const root = document.documentElement
  root.style.setProperty('--ai-panel-font-size', value.fontSize)
  root.dataset.aiPanelSide = value.side
  for (const el of document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(
    '[data-ai-composer]',
  )) {
    el.spellcheck = value.spellcheck
  }
  window.dispatchEvent(new CustomEvent('revelith-ai-panel-prefs-applied', { detail: value }))
}

// ── geometry ────────────────────────────────────────────────────────────

/**
 * Panel width for a pointer position while dragging the rail's edge. The rail
 * sits on the dock side, so the width is the distance from that edge — reading
 * the side off the applied prefs keeps the caller to a single argument.
 */
export function aiPanelWidthAtPointer(clientX: number): number {
  const side = document.documentElement.dataset.aiPanelSide === 'left' ? 'left' : 'right'
  return side === 'left' ? clientX : window.innerWidth - clientX
}

// ── side button ─────────────────────────────────────────────────────────

interface AiPanelSideButtonProps {
  /** UI language, so the chevron points the right way in an RTL layout */
  lang: string
  /** move the panel to the other side; resolves with the prefs now in effect */
  onMove: (side: 'left' | 'right') => Promise<AiPanelPrefs> | AiPanelPrefs
}

/**
 * The collapsed-panel affordance: one button that re-docks the panel to the
 * other side. It reads the current side from the applied prefs, so the panel
 * chrome does not have to thread that state through.
 */
export function AiPanelSideButton({ lang, onMove }: AiPanelSideButtonProps): ReactElement {
  const [side, setSide] = useState<'left' | 'right'>(() =>
    document.documentElement.dataset.aiPanelSide === 'left' ? 'left' : 'right',
  )
  const [busy, setBusy] = useState(false)
  const rtl = lang === 'ar' || lang === 'he' || lang === 'fa' || lang === 'ur'

  useEffect(() => {
    const onApplied = (event: Event) => {
      const detail = (event as CustomEvent<AiPanelPrefs>).detail
      if (detail?.side) setSide(detail.side)
    }
    window.addEventListener('revelith-ai-panel-prefs-applied', onApplied)
    return () => window.removeEventListener('revelith-ai-panel-prefs-applied', onApplied)
  }, [])

  const move = () => {
    if (busy) return
    setBusy(true)
    const next = side === 'left' ? 'right' : 'left'
    void Promise.resolve(onMove(next))
      .then((prefs) => {
        const resolved = normalizeAiPanelPrefs(prefs)
        applyAiPanelPrefs(resolved)
        setSide(resolved.side)
      })
      .catch(() => {
        /* the main process refused: leave the panel where it was */
      })
      .finally(() => setBusy(false))
  }

  // the chevron points at the edge the panel would move to
  const chevron = rtl ? (side === 'left' ? '›' : '‹') : side === 'left' ? '‹' : '›'
  const label =
    side === 'left' ? 'Move the assistant to the right' : 'Move the assistant to the left'

  return (
    <button
      type="button"
      className="ai-panel-side-button"
      data-side={side}
      title={label}
      aria-label={label}
      disabled={busy}
      onClick={move}
    >
      <span aria-hidden="true">{chevron}</span>
    </button>
  )
}

// ── scope quote ─────────────────────────────────────────────────────────

/** What the user had selected (or which page/range) when they sent the turn. */
export interface AiScopeQuoteData {
  /** location hint, e.g. "Element <h2>" or "Page 3" */
  label: string
  /** the quoted text, when there was any (a big element is not quoted) */
  text?: string | undefined
}

interface AiScopeQuoteProps {
  scope: AiScopeQuoteData
}

/** Chip that shows which selection a stored question referred to. */
export function AiScopeQuote({ scope }: AiScopeQuoteProps): ReactElement | null {
  const text = scope.text?.trim() ?? ''
  if (!text) return null
  return (
    <figure className="ai-scope-quote">
      <figcaption className="ai-scope-quote-label">{scope.label}</figcaption>
      <blockquote>{text}</blockquote>
    </figure>
  )
}

/** Wrap AI panel content with the panel's own padding and font size. */
export function AiPanelBody({
  children,
  style,
}: {
  children: ReactNode
  style?: object
}): ReactElement {
  return (
    <div className="ai-panel-body" style={style}>
      {children}
    </div>
  )
}

// ── auto-save preference ────────────────────────────────────────────────

/** The slice of an editor's preload API the preference needs. */
export interface AutoSavePrefApi {
  getAutoSaveDefault(): Promise<{ on: boolean; updatedAt: number }>
  onAutoSaveDefaultChanged(handler: (value: { on: boolean; updatedAt: number }) => void): () => void
}

/**
 * Auto-save toggle state for an editor: the user's per-document choice wins
 * once made, otherwise the shell-wide default applies. The default can change
 * while an editor is open (Settings is a different window), so it is
 * subscribed to; the override is stored under `key` so it survives a reopen.
 */
export function useAutoSavePref(
  key: string,
  api: AutoSavePrefApi,
): [boolean, (on: boolean) => void] {
  const [override, setOverride] = useState<boolean | null>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === '1' || raw === 'true') return true
      if (raw === '0' || raw === 'false') return false
    } catch {
      /* private mode: fall back to the shell default */
    }
    return null
  })
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    let alive = true
    void api
      .getAutoSaveDefault()
      .then((value) => {
        if (alive) setFallback(value?.on === true)
      })
      .catch(() => {
        /* no handler registered (standalone launch): keep the default off */
      })
    const off = api.onAutoSaveDefaultChanged((value) => setFallback(value?.on === true))
    return () => {
      alive = false
      off()
    }
  }, [api])

  const set = useCallback(
    (on: boolean) => {
      setOverride(on)
      try {
        localStorage.setItem(key, on ? '1' : '0')
      } catch {
        /* private mode: the choice holds for this session only */
      }
      window.dispatchEvent(
        new CustomEvent('revelith-autosave-changed', { detail: { enabled: on } }),
      )
    },
    [key],
  )

  return [override ?? fallback, set]
}

/** Scroll an element into view once, when it first appears. */
export function useScrollIntoViewOnMount<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return ref
}
