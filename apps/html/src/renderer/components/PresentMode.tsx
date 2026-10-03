import { useEffect } from 'react'

interface PresentModeProps {
  html: string
  onClose: () => void
}

export function PresentMode({ html, onClose }: PresentModeProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: '#09090b',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Floating Control Bar */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 20,
          zIndex: 100000,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(24, 24, 27, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '6px 12px',
          borderRadius: 20,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        <span style={{ fontSize: 11, color: '#a1a1aa' }}>Present Mode (Press Esc to exit)</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: '#ef4444',
            border: 'none',
            color: '#fff',
            borderRadius: 12,
            padding: '2px 8px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Exit
        </button>
      </div>

      <iframe
        title="ReveLith Presenter View"
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#ffffff',
        }}
      />
    </div>
  )
}
