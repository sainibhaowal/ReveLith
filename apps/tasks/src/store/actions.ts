import type {
  BoardState,
  CustomFieldType,
  CustomFieldValue,
  ExternalLinkType,
  ID,
  Priority,
  RelationType,
  SortMode,
  TaskFilters,
} from '../domain/types'

/** Every mutation the board understands. Discriminated on `kind`. */
export type Action =
  | { kind: 'board/replace'; state: BoardState }
  | { kind: 'filters/set'; patch: Partial<TaskFilters> }
  | { kind: 'filters/clear' }
  | { kind: 'sort/set'; mode: SortMode }
  | { kind: 'view/create'; name: string }
  | { kind: 'view/apply'; id: ID | null }
  | { kind: 'view/rename'; id: ID; name: string }
  | { kind: 'view/delete'; id: ID }
  | { kind: 'attachment/add'; id: ID; taskId: ID; name: string; mime: string; size: number }
  | { kind: 'attachment/remove'; id: ID }
  | { kind: 'project/create'; name: string; key?: string; color?: string; description?: string }
  | {
      kind: 'project/update'
      id: ID
      patch: Partial<{ name: string; key: string; color: string; description: string }>
    }
  | { kind: 'project/setArchived'; id: ID; archived: boolean }
  | { kind: 'project/delete'; id: ID }
  | { kind: 'project/select'; id: ID | null }
  | {
      kind: 'column/create'
      projectId: ID
      name: string
      color?: string
      isDone?: boolean
      wipLimit?: number | null
    }
  | {
      kind: 'column/update'
      id: ID
      patch: Partial<{
        name: string
        color: string
        isDone: boolean
        wipLimit: number | null
        position: number
      }>
    }
  | { kind: 'column/delete'; id: ID }
  | { kind: 'label/create'; name: string; color: string; projectId?: ID | null }
  | { kind: 'label/update'; id: ID; patch: Partial<{ name: string; color: string }> }
  | { kind: 'label/delete'; id: ID }
  | {
      kind: 'task/create'
      projectId: ID
      columnId: ID
      title: string
      description?: string
      priority?: Priority
      dueDate?: string | null
      startDate?: string | null
      labelIds?: ID[]
      parentId?: ID | null
      position?: number
      estimateMinutes?: number | null
    }
  | {
      kind: 'task/update'
      id: ID
      patch: Partial<{
        title: string
        description: string
        priority: Priority
        dueDate: string | null
        startDate: string | null
        parentId: ID | null
        estimateMinutes: number | null
        archived: boolean
      }>
    }
  | { kind: 'task/move'; id: ID; columnId: ID; position?: number; parentId?: ID | null }
  | { kind: 'task/setArchived'; id: ID; archived: boolean }
  | { kind: 'task/delete'; id: ID }
  | { kind: 'task/setLabels'; id: ID; labelIds: ID[] }
  | { kind: 'task/setAssignee'; id: ID; assigneeId: ID | null }
  | { kind: 'task/setCustomField'; taskId: ID; fieldId: ID; value: CustomFieldValue }
  | { kind: 'task/logTime'; id: ID; minutes: number }
  /** Copy a task, its labels and custom fields; sub-tasks are copied too. */
  | { kind: 'task/duplicate'; id: ID; columnId?: ID; title?: string }
  | { kind: 'comment/add'; taskId: ID; body: string; author?: string }
  | { kind: 'comment/update'; id: ID; body: string }
  | { kind: 'comment/delete'; id: ID }
  | { kind: 'relation/link'; fromTaskId: ID; toTaskId: ID; type: RelationType }
  | { kind: 'relation/unlink'; id: ID }
  | {
      kind: 'customField/define'
      projectId: ID
      name: string
      type: CustomFieldType
      options?: string[]
      required?: boolean
    }
  | {
      kind: 'customField/update'
      id: ID
      patch: Partial<{ name: string; options: string[]; required: boolean }>
    }
  | { kind: 'customField/delete'; id: ID }
  // ---- members (assignees) -------------------------------------------------
  | { kind: 'member/create'; name: string; color?: string }
  | { kind: 'member/update'; id: ID; patch: Partial<{ name: string; color: string }> }
  | { kind: 'member/delete'; id: ID }
  // ---- external links ------------------------------------------------------
  | {
      kind: 'externalLink/add'
      taskId: ID
      type: ExternalLinkType
      url: string
      title?: string
      externalId?: string
    }
  | { kind: 'externalLink/remove'; id: ID }
  // ---- bulk selection & edits ---------------------------------------------
  | { kind: 'selection/set'; ids: ID[] }
  | { kind: 'selection/toggle'; id: ID }
  | { kind: 'selection/clear' }
  | {
      kind: 'bulk/update'
      ids: ID[]
      patch: Partial<{
        priority: Priority
        dueDate: string | null
        startDate: string | null
        assigneeId: ID | null
        labelIds: ID[]
        parentId: ID | null
        archived: boolean
        estimateMinutes: number | null
      }>
    }
  | { kind: 'bulk/move'; ids: ID[]; columnId: ID }
  | { kind: 'bulk/delete'; ids: ID[] }
  | { kind: 'ui/selectTask'; id: ID | null }

/**
 * Actions that change board data rather than transient UI state.
 *
 * Selection and view switching are excluded so that clicking around a board
 * does not fill the undo history with noise.
 */
export function isMutatingAction(action: Action): boolean {
  if (action.kind === 'ui/selectTask' || action.kind === 'project/select') return false
  if (action.kind === 'view/apply') return false
  return true
}
