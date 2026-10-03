import { useState } from 'react'

interface AiSummaryModalProps {
  isOpen: boolean
  summary: string
  isSummarizing: boolean
  error?: string | null
  onClose: () => void
  onCancel?: () => void
}

export function AiSummaryModal({
  isOpen,
  summary,
  isSummarizing,
  error,
  onClose,
  onCancel,
}: AiSummaryModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleCopy = () => {
    if (!summary) return
    void navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50000,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#18181b',
          border: '1px solid #27272a',
          borderRadius: 12,
          width: '100%',
          maxWidth: 620,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #27272a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>📋</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#34d399' }}>
              AI Document Summary
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#71717a',
              cursor: 'pointer',
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          {isSummarizing && !summary && (
            <div style={{ fontSize: 13, color: '#a1a1aa' }}>Summarizing with AI…</div>
          )}
          {summary && (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                color: '#e4e4e7',
                whiteSpace: 'pre-wrap',
                background: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: 8,
                padding: 14,
              }}
            >
              {summary}
            </div>
          )}
          {!isSummarizing && !summary && !error && (
            <div style={{ fontSize: 13, color: '#a1a1aa' }}>
              The document has no readable text to summarize yet.
            </div>
          )}
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #27272a',
            background: '#121214',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          {error && (
            <span style={{ marginRight: 'auto', fontSize: 12, color: '#f87171' }}>⚠ {error}</span>
          )}
          {isSummarizing && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                background: '#27272a',
                border: '1px solid #ef4444',
                borderRadius: 6,
                color: '#fca5a5',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Stop
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!summary}
                style={{
                  padding: '8px 16px',
                  background: summary ? '#059669' : '#3f3f46',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  fontWeight: 600,
                  cursor: summary ? 'pointer' : 'default',
                  fontSize: 12,
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  background: '#27272a',
                  border: '1px solid #3f3f46',
                  borderRadius: 6,
                  color: '#d4d4d8',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
