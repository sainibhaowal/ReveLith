import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { useI18n } from '../i18n/locale'
import { useModalKeys } from './modal-keys'

/**
 * Hyperlink hover card for `a.doc-link` ranges in the editor.
 *
 * Hovering a link shows a small preview with the URL plus Copy / Edit /
 * Remove actions; Edit opens an inline modal (same chrome as the ribbon's
 * LinkInsertModal) that rewrites the display text and href in place. Copy
 * works in read-only mode; Edit/Remove require an editable editor.
 */

interface LinkTarget {
  from: number
  to: number
  href: string
  rId: string | null
  text: string
  /** viewport-anchored position under the hovered anchor */
  x: number
  y: number
}

function anchorTarget(editor: Editor, anchor: HTMLAnchorElement): LinkTarget | null {
  let from = -1
  let to = -1
  try {
    const pos = editor.view.posAtDOM(anchor, 0)
    if (pos < 0) return null
    const $pos = editor.state.doc.resolve(pos)
    const marks = $pos.marks()
    const link = marks.find((m) => m.type.name === 'link')
    if (!link) return null
    // expand to the full contiguous link-mark run
    from = pos
    while (from > 0) {
      const $before = editor.state.doc.resolve(from - 1)
      if (!$before.marks().some((m) => m.type.name === 'link' && m.attrs.href === link.attrs.href)) break
      from--
    }
    const end = editor.state.doc.content.size
    to = pos
    while (to < end) {
      const $after = editor.state.doc.resolve(to + 1)
      if (!$after.marks().some((m) => m.type.name === 'link' && m.attrs.href === link.attrs.href)) break
      to++
    }
    to++ // resolve() points between chars; include the last char
    const rect = anchor.getBoundingClientRect()
    return {
      from,
      to,
      href: String(link.attrs.href ?? ''),
      rId: (link.attrs.rId as string | null) ?? null,
      text: editor.state.doc.textBetween(from, Math.min(to, end)),
      x: Math.min(rect.left, window.innerWidth - 320),
      y: rect.bottom + 6,
    }
  } catch {
    return null
  }
}

function LinkEditModal({
  editor,
  target,
  onClose,
}: {
  editor: Editor
  target: LinkTarget
  onClose: () => void
}) {
  const { t } = useI18n()
  const modalKeys = useModalKeys(onClose)
  const [linkText, setLinkText] = useState(target.text)
  const [linkUrl, setLinkUrl] = useState(target.href)

  const apply = () => {
    const href = linkUrl.trim()
    const text = linkText.trim() || href
    if (!href || !editor.isEditable) return
    const { from, to } = target
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .insertContentAt({ from, to }, [
        { type: 'text', text, marks: [{ type: 'link', attrs: { href, rId: target.rId } }] },
      ])
      .run()
    onClose()
  }

  return (
    <div
      className="modal-backdrop"
      ref={modalKeys.ref}
      onKeyDown={modalKeys.onKeyDown}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <h2>{t('linkEditTitle')}</h2>
        <label>
          {t('ribbonLinkText')}
          <input value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder={t('ribbonLinkTextPh')} />
        </label>
        <label>
          {t('ribbonLinkAddress')}
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </label>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            {t('ribbonCancel')}
          </button>
          <button className="btn-primary" disabled={!linkUrl.trim()} onClick={apply}>
            {t('ribbonInsert')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function LinkTooltip({ editor }: { editor: Editor | null }) {
  const { t } = useI18n()
  const [target, setTarget] = useState<LinkTarget | null>(null)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const hideTimer = useRef<number | null>(null)

  const hide = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setTarget(null), 120)
  }, [])

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const onOver = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.('a.doc-link') as HTMLAnchorElement | null
      if (!anchor || !dom.contains(anchor)) return
      cancelHide()
      const next = anchorTarget(editor, anchor)
      if (next) {
        setTarget(next)
        setCopied(false)
      }
    }
    const onOut = (e: MouseEvent) => {
      const to = e.relatedTarget as HTMLElement | null
      // moving into the card itself keeps it open
      if (to?.closest?.('.link-tip')) return
      hide()
    }
    const onScroll = () => setTarget(null)
    dom.addEventListener('mouseover', onOver)
    dom.addEventListener('mouseout', onOut)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      dom.removeEventListener('mouseover', onOver)
      dom.removeEventListener('mouseout', onOut)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [editor, cancelHide, hide])

  // the hovered range changed under us (edit/undo): drop the stale card
  useEffect(() => {
    if (!editor || !target) return
    const onTx = () => {
      try {
        const marks = editor.state.doc.resolve(Math.min(target.from, editor.state.doc.content.size)).marks()
        if (!marks.some((m) => m.type.name === 'link')) setTarget(null)
      } catch {
        setTarget(null)
      }
    }
    editor.on('transaction', onTx)
    return () => {
      editor.off('transaction', onTx)
    }
  }, [editor, target])

  const copy = useCallback(async () => {
    if (!target) return
    try {
      await navigator.clipboard.writeText(target.href)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = target.href
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
  }, [target])

  const remove = useCallback(() => {
    if (!editor || !target || !editor.isEditable) return
    editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).unsetMark('link').run()
    setTarget(null)
  }, [editor, target])

  if (!editor || !target) return null

  return (
    <>
      <div
        className="link-tip"
        style={{ left: Math.max(8, target.x), top: target.y }}
        onMouseEnter={cancelHide}
        onMouseLeave={hide}
      >
        <span className="link-tip-url" title={target.href}>
          {target.href}
        </span>
        <button className="link-tip-btn" onClick={() => void copy()}>
          {copied ? '✓' : t('linkTipCopy')}
        </button>
        {editor.isEditable && (
          <>
            <button
              className="link-tip-btn"
              onClick={() => {
                cancelHide()
                setEditing(true)
              }}
            >
              {t('linkTipEdit')}
            </button>
            <button className="link-tip-btn danger" onClick={remove}>
              {t('linkTipRemove')}
            </button>
          </>
        )}
      </div>
      {editing && (
        <LinkEditModal
          editor={editor}
          target={target}
          onClose={() => {
            setEditing(false)
            setTarget(null)
          }}
        />
      )}
    </>
  )
}
