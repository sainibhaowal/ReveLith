/**
 * Find-in-document overlay shared by the editors. The host owns the search
 * backend (CodeMirror decorations, a ProseMirror plugin, or a plain text scan);
 * this component owns the fields, the match counter and the keyboard map, so
 * every editor's find behaves the same way.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { foldCase } from './fold-case'

/** Search behavior flags, exactly what the host's matcher needs. */
export interface FindOptions {
  matchCase: boolean
  wholeWord: boolean
}

/** One hit: character offsets into the host's text. */
export interface FindMatch {
  from: number
  to: number
}

/** The search backend the panel drives. */
export interface FindTarget {
  /** false for a read-only document: the panel hides the replace row */
  readonly editable: boolean
  /** run a search; returns the hit count (and re-paints the highlights) */
  search(query: string, options: FindOptions, activeIndex: number): number
  /** make hit `index` the active one and scroll it into view */
  activate(index: number): void
  /** replace the hit at `index`; the host re-runs the search afterwards */
  replaceOne(index: number, replacement: string): void
  /** replace every current hit */
  replaceAll(replacement: string): void
  /** drop all hits and highlights (panel closed, or the document emptied) */
  clear(): void
  /** subscribe to document edits; returns the unsubscribe function */
  onDocChanged(listener: () => void): () => void
}

/** Localized copy for the panel. */
export interface FindPanelStrings {
  findPlaceholder: string
  replacePlaceholder: string
  matchCase: string
  wholeWord: string
  /** shown in the counter when the query matches nothing */
  noResults: string
  prevMatch: string
  nextMatch: string
  closeEsc: string
  replace: string
  replaceAll: string
}

/** A focus request from the host: which field, and a nonce so repeats re-focus. */
export interface FindFocusRequest {
  field: 'find' | 'replace'
  nonce: number
}

interface FindPanelProps {
  target: FindTarget
  strings: FindPanelStrings
  onClose: () => void
  /** host asks for focus (ribbon button, keyboard shortcut) */
  focusRequest?: FindFocusRequest | null
  /** extra classes on the panel root */
  className?: string
}

/** A word character for the whole-word boundary test (letters, digits, _). */
const WORDISH = /[\p{L}\p{N}_]/u

/**
 * Character offsets of `query` in `text`, honoring matchCase / wholeWord.
 *
 * Plain substring scan on purpose: the panel is a "find text" box, not a regex
 * box, so a pattern can never throw at the user. Case folding goes through
 * `foldCase` rather than `toLowerCase`, which is length-preserving — otherwise
 * a page containing 'İ' would report every hit after it at the wrong offset.
 */
export function findInText(text: string, query: string, options: FindOptions): number[] {
  if (!query) return []
  const haystack = options.matchCase ? text : foldCase(text)
  const needle = options.matchCase ? query : foldCase(query)
  if (!needle) return []
  const hits: number[] = []
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) break
    const end = at + needle.length
    // the boundary test reads the ORIGINAL text, so a fold that changes a
    // character can never make a word boundary look like a word character
    const before = at > 0 ? text[at - 1]! : ''
    const after = end < text.length ? text[end]! : ''
    if (!options.wholeWord || (!WORDISH.test(before) && !WORDISH.test(after))) hits.push(at)
    // advance past the match, not by one character: "aa" in "aaaa" is two
    // hits, and a one-character step would report every intermediate offset
    from = at + needle.length
  }
  return hits
}

/**
 * Settle time after the last keystroke before the scan runs. A page of text
 * can hold tens of thousands of characters, and re-scanning on every keypress
 * is what makes a find box feel sticky in big documents.
 */
const DEBOUNCE_MS = 120

