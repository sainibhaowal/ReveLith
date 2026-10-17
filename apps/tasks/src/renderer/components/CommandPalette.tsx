import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { BoardState, ID } from '../../domain/types'
import { isTaskDone, ticketId } from '../../store/selectors'
import { Avatar } from './Avatar'
import { PRIORITIES } from '../../domain/types'

/** One runnable thing the palette can do. */
export interface Command {
  id: string
  title: string
  hint?: string
  group: string
  keywords: string
  run: () => void
}

/**
 * Build every command the board can run right now.
 *
 * Tasks are matched by ticket id, title and label names, so "ENG-12" and
 * "overdue" both land on something useful. Commands are cheap to build — it is
 * a pure function of state — so the palette can recompute on every keystroke.
 */
export function buildCommands(
  state: BoardState,
  actions: {
    openTask: (id: ID) => void
    setView: (view: 'board' | 'list' | 'backlog' | 'calendar' | 'gantt' | 'activity' | 'mytasks') => void
    newTask: () => void
    newProject: () => void
    newLabel: () => void
    newColumn: () => void
    people: () => void
    myTasks: (memberId: ID) => void
    exportBoard: () => void
    clearFilters: () => void
    openMember: (memberId: ID) => void
    projectId: ID | null
  },
): Command[] {
  const commands: Command[] = []
  const project = state.projects.find((entry) => entry.id === actions.projectId)

  for (const task of state.tasks) {
    const labels = state.labels.filter((label) => task.labelIds.includes(label.id))
    const assignee = state.members.find((member) => member.id === task.assigneeId)
    commands.push({
      id: `task:${task.id}`,
      title: `${ticketId(state, task)} ${task.title}`,
      hint: [assignee?.name, task.dueDate, isTaskDone(state, task) ? 'done' : null]
        .filter(Boolean)
        .join(' · '),
      group: 'Tasks',
      keywords: `${task.title} ${ticketId(state, task)} ${labels.map((l) => l.name).join(' ')} ${task.description}`.toLowerCase(),
      run: () => actions.openTask(task.id),
    })
  }

  for (const member of state.members) {
    commands.push({
      id: `member:${member.id}`,
      title: `My tasks — ${member.name}`,
      hint: `${state.tasks.filter((t) => t.assigneeId === member.id && !t.archived).length} assigned`,
      group: 'People',
      keywords: `${member.name} my tasks assign owner`.toLowerCase(),
      run: () => actions.myTasks(member.id),
    })
  }

  const views: { id: Command['group']; label: string; view: Parameters<typeof actions.setView>[0] }[] = [
    { id: 'views', label: 'Board', view: 'board' },
    { id: 'views', label: 'List', view: 'list' },
    { id: 'views', label: 'Backlog', view: 'backlog' },
    { id: 'views', label: 'Calendar', view: 'calendar' },
    { id: 'views', label: 'Gantt', view: 'gantt' },
    { id: 'views', label: 'Activity', view: 'activity' },
  ]
  for (const entry of views) {
    commands.push({
      id: `view:${entry.view}`,
      title: `Go to ${entry.label}`,
      group: 'Views',
      keywords: `${entry.label} view switch go to`.toLowerCase(),
      run: () => actions.setView(entry.view),
    })
  }

  const simple: [string, string, () => void][] = [
    ['New task', 'create add task ticket issue', actions.newTask],
    ['New project', 'create add project board', actions.newProject],
    ['New label', 'create add label tag', actions.newLabel],
    ['New column', 'create add column stage', actions.newColumn],
    ['Manage people', 'members team assign owner roster', actions.people],
    ['Export board', 'download markdown csv json ics', actions.exportBoard],
    ['Clear filters', 'reset search filters show all', actions.clearFilters],
  ]
  for (const [title, keywords, run] of simple) {
    commands.push({ id: `do:${title}`, title, group: 'Actions', keywords: keywords.toLowerCase(), run })
  }

  for (const priority of PRIORITIES) {
    commands.push({
      id: `filter:${priority}`,
      title: `Filter: ${priority} priority`,
      group: 'Filters',
      keywords: `filter priority ${priority} urgent high medium low`.toLowerCase(),
      run: () => actions.setView('list'),
    })
  }

  void project
  return commands
}

/**
 * ⌘K / Ctrl+K palette.
 *
 * Ranks by a simple score rather than a fuzzy matcher: an exact ticket id beats
 * a title prefix beats a substring, so "ENG-1" finds ENG-12, ENG-1 and ENG-19 in
 * a sensible order without pulling in a dependency.
 */
