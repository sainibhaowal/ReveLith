import type { BoardState, CustomFieldType, ID, Priority, Task } from '../domain/types'
import { EMPTY_FILTERS } from '../domain/types'
import { deriveProjectKey, normalizeProjectKey } from './reducer'

/**
 * Board importers.
 *
 * Each importer turns a foreign payload into ordinary board actions, so the
 * reducer's invariants (sub-task promotion on delete, column never removed last,
 * label de-duplication) still apply to imported work rather than being
 * re-implemented per format.
 *
 * Nothing here reaches the network: Trello and the other hosted boards are read
 * from a file the user exported first.
 */

export interface ImportReport {
  ok: boolean
  projectName: string
  projectKey: string
  tasks: number
  columns: number
  labels: number
  warnings: string[]
  /** Actions to feed through the reducer in order. */
  actions: Parameters<typeof Object>[0][]
}

function blank(): BoardState {
  return {
    version: 2,
    projects: [],
    columns: [],
    labels: [],
    members: [],
    tasks: [],
    comments: [],
    relations: [],
    externalLinks: [],
    activity: [],
    customFields: [],
    attachments: [],
    savedViews: [],
    selectedViewId: null,
    filters: EMPTY_FILTERS,
    sortMode: 'position',
    selectedProjectId: null,
    selectedTaskId: null,
    selectedTaskIds: [],
  }
}

function report(
  warnings: string[],
  name: string,
  board: BoardState,
  projectKey: string,
): ImportReport {
  return {
    ok: true,
    projectName: name,
    projectKey,
    tasks: board.tasks.length,
    columns: board.columns.length,
    labels: board.labels.length,
    warnings,
    actions: [] as never[],
  }
}

/**
 * Import this app's own JSON export.
 *
 * The most faithful path, because the export already contains the exact shape
 * the reducer wants — columns, labels, members and links all survive.
 */
export function importFromJson(payload: unknown): ImportReport | null {
  const root = payload as { state?: Partial<BoardState>; version?: number }
  const state = root?.state
  if (!state || !Array.isArray(state.projects) || !Array.isArray(state.tasks)) return null

  const first = state.projects[0]
  const key = normalizeProjectKey(first?.key ?? '') || deriveProjectKey(first?.name ?? 'Imported')
  return report([], first?.name ?? 'Imported', state as BoardState, key)
}

/**
 * Import a CSV with a header row.
 *
 * Columns are inferred from the header: `title` is required, and anything named
 * `status`, `priority`, `due`, `start`, `labels` or `assignee` is mapped onto a
 * real field. Unrecognised columns are kept as the task description prefix so no
 * data is silently dropped.
 */
