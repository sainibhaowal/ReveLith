import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { searchPluginKey } from '../editor/searchHighlight'

export interface Range {
  from: number
  to: number
}

export interface FindOptions {
  matchCase: boolean
  wholeWord: boolean
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch)

export function foldCase(s: string): string {
  let out = ''
  for (const ch of s) {
    const lower = ch.toLowerCase()
    out += lower.length === ch.length ? lower : ch
  }
  return out
}

export function findMatches(editor: Editor, query: string, opts: FindOptions): Range[] {
  const found: Range[] = []
  if (!query) return found
  const needle = opts.matchCase ? query : foldCase(query)
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const posAt: number[] = []
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        for (let k = 0; k < child.text.length; k++) posAt.push(pos + 1 + offset + k)
        text += child.text
      } else {
        posAt.push(pos + 1 + offset)
        text += '\u0000'
      }
    })
    const haystack = opts.matchCase ? text : foldCase(text)
    let i = 0
    while ((i = haystack.indexOf(needle, i)) !== -1) {
      const isWhole =
        !opts.wholeWord || (!isWordChar(text[i - 1]) && !isWordChar(text[i + query.length]))
      if (isWhole) {
        found.push({ from: posAt[i]!, to: posAt[i + query.length - 1]! + 1 })
        i += query.length
      } else {
        i += 1
      }
    }
    return false
  })
  return found
}

export interface FindReplaceBarProps {
  editor: Editor
  isOpen: boolean
  initialReplaceOpen?: boolean
  onClose: () => void
}

const SCAN_DEBOUNCE_MS = 150

