import { useMemo, useState, type CSSProperties } from 'react'
import type { BoardState, ID, Task } from '../../domain/types'
import { getMember, isOverdue, isTaskDone, tasksAssignedTo, ticketId } from '../../store/selectors'
import { Avatar } from './Avatar'
import { TaskRow } from './ListView'
import { btnGhost } from '../styles'
import { SelectMenu } from './SelectMenu'

type Grouping = 'due' | 'project'

/** Bucket label plus its tasks, used for both groupings. */
interface Bucket {
  key: string
  label: string
  tone: 'danger' | 'warn' | 'muted'
  tasks: Task[]
}

/**
 * Everything assigned to one person, across every project.
 *
 * Grouped by due date (overdue / today / tomorrow / this week / later) or by
 * project — the two ways people actually answer "what should I pick up next".
 */
export function MyTasksView({
  state,
  memberId,
  onOpen,
  selectedIds,
  onToggleSelect,
  onSelectAll,
}: {
  state: BoardState
  memberId: ID | null
  onOpen: (id: ID) => void
  selectedIds: ID[]
  onToggleSelect: (id: ID) => void
  onSelectAll: (ids: ID[]) => void
}) {
  const [grouping, setGrouping] = useState<Grouping>('due')

  const member = getMember(state, memberId)
  const tasks = useMemo(
    () => (memberId ? tasksAssignedTo(state, memberId).filter((task) => !isTaskDone(state, task)) : []),
    [memberId, state],
  )

  const buckets = useMemo<Bucket[]>(() => group(state, tasks, grouping), [state, tasks, grouping])

  if (!member) {
    return (
      <div style={emptyPage}>
        <p>No person selected.</p>
        <p style={{ ...hint, fontWeight: 400 }}>
          Add people from the People panel, then pick one here.
        </p>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={toolbar}>
        <Avatar name={member.name} color={member.color} size={26} />
        <strong style={{ fontSize: 14 }}>{member.name}</strong>
        <span style={count}>{tasks.length} open</span>
        <span style={{ flex: 1 }} />
        <button style={btnGhost} type="button" onClick={() => onSelectAll(tasks.map((t) => t.id))}>
          Select all
        </button>
        <SelectMenu
          label="Group my tasks by"
          value={grouping}
          options={[{ value: 'due', label: 'Group by due date' }, { value: 'project', label: 'Group by project' }]}
          onChange={(value) => setGrouping(value as Grouping)}
          style={{ ...miniSelect, padding: 0 }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 14px' }}>
        {buckets.length === 0 ? (
          <p style={hint}>Nothing assigned and outstanding.</p>
        ) : (
          buckets.map((bucket) => (
            <section key={bucket.key}>
              <h3 style={groupHead}>
                {bucket.label}
                <span style={count}>{bucket.tasks.length}</span>
              </h3>
              {bucket.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  state={state}
                  task={task}
                  onOpen={onOpen}
                  selectable
                  selected={selectedIds.includes(task.id)}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  )
}

/** Split tasks into the buckets the current grouping wants. */
function group(state: BoardState, tasks: Task[], grouping: Grouping): Bucket[] {
  if (grouping === 'project') {
    const map = new Map<string, Bucket>()
    for (const task of tasks) {
      const project = state.projects.find((entry) => entry.id === task.projectId)
      const key = task.projectId
      if (!map.has(key)) {
        map.set(key, { key, label: project?.name ?? 'Unknown project', tone: 'muted', tasks: [] })
      }
      map.get(key)!.tasks.push(task)
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
  }

  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const buckets: Bucket[] = [
    { key: 'overdue', label: 'Overdue', tone: 'danger', tasks: [] },
    { key: 'today', label: 'Today', tone: 'warn', tasks: [] },
    { key: 'tomorrow', label: 'Tomorrow', tone: 'muted', tasks: [] },
    { key: 'week', label: 'This week', tone: 'muted', tasks: [] },
    { key: 'later', label: 'Later', tone: 'muted', tasks: [] },
    { key: 'none', label: 'No due date', tone: 'muted', tasks: [] },
  ]

  for (const task of tasks) {
    if (!task.dueDate) {
      buckets[5].tasks.push(task)
      continue
    }
    if (isOverdue(task, today)) {
      buckets[0].tasks.push(task)
      continue
    }
    if (task.dueDate === todayIso) {
      buckets[1].tasks.push(task)
      continue
    }
    const days = Math.round(
      (Date.parse(`${task.dueDate}T00:00:00`) - Date.parse(`${todayIso}T00:00:00`)) / 86_400_000,
    )
    if (days === 1) buckets[2].tasks.push(task)
    else if (days <= 7) buckets[3].tasks.push(task)
    else buckets[4].tasks.push(task)
  }

  // Empty buckets add noise; overdue is always shown so the view reads truthfully.
  return buckets.filter((bucket) => bucket.tasks.length || bucket.key === 'overdue')
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  borderBottom: '1px solid var(--border)',
}

const emptyPage: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  gap: 6,
  color: 'var(--text-secondary)',
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

const hint: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }

const count: CSSProperties = { fontSize: 11, color: 'var(--text-secondary)' }

const miniSelect = {
  fontSize: 11,
  padding: '3px 6px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-primary)',
} as const

export { ticketId }