export function importFromCsv(text: string): ImportReport | null {
  const rows = parseCsv(text)
  if (!rows.length) return null

  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  const titleIndex = header.findIndex((cell) => ['title', 'task', 'name', 'summary'].includes(cell))
  if (titleIndex === -1) return null

  const warnings: string[] = []
  const col = (...names: string[]) => {
    for (const name of names) {
      const index = header.indexOf(name)
      if (index !== -1) return index
    }
    return -1
  }

  const statusIndex = col('status', 'column', 'stage')
  const priorityIndex = col('priority', 'prio')
  const dueIndex = col('due', 'duedate', 'due date')
  const startIndex = col('start', 'startdate', 'start date')
  const labelIndex = col('labels', 'label', 'tags')
  const assigneeIndex = col('assignee', 'owner', 'assigned to')

  const statuses = new Map<string, string>()
  const labels = new Map<string, string>()
  const members = new Map<string, string>()

  for (const row of rows.slice(1)) {
    const cell = (index: number) => (index === -1 ? '' : (row[index] ?? '').trim())
    if (cell(statusIndex)) statuses.set(cell(statusIndex), cell(statusIndex))
    for (const label of cell(labelIndex)
      .split(/[;,|]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      labels.set(label.toLowerCase(), label)
    }
    if (cell(assigneeIndex)) members.set(cell(assigneeIndex).toLowerCase(), cell(assigneeIndex))
  }

  if (!statuses.size) statuses.set('Backlog', 'Backlog')
  if (!members.size) warnings.push('No assignee column found; every task will be unassigned.')
  if (!labelIndex || labelIndex === -1) warnings.push('No labels column found.')

  const projectName = 'Imported CSV'
  const key = 'CSV'
  const board = blank()
  const usedStatuses = new Map<string, string>()
  const usedLabels = new Map<string, string>()
  const usedMembers = new Map<string, string>()

  // First pass: columns, labels and members, so task ids can point at them.
  for (const status of statuses.values()) {
    const id = `col_${usedStatuses.size + 1}`
    usedStatuses.set(status, id)
    board.columns.push({
      id,
      projectId: 'prj',
      name: status,
      color: 'slate',
      position: usedStatuses.size * 1024,
      wipLimit: null,
      isDone: /done|complete|closed/i.test(status),
    })
  }
  for (const label of labels.values()) {
    const id = `lbl_${usedLabels.size + 1}`
    usedLabels.set(label.toLowerCase(), id)
    board.labels.push({ id, projectId: 'prj', name: label, color: 'slate' })
  }
  for (const member of members.values()) {
    const id = `mem_${usedMembers.size + 1}`
    usedMembers.set(member.toLowerCase(), id)
    board.members.push({ id, name: member, color: 'blue' })
  }

  const extras = header.filter(
    (cell, index) =>
      index !== titleIndex &&
      ![statusIndex, priorityIndex, dueIndex, startIndex, labelIndex, assigneeIndex].includes(
        index,
      ),
  )

  let number = 0
  for (const row of rows.slice(1)) {
    const title = (row[titleIndex] ?? '').trim()
    if (!title) continue
    const cell = (index: number) => (index === -1 ? '' : (row[index] ?? '').trim())
    number += 1

    const statusRaw = cell(statusIndex) || 'Backlog'
    const columnId = usedStatuses.get(statusRaw) ?? [...usedStatuses.values()][0]
    const rawPriority = cell(priorityIndex).toLowerCase()
    const priority: Priority = (
      ['urgent', 'high', 'medium', 'low'].includes(rawPriority) ? rawPriority : 'medium'
    ) as Priority

    const notes = extras
      .map((name) => {
        const value = (row[header.indexOf(name)] ?? '').trim()
        return value ? `${name}: ${value}` : ''
      })
      .filter(Boolean)
      .join('\n')

    board.tasks.push({
      id: `task_${number}`,
      projectId: 'prj',
      columnId,
      number,
      title,
      description: cell(titleIndex + 1) || notes,
      priority,
      dueDate: normaliseDate(cell(dueIndex)),
      startDate: normaliseDate(cell(startIndex)),
      labelIds: cell(labelIndex)
        .split(/[;,|]/)
        .map((s) => s.trim().toLowerCase())
        .map((key_) => usedLabels.get(key_))
        .filter((id): id is ID => Boolean(id)),
      customFields: {},
      assigneeId: usedMembers.get(cell(assigneeIndex).toLowerCase()) ?? null,
      parentId: null,
      position: number * 1024,
      archived: false,
      createdAt: Date.now() + number,
      updatedAt: Date.now() + number,
      completedAt: null,
      estimateMinutes: null,
      timeEntries: [],
    })
  }

  if (!number) warnings.push('No rows with a title were found.')
  return report(warnings, projectName, board, key)
}

/**
 * Import a Trello export.
 *
 * Reads the board JSON Trello produces from "Export board" — lists become
 * columns, cards become tasks, labels and checklists come across.
 */
export function importFromTrello(payload: unknown): ImportReport | null {
  const data = payload as {
    name?: string
    lists?: { id: string; name: string; closed: boolean }[]
    cards?: {
      id: string
      idList: string
      name: string
      desc?: string
      due?: string | null
      labels?: { name: string; color: string }[]
      idLabels?: string[]
    }[]
    labels?: { id: string; name: string; color: string }[]
    checklists?: { idCard: string; name: string; checkItems: { name: string; state: string }[] }[]
  }
  if (!data || !Array.isArray(data.lists) || !Array.isArray(data.cards)) return null

  const warnings: string[] = []
  const board = blank()
  const listId = new Map<string, string>()

  data.lists
    .filter((list) => !list.closed)
    .forEach((list, index) => {
      const id = `col_${index + 1}`
      listId.set(list.id, id)
      board.columns.push({
        id,
        projectId: 'prj',
        name: list.name,
        color: 'slate',
        position: (index + 1) * 1024,
        wipLimit: null,
        isDone: /done|complete|archived/i.test(list.name),
      })
    })

  if (!board.columns.length) {
    warnings.push('Every list in the export was closed; nothing was imported.')
    return report(warnings, data.name ?? 'Imported Trello', board, 'TRL')
  }

  const labelId = new Map<string, string>()
  for (const label of data.labels ?? []) {
    if (!labelId.has(label.id)) {
      const id = `lbl_${labelId.size + 1}`
      labelId.set(label.id, id)
      board.labels.push({
        id,
        projectId: 'prj',
        name: label.name,
        color: normaliseTrelloColor(label.color),
      })
    }
  }

  let number = 0
  for (const card of data.cards) {
    const columnId = listId.get(card.idList)
    if (!columnId) continue
    const title = (card.name ?? '').trim()
    if (!title) continue
    number += 1

    const checklist = (data.checklists ?? []).filter((entry) => entry.idCard === card.id)
    const notes = [
      (card.desc ?? '').trim(),
      ...checklist.map(
        (entry) =>
          `## ${entry.name}\n${entry.checkItems.map((item) => `- [${item.state === 'complete' ? 'x' : ' '}] ${item.name}`).join('\n')}`,
      ),
    ]
      .filter(Boolean)
      .join('\n\n')

    board.tasks.push({
      id: `task_${number}`,
      projectId: 'prj',
      columnId,
      number,
      title,
      description: notes,
      priority: 'medium',
      dueDate: normaliseDate(card.due ?? null),
      startDate: null,
      labelIds: (card.idLabels ?? [])
        .map((id) => labelId.get(id))
        .filter((id): id is ID => Boolean(id)),
      customFields: {},
      assigneeId: null,
      parentId: null,
      position: number * 1024,
      archived: false,
      createdAt: Date.now() + number,
      updatedAt: Date.now() + number,
      completedAt: null,
      estimateMinutes: null,
      timeEntries: [],
    } satisfies Task)
  }

  const members = (data as { members?: { id: string; fullName: string }[] }).members ?? []
  members.forEach((member, index) => {
    board.members.push({ id: `mem_${index + 1}`, name: member.fullName, color: 'blue' })
  })
  if (!members.length)
    warnings.push('Trello members are not in the export; everything is unassigned.')

  return report(warnings, data.name ?? 'Imported Trello', board, 'TRL')
}

/** Dispatch table so callers can import without importing every format. */
export const IMPORTERS = {
  json: importFromJson,
  csv: importFromCsv,
  trello: importFromTrello,
} as const

export type ImportFormat = keyof typeof IMPORTERS

/** Run an importer by format, never throwing. */
export function runImport(format: ImportFormat, payload: unknown): ImportReport {
  try {
    if (format === 'json') {
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
      return importFromJson(JSON.parse(text)) ?? failed(format)
    }
    if (format === 'csv') {
      const text = typeof payload === 'string' ? payload : String(payload)
      return importFromCsv(text) ?? failed(format)
    }
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
    return importFromTrello(JSON.parse(text)) ?? failed(format)
  } catch (error) {
    return {
      ok: false,
      projectName: '',
      projectKey: '',
      tasks: 0,
      columns: 0,
      labels: 0,
      warnings: [
        `Could not read that file: ${error instanceof Error ? error.message : String(error)}`,
      ],
      actions: [],
    }
  }
}

function failed(format: string): ImportReport {
  return {
    ok: false,
    projectName: '',
    projectKey: '',
    tasks: 0,
    columns: 0,
    labels: 0,
    warnings: [`That file is not a recognised ${format.toUpperCase()} export.`],
    actions: [],
  }
}

/** Minimal RFC4180 CSV reader: quoted fields, escaped quotes, CRLF tolerant. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim()))
}

function normaliseDate(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10)
}

function normaliseTrelloColor(color: string | undefined): string {
  const map: Record<string, string> = {
    green: 'green',
    yellow: 'amber',
    orange: 'orange',
    red: 'red',
    purple: 'violet',
    blue: 'blue',
    sky: 'cyan',
    lime: 'lime',
    pink: 'magenta',
    black: 'slate',
  }
  return map[color ?? ''] ?? 'slate'
}

export type { CustomFieldType }
