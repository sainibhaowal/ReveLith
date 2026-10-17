import { useMemo, type CSSProperties } from 'react'
import type { BoardState, ID, Task } from '../../domain/types'
import { positionBetween } from '../../domain/position'
import { columnLoad, projectColumns, type SortMode, type TaskFilters } from '../../store/selectors'
import type { Action } from '../../store/actions'
import { colorVar } from '../styles'
import { TaskCard } from './TaskCard'

/** The kanban board: one column per configured board column, cards in manual order. */
export function Board({
  state,
  projectId,
  tasks,
  filters,
  sortMode: _sortMode,
  dispatch,
  onOpenTask,
  onAddTask,
  onEditColumn,
  dragging,
  setDragging,
}: {
  state: BoardState
  projectId: ID
  tasks: Task[]
  filters: TaskFilters
  sortMode: SortMode
  dispatch: (action: Action) => void
  onOpenTask: (id: string) => void
  onAddTask: (columnId: string) => void
  onEditColumn: (columnId: string) => void
  dragging: string | null
  setDragging: (id: string | null) => void
}) {
  const columns = useMemo(() => projectColumns(state, projectId), [state, projectId])

  /**
   * Insert before the card the pointer is hovering. Uses the neighbouring
   * visible cards as bounds — a midpoint between two ordered positions is still
   * a valid slot in the full group even when other cards are filtered out.
   */
  const dropOn = (columnId: string, beforeTaskId: string | null) => {
    const taskId = dragging
    if (!taskId) return
    const inColumn = tasks.filter((task) => task.columnId === columnId && task.id !== taskId)
    const index = beforeTaskId
      ? inColumn.findIndex((task) => task.id === beforeTaskId)
      : inColumn.length
    const before = index > 0 ? inColumn[index - 1].position : null
    const after = index >= 0 && index < inColumn.length ? inColumn[index].position : null
    dispatch({ kind: 'task/move', id: taskId, columnId, position: positionBetween(before, after) })
    setDragging(null)
  }

  return (
    <div style={board}>
      {columns.map((column) => {
        const cards = tasks.filter((task) => task.columnId === column.id)
        const load = columnLoad(state, column.id)
        const overLimit = column.wipLimit !== null && load > column.wipLimit

        return (
          <section
            key={column.id}
            style={columnStyle}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              event.preventDefault()
              dropOn(column.id, null)
            }}
            aria-label={column.name}
          >
            <header style={columnHeader}>
              <span style={{ ...dot, background: colorVar(column.color) }} aria-hidden="true" />
              <button
                onClick={() => onEditColumn(column.id)}
                style={columnNameButton}
                title="Edit column"
              >
                {column.name}
              </button>
              <span style={count}>{cards.length}</span>
              {column.wipLimit !== null ? (
                <span
                  style={{ ...count, color: overLimit ? 'var(--danger)' : 'var(--text-tertiary)' }}
                  title="Work in progress limit"
                >
                  /{column.wipLimit}
                </span>
              ) : null}
              {column.isDone ? <span style={doneBadge}>done</span> : null}
            </header>

            <div style={cardList}>
              {cards.map((task, index) => (
                <div
                  key={task.id}
                  onDragOver={(event) => {
                    // Only the lower half of a card means "insert before it".
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
                    const after = event.clientY > rect.top + rect.height / 2
                    dropOn(column.id, after ? null : task.id)
                  }}
                >
                  <TaskCard
                    state={state}
                    task={task}
                    onOpen={onOpenTask}
                    onDragStart={setDragging}
                    onDragEnd={() => setDragging(null)}
                    dragging={dragging === task.id}
                  />
                  {index === cards.length - 1 ? null : <div style={gap} />}
                </div>
              ))}

              {cards.length === 0 ? (
                <div style={emptyColumn}>
                  {filters.query || filters.labelIds.length
                    ? 'No matching tasks'
                    : 'Drop tasks here'}
                </div>
              ) : null}
            </div>

            <button style={addButton} onClick={() => onAddTask(column.id)}>
              + Add task
            </button>
          </section>
        )
      })}
    </div>
  )
}

const board: CSSProperties = {
  flex: 1,
  display: 'flex',
  gap: 12,
  padding: 16,
  overflowX: 'auto',
  alignItems: 'flex-start',
  minHeight: 0,
}

const columnStyle: CSSProperties = {
  flex: '1 1 0',
  minWidth: 270,
  maxWidth: 400,
  background: 'var(--bg-hover-subtle)',
  borderRadius: 'var(--radius-12)',
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '100%',
  border: '1px solid var(--border-subtle)',
}

const columnHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginBottom: 9,
  padding: '0 3px',
}

const dot: CSSProperties = { width: 8, height: 8, borderRadius: 4, flexShrink: 0 }

const columnNameButton: CSSProperties = {
  flex: 1,
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
  padding: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const count: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  background: 'var(--surface)',
  borderRadius: 10,
  padding: '1px 7px',
  fontWeight: 600,
}

const doneBadge: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--success)',
  background: 'var(--success-bg)',
  border: '1px solid var(--success-border)',
  borderRadius: 8,
  padding: '1px 5px',
}

const cardList: CSSProperties = {
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 40,
  flex: 1,
}

const gap: CSSProperties = { height: 7 }

const emptyColumn: CSSProperties = {
  textAlign: 'center',
  color: 'var(--text-tertiary)',
  fontSize: 12,
  padding: '18px 8px',
  border: '1px dashed var(--border-strong)',
  borderRadius: 'var(--radius-8)',
}

const addButton: CSSProperties = {
  marginTop: 8,
  padding: 7,
  fontSize: 12,
  borderRadius: 'var(--radius-8)',
  border: '1px dashed var(--border-strong)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
}
