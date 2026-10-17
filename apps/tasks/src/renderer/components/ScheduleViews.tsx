import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { BoardState, ID, Task } from '../../domain/types'
import { isTaskDone, ticketId } from '../../store/selectors'
import { addDays, monthGrid, monthLabel, shiftMonth, spanOf, today } from '../../store/dates'
import { Avatar } from './Avatar'
import { btnGhost, PRIORITY_COLOR } from '../styles'

/**
 * Month grid of every dated task.
 *
 * A board already stores `startDate` and `dueDate`; this is simply the view
 * that makes them legible. Days past the cap show a "+n" button rather than an
 * ever-growing popover, so the grid height stays constant.
 */
export function CalendarView({
  state,
  tasks,
  onOpen,
}: {
  state: BoardState
  tasks: Task[]
  onOpen: (id: ID) => void
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [expanded, setExpanded] = useState<string | null>(null)

  const grid = useMemo(() => monthGrid(month, 1), [month])
  const isoToday = today()

  // Index once rather than filtering 42 times per render. A task with both
  // dates occupies every day in its inclusive span, while the grid bounds
  // keep a long-running task from creating an unbounded loop.
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    const firstVisibleDay = grid.start
    const lastVisibleDay = grid.days[grid.days.length - 1]
    for (const task of tasks) {
      const span = spanOf(task.startDate, task.dueDate)
      if (!span) continue
      const start = span.start < firstVisibleDay ? firstVisibleDay : span.start
      const end = span.end > lastVisibleDay ? lastVisibleDay : span.end
      if (start > end) continue
      for (let day = start; day <= end; day = addDays(day, 1)) {
        if (!map.has(day)) map.set(day, [])
        map.get(day)!.push(task)
      }
    }
    return map
  }, [grid, tasks])

  const cap = 3

  return (
    <div className="tasks-calendar-view" style={wrap}>
      <div className="tasks-calendar-toolbar" style={toolbar}>
        <button
          style={btnGhost}
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <strong style={{ fontSize: 14, minWidth: 130, textAlign: 'center' }}>
          {monthLabel(month)}
        </strong>
        <button
          style={btnGhost}
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Next month"
        >
          ›
        </button>
        <button style={btnGhost} type="button" onClick={() => setMonth(isoToday.slice(0, 7))}>
          Today
        </button>
        <span style={{ flex: 1 }} />
        <span style={hint}>{tasks.filter((t) => t.startDate || t.dueDate).length} dated</span>
      </div>

      <div className="tasks-calendar-week-head" style={weekHeadRow}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name) => (
          <div key={name} className="tasks-calendar-weekday" style={weekHead}>
            {name}
          </div>
        ))}
      </div>

      <div className="tasks-calendar-grid" style={gridBody}>
        {grid.weeks.map((week) => (
          <div key={week[0]} style={weekRow}>
            {week.map((day) => {
              const items = byDay.get(day) ?? []
              const inMonth = day.slice(0, 7) === month
              const isToday = day === isoToday
              const isOpen = expanded === day
              const shown = isOpen ? items : items.slice(0, cap)

              return (
                <div
                  key={day}
                  className="tasks-calendar-cell"
                  style={{
                    ...cell,
                    background: inMonth ? 'var(--surface)' : 'var(--surface-subtle)',
                    borderColor: isToday ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  <div className="tasks-calendar-day-number" style={dayNum}>
                    {Number(day.slice(8, 10))}
                  </div>
                  <div style={cellBody}>
                    {shown.map((task) => (
                      <CalendarPill key={task.id} state={state} task={task} onOpen={onOpen} />
                    ))}
                    {items.length > cap ? (
                      <button
                        className="tasks-calendar-more"
                        style={more}
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : day)}
                        aria-label={`${isOpen ? 'Show fewer' : 'Show all'} tasks on ${day}`}
                      >
                        {isOpen ? '− less' : `+${items.length - cap} more`}
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarPill({
  state,
  task,
  onOpen,
}: {
  state: BoardState
  task: Task
  onOpen: (id: ID) => void
}) {
  const done = isTaskDone(state, task)
  const assignee = state.members.find((member) => member.id === task.assigneeId)
  return (
    <button
      type="button"
      className="tasks-calendar-pill"
      onClick={() => onOpen(task.id)}
      title={`${ticketId(state, task)} ${task.title}`}
      style={{
        ...pill,
        opacity: done ? 0.55 : 1,
        borderLeftColor: PRIORITY_COLOR[task.priority],
        textDecoration: done ? 'line-through' : 'none',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {task.title}
      </span>
      {assignee ? <Avatar name={assignee.name} color={assignee.color} size={13} /> : null}
    </button>
  )
}

/**
 * Timeline of tasks across a scrolling window, with bars that can be dragged.
 *
 * Dragging rewrites only the start date; the bar keeps its length, so a drag is
 * a shift rather than a resize. That keeps one gesture unambiguous.
 */
export function GanttView({
  state: _state,
  tasks,
  onOpen,
  onShift,
}: {
  state: BoardState
  tasks: Task[]
  onOpen: (id: ID) => void
  onShift: (id: ID, newStart: string) => void
}) {
  const [offset, setOffset] = useState(() => addDays(today(), -7))
  const [dragging, setDragging] = useState<{
    id: string
    start: string
    originX: number
    previewStart: string
  } | null>(null)
  const dragMovedRef = useRef(false)

  useEffect(() => {
    if (!dragging) return
    const onMove = (event: PointerEvent) => {
      const delta = Math.round((event.clientX - dragging.originX) / dayWidth)
      if (delta !== 0) dragMovedRef.current = true
      const previewStart = addDays(dragging.start, delta)
      setDragging((current) => (current ? { ...current, previewStart } : null))
    }
    const onUp = () => {
      const current = dragging
      if (current && current.previewStart !== current.start)
        onShift(current.id, current.previewStart)
      setDragging(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDragging(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dragging, onShift])

  const dayWidth = 26
  const spanDays = 45

  const window_ = useMemo(
    () => Array.from({ length: spanDays }, (_, i) => addDays(offset, i)),
    [offset],
  )

  const positioned = useMemo(() => {
    const rows: { task: Task; start: number; length: number }[] = []
    for (const task of tasks) {
      const start = task.startDate ?? task.dueDate
      if (!start) continue
      const end = task.dueDate && task.dueDate > start ? task.dueDate : start
      const startIdx = Math.round(
        (Date.parse(`${start}T00:00:00Z`) - Date.parse(`${offset}T00:00:00Z`)) / 86_400_000,
      )
      const endIdx = Math.round(
        (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${offset}T00:00:00Z`)) / 86_400_000,
      )
      if (endIdx < 0 || startIdx > spanDays) continue
      rows.push({
        task,
        start: Math.max(0, startIdx),
        length: Math.max(1, endIdx - Math.max(0, startIdx) + 1),
      })
    }
    return rows.sort((a, b) => a.start - b.start || a.task.title.localeCompare(b.task.title))
  }, [tasks, offset])

  const todayIdx = Math.round(
    (Date.parse(`${today()}T00:00:00Z`) - Date.parse(`${offset}T00:00:00Z`)) / 86_400_000,
  )

  return (
    <div className="tasks-gantt-view" style={wrap}>
      <div className="tasks-gantt-toolbar" style={toolbar}>
        <button
          style={btnGhost}
          type="button"
          onClick={() => setOffset(addDays(offset, -spanDays))}
          aria-label="Earlier"
        >
          ‹
        </button>
        <button style={btnGhost} type="button" onClick={() => setOffset(addDays(today(), -7))}>
          Today
        </button>
        <button
          style={btnGhost}
          type="button"
          onClick={() => setOffset(addDays(offset, spanDays))}
          aria-label="Later"
        >
          ›
        </button>
        <span style={hint}>{positioned.length} scheduled</span>
        <span style={{ flex: 1 }} />
        <span style={hint}>Drag a bar to shift its start date</span>
      </div>

      <div className="tasks-gantt-scroll" style={ganttScroll}>
        <div style={{ minWidth: spanDays * dayWidth + 220 }}>
          <div className="tasks-gantt-day-head" style={dayHeadRow}>
            <div className="tasks-gantt-name-head" style={nameHead}>
              Task
            </div>
            <div style={{ display: 'flex' }}>
              {window_.map((day) => (
                <div
                  key={day}
                  className="tasks-gantt-day-head-cell"
                  style={{
                    ...dayHead,
                    borderLeftColor: day === today() ? 'var(--accent)' : 'var(--border)',
                    color: day === today() ? 'var(--accent-strong)' : 'var(--text-secondary)',
                  }}
                >
                  <span>{Number(day.slice(8, 10))}</span>
                  <small>{day.slice(5, 7)}</small>
                </div>
              ))}
            </div>
          </div>

          {positioned.length === 0 ? (
            <p style={{ ...hint, padding: 18 }}>
              Nothing scheduled. Give a task a start or due date.
            </p>
          ) : (
            positioned.map(({ task, length }) => (
              <div key={task.id} className="tasks-gantt-row" style={ganttRow}>
                <button
                  className="tasks-gantt-name-cell"
                  style={nameCell}
                  onClick={() => onOpen(task.id)}
                  title={task.title}
                >
                  {task.title}
                </button>
                <div style={{ display: 'flex', position: 'relative' }}>
                  {todayIdx >= 0 && todayIdx < spanDays ? (
                    <div style={{ ...todayLine, left: todayIdx * dayWidth + dayWidth / 2 }} />
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Reschedule ${task.title}`}
                    title={`${task.startDate ?? ''} → ${task.dueDate ?? ''}`}
                    onClick={() => {
                      if (dragMovedRef.current) {
                        dragMovedRef.current = false
                        return
                      }
                      onOpen(task.id)
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      const baseStart = task.startDate ?? task.dueDate ?? offset
                      dragMovedRef.current = false
                      setDragging({
                        id: task.id,
                        start: baseStart,
                        originX: event.clientX,
                        previewStart: baseStart,
                      })
                    }}
                    style={{
                      ...bar,
                      left: (() => {
                        const shownStart =
                          dragging?.id === task.id
                            ? dragging.previewStart
                            : (task.startDate ?? task.dueDate ?? offset)
                        return (
                          Math.max(
                            0,
                            Math.round(
                              (Date.parse(`${shownStart}T00:00:00Z`) -
                                Date.parse(`${offset}T00:00:00Z`)) /
                                86_400_000,
                            ),
                          ) * dayWidth
                        )
                      })(),
                      width: length * dayWidth - 4,
                      background: `color-mix(in srgb, ${PRIORITY_COLOR[task.priority]} 28%, var(--surface))`,
                      borderColor: PRIORITY_COLOR[task.priority],
                      opacity: dragging?.id === task.id ? 0.7 : 1,
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {dragging ? (
        <div style={dragHelp}>
          <span>Dragging — release over the timeline, or press Escape to cancel.</span>
          <button style={btnGhost} type="button" onClick={() => setDragging(null)}>
            Cancel
          </button>
          <button
            style={btnGhost}
            type="button"
            onClick={() => {
              // Keyboard path: nudge the selected bar by one day.
              const row = positioned.find((r) => r.task.id === dragging.id)
              if (row) {
                const base = row.task.startDate ?? row.task.dueDate!
                onShift(row.task.id, addDays(base, 1))
              }
              setDragging(null)
            }}
          >
            Shift +1 day
          </button>
        </div>
      ) : null}
    </div>
  )
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  borderBottom: '1px solid var(--border)',
}

const hint: CSSProperties = { fontSize: 11, color: 'var(--text-secondary)' }

const weekHeadRow: CSSProperties = { display: 'flex', borderBottom: '1px solid var(--border)' }

const weekHead: CSSProperties = {
  flex: 1,
  textAlign: 'center',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-secondary)',
  padding: '4px 0',
}

const gridBody: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
}

const weekRow: CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 86,
  borderBottom: '1px solid var(--border)',
}

const cell: CSSProperties = {
  flex: 1,
  minWidth: 0,
  borderLeft: '1px solid',
  borderRight: '1px solid',
  padding: '2px 3px',
  overflow: 'hidden',
}

const dayNum: CSSProperties = {
  fontSize: 10,
  color: 'var(--text-secondary)',
  textAlign: 'right',
  paddingRight: 2,
}

const cellBody: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }

const pill: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  fontSize: 10,
  textAlign: 'left',
  padding: '1px 4px',
  borderRadius: 4,
  border: '1px solid var(--border)',
  borderLeftWidth: 3,
  borderLeftStyle: 'solid',
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  maxWidth: '100%',
}

const more: CSSProperties = {
  fontSize: 9,
  background: 'none',
  border: 'none',
  color: 'var(--accent-strong)',
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
}

const ganttScroll: CSSProperties = { flex: 1, overflow: 'auto' }

const dayHeadRow: CSSProperties = {
  display: 'flex',
  position: 'sticky',
  top: 0,
  zIndex: 2,
  background: 'var(--surface)',
  borderBottom: '1px solid var(--border)',
}

const nameHead: CSSProperties = {
  width: 220,
  flexShrink: 0,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-secondary)',
  padding: '4px 8px',
  borderRight: '1px solid var(--border)',
}

const dayHead: CSSProperties = {
  width: 26,
  flexShrink: 0,
  fontSize: 9,
  textAlign: 'center',
  padding: '4px 0',
  borderLeft: '1px solid',
}

const ganttRow: CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border)',
  minHeight: 30,
  alignItems: 'center',
}

const nameCell: CSSProperties = {
  width: 220,
  flexShrink: 0,
  fontSize: 12,
  textAlign: 'left',
  padding: '4px 8px',
  background: 'none',
  border: 'none',
  borderRight: '1px solid var(--border)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const bar: CSSProperties = {
  position: 'absolute',
  top: 5,
  height: 18,
  borderRadius: 4,
  borderWidth: 1,
  borderStyle: 'solid',
  cursor: 'grab',
  padding: 0,
}

const todayLine: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 2,
  background: 'var(--accent)',
  zIndex: 1,
  pointerEvents: 'none',
}

const dragHelp: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 14px',
  borderTop: '1px solid var(--border)',
  fontSize: 12,
  color: 'var(--text-secondary)',
}
