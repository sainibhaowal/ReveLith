import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'

export interface HeadingItem {
  id: string
  level: number
  text: string
  pos: number
}

interface OutlinePanelProps {
  editor: Editor | null
  onClose: () => void
}

const MIN_WIDTH = 180
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 240

export function OutlinePanel({ editor, onClose }: OutlinePanelProps) {
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(DEFAULT_WIDTH)

  useEffect(() => {
    if (!editor) return

    const updateHeadings = () => {
      const items: HeadingItem[] = []
      const doc = editor.state.doc
      doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          const text = node.textContent.trim()
          if (text) {
            items.push({
              id: `${pos}-${text}`,
              level: node.attrs.level ?? 1,
              text,
              pos,
            })
          }
        }
      })
      setHeadings(items)
    }

    updateHeadings()
    editor.on('update', updateHeadings)
    return () => {
      editor.off('update', updateHeadings)
    }
  }, [editor])

  const onMouseDownDivider = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    startW.current = width

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta = ev.clientX - startX.current
      const next = Math.min(Math.max(startW.current + delta, MIN_WIDTH), MAX_WIDTH)
      setWidth(next)
    }

    const onMouseUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const jumpTo = (pos: number) => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 1)
      .scrollIntoView()
      .run()
  }

  return (
    <aside
      className="md-outline-panel"
      style={{
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--panel-bg, #ffffff)',
        borderRight: '1px solid var(--border-color, #e2e8f0)',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-color, #e2e8f0)',
          fontWeight: 600,
          fontSize: '13px',
          color: 'var(--text-primary, #1e293b)',
        }}
      >
        <span>Outline</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: '14px',
            color: 'var(--text-muted, #64748b)',
            borderRadius: '4px',
          }}
          title="Close Outline"
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 4px',
        }}
      >
        {headings.length === 0 ? (
          <div
            style={{
              padding: '16px 12px',
              fontSize: '12px',
              color: 'var(--text-muted, #94a3b8)',
              fontStyle: 'italic',
            }}
          >
            No headings in document
          </div>
        ) : (
          headings.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => jumpTo(h.pos)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '4px 8px',
                paddingLeft: `${(h.level - 1) * 12 + 10}px`,
                fontSize: h.level === 1 ? '13px' : '12px',
                fontWeight: h.level <= 2 ? 600 : 400,
                color: 'var(--text-primary, #334155)',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--hover-bg, #f1f5f9)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
              title={h.text}
            >
              {h.text}
            </button>
          ))
        )}
      </div>

      {/* Resizable drag divider handle */}
      <div
        onMouseDown={onMouseDownDivider}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '6px',
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
        }}
      />
    </aside>
  )
}
