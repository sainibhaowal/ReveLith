import { useState } from 'react'

export function PrintRangeDialog({
  pageCount,
  onPrint,
  onClose,
}: {
  pageCount: number
  onPrint: (range?: string) => void
  onClose: () => void
}) {
  const [range, setRange] = useState(`1-${pageCount}`)
  const [busy, setBusy] = useState(false)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Print range</h2>
        <p>Pages: 1–{pageCount}. Use e.g. 1-3, 5 (empty = all)</p>
        <input value={range} onChange={(e) => setRange(e.target.value)} placeholder="1-3, 5" />
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              try {
                onPrint(range.trim() ? range : undefined)
              } finally {
                setBusy(false)
                onClose()
              }
            }}
          >
            Print
          </button>
        </div>
      </div>
    </div>
  )
}
