import { useState, type CSSProperties } from 'react'
import type {
  BoardState,
  CustomFieldValue,
  ID,
  Priority,
  RelationType,
  Task,
} from '../../domain/types'
import { RELATION_TYPES } from '../../domain/types'
import { nextId } from '../../domain/ids'
import type { Action } from '../../store/actions'
import { deleteBlob, putBlob } from '../../store/attachments'
import {
  isBlocked,
  projectColumns,
  projectCustomFields,
  projectLabels,
  relatedTasks,
  subtasksOf,
  tasksBlockedBy,
  ticketId,
  totalLoggedMinutes,
} from '../../store/selectors'
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  chip,
  colorVar,
  fieldGroup,
  formatMinutes,
  input,
  label,
  PRIORITY_COLOR_NAME,
  PRIORITY_ORDER,
} from '../styles'
import { AttachmentPanel } from './AttachmentPanel'
import { AssigneePicker } from './MembersDialog'
import { ExternalLinksSection } from './ExternalLinks'
import { SelectMenu } from './SelectMenu'

/**
 * Right-hand detail drawer for a single task.
 *
 * Every control dispatches an ordinary board action, so anything changed here is
 * immediately visible to the AI tools and survives a reload like any other edit.
 */
export function TaskDetail({
  state,
  task,
  dispatch,
  onClose,
  onError,
  onAskAI,
}: {
  state: BoardState
  task: Task
  dispatch: (action: Action) => void
  onClose: () => void
  onError: (message: string) => void
  onAskAI: () => void
}) {
  const [comment, setComment] = useState('')
  const [subtask, setSubtask] = useState('')
  const [linkTarget, setLinkTarget] = useState('')
  const [linkType, setLinkType] = useState<RelationType>('blocked_by')
  const [minutes, setMinutes] = useState('30')

  const columns = projectColumns(state, task.projectId)
  const labels = projectLabels(state, task.projectId)
  const fields = projectCustomFields(state, task.projectId)
  const children = subtasksOf(state, task.id)
  const blockedBy = tasksBlockedBy(state, task)
  const related = relatedTasks(state, task)
  const comments = state.comments
    .filter((entry) => entry.taskId === task.id)
    .sort((a, b) => a.createdAt - b.createdAt)
  const activity = state.activity
    .filter((entry) => entry.taskId === task.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 12)
  const logged = totalLoggedMinutes(task)
  const attachments = state.attachments
    .filter((entry) => entry.taskId === task.id)
    .sort((a, b) => a.createdAt - b.createdAt)

  const toggleLabel = (labelId: ID) => {
    const next = task.labelIds.includes(labelId)
      ? task.labelIds.filter((entry) => entry !== labelId)
      : [...task.labelIds, labelId]
    dispatch({ kind: 'task/setLabels', id: task.id, labelIds: next })
  }

  return (
    <aside
      className="tasks-detail-drawer"
      style={drawer}
      aria-label={`Task ${ticketId(state, task)}`}
    >
      <header className="tasks-detail-header" style={drawerHeader}>
        <div className="tasks-detail-ticket-group">
          <span className="tasks-detail-kicker">Task details</span>
          <span style={ticket}>{ticketId(state, task)}</span>
        </div>
        <span style={flex} />
        {task.archived ? (
          <span className="tasks-detail-archived" style={archivedBadge}>
            Archived
          </span>
        ) : null}
        <button
          type="button"
          style={detailButton}
          title="Only the selected tasks (up to 12), including their titles, descriptions, metadata, and visible card bounds when available, are sent to your configured AI provider when you click. The provider may be remote. Other tasks and attachments are excluded."
          onClick={onAskAI}
        >
          Ask AI
        </button>
        <button
          onClick={onClose}
          className="tasks-detail-close"
          style={closeButton}
          title="Close"
          aria-label="Close task"
        >
          ✕
        </button>
      </header>

      <div className="tasks-detail-body" style={drawerBody}>
        <textarea
          value={task.title}
          onChange={(event) =>
            dispatch({ kind: 'task/update', id: task.id, patch: { title: event.target.value } })
          }
          rows={2}
          className="tasks-detail-title"
          style={{
            ...detailInput,
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.3,
            minHeight: 76,
            resize: 'vertical',
          }}
          aria-label="Task title"
        />

        <div className="tasks-detail-meta-grid" style={metaGrid}>
          <div style={metaField}>
            <span style={label}>Column</span>
            <SelectMenu
              label="Column"
              value={task.columnId}
              options={columns.map((entry) => ({
                value: entry.id,
                label: entry.name,
                color: entry.color,
              }))}
              onChange={(value) => dispatch({ kind: 'task/move', id: task.id, columnId: value })}
              style={{ ...detailInput, padding: 0 }}
            />
          </div>
          <div style={metaField}>
            <span style={label}>Priority</span>
            <SelectMenu
              label="Priority"
              value={task.priority}
              options={PRIORITY_ORDER.map((priority) => ({
                value: priority,
                label: priority,
                color: PRIORITY_COLOR_NAME[priority],
              }))}
              onChange={(value) =>
                dispatch({
                  kind: 'task/update',
                  id: task.id,
                  patch: { priority: value as Priority },
                })
              }
              style={{ ...detailInput, padding: 0 }}
            />
          </div>
          <div style={metaField}>
            <span style={label}>Due</span>
            <input
              type="date"
              value={task.dueDate ?? ''}
              onChange={(event) =>
                dispatch({
                  kind: 'task/update',
                  id: task.id,
                  patch: { dueDate: event.target.value || null },
                })
              }
              style={detailInput}
              aria-label="Due date"
            />
          </div>
          <div style={metaField}>
            <span style={label}>Estimate (min)</span>
            <input
              type="number"
              min={0}
              value={task.estimateMinutes ?? ''}
              onChange={(event) =>
                dispatch({
                  kind: 'task/update',
                  id: task.id,
                  patch: {
                    estimateMinutes: event.target.value ? Number(event.target.value) : null,
                  },
                })
              }
              style={detailInput}
              aria-label="Estimate in minutes"
            />
          </div>
        </div>

        <Section title="Assignee">
          <AssigneePicker
            state={state}
            taskId={task.id}
            assigneeId={task.assigneeId}
            dispatch={dispatch}
          />
        </Section>

        <Section title="Description">
          <textarea
            value={task.description}
            onChange={(event) =>
              dispatch({
                kind: 'task/update',
                id: task.id,
                patch: { description: event.target.value },
              })
            }
            rows={5}
            placeholder="Markdown is supported. Blank lines separate paragraphs."
            style={{
              ...detailInput,
              minHeight: 138,
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
          />
        </Section>

        <Section title="External links">
          <ExternalLinksSection state={state} taskId={task.id} dispatch={dispatch} />
        </Section>

        <Section title="Labels">
          <div style={chipRow}>
            {labels.length === 0 ? <span style={muted}>No labels yet.</span> : null}
            {labels.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="tasks-label-control"
                data-active={task.labelIds.includes(entry.id)}
                onClick={() => toggleLabel(entry.id)}
                style={{
                  ...chip,
                  cursor: 'pointer',
                  borderColor: colorVar(entry.color),
                  background: task.labelIds.includes(entry.id)
                    ? `color-mix(in srgb, ${colorVar(entry.color)} 14%, var(--surface))`
                    : 'var(--surface)',
                  color: colorVar(entry.color),
                }}
              >
                <span
                  className="tasks-label-dot"
                  style={{ background: colorVar(entry.color) }}
                  aria-hidden="true"
                />
                {entry.name}
              </button>
            ))}
          </div>
        </Section>

        {fields.length ? (
          <Section title="Custom fields">
            {fields.map((field) => (
              <div key={field.id} style={fieldGroup}>
                <span style={label}>{field.name}</span>
                <CustomFieldControl
                  field={field}
                  value={task.customFields[field.id] ?? null}
                  onChange={(value) =>
                    dispatch({
                      kind: 'task/setCustomField',
                      taskId: task.id,
                      fieldId: field.id,
                      value,
                    })
                  }
                />
              </div>
            ))}
          </Section>
        ) : null}

        <Section
          title={`Sub-tasks (${children.filter((child) => child.completedAt).length}/${children.length})`}
        >
          {children.map((child) => (
            <div key={child.id} style={row}>
              <button
                style={linkButton}
                onClick={() => dispatch({ kind: 'ui/selectTask', id: child.id })}
              >
                {child.completedAt ? '☑' : '☐'} {ticketId(state, child)} {child.title}
              </button>
              <button
                style={iconBtn}
                title="Remove sub-task"
                onClick={() => dispatch({ kind: 'task/delete', id: child.id })}
              >
                ✕
              </button>
            </div>
          ))}
          <form
            style={row}
            onSubmit={(event) => {
              event.preventDefault()
              const title = subtask.trim()
              if (!title) return
              dispatch({
                kind: 'task/create',
                projectId: task.projectId,
                columnId: task.columnId,
                title,
                parentId: task.id,
              })
              setSubtask('')
            }}
          >
            <input
              value={subtask}
              onChange={(event) => setSubtask(event.target.value)}
              placeholder="Add a sub-task…"
              style={detailInput}
            />
            <button type="submit" style={detailButton}>
              Add
            </button>
          </form>
        </Section>

        <Section title="Relations">
          {isBlocked(state, task) ? (
            <p style={{ ...muted, color: 'var(--danger)' }}>
              Blocked by{' '}
              {blockedBy.map((entry) => ticketId(state, entry)).join(', ') || 'an unfinished task'}
            </p>
          ) : null}
          {related.length ? (
            <div style={chipRow}>
              <span style={muted}>Related:</span>
              {related.map((entry) => (
                <button
                  key={entry.id}
                  style={chipButton}
                  onClick={() => dispatch({ kind: 'ui/selectTask', id: entry.id })}
                >
                  {ticketId(state, entry)} {entry.title}
                </button>
              ))}
            </div>
          ) : null}

          <form
            style={row}
            onSubmit={(event) => {
              event.preventDefault()
              const target = linkTarget.trim()
              if (!target) return
              const match = state.tasks.find(
                (entry) =>
                  entry.id === target ||
                  ticketId(state, entry).toLowerCase() === target.toLowerCase(),
              )
              if (!match || match.id === task.id) {
                setLinkTarget('')
                return
              }
              dispatch({
                kind: 'relation/link',
                fromTaskId: task.id,
                toTaskId: match.id,
                type: linkType,
              })
              setLinkTarget('')
            }}
          >
            <SelectMenu
              label="Relation type"
              value={linkType}
              options={RELATION_TYPES.map((type) => ({
                value: type,
                label: type.replace('_', ' '),
              }))}
              onChange={(value) => setLinkType(value as RelationType)}
              style={{ ...detailInput, width: 148, padding: 0 }}
            />
            <input
              value={linkTarget}
              onChange={(event) => setLinkTarget(event.target.value)}
              placeholder="WEB-12 or exact title"
              style={detailInput}
            />
            <button type="submit" style={detailButton}>
              Link
            </button>
          </form>

          {state.relations
            .filter((relation) => relation.fromTaskId === task.id)
            .map((relation) => {
              const other = state.tasks.find((entry) => entry.id === relation.toTaskId)
              if (!other) return null
              return (
                <div key={relation.id} style={row}>
                  <span style={{ ...chip, fontSize: 11 }}>
                    {relation.type.replace('_', ' ')} → {ticketId(state, other)}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {other.title}
                  </span>
                  <button
                    style={iconBtn}
                    title="Remove relation"
                    onClick={() => dispatch({ kind: 'relation/unlink', id: relation.id })}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
        </Section>

        <Section title={`Comments (${comments.length})`}>
          {comments.map((entry) => (
            <div key={entry.id} style={commentBubble}>
              <div style={commentMeta}>
                <strong>{entry.author}</strong>
                <span style={muted}>{new Date(entry.createdAt).toLocaleString()}</span>
                <span style={flex} />
                <button
                  style={iconBtn}
                  title="Delete comment"
                  onClick={() => dispatch({ kind: 'comment/delete', id: entry.id })}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{entry.body}</div>
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const body = comment.trim()
              if (!body) return
              dispatch({ kind: 'comment/add', taskId: task.id, body })
              setComment('')
            }}
          >
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={2}
              placeholder="Write a comment…"
              style={{ ...detailInput, minHeight: 78, resize: 'vertical' }}
            />
            <button type="submit" style={{ ...btnPrimary, marginTop: 8 }}>
              Comment
            </button>
          </form>
        </Section>

        <Section title={`Time (${formatMinutes(logged)})`}>
          <form
            style={row}
            onSubmit={(event) => {
              event.preventDefault()
              const value = Number(minutes)
              if (!Number.isFinite(value) || value <= 0) return
              dispatch({ kind: 'task/logTime', id: task.id, minutes: value })
              setMinutes('30')
            }}
          >
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              style={{ ...detailInput, width: 100 }}
            />
            <span style={muted}>minutes</span>
            <button type="submit" style={detailButton}>
              Log
            </button>
          </form>
          {task.estimateMinutes !== null ? (
            <p style={muted}>
              {formatMinutes(logged)} of {formatMinutes(task.estimateMinutes)} estimated
            </p>
          ) : null}
        </Section>

        <Section title={`Attachments (${attachments.length})`}>
          <AttachmentPanel
            attachments={attachments}
            onAdd={async (name, file) => {
              const id = nextId('att')
              try {
                await putBlob(id, file)
                dispatch({
                  kind: 'attachment/add',
                  id,
                  taskId: task.id,
                  name,
                  mime: file.type,
                  size: file.size,
                })
              } catch (error) {
                onError(error instanceof Error ? error.message : String(error))
              }
            }}
            onRemove={async (id) => {
              dispatch({ kind: 'attachment/remove', id })
              try {
                await deleteBlob(id)
              } catch {
                // The metadata is already gone; a stale blob is harmless.
              }
            }}
            onError={onError}
          />
        </Section>

        {activity.length ? (
          <Section title="History">
            {activity.map((entry) => (
              <div key={entry.id} style={activityRow}>
                <span style={muted}>{new Date(entry.createdAt).toLocaleString()}</span>
                <span>{entry.message}</span>
              </div>
            ))}
          </Section>
        ) : null}
      </div>

      <footer className="tasks-detail-footer" style={drawerFooter}>
        <button
          style={detailButton}
          onClick={() => {
            dispatch({ kind: 'task/duplicate', id: task.id })
            onClose()
          }}
          title="Copy this task and its sub-tasks"
        >
          Duplicate
        </button>
        <button
          style={detailButton}
          onClick={() =>
            dispatch({ kind: 'task/setArchived', id: task.id, archived: !task.archived })
          }
        >
          {task.archived ? 'Restore' : 'Archive'}
        </button>
        <span style={flex} />
        <button
          style={detailDangerButton}
          aria-label="Delete task"
          onClick={() => {
            if (window.confirm(`Delete ${ticketId(state, task)}? This cannot be undone.`)) {
              dispatch({ kind: 'task/delete', id: task.id })
            }
          }}
        >
          Delete
        </button>
      </footer>
    </aside>
  )
}

function CustomFieldControl({
  field,
  value,
  onChange,
}: {
  field: { id: string; type: string; options: string[] }
  value: CustomFieldValue
  onChange: (value: CustomFieldValue) => void
}) {
  if (field.type === 'checkbox') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {value === true ? 'Yes' : 'No'}
      </label>
    )
  }
  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : []
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {field.options.length === 0 ? (
          <span style={{ ...label, fontWeight: 400 }}>No options defined</span>
        ) : (
          field.options.map((option) => {
            const on = selected.includes(option)
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(
                    on ? selected.filter((entry) => entry !== option) : [...selected, option],
                  )
                }
                style={{
                  ...chip,
                  background: on ? 'var(--accent-soft)' : 'var(--surface)',
                  borderColor: on ? 'var(--accent)' : 'var(--border)',
                  color: on ? 'var(--accent-strong)' : 'var(--text-secondary)',
                }}
              >
                {option}
              </button>
            )
          })
        )}
      </div>
    )
  }
  if (field.type === 'select')
    return (
      <SelectMenu
        label="Custom field"
        value={typeof value === 'string' ? value : ''}
        placeholder="—"
        options={field.options.map((option) => ({ value: option, label: option }))}
        onChange={(next) => onChange(next || null)}
        style={{ ...detailInput, padding: 0 }}
      />
    )
  if (field.type === 'select') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value || null)}
        style={detailInput}
      >
        <option value="">—</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }
  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={typeof value === 'number' ? value : ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number(event.target.value))
        }
        style={detailInput}
      />
    )
  }
  if (field.type === 'date') {
    return (
      <input
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value || null)}
        style={detailInput}
      />
    )
  }
  return (
    <input
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value || null)}
      style={detailInput}
    />
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="tasks-detail-section" style={section}>
      <h3 className="tasks-detail-section-title" style={sectionTitle}>
        {title}
      </h3>
      {children}
    </section>
  )
}