export function CommandPalette({
  state,
  open,
  commands,
  onClose,
}: {
  state: BoardState
  open: boolean
  commands: Command[]
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      // Focus after paint so the dialog exists.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
  }, [open])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands.slice(0, 60)
    const scored: { command: Command; score: number }[] = []
    for (const command of commands) {
      const score = scoreCommand(command, needle)
      if (score > 0) scored.push({ command, score })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 60).map((entry) => entry.command)
  }, [commands, query])

  if (!open) return null

  const runAt = (index: number) => {
    const command = results[index]
    if (!command) return
    onClose()
    command.run()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((value) => (results.length ? (value + 1) % results.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((value) => (results.length ? (value - 1 + results.length) % results.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runAt(cursor)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  let lastGroup = ''

  return (
    <div
      className="tasks-dialog-backdrop"
      style={backdrop}
      role="presentation"
      onClick={onClose}
      onKeyDown={onKeyDown}
    >
      <div
        className="tasks-dialog tasks-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
        style={panel}
      >
        <input
          ref={inputRef}
          value={query}
          placeholder="Search tasks, jump to a view, run an action…"
          aria-label="Command palette search"
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
          }}
          style={input}
        />

        <div style={list} role="listbox" aria-label="Results">
          {results.length === 0 ? (
            <p style={empty}>Nothing matches “{query}”.</p>
          ) : (
            results.map((command, index) => {
              const showGroup = command.group !== lastGroup
              lastGroup = command.group
              const assignee =
                command.id.startsWith('task:')
                  ? state.members.find(
                      (member) => member.id === state.tasks.find((t) => `task:${t.id}` === command.id)?.assigneeId,
                    )
                  : undefined
              return (
                <div key={command.id}>
                  {showGroup ? <div className="tasks-command-group" style={group}>{command.group}</div> : null}
                  <button
                    className="tasks-command-option"
                    role="option"
                    aria-selected={index === cursor}
                    type="button"
                    style={{ ...option, background: index === cursor ? 'var(--accent-soft)' : 'transparent' }}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => runAt(index)}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {command.title}
                    </span>
                    {command.hint ? <span style={hint}>{command.hint}</span> : null}
                    {assignee ? <Avatar name={assignee.name} color={assignee.color} size={16} /> : null}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <footer style={footer}>
          <span>↑↓ move</span>
          <span>↵ run</span>
          <span>esc close</span>
        </footer>
      </div>
    </div>
  )
}

/** Higher is better; 0 means no match. */
function scoreCommand(command: Command, needle: string): number {
  const title = command.title.toLowerCase()
  if (title === needle) return 1000
  if (title.startsWith(needle)) return 800
  // A ticket id is the most precise handle a task has, so weight it above prose.
  const ticket = title.split(' ')[0]
  if (ticket && ticket === needle) return 900
  if (ticket && ticket.startsWith(needle)) return 700
  if (title.includes(needle)) return 500
  if (command.keywords.includes(needle)) return 300
  // Every whitespace-separated term must appear somewhere, for "spec review".
  const terms = needle.split(/\s+/).filter(Boolean)
  if (terms.length > 1 && terms.every((term) => command.keywords.includes(term))) return 200
  return 0
}

const backdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '12vh',
  zIndex: 100,
}

const panel: CSSProperties = {
  width: 'min(640px, 92vw)',
  maxHeight: '64vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
  overflow: 'hidden',
}

const input: CSSProperties = {
  border: 'none',
  borderBottom: '1px solid var(--border)',
  padding: '12px 14px',
  fontSize: 14,
  background: 'transparent',
  color: 'var(--text-primary)',
  outline: 'none',
}

const list: CSSProperties = { flex: 1, overflowY: 'auto', padding: '4px 0' }

const group: CSSProperties = {
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: 'var(--text-secondary)',
  padding: '8px 14px 3px',
}

const option: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  border: 'none',
  padding: '6px 14px',
  fontSize: 13,
  color: 'var(--text-primary)',
  cursor: 'pointer',
}

const empty: CSSProperties = { padding: 16, fontSize: 12, color: 'var(--text-secondary)' }

const hint: CSSProperties = { fontSize: 10, color: 'var(--text-secondary)' }

const footer: CSSProperties = {
  display: 'flex',
  gap: 14,
  padding: '7px 14px',
  borderTop: '1px solid var(--border)',
  fontSize: 10,
  color: 'var(--text-secondary)',
}
