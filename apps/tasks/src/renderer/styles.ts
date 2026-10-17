import type { CSSProperties } from 'react'
import type { ColorName, Priority } from '../domain/types'

/**
 * Shared style objects and small formatters.
 *
 * Everything here reads from the semantic tokens in `ui/tokens.css`, so the app
 * follows light/dark without any inline hex in component code.
 */

export const btnPrimary: CSSProperties = {
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 7,
  border: 'none',
  background: 'var(--color-btn-primary)',
  color: 'var(--color-btn-primary-text)',
  cursor: 'pointer',
}

export const btnSecondary: CSSProperties = {
  padding: '7px 14px',
  fontSize: 13,
  borderRadius: 7,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
}

export const btnGhost: CSSProperties = {
  padding: '5px 9px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
}

export const btnDanger: CSSProperties = {
  ...btnGhost,
  border: '1px solid var(--danger-border)',
  background: 'var(--danger-bg)',
  color: 'var(--danger)',
}

export const input: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  fontSize: 13,
  borderRadius: 7,
  border: '1px solid var(--border-strong)',
  background: 'var(--surface)',
  color: 'var(--text-primary)',
}

export const label: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-tertiary)',
  marginBottom: 5,
}

export const fieldGroup: CSSProperties = { marginTop: 12 }

export const chip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 10,
  fontWeight: 600,
  padding: '1px 7px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--surface-subtle)',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
}

/** Resolve a colour name to its token. Unknown names fall back to slate. */
export function colorVar(name: string): string {
  return `var(--col-${name})`
}

/** One semantic palette shared by filters, cards, lists and priority menus. */
export const PRIORITY_COLOR_NAME: Record<Priority, ColorName> = {
  urgent: 'red',
  high: 'amber',
  medium: 'blue',
  low: 'green',
}

export const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: 'var(--tasks-priority-urgent)',
  high: 'var(--tasks-priority-high)',
  medium: 'var(--tasks-priority-medium)',
  low: 'var(--tasks-priority-low)',
}

export const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low']

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/** Compact relative day label for a due date. */
export function formatDueDate(dueDate: string, today = new Date()): string {
  const due = Date.parse(`${dueDate}T00:00:00`)
  const base = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00`)
  const days = Math.round((due - base) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days <= 7) return `in ${days}d`
  return dueDate
}

export const dialogBackdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--color-bg-overlay)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: 24,
}

export const dialogBody: CSSProperties = {
  width: 520,
  maxWidth: '100%',
  maxHeight: '85vh',
  overflowY: 'auto',
  background: 'var(--surface)',
  borderRadius: 'var(--radius-12)',
  padding: 20,
  boxShadow: 'var(--shadow-modal-strong)',
}

export const dialogTitle: CSSProperties = { margin: '0 0 4px', fontSize: 16 }

export const dialogHint: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
}

export const dialogActions: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 18,
  justifyContent: 'flex-end',
  alignItems: 'center',
}
