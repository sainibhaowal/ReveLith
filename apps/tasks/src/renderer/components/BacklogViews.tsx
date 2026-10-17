import { useMemo, useState, type CSSProperties } from 'react'
import type { BoardState, ID, Task } from '../../domain/types'
import { isTaskDone, recentActivity, ticketId } from '../../store/selectors'
import type { Action } from '../../store/actions'
import { Avatar } from './Avatar'
import { TaskRow } from './ListView'
import { btnGhost } from '../styles'

/**
 * Everything not yet on the board, plus everything finished.
 *
 * Split into Planned and Archived directly in the native Tasks store and
 * views. A task is archived when it sits in a done column or carries the
 * archive flag, so moving a card is enough to change the view.
 */
export function BacklogView({
  state,
  tasks,
  dispatch: _dispatch,
  onOpen,
  selectedIds,
  onToggleSelect,
}: {
  state: BoardState
  tasks: Task[]
  dispatch: (action: Action) => void
  onOpen: (id: ID) => void
  selectedIds: ID[]
  onToggleSelect: (id: ID) => void
}) {
  const [showArchived, setShowArchived] = useState(false)

  const { planned, archived } = useMemo(() => {
    const open: Task[] = []
    const done: Task[] = []
    for (const task of tasks) {
      if (task.parentId) continue
      if (task.archived || isTaskDone(state, task)) done.push(task)
      else open.push(task)
    }
    return {
      planned: open.sort((a, b) => a.position - b.position),
      archived: done.sort(
        (a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt),
      ),
    }
  }, [state, tasks])

  return (
    <div className="tasks-backlog-view" style={wrap}>
      <div className="tasks-backlog-toolbar" style={toolbar}>
        <strong style={{ fontSize: 13 }}>Backlog</strong>
        <span style={count}>
          {planned.length} planned · {archived.length} archived
        </span>
        <span style={{ flex: 1 }} />
        <button
          style={btnGhost}
          type="button"
          aria-pressed={showArchived}
          onClick={() => setShowArchived((value) => !value)}
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      <div
        className="tasks-backlog-scroll"
        style={{ overflowY: 'auto', flex: 1, padding: '0 14px 14px' }}
      >
        <h3 className="tasks-backlog-section-heading" style={head}>
          Planned
          <span style={count}>{planned.length}</span>
        </h3>
        {planned.length === 0 ? (
          <p style={hint}>Nothing waiting. Everything is on the board or done.</p>
        ) : (
          planned.map((task) => (
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

        {showArchived ? (
          <>
            <h3 className="tasks-backlog-section-heading" style={head}>
              Archived
              <span style={count}>{archived.length}</span>
            </h3>
            {archived.length === 0 ? (
              <p style={hint}>Nothing archived yet.</p>
            ) : (
              archived.map((task) => (
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
          </>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Cross-task activity feed.
 *
 * Derived straight from the activity log, newest first, so it can never drift
 * from the history a task already shows. Clicking an entry opens its task.
 */
export function ActivityFeed({
  state,
  limit = 40,
  onOpenTask,
}: {
  state: BoardState
  limit?: number
  onOpenTask: (id: ID) => void
}) {
  const entries = useMemo(() => recentActivity(state, limit), [state, limit])
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? entries : entries.slice(0, 15)

  if (!entries.length) {
    return <p style={{ ...hint, padding: 18 }}>Nothing has happened yet.</p>
  }

  return (
    <div style={wrap}>
      <div style={toolbar}>
        <strong style={{ fontSize: 13 }}>Activity</strong>
        <span style={count}>{entries.length} event(s)</span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 14px' }}>
        {shown.map((entry) => {
          const task = entry.taskId ? state.tasks.find((t) => t.id === entry.taskId) : null
          // Activity has no actor field; the task's owner is the closest thing.
          const actor = task ? state.members.find((m) => m.id === task.assigneeId) : undefined
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => task && onOpenTask(task.id)}
              style={{ ...feedRow, cursor: task ? 'pointer' : 'default' }}
            >
              <span style={kind}>{entry.kind.replace(/_/g, ' ')}</span>
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {task ? `${ticketId(state, task)} · ${entry.message}` : entry.message}
              </span>
              <span style={when}>{new Date(entry.createdAt).toLocaleDateString()}</span>
              {actor ? <Avatar name={actor.name} color={actor.color} size={16} /> : null}
            </button>
          )
        })}
        {entries.length > 15 ? (
          <button
            style={{ ...btnGhost, alignSelf: 'flex-start', marginTop: 8 }}
            type="button"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Show less' : `Show all ${entries.length}`}
          </button>
        ) : null}
      </div>
    </div>
  )
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  borderBottom: '1px solid var(--border)',
}

const head: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-secondary)',
  margin: '14px 0 4px',
}

const hint: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)' }

const count: CSSProperties = { fontSize: 11, color: 'var(--text-secondary)' }

const feedRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid var(--border)',
  padding: '5px 4px',
  fontSize: 12,
  color: 'var(--text-primary)',
}

const kind: CSSProperties = {
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-secondary)',
  minWidth: 78,
}

const when: CSSProperties = { fontSize: 10, color: 'var(--text-secondary)' }
