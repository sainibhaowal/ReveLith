/** Core board domain types. Pure data — no React, no Electron, no I/O. */

export type ID = string

export type Priority = 'urgent' | 'high' | 'medium' | 'low'

export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low']

/** Human labels for priorities, reused by the UI and by AI tool responses. */
export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export type RelationType = 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates'

export const RELATION_TYPES: RelationType[] = ['blocks', 'blocked_by', 'relates_to', 'duplicates']

/**
 * The inverse of each relation, used to store one edge instead of two and to keep
 * the relation list consistent when a task is deleted.
 */
export const RELATION_INVERSE: Record<RelationType, RelationType> = {
  blocks: 'blocked_by',
  blocked_by: 'blocks',
  relates_to: 'relates_to',
  duplicates: 'duplicates',
}

/** `multiselect` stores a `string[]`; the other types store a scalar. */
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox'

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = [
  'text',
  'number',
  'date',
  'select',
  'multiselect',
  'checkbox',
]

export type CustomFieldValue = string | number | boolean | null | string[]

export interface Project {
  id: ID
  /** Ticket prefix, e.g. `ENG` produces `ENG-12`. Unique and case-insensitive. */
  key: string
  name: string
  description: string
  /** Token-safe colour name, e.g. `blue`. */
  color: string
  archived: boolean
  /** Highest task number handed out so far. Never decremented on delete. */
  lastTaskNumber: number
  createdAt: number
}

export interface Column {
  id: ID
  projectId: ID
  name: string
  color: string
  position: number
  /** Soft work-in-progress limit; `null` means unlimited. */
  wipLimit: number | null
  /** A done column stamps `completedAt` on tasks that enter it. */
  isDone: boolean
}

export interface Label {
  id: ID
  /** `null` means the label is global and offered in every project. */
  projectId: ID | null
  name: string
  color: string
}

export interface TimeEntry {
  id: ID
  minutes: number
  loggedAt: number
}

/**
 * A person who can own work. Local-first has no accounts, so a member is just a
 * name and a colour — enough for avatars, filters and assignment without an
 * identity system.
 */
export interface Member {
  id: ID
  name: string
  color: string
}

/** Kinds of external resource a task can point at. */
export type ExternalLinkType = 'issue' | 'pull_request' | 'branch' | 'url'

export const EXTERNAL_LINK_TYPES: ExternalLinkType[] = ['issue', 'pull_request', 'branch', 'url']

/** A link from a task to something outside the board, e.g. `ENG-12 -> #482`. */
export interface ExternalLink {
  id: ID
  taskId: ID
  type: ExternalLinkType
  url: string
  title: string
  /** The provider's own identifier, e.g. `482` for a GitHub issue. */
  externalId: string
  createdAt: number
}

export interface Task {
  id: ID
  projectId: ID
  columnId: ID
  /** Per-project sequential number; the ticket id is `${project.key}-${number}`. */
  number: number
  title: string
  description: string
  priority: Priority
  /** ISO `YYYY-MM-DD`, or `null`. Date-only on purpose: no timezone drift. */
  dueDate: string | null
  startDate: string | null
  labelIds: ID[]
  customFields: Record<ID, CustomFieldValue>
  /** Who owns this task, or `null` when unassigned. */
  assigneeId: ID | null
  /** Set when this task is a sub-task of another. */
  parentId: ID | null
  /** Fractional index within (columnId, parentId); ascending. */
  position: number
  archived: boolean
  createdAt: number
  updatedAt: number
  completedAt: number | null
  estimateMinutes: number | null
  timeEntries: TimeEntry[]
}

export interface Comment {
  id: ID
  taskId: ID
  author: string
  body: string
  createdAt: number
}

export interface Relation {
  id: ID
  fromTaskId: ID
  toTaskId: ID
  type: RelationType
  createdAt: number
}