export function FindPanel({
  target,
  strings,
  onClose,
  focusRequest,
  className,
}: FindPanelProps): ReactElement {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [options, setOptions] = useState<FindOptions>({ matchCase: false, wholeWord: false })
  const [total, setTotal] = useState(0)
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const findRef = useRef<HTMLInputElement | null>(null)
  const replaceRef = useRef<HTMLInputElement | null>(null)
  // -1, not 0: the host's first focus request legitimately uses nonce 0
  const lastNonce = useRef(-1)
  // the live hit count, so an edit callback re-scans at the current cursor
  const totalRef = useRef(0)
  const activeRef = useRef(0)

  /** Run the search, paint the new hit count and reveal the active hit. */
  const runSearch = useCallback(
    (nextQuery: string, nextOptions: FindOptions, nextActive: number) => {
      setError(null)
      let count: number
      try {
        count = nextQuery ? target.search(nextQuery, nextOptions, nextActive) : 0
      } catch (err) {
        count = 0
        setError(err instanceof Error ? err.message : String(err))
      }
      const clamped = count === 0 ? 0 : Math.min(nextActive, count - 1)
      totalRef.current = count
      activeRef.current = clamped
      setTotal(count)
      setActive(clamped)
      if (count > 0) target.activate(clamped)
    },
    [target],
  )

  // debounce the scan: a keystroke should not cost a full-document pass
  useEffect(() => {
    if (!query) {
      totalRef.current = 0
      activeRef.current = 0
      setTotal(0)
      setActive(0)
      return
    }
    const timer = setTimeout(() => runSearch(query, options, 0), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, options, runSearch])

  // an edit invalidates every hit: re-scan so offsets stay truthful
  useEffect(() => {
    if (!query) return
    return target.onDocChanged(() => runSearch(query, options, activeRef.current))
  }, [target, query, options, runSearch])

  // drop the highlights when the host closes the panel
  useEffect(() => () => target.clear(), [target])

  useEffect(() => {
    if (!focusRequest || focusRequest.nonce === lastNonce.current) return
    lastNonce.current = focusRequest.nonce
    const el = focusRequest.field === 'replace' ? replaceRef.current : findRef.current
    el?.focus()
    el?.select()
  }, [focusRequest])

  const step = (delta: number) => {
    if (total === 0) return
    const next = (activeRef.current + delta + total) % total
    activeRef.current = next
    setActive(next)
    target.activate(next)
  }

  const replace = (all: boolean) => {
    if (total === 0) return
    if (all) target.replaceAll(replacement)
    else target.replaceOne(activeRef.current, replacement)
    // the edit listener re-scans; re-anchor on the first hit right away so the
    // counter never shows stale positions
    runSearch(query, options, 0)
  }

  const countLabel = error
    ? error
    : total === 0
      ? query
        ? strings.noResults
        : ''
      : `${active + 1}/${total}`

  return (
    <div className={className ? `find-panel ${className}` : 'find-panel'} role="search">
      <div className="find-row">
        <input
          ref={findRef}
          className="find-input"
          type="text"
          value={query}
          placeholder={strings.findPlaceholder}
          aria-label={strings.findPlaceholder}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey) step(-1)
              else step(1)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
        <span className="find-count" role="status" aria-live="polite">
          {countLabel}
        </span>
        <button
          type="button"
          className="find-btn"
          title={strings.prevMatch}
          aria-label={strings.prevMatch}
          disabled={total === 0}
          onClick={() => step(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="find-btn"
          title={strings.nextMatch}
          aria-label={strings.nextMatch}
          disabled={total === 0}
          onClick={() => step(1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="find-btn find-close"
          title={strings.closeEsc}
          aria-label={strings.closeEsc}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="find-options">
        <label>
          <input
            type="checkbox"
            checked={options.matchCase}
            onChange={() => setOptions((prev) => ({ ...prev, matchCase: !prev.matchCase }))}
          />
          {strings.matchCase}
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.wholeWord}
            onChange={() => setOptions((prev) => ({ ...prev, wholeWord: !prev.wholeWord }))}
          />
          {strings.wholeWord}
        </label>
      </div>

      {target.editable && (
        <div className="find-row">
          <input
            ref={replaceRef}
            className="find-input"
            type="text"
            value={replacement}
            placeholder={strings.replacePlaceholder}
            aria-label={strings.replacePlaceholder}
            spellCheck={false}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                replace(false)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
          />
          <button
            type="button"
            className="find-action"
            disabled={total === 0}
            onClick={() => replace(false)}
          >
            {strings.replace}
          </button>
          <button
            type="button"
            className="find-action"
            disabled={total === 0}
            onClick={() => replace(true)}
          >
            {strings.replaceAll}
          </button>
        </div>
      )}
    </div>
  )
}
