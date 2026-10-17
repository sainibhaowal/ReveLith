import type { CSSProperties } from 'react'
import type { BoardState, Task } from '../../domain/types'
import { isBlocked, subtasksOf, ticketId, totalLoggedMinutes } from '../../store/selectors'
import { chip, colorVar, formatDueDate, formatMinutes, PRIORITY_COLOR } from '../styles'
import { Avatar, UnassignedAvatar } from './Avatar'

/** A single kanban card. Double-click or Enter opens the detail panel. */
export function TaskCard({
  state,
  task,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  state: BoardState
  task: Task
  onOpen: (id: string) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  dragging: boolean
}) {
  const subtasks = subtasksOf(state, task.id)
  const doneSubs = subtasks.filter((sub) => sub.completedAt !== null).length
  const blocked = isBlocked(state, task)
  const labels = state.labels.filter((label) => task.labelIds.includes(label.id))
  const logged = totalLoggedMinutes(task)
  const assignee = state.members.find((member) => member.id === task.assigneeId)
  const overdue =
    task.dueDate !== null &&
    task.dueDate < new Date().toISOString().slice(0, 10) &&
    !task.completedAt

  return (
    <article
      data-task-id={task.id}
      style={{
        ...card,
        opacity: dragging ? 0.5 : 1,
        borderLeftColor: PRIORITY_COLOR[task.priority],
      }}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/task-id', task.id)
        event.dataTransfer.effectAllowed = 'move'
        onDragStart(task.id)
      }}
      onDragEnd={onDragEnd}
      onDoubleClick={() => onOpen(task.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(task.id)
      }}
      tabIndex={0}
      role="button"
      aria-label={`${ticketId(state, task)} ${task.title}`}
    >
      <div style={titleRow}>
        <span style={ticket}>{ticketId(state, task)}</span>
        {blocked ? (
          <span style={blockedBadge} title="Blocked by an unfinished task">
            🚧 blocked
          </span>
        ) : null}
      </div>

      <div style={title}>
        {task.title || <em style={{ color: 'var(--text-tertiary)' }}>Untitled</em>}
      </div>

      {task.description ? <div style={excerpt}>{task.description.split('\n')[0]}</div> : null}

      {labels.length ? (
        <div style={labelRow}>
          {labels.map((label) => (
            <span
              key={label.id}
              className="tasks-label-badge"
              style={{ ...chip, borderColor: colorVar(label.color), color: colorVar(label.color) }}
            >
              <span
                className="tasks-label-dot"
                style={{ background: colorVar(label.color) }}
                aria-hidden="true"
              />
              {label.name}
            </span>
          ))}
        </div>
      ) : null}

      <div style={metaRow}>
        <span style={{ ...meta, color: PRIORITY_COLOR[task.priority] }}>{task.priority}</span>
        {task.dueDate ? (
          <span style={{ ...meta, color: overdue ? 'var(--danger)' : 'var(--text-tertiary)' }}>
            📅 {formatDueDate(task.dueDate)}
          </span>
        ) : null}
        {subtasks.length ? (
          <span style={meta}>
            ☑ {doneSubs}/{subtasks.length}
          </span>
        ) : null}
        {logged ? <span style={meta}>⏱ {formatMinutes(logged)}</span> : null}
        <span style={{ flex: 1 }} />
        {assignee ? (
          <Avatar name={assignee.name} color={assignee.color} size={18} />
        ) : (
          <UnassignedAvatar size={18} />
        )}
      </div>
    </article>
  )
}

const card: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius-8)',
  padding: '9px 11px',
  border: '1px solid var(--border)',
  borderLeftWidth: 4,
  boxShadow: 'var(--shadow-btn-hover)',
  cursor: 'grab',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  outlineOffset: 2,
}

const titleRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 }

const ticket: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-tertiary)',
  fontFamily: 'ui-monospace, monospace',
}

const blockedBadge: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: 'var(--danger)',
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-border)',
  borderRadius: 8,
  padding: '0 5px',
}

const title: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
  lineHeight: 1.35,
}

const excerpt: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const labelRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 }

const metaRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  fontSize: 10,
}

const meta: CSSProperties = { color: 'var(--text-tertiary)', fontWeight: 600 }
