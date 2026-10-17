import { useMemo, type CSSProperties } from 'react'
import type { BoardState, ID } from '../../domain/types'
import {
  buildNotifications,
  NOTIFICATION_LABEL,
  notificationCounts,
  type NotificationKind,
} from '../../store/notifications'
import { btnGhost, chip } from '../styles'

/**
 * Notification centre, derived live from board state.
 *
 * There is nothing to acknowledge or dismiss — a notification is a fact about
 * the current board, so fixing the underlying task is what makes it go away.
 */
/** Count badge button for the status bar. Toggles the expanded panel. */
export function NotificationBell({
  count,
  open,
  onToggle,
}: {
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      style={bell}
      onClick={onToggle}
      aria-label={count ? `Notifications: ${count}` : 'Notifications'}
      aria-expanded={open}
      title="Notifications"
    >
      <span aria-hidden="true">🔔</span>
      {count ? <span style={badge}>{count > 99 ? '99+' : count}</span> : null}
    </button>
  )
}

export function NotificationPanel({
  state,
  projectId,
  onClose,
  onOpenTask,
  allProjects,
  currentAuthor,
}: {
  state: BoardState
  projectId: ID | null
  onClose: () => void
  onOpenTask: (id: ID) => void
  allProjects: boolean
  currentAuthor?: string
}) {
  const notifications = useMemo(
    () => buildNotifications(state, projectId, new Date(), { allProjects, currentAuthor }),
    [state, projectId, allProjects, currentAuthor],
  )
  const counts = notificationCounts(notifications)
  const kinds = (Object.keys(NOTIFICATION_LABEL) as NotificationKind[]).filter(
    (kind) => counts[kind] > 0,
  )

  return (
    <aside style={panel} aria-label="Notifications">
      <header style={panelHeader}>
        <strong style={{ fontSize: 13 }}>Notifications</strong>
        <span style={{ flex: 1 }} />
        <button style={btnGhost} onClick={onClose}>
          Close
        </button>
      </header>

      <div style={summary}>
        {kinds.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Nothing needs attention.
          </span>
        ) : (
          kinds.map((kind) => (
            <span key={kind} style={chip}>
              {counts[kind]} {NOTIFICATION_LABEL[kind].toLowerCase()}
            </span>
          ))
        )}
      </div>

      <div style={list}>
        {notifications.map((entry) => (
          <button
            key={entry.id}
            style={row}
            onClick={() => entry.taskId && onOpenTask(entry.taskId)}
            disabled={!entry.taskId}
          >
            <span style={{ ...dot, background: dotColor(entry.kind) }} aria-hidden="true" />
            <span style={rowBody}>
              <span style={rowTitle}>{entry.taskTitle}</span>
              <span style={rowMessage}>{entry.message}</span>
            </span>
          </button>
        ))}
      </div>

      {notifications.length >= 100 ? (
        <footer style={footer}>
          Showing the first 100. Narrow the board with a filter to see more.
        </footer>
      ) : null}
    </aside>
  )
}

function dotColor(kind: NotificationKind): string {
  if (kind === 'overdue') return 'var(--col-red)'
  if (kind === 'dueSoon') return 'var(--col-amber)'
  if (kind === 'blocked') return 'var(--col-orange)'
  return 'var(--col-blue)'
}

const panel: CSSProperties = {
  width: 320,
  flexShrink: 0,
  borderLeft: '1px solid var(--border)',
  background: 'var(--surface)',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
}

const panelHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
}

const summary: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 5,
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-subtle)',
}

const list: CSSProperties = { flex: 1, overflowY: 'auto', padding: 6 }

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '7px 8px',
  borderRadius: 'var(--radius-8)',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
}

const rowBody: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }

const rowTitle: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }

const rowMessage: CSSProperties = { fontSize: 11, color: 'var(--text-secondary)' }

const dot: CSSProperties = { width: 7, height: 7, borderRadius: 4, marginTop: 5, flexShrink: 0 }

const footer: CSSProperties = {
  padding: '8px 12px',
  fontSize: 11,
  color: 'var(--text-tertiary)',
  borderTop: '1px solid var(--border)',
}

const bell: CSSProperties = {
  position: 'relative',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 'var(--radius-6)',
  cursor: 'pointer',
  padding: '5px 9px',
  fontSize: 13,
  lineHeight: 1,
}

const badge: CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -6,
  minWidth: 16,
  height: 16,
  padding: '0 4px',
  borderRadius: 8,
  background: 'var(--color-error)',
  color: 'var(--color-btn-primary-text)',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
