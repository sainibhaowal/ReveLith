import type { BoardState, ID, Task } from '../domain/types'
import { getColumn, getProject, ticketId } from './selectors'

/**
 * iCalendar (RFC 5545) export.
 *
 * Dated tasks become VEVENTs so real due dates reach Google/Outlook rather than
 * living only inside this app. Undated tasks are omitted — a calendar entry with
 * no date is noise.
 */

const PRODID = '-//ReveLith Tasks//Task Board//EN'

/** RFC 5545 folds content lines at 75 octets, continuation lines start with a space. */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let remaining = line
  parts.push(remaining.slice(0, 75))
  remaining = remaining.slice(75)
  while (remaining.length > 0) {
    // 74 because the continuation adds a leading space.
    parts.push(` ${remaining.slice(0, 74)}`)
    remaining = remaining.slice(74)
  }
  return parts.join('\r\n')
}

/** Escape TEXT values: backslash, semicolon, comma, newline. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * A date-only value for `VALUE=DATE`, e.g. 20260401.
 *
 * Deliberately drops the time: a task due "2026-04-01" is a whole day, and
 * stamping a time onto it would shift it by a day for anyone east or west of UTC.
 */
function formatDate(value: string | Date): string {
  const iso = (typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : value).toISOString()
  return iso.slice(0, 10).replace(/-/g, '')
}

/** RFC 5545 timestamp with the local UTC offset, e.g. 20260310T120000Z. */
function formatStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

/** Escape a UID: no spaces, no commas. */
function safeUid(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-')
}

export function taskToEvent(state: BoardState, task: Task, stamp: Date): string[] {
  if (!task.dueDate && !task.startDate) return []
  const project = getProject(state, task.projectId)
  const column = getColumn(state, task.columnId)
  const done = column?.isDone ?? false
  const location = project ? `${project.name} / ${column?.name ?? ''}`.trim() : ''

  const lines = [
    'BEGIN:VEVENT',
    `UID:${safeUid(task.id)}@revelith-tasks`,
    `DTSTAMP:${formatStamp(stamp)}`,
    `SUMMARY:${escapeText(`${ticketId(state, task)} ${task.title}`)}`,
  ]

  if (task.startDate) {
    lines.push(`DTSTART;VALUE=DATE:${formatDate(task.startDate)}`)
  }
  if (task.dueDate) {
    lines.push(`DTEND;VALUE=DATE:${formatDate(task.dueDate)}`)
  }

  if (descriptionOrEmpty(task)) {
    lines.push(`DESCRIPTION:${escapeText(task.description)}`)
  }
  if (location) lines.push(`LOCATION:${escapeText(location)}`)
  lines.push(`CATEGORIES:${escapeText(task.priority)}`)
  lines.push(`STATUS:${done ? 'COMPLETED' : 'CONFIRMED'}`)
  lines.push('END:VEVENT')

  return lines
}

function descriptionOrEmpty(task: Task): string {
  return task.description.trim()
}

/** Build a complete VCALENDAR for one project. */
export function projectToIcs(state: BoardState, projectId: ID, now = new Date()): string {
  const project = getProject(state, projectId)
  const name = project?.name ?? 'Tasks'

  const events: string[] = []
  const tasks = state.tasks
    .filter((task) => task.projectId === projectId && !task.parentId)
    .sort((a, b) => a.number - b.number)

  for (const task of tasks) {
    events.push(...taskToEvent(state, task, now))
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    ...events,
    'END:VCALENDAR',
  ]

  // RFC 5545 requires CRLF line endings.
  return `${lines.map(fold).join('\r\n')}\r\n`
}

/** Every dated task across every project. */
export function boardToIcs(state: BoardState, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:ReveLith Tasks',
  ]
  for (const project of state.projects) {
    if (project.archived) continue
    const tasks = state.tasks
      .filter((task) => task.projectId === project.id && !task.parentId && !task.archived)
      .sort((a, b) => a.number - b.number)
    for (const task of tasks) lines.push(...taskToEvent(state, task, now))
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}

/** How many dated tasks an export would contain. */
export function icsEventCount(state: BoardState, projectId?: ID): number {
  const tasks = state.tasks.filter(
    (task) =>
      !task.parentId &&
      (projectId ? task.projectId === projectId : true) &&
      (task.dueDate !== null || task.startDate !== null),
  )
  return tasks.length
}