export function FindReplaceBar({
  editor,
  isOpen,
  initialReplaceOpen = false,
  onClose,
}: FindReplaceBarProps) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [replaceMode, setReplaceMode] = useState(initialReplaceOpen)
  const [matches, setMatches] = useState<Range[]>([])
  const [index, setIndex] = useState(0)
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const indexRef = useRef(0)

  useEffect(() => {
    if (initialReplaceOpen) setReplaceMode(true)
  }, [initialReplaceOpen])

  const highlight = useCallback(
    (ranges: Range[], activeIndex: number) => {
      editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, { ranges, activeIndex }))
    },
    [editor],
  )

  const scrollTo = useCallback(
    (range: Range) => {
      const { node } = editor.view.domAtPos(range.from)
      const el = node instanceof HTMLElement ? node : node.parentElement
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
    [editor],
  )

  const refresh = useCallback(
    (q: string, keepIndex = 0, opts?: Partial<FindOptions>) => {
      const ranges = findMatches(editor, q, { matchCase, wholeWord, ...opts })
      const active = ranges.length === 0 ? 0 : Math.min(keepIndex, ranges.length - 1)
      setMatches(ranges)
      setIndex(active)
      indexRef.current = active
      highlight(ranges, active)
      return ranges
    },
    [editor, highlight, matchCase, wholeWord],
  )

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const timerRef = useRef<number | null>(null)
  const pendingKeepRef = useRef<'reset' | 'current'>('reset')

  const scheduleRefresh = useCallback((q: string, keep: 'reset' | 'current' = 'reset') => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    pendingKeepRef.current = keep
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      refreshRef.current(q, keep === 'current' ? indexRef.current : 0)
    }, SCAN_DEBOUNCE_MS)
  }, [])

  const flushPending = useCallback(
    (q: string) => {
      if (timerRef.current === null) return null
      window.clearTimeout(timerRef.current)
      timerRef.current = null
      const keep = pendingKeepRef.current
      return {
        ranges: refresh(q, keep === 'current' ? indexRef.current : 0),
        queryChanged: keep === 'reset',
      }
    },
    [refresh],
  )

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    } else {
      highlight([], 0)
    }
  }, [isOpen, highlight])

  const queryRef = useRef(query)
  queryRef.current = query
  useEffect(() => {
    const onUpdate = () => {
      if (queryRef.current && isOpen) scheduleRefresh(queryRef.current, 'current')
    }
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
    }
  }, [editor, isOpen, scheduleRefresh])

  const close = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    highlight([], 0)
    onClose()
  }, [highlight, onClose])

  const step = useCallback(
    (dir: 1 | -1) => {
      const fresh = flushPending(query)
      const ranges = fresh ? fresh.ranges : matches
      if (ranges.length === 0) return
      const next = fresh?.queryChanged
        ? indexRef.current
        : ((fresh ? indexRef.current : index) + dir + ranges.length) % ranges.length
      setIndex(next)
      indexRef.current = next
      highlight(ranges, next)
      if (ranges[next]) scrollTo(ranges[next]!)
    },
    [flushPending, query, matches, index, highlight, scrollTo],
  )

  const replaceOne = useCallback(() => {
    if (!editor.isEditable) return
    const fresh = flushPending(query)
    const ranges = fresh ? fresh.ranges : matches
    const at = fresh ? indexRef.current : index
    const m = ranges[at]
    if (!m) return
    editor.commands.command(({ tr }) => {
      tr.insertText(replacement, m.from, m.to)
      return true
    })
    const after = refresh(query, at)
    if (after.length > 0) scrollTo(after[Math.min(at, after.length - 1)]!)
  }, [editor, flushPending, matches, index, replacement, query, refresh, scrollTo])

  const replaceAll = useCallback(() => {
    if (!editor.isEditable) return
    const fresh = flushPending(query)
    const ranges = fresh ? fresh.ranges : matches
    if (ranges.length === 0) return
    editor.commands.command(({ tr }) => {
      for (const m of [...ranges].reverse()) tr.insertText(replacement, m.from, m.to)
      return true
    })
    refresh(query)
  }, [editor, flushPending, matches, replacement, query, refresh])

  if (!isOpen) return null

  return (
    <div className="md-find-panel">
      <div className="md-find-row">
        <button
          className={`md-find-toggle ${replaceMode ? 'expanded' : ''}`}
          title={replaceMode ? 'Hide Replace' : 'Show Replace'}
          onClick={() => setReplaceMode(!replaceMode)}
        >
          {replaceMode ? '▼' : '▶'}
        </button>
        <input
          ref={inputRef}
          className="md-find-input"
          placeholder="Find…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            queryRef.current = e.target.value
            scheduleRefresh(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
            if (e.key === 'Escape') close()
          }}
        />
        <button
          className={`md-find-opt ${matchCase ? 'on' : ''}`}
          title="Match Case"
          onClick={() => {
            setMatchCase(!matchCase)
            refresh(query, index, { matchCase: !matchCase })
          }}
        >
          Aa
        </button>
        <button
          className={`md-find-opt ${wholeWord ? 'on' : ''}`}
          title="Whole Word"
          onClick={() => {
            setWholeWord(!wholeWord)
            refresh(query, index, { wholeWord: !wholeWord })
          }}
        >
          W
        </button>
        <span className="md-find-count">
          {query
            ? matches.length === 0
              ? 'No results'
              : `${index + 1} of ${matches.length}`
            : ''}
        </span>
        <button
          className="md-find-btn"
          title="Previous (Shift+Enter)"
          disabled={matches.length === 0}
          onClick={() => step(-1)}
        >
          ‹
        </button>
        <button
          className="md-find-btn"
          title="Next (Enter)"
          disabled={matches.length === 0}
          onClick={() => step(1)}
        >
          ›
        </button>
        <button className="md-find-btn md-find-close" title="Close (Esc)" onClick={close}>
          ✕
        </button>
      </div>
      {replaceMode && (
        <div className="md-find-row md-replace-row">
          <span className="md-find-spacer" />
          <input
            ref={replaceInputRef}
            className="md-find-input"
            placeholder="Replace with…"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') replaceOne()
              if (e.key === 'Escape') close()
            }}
          />
          <button
            className="md-find-action"
            disabled={matches.length === 0 || !editor.isEditable}
            onClick={replaceOne}
          >
            Replace
          </button>
          <button
            className="md-find-action"
            disabled={matches.length === 0 || !editor.isEditable}
            onClick={replaceAll}
          >
            Replace All
          </button>
        </div>
      )}
    </div>
  )
}
