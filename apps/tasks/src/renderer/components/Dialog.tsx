import type { CSSProperties, ReactNode } from 'react'

/** Shared modal shell. Closes on backdrop click and Escape. */
export function Dialog({
  title,
  hint,
  onClose,
  children,
  actions,
}: {
  title: string
  hint?: ReactNode
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div
      className="tasks-dialog-backdrop"
      style={backdrop}
      role="presentation"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <div
        className="tasks-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        style={body}
      >
        <h2 style={titleStyle}>{title}</h2>
        {hint ? <p style={hintStyle}>{hint}</p> : null}
        {children}
        {actions ? <div style={actionsStyle}>{actions}</div> : null}
      </div>
    </div>
  )
}

const backdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--color-bg-overlay)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: 24,
}

const body: CSSProperties = {
  width: 520,
  maxWidth: '100%',
  maxHeight: '85vh',
  overflowY: 'auto',
  background: 'var(--surface)',
  borderRadius: 'var(--radius-12)',
  padding: 20,
  boxShadow: 'var(--shadow-modal-strong)',
}

const titleStyle: CSSProperties = { margin: '0 0 4px', fontSize: 16 }

const hintStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 18,
  justifyContent: 'flex-end',
}