export type ActivityKind =
  | 'created'
  | 'updated'
  | 'moved'
  | 'archived'
  | 'restored'
  | 'deleted'
  | 'commented'
  | 'labeled'
  | 'unlabeled'
  | 'linked'
  | 'unlinked'
  | 'subtask_added'
  | 'subtask_removed'
  | 'logged_time'
  | 'assigned'
  | 'unassigned'
  | 'duplicated'
  | 'link_added'
  | 'link_removed'
  | 'bulk_updated'

export interface Activity {
  id: ID
  projectId: ID
  /** `null` for project-level events such as column creation. */
  taskId: ID | null
  kind: ActivityKind
  message: string
  createdAt: number
}

export interface CustomField {
  id: ID
  projectId: ID
  name: string
  type: CustomFieldType
  /** Only meaningful for `select`; ordered. */
  options: string[]
  required: boolean
}

/** Sort orders offered by the board toolbar. */
export type SortMode = 'position' | 'priority' | 'dueDate' | 'title' | 'createdAt'

export interface TaskFilters {
  /** Free text over title, description, ticket id and label names. */
  query: string
  labelIds: ID[]
  priorities: string[]
  columnIds: ID[]
  assigneeIds: ID[]
  /** `null` means "either state". */
  dueWithinDays: number | null
  overdueOnly: boolean
  /** Tasks with no owner. Distinct from `assigneeIds`, which names owners. */
  unassignedOnly: boolean
  showArchived: boolean
}

export const EMPTY_FILTERS: TaskFilters = {
  query: '',
  labelIds: [],
  priorities: [],
  columnIds: [],
  assigneeIds: [],
  dueWithinDays: null,
  overdueOnly: false,
  unassignedOnly: false,
  showArchived: false,
}

/** A named, persisted filter + sort combination. */
export interface SavedView {
  id: ID
  name: string
  filters: TaskFilters
  sortMode: SortMode
  createdAt: number
}

/** File metadata. The bytes live in IndexedDB, keyed by attachment id. */
export interface Attachment {
  id: ID
  taskId: ID
  name: string
  mime: string
  size: number
  createdAt: number
}

export interface BoardState {
  /** Document schema version, used by `store/migrate`. */
  version: number
  projects: Project[]
  columns: Column[]
  labels: Label[]
  members: Member[]
  tasks: Task[]
  comments: Comment[]
  relations: Relation[]
  externalLinks: ExternalLink[]
  activity: Activity[]
  customFields: CustomField[]
  attachments: Attachment[]
  savedViews: SavedView[]
  /** The view currently applied to the board, or `null` for ad-hoc filters. */
  selectedViewId: ID | null
  filters: TaskFilters
  sortMode: SortMode
  selectedProjectId: ID | null
  /** Currently open task detail, or `null`. */
  selectedTaskId: ID | null
  /**
   * Tasks picked for a bulk edit. Transient like the open task detail, but it
   * survives reload because a half-finished bulk edit should not lose its
   * selection when the board re-renders.
   */
  selectedTaskIds: ID[]
}

export const EMPTY_STATE: BoardState = {
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

/** Colour names usable for columns, labels and projects. */
export const COLOR_NAMES = [
  'slate',
  'blue',
  'violet',
  'magenta',
  'rose',
  'red',
  'orange',
  'amber',
  'lime',
  'green',
  'teal',
  'cyan',
] as const

export type ColorName = (typeof COLOR_NAMES)[number]

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as string[]).includes(value)
}

export function isRelationType(value: unknown): value is RelationType {
  return typeof value === 'string' && (RELATION_TYPES as string[]).includes(value)
}

export function isCustomFieldType(value: unknown): value is CustomFieldType {
  return typeof value === 'string' && (CUSTOM_FIELD_TYPES as string[]).includes(value)
}

export function isColorName(value: unknown): value is ColorName {
  return typeof value === 'string' && (COLOR_NAMES as readonly string[]).includes(value)
}

export function isExternalLinkType(value: unknown): value is ExternalLinkType {
  return typeof value === 'string' && (EXTERNAL_LINK_TYPES as readonly string[]).includes(value)
}

/** Up to two letters for an avatar, e.g. `Ada Lovelace` -> `AL`. */
export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}
