import type { BoardState, ID, Task } from '../domain/types'
import {
  getColumn,
  getProject,
  isBlocked,
  isTaskDone,
  projectColumns,
  projectCustomFields,
  projectLabels,
  subtasksOf,
  ticketId,
  totalLoggedMinutes,
} from '../store/selectors'

/**
 * Board export. JSON round-trips losslessly; Markdown and CSV are for pasting
 * into docs and spreadsheets.
 */

export function boardToJson(state: BoardState): string {
  return JSON.stringify(state, null, 2)
}

export function boardToMarkdown(state: BoardState, projectId: ID): string {
  const project = getProject(state, projectId)
  if (!project) return ''
  const lines: string[] = [`# ${project.name}`, '']

  if (project.description.trim()) {
    lines.push(project.description.trim(), '')
  }

  const fields = projectCustomFields(state, project.id)
  if (fields.length) {
    lines.push(`Custom fields: ${fields.map((field) => field.name).join(', ')}`, '')
  }

  lines.push(`Key: \`${project.key}\``, '')

  for (const column of projectColumns(state, project.id)) {
    const tasks = state.tasks
      .filter((task) => task.columnId === column.id && !task.archived && !task.parentId)
      .sort((a, b) => a.position - b.position)

    lines.push(`## ${column.name} (${tasks.length})`, '')
    if (!tasks.length) {
      lines.push('_Empty_', '')
      continue
    }

    for (const task of tasks) {
      lines.push(`- **${ticketId(state, task)} ${task.title}** — _${task.priority}_`)
      if (task.dueDate) lines.push(`  - Due: ${task.dueDate}`)
      const labels = projectLabels(state, project.id).filter((label) =>
        task.labelIds.includes(label.id),
      )
      if (labels.length) lines.push(`  - Labels: ${labels.map((label) => label.name).join(', ')}`)
      const subtasks = subtasksOf(state, task.id)
      if (subtasks.length) {
        lines.push(
          `  - Sub-tasks: ${subtasks.map((sub) => `${sub.title}${isTaskDone(state, sub) ? ' ✓' : ''}`).join('; ')}`,
        )
      }
      if (task.description.trim()) {
        lines.push(`  - ${task.description.trim().split('\n')[0]}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

function csvCell(value: string): string {
  // Quote when the value contains a delimiter, quote or newline; double inner quotes.
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const CSV_COLUMNS = [
  'ticket',
  'title',
  'column',
  'priority',
  'dueDate',
  'labels',
  'blockedBy',
  'subtasks',
  'timeLoggedMinutes',
  'archived',
] as const

export function projectToCsv(state: BoardState, projectId: ID): string {
  const project = getProject(state, projectId)
  if (!project) return ''
  const labels = projectLabels(state, project.id)

  const rows: string[] = [CSV_COLUMNS.join(',')]
  const tasks = state.tasks
    .filter((task) => task.projectId === project.id)
    .sort((a, b) => a.number - b.number)

  for (const task of tasks) {
    const taskLabels = labels
      .filter((label) => task.labelIds.includes(label.id))
      .map((label) => label.name)
    const blockedBy = state.relations
      .filter((relation) => relation.fromTaskId === task.id && relation.type === 'blocked_by')
      .map((relation) => {
        const target = state.tasks.find((entry) => entry.id === relation.toTaskId)
        return target ? ticketId(state, target) : ''
      })
      .filter(Boolean)

    rows.push(
      [
        ticketId(state, task),
        task.title,
        getColumn(state, task.columnId)?.name ?? '',
        task.priority,
        task.dueDate ?? '',
        taskLabels.join('; '),
        blockedBy.join('; '),
        String(subtasksOf(state, task.id).length),
        String(totalLoggedMinutes(task)),
        task.archived ? 'yes' : 'no',
      ]
        .map((cell) => csvCell(cell))
        .join(','),
    )
  }

  return rows.join('\n')
}

/** One-line summary of a task, used for board snapshots in the AI context. */
export function compactTask(state: BoardState, task: Task): string {
  const column = getColumn(state, task.columnId)?.name ?? '?'
  const flags: string[] = [column, task.priority]
  if (isBlocked(state, task)) flags.push('blocked')
  if (task.archived) flags.push('archived')
  return `${ticketId(state, task)} [${flags.join(', ')}] ${task.title}`
}
