import { useState } from 'react'

/** Paste Options chip: after a paste, switch between Keep Source / Merge / Text Only. */

export function PasteOptionsChip({
  onPick,
}: {
  onPick: (mode: 'source' | 'merge' | 'text') => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 60 }}>
      {open && (
        <div
          style={{
            background: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: 8,
            padding: 6,
            display: 'flex',
            gap: 4,
            marginBottom: 6,
          }}
        >
          <button
            type="button"
            onClick={() => {
              onPick('source')
              setOpen(false)
            }}
          >
            Keep Source
          </button>
          <button
            type="button"
            onClick={() => {
              onPick('merge')
              setOpen(false)
            }}
          >
            Merge
          </button>
          <button
            type="button"
            onClick={() => {
              onPick('text')
              setOpen(false)
            }}
          >
            Text Only
          </button>
        </div>
      )}
      <button
        type="button"
        title="Paste Options (Ctrl)"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '6px 10px',
          cursor: 'pointer',
        }}
      >
        ⧉ Paste Options
      </button>
    </div>
  )
}