const drawer: CSSProperties = {
  width: 'clamp(360px, 34vw, 520px)',
  maxWidth: '100%',
  flexShrink: 0,
  borderLeft: '1px solid var(--border-strong)',
  background: 'var(--surface)',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  boxShadow: 'var(--shadow-menu)',
}

const drawerHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 64,
  padding: '12px 18px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--surface)',
}

const drawerBody: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '18px 20px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const drawerFooter: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 18px',
  borderTop: '1px solid var(--border-strong)',
  background: 'var(--surface)',
}

const ticket: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-tertiary)',
  fontFamily: 'ui-monospace, monospace',
}

const archivedBadge: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  background: 'var(--surface-subtle)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '1px 5px',
}

const closeButton: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface-subtle)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  color: 'var(--text-secondary)',
  width: 34,
  height: 34,
  borderRadius: 10,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
}

const metaGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
  marginTop: 18,
}

const metaField: CSSProperties = { minWidth: 0 }

const detailInput: CSSProperties = {
  ...input,
  minHeight: 40,
  padding: '9px 12px',
  fontSize: 14,
  borderRadius: 10,
}

const detailButton: CSSProperties = {
  ...btnGhost,
  minHeight: 38,
  padding: '8px 13px',
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 600,
}

const detailDangerButton: CSSProperties = {
  ...btnDanger,
  minHeight: 38,
  padding: '8px 14px',
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 700,
}

const section: CSSProperties = { marginTop: 24, paddingTop: 2 }

const sectionTitle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  color: 'var(--text-secondary)',
  marginBottom: 10,
}

const chipRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }

const chipButton: CSSProperties = {
  ...chip,
  cursor: 'pointer',
  textAlign: 'left',
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }

const linkButton: CSSProperties = {
  flex: 1,
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--text-primary)',
  padding: 0,
}

const iconBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 11,
  color: 'var(--text-tertiary)',
  padding: '0 4px',
}

const muted: CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0' }

const commentBubble: CSSProperties = {
  background: 'var(--surface-subtle)',
  borderRadius: 'var(--radius-8)',
  padding: '8px 10px',
  marginBottom: 8,
  border: '1px solid var(--border-subtle)',
}

const commentMeta: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  marginBottom: 4,
}

const activityRow: CSSProperties = {
  display: 'flex',
  gap: 8,
  fontSize: 11,
  color: 'var(--text-secondary)',
  padding: '2px 0',
}

const flex: CSSProperties = { flex: 1 }
