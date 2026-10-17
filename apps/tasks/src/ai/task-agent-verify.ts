import type { ExecutedToolCall } from '@revelith/agent-core'

/**
 * Native board operations that alter persisted task-board state.  A successful
 * one must be followed by a successful read before the agent may finish its
 * response.  This turns the prompt-level "verify your work" rule into an
 * enforceable agent-loop invariant.
 */
const TASK_MUTATIONS = new Set([
  'create_project',
  'update_project',
  'archive_project',
  'delete_project',
  'create_column',
  'update_column',
  'reorder_columns',
  'delete_column',
  'create_label',
  'delete_label',
  'create_task',
  'update_task',
  'move_task',
  'archive_task',
  'delete_task',
  'set_task_labels',
  'add_comment',
  'link_tasks',
  'unlink_task',
  'define_custom_field',
  'set_custom_field_value',
  'add_subtask',
  'log_time',
  'create_saved_view',
  'apply_saved_view',
  'delete_saved_view',
  'create_member',
  'delete_member',
  'assign_task',
  'duplicate_task',
  'bulk_update_tasks',
  'add_external_link',
  'remove_external_link',
])

/** Read tools that return the current, authoritative board state. */
const TASK_VERIFICATIONS = new Set([
  'list_projects',
  'list_columns',
  'list_labels',
  'list_tasks',
  'get_task',
  'list_comments',
  'list_subtasks',
  'search_tasks',
  'board_summary',
  'list_saved_views',
  'list_attachments',
  'list_members',
  'my_tasks',
  'list_external_links',
  'activity_feed',
])

/**
 * Require a fresh board read after the most recent successful mutation.
 *
 * The agent loop permits one corrective turn, so this cannot cause an
 * unbounded tool loop. The corrective instruction is deliberately specific
 * about the available native verification tools.
 */
export function verifyTaskResponse(
  _finalText: string,
  executed: readonly ExecutedToolCall[],
): string | null {
  const successful = executed.map((call, index) => ({ ...call, index })).filter((call) => call.ok)
  const lastMutation = Math.max(
    -1,
    ...successful.filter((call) => TASK_MUTATIONS.has(call.name)).map((call) => call.index),
  )
  if (lastMutation < 0) return null

  const lastVerification = Math.max(
    -1,
    ...successful.filter((call) => TASK_VERIFICATIONS.has(call.name)).map((call) => call.index),
  )
  if (lastVerification > lastMutation) return null

  return 'The task board changed but has not been verified. Read the current board now with list_tasks or board_summary; use get_task for a specific changed task and the relevant list tool for project, member, view, label, or link changes. Repair any discrepancy with the available native Tasks tools, then read the board again before replying.'
}
