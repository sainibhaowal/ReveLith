import type { BoardState, ID } from '../domain/types'
import { isBlocked, isOverdue, ticketId } from './selectors'

/**
 * Notification centre.
 *
 * Derived entirely from board state rather than stored, so it can never drift
 * out of sync with the tasks it describes, and it works the moment a board is
 * opened — no background job, which is the one thing a desktop app cannot have.
 */

export type NotificationKind = 'overdue' | 'dueSoon' | 'blocked' | 'mention' | 'unassigned' | 'overWip'

export interface Notification {
  id: string
  kind: NotificationKind
  taskId: ID | null
  taskTitle: string
  message: string
  /** Sort key; higher means more recent. */
  createdAt: number
}

export interface NotificationOptions {
  /** Days ahead to count as "due soon". */
  dueWithinDays?: number
  /** Include notifications from every project, not just the active one. */
  allProjects?: boolean
  /** Recognise @mentions with this author name. */
  currentAuthor?: string
}

const DEFAULTS = { dueWithinDays: 3, allProjects: false } as const

function daysUntil(taskDue: string, today: Date): number {
  const due = Date.parse(`${taskDue}T00:00:00`)
  const base = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00`)
  return Math.round((due - base) / 86_400_000)
}

/** Find `@name` mentions in a body, ignoring email-style addresses. */
export function findMentions(body: string, author: string): boolean {
  if (!author.trim()) return false
  const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\w@])@${escaped}\\b`, 'i').test(body)
}

/**
 * Build the notification list for a project, most urgent first.
 * Capped so a large board cannot produce an unbounded panel.
 */
export function buildNotifications(
  state: BoardState,
  projectId: ID | null,
  today = new Date(),
  options: NotificationOptions = {},
): Notification[] {
  const dueWithinDays = options.dueWithinDays ?? DEFAULTS.dueWithinDays
  const scopeAll = options.allProjects ?? DEFAULTS.allProjects
  const cap = 100

  const tasks = state.tasks.filter((task) => {
    if (task.archived || task.parentId) return false
    if (scopeAll) return true
    return projectId !== null && task.projectId === projectId
  })

  const out: Notification[] = []

  for (const task of tasks) {
    if (isOverdue(task, today)) {
      out.push({
        id: `overdue_${task.id}`,
        kind: 'overdue',
        taskId: task.id,
        taskTitle: task.title,
        message: `${ticketId(state, task)} was due ${task.dueDate}`,
        createdAt: task.updatedAt,
      })
      continue
    }

    if (task.dueDate) {
      const days = daysUntil(task.dueDate, today)
      if (days >= 0 && days <= dueWithinDays) {
        out.push({
          id: `due_${task.id}`,
          kind: 'dueSoon',
          taskId: task.id,
          taskTitle: task.title,
          message: `${ticketId(state, task)} is due ${task.dueDate}`,
          createdAt: task.updatedAt,
        })
      }
    }

    if (isBlocked(state, task)) {
      out.push({
        id: `blocked_${task.id}`,
        kind: 'blocked',
        taskId: task.id,
        taskTitle: task.title,
        message: `${ticketId(state, task)} is blocked by unfinished work`,
        createdAt: task.updatedAt,
      })
    }
  }

  if (options.currentAuthor) {
    for (const comment of state.comments) {
      const task = state.tasks.find((entry) => entry.id === comment.taskId)
      if (!task || task.archived) continue
      if (!scopeAll && projectId !== null && task.projectId !== projectId) continue
      if (!findMentions(comment.body, options.currentAuthor)) continue
      out.push({
        id: `mention_${comment.id}`,
        kind: 'mention',
        taskId: task.id,
        taskTitle: task.title,
        message: `${comment.author} mentioned you on ${ticketId(state, task)}`,
        createdAt: comment.createdAt,
      })
    }
  }

  // Overdue first, then due-soon, then blocked, then mentions; newest within a kind.
  const rank: Record<NotificationKind, number> = {
    overdue: 0,
    dueSoon: 1,
    blocked: 2,
    mention: 3,
    unassigned: 4,
    overWip: 5,
  }
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.createdAt - a.createdAt).slice(0, cap)
}

/** Counts per kind, for the badge. */
export function notificationCounts(
  notifications: Notification[],
): Record<NotificationKind, number> {
  const counts = { overdue: 0, dueSoon: 0, blocked: 0, mention: 0, unassigned: 0, overWip: 0 }
  for (const notification of notifications) counts[notification.kind] += 1
  return counts
}

export const NOTIFICATION_LABEL: Record<NotificationKind, string> = {
  overdue: 'Overdue',
  dueSoon: 'Due soon',
  blocked: 'Blocked',
  mention: 'Mentions',
  unassigned: 'Unassigned',
  overWip: 'Over WIP limit',
}

/** A single-line summary for the status bar. */
export function notificationSummary(notifications: Notification[]): string {
  if (!notifications.length) return ''
  const counts = notificationCounts(notifications)
  const parts: string[] = []
  if (counts.overdue) parts.push(`${counts.overdue} overdue`)
  if (counts.dueSoon) parts.push(`${counts.dueSoon} due soon`)
  if (counts.blocked) parts.push(`${counts.blocked} blocked`)
  if (counts.mention) parts.push(`${counts.mention} mention${counts.mention === 1 ? '' : 's'}`)
  return parts.join(' · ')
}
