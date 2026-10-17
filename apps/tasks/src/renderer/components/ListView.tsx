import { useMemo, type CSSProperties } from 'react'
import type { BoardState, ID, Task } from '../../domain/types'
import { PRIORITY_LABEL } from '../../domain/types'
import { isOverdue, isTaskDone, ticketId } from '../../store/selectors'
import { Avatar, UnassignedAvatar } from './Avatar'
import { btnGhost, PRIORITY_COLOR } from '../styles'

/** One dense row, shared by the list, backlog and my-tasks views. */
export function TaskRow({
  state,
  task,
  onOpen,
  selectable,
  selected,
  onToggleSelect,
}: {
  state: BoardState
  task: Task
  onOpen: (id: ID) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: ID) => void
}) {
  const overdue = !task.completedAt && isOverdue(task, new Date())
  const done = isTaskDone(state, task)
  const assignee = state.members.find((member) => member.id === task.assigneeId)
  const project = state.projects.find((entry) => entry.id === task.projectId)
  const subtasks = state.tasks.filter((entry) => entry.parentId === task.id)
  const doneSubs = subtasks.filter((sub) => sub.completedAt !== null).length

  return (
    <div
      className="tasks-task-row"
      data-task-id={task.id}
      style={{ ...row, borderLeftColor: PRIORITY_COLOR[task.priority] }}
      data-selected={selected ? 'true' : undefined}
    >
      {selectable ? (
        <input
          className="tasks-task-row-check"
          type="checkbox"
          aria-label={`Select ${ticketId(state, task)}`}
          checked={Boolean(selected)}
          onChange={() => onToggleSelect?.(task.id)}
          style={{ flexShrink: 0 }}
        />
      ) : null}
      <button
        className="tasks-task-ticket"
        style={ticket}
        type="button"
        onClick={() => onOpen(task.id)}
        title={task.title}
      >
        {ticketId(state, task)}
      </button>
      <button
        className="tasks-task-title"
        style={title}
        type="button"
        onClick={() => onOpen(task.id)}
      >
        {task.title}
      </button>
      {subtasks.length ? (
        <span
          className="tasks-task-subtasks"
          style={sub}
          title={`${doneSubs} of ${subtasks.length} subtasks complete`}
        >
          {doneSubs}/{subtasks.length}
        </span>
      ) : null}
      <span
        className="tasks-task-priority"
        style={{ ...meta, color: PRIORITY_COLOR[task.priority] }}
      >
        {PRIORITY_LABEL[task.priority]}
      </span>
      {task.dueDate ? (
        <span
          className={`tasks-task-due${overdue ? ' is-overdue' : ''}`}
          style={{ ...meta, color: overdue ? 'var(--col-red)' : 'var(--text-secondary)' }}
          title={overdue ? `Overdue: ${task.dueDate}` : `Due ${task.dueDate}`}
        >
          {task.dueDate}
        </span>
      ) : null}
      <span className="tasks-task-project" style={project} title={project?.name ?? 'No project'}>
        {project?.key ?? ''}
      </span>
      {done ? (
        <span className="tasks-task-done" style={doneTag}>
          Done
        </span>
      ) : null}
      {assignee ? (
        <Avatar name={assignee.name} color={assignee.color} size={18} />
      ) : (
        <UnassignedAvatar size={18} />
      )}
    </div>
  )
}

/**
 * List view: every task in the project, grouped by column, in one scroll.
 *
 * The board answers "where is everything"; this answers "what is in each
 * stage", which a card-per-task board makes awkward.
 */
export function ListView({
  state,
  tasks,
  projectId,
  onOpen,
  selectedIds,
  onToggleSelect,
  onSelectAll,
}: {
  state: BoardState
  tasks: Task[]
  projectId: ID | null
  onOpen: (id: ID) => void
  selectedIds: ID[]
  onToggleSelect: (id: ID) => void
  onSelectAll: () => void
}) {
  const columns = state.columns
    .filter((column) => column.projectId === projectId)
    .sort((a, b) => a.position - b.position)

  const grouped = useMemo(
    () =>
      columns.map((column) => ({
        column,
        items: tasks
          .filter((task) => task.columnId === column.id)
          .sort((a, b) => a.position - b.position),
      })),
    [columns, tasks],
  )

  return (
    <div className="tasks-list-view" style={wrap}>
      <div className="tasks-list-toolbar" style={toolbar}>
        <button
          className="tasks-list-select-all"
          style={btnGhost}
          type="button"
          onClick={onSelectAll}
          disabled={tasks.length === 0}
          aria-label="Select all visible tasks"
        >
          Select all
        </button>
        <span className="tasks-list-count" style={count}>
          {tasks.length} task(s) in {grouped.length} column(s)
        </span>
      </div>
      <div
        className="tasks-list-scroll"
        style={{ overflowY: 'auto', flex: 1, padding: '0 14px 14px' }}
      >
        {grouped.map(({ column, items }) => (
          <section className="tasks-list-section" key={column.id}>
            <h3 className="tasks-list-section-heading" style={groupHead}>
              <span
                className="tasks-list-section-dot"
                style={{ ...dot, background: `var(--col-${column.color})` }}
              />
              {column.name}
              <span className="tasks-list-section-count" style={count}>
                {items.length}
              </span>
            </h3>
            {items.length === 0 ? (
              <p className="tasks-list-empty" style={empty}>
                Nothing here.
              </p>
            ) : (
              items.map((task) => (
                <TaskRow
                  key={task.id}
                  state={state}
                  task={task}
                  onOpen={onOpen}
                  selectable
                  selected={selectedIds.includes(task.id)}
                  onToggleSelect={onToggleSelect}
                />
              ))
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
}

const groupHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-secondary)',
  margin: '14px 0 4px',
}

const dot: CSSProperties = { width: 8, height: 8, borderRadius: '50%' }

const empty: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontStyle: 'italic',
  margin: '0 0 4px 22px',
}

const count: CSSProperties = { fontSize: 11, color: 'var(--text-secondary)' }

export const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 8px',
  borderBottom: '1px solid var(--border)',
  fontSize: 13,
}

export const ticket: CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
  color: 'var(--text-secondary)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  minWidth: 62,
  textAlign: 'left',
}

export const title: CSSProperties = {
  flex: 1,
  textAlign: 'left',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-primary)',
  fontSize: 13,
  padding: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const meta: CSSProperties = { fontSize: 11, minWidth: 66 }

export const sub: CSSProperties = { fontSize: 11, color: 'var(--text-secondary)' }

export const project: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  minWidth: 38,
}

export const doneTag: CSSProperties = {
  fontSize: 10,
  color: 'var(--col-green)',
  fontWeight: 600,
}
