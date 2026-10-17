/**
 * Locally select only the task tools relevant to one user turn.
 *
 * This runs before the model request, costs no tokens, and deliberately falls
 * back to the complete tool set for ambiguous actionable requests. ReveLith's
 * `withGlobalTools` then unions these with the host's native tools, so the model
 * always sees its own capabilities plus the narrow slice of board tools the turn
 * actually needs.
 */

/** Canonical tool names, in the order they appear in the registry. */
export const TASK_TOOL_NAMES = [
  'list_projects',
  'create_project',
  'update_project',
  'archive_project',
  'delete_project',
  'list_columns',
  'create_column',
  'update_column',
  'reorder_columns',
  'delete_column',
  'list_labels',
  'create_label',
  'delete_label',
  'list_tasks',
  'get_task',
  'create_task',
  'update_task',
  'move_task',
  'archive_task',
  'delete_task',
  'set_task_labels',
  'add_comment',
  'list_comments',
  'link_tasks',
  'unlink_task',
  'define_custom_field',
  'set_custom_field_value',
  'add_subtask',
  'list_subtasks',
  'search_tasks',
  'board_summary',
  'log_time',
  'export_board',
  'list_saved_views',
  'create_saved_view',
  'apply_saved_view',
  'delete_saved_view',
  'list_attachments',
  'list_members',
  'create_member',
  'delete_member',
  'assign_task',
  'my_tasks',
  'duplicate_task',
  'bulk_update_tasks',
  'list_external_links',
  'add_external_link',
  'remove_external_link',
  'activity_feed',
] as const

export type TaskToolName = (typeof TASK_TOOL_NAMES)[number]

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text)
}

/** True when the turn reads as a question rather than a request to change the board. */
function isReadOnly(text: string): boolean {
  // Do not classify a whole user message as a question just because it quotes
  // an earlier assistant reply ("I can't create…") or mentions a status named
  // "Review". Only a question-led turn with no write verb is read-only. In
  // particular, "Can you create…" is an action request, not a capability query.
  const startsWithQuestion = /^(?:what|which|who|whom|whose|how|when|where|why|is|are|was|were|do|does|did|can|should|would|could)\b/i.test(text.trim())
  return startsWithQuestion && !isAction(text)
}

/** True when the turn asks for something to be written, not just read. */
function isAction(text: string): boolean {
  return has(
    text,
    /\b(create|add|make|new|write|draft|prepare|generate|build|plan|fix|ensure|set|assign|update|edit|change|modify|rename|move|relocate|reorder|prioriti[sz]e|delete|remove|drop|archive|restore|log|track|link|unlink|connect|disconnect|define|duplicate|copy|import|export|save|apply|block|unblock|comment)\b/,
  )
}

export interface TaskToolRoutingContext {
  /** Active (non-archived) project count, used to provision an empty board. */
  activeProjectCount?: number
}

const CREATE_WORK_PATTERN =
  /\b(create|add|make|write|draft|prepare|generate|build|plan)\b.{0,100}\b(tasks?|tickets?|issues?|work\s+items?|stories|checklists?|action\s+items?|release\s+plans?|launch\s+plans?)\b/

export function selectTaskToolNames(instruction: string, context: TaskToolRoutingContext = {}): TaskToolName[] {
  // Deterministic escape hatch, so a caller can force one tool regardless of wording.
  const explicitTool = instruction.match(/(?:^|\b)RUN_TASK_TOOL:([a-z_]+)/)?.[1]
  if (explicitTool && (TASK_TOOL_NAMES as readonly string[]).includes(explicitTool)) {
    return [explicitTool as TaskToolName]
  }

  const text = instruction.toLocaleLowerCase()
  const selected = new Set<TaskToolName>()

  // Canonical tool names are useful for explicit user instructions and keep
  // integration tests able to verify each capability without special hooks.
  for (const name of TASK_TOOL_NAMES) {
    if (new RegExp(`(?<![a-z0-9_])${name}(?![a-z0-9_])`).test(text)) selected.add(name)
  }

  const readOnly = isReadOnly(text)
  const wantsWrite = isAction(text) && !readOnly
  const createWorkRequested = CREATE_WORK_PATTERN.test(text)

  // ---- projects -----------------------------------------------------------
  if (has(text, /\b(project|projects|board|boards|workspace|portfolio)\b/)) selected.add('list_projects')
  if (has(text, /\b(create|add|new|start|set up|spin up|make)\b.{0,35}\b(project|board|portfolio)\b/))
    selected.add('create_project')
  if (has(text, /\b(renam\w*|edit|update|change|modif\w*|describ\w*|colour|color|icon|key|recolor)\b.{0,35}\b(project|board)\b/))
    selected.add('update_project')
  if (has(text, /\b(archive|retire|close out|hide)\b.{0,35}\b(project|board)\b/)) selected.add('archive_project')
  if (has(text, /\b(delete|remove|destroy|drop|wipe|nuke)\b.{0,35}\b(project|board)\b/))
    selected.add('delete_project')

  // ---- columns ------------------------------------------------------------
  if (has(text, /\b(column|columns|stage|states?|status|workflow|swimlane)\b/)) {
    if (readOnly || !wantsWrite) selected.add('list_columns')
  }
  if (has(text, /\b(add|create|new|insert)\b.{0,30}\b(column|stage|status)\b/)) selected.add('create_column')
  if (has(text, /\b(renam\w*|recolou?r|edit|update|change|modify|mark as done|final)\b.{0,35}\b(column|stage|status)\b/))
    selected.add('update_column')
  if (has(text, /\b(reorder|move|swap|switch|reorder|rearrange|reorder)\b.{0,30}\b(column|columns|stage)\b/))
    selected.add('reorder_columns')
  if (has(text, /\b(delete|remove|drop)\b.{0,30}\b(column|stage|status)\b/)) selected.add('delete_column')

  // ---- labels -------------------------------------------------------------
  if (has(text, /\b(label|labels|tag|tags|categor\w+)\b/)) {
    if (readOnly || !wantsWrite) selected.add('list_labels')
  }
  if (has(text, /\b(create|add|new|make)\b.{0,30}\blabel\b/)) selected.add('create_label')
  if (has(text, /\b(delete|remove|drop)\b.{0,30}\blabel\b/)) selected.add('delete_label')

  // ---- tasks --------------------------------------------------------------
  if (
    has(
      text,
      /\b(task|tasks|ticket|issue|issues|work item|item|story|backlog|board)\b/,
    )
  ) {
    selected.add('list_tasks')
  }
  if (has(text, /\b(detail|details|full|about|open|view|read|show me|inspected)\b.{0,35}\b(task|ticket|issue)\b/))
    selected.add('get_task')
  if (has(text, /\b(create|add|new|make|draft|open|raise|log)\b.{0,35}\b(task|ticket|issue|work item|story)\b/))
    selected.add('create_task')
  // Natural requests commonly call the deliverable a checklist, release plan,
  // or action-item list rather than saying "create tasks" next to the verb.
  if (createWorkRequested) selected.add('create_task')
  if (
    has(
      text,
      /\b(edit|update|change|modify|renam\w*|describ\w*|reschedul\w*|extend|push back|due date|start date|estimat\w*|priority|prioriti[sz]e)\b/,
    )
  ) {
    if (has(text, /\b(task|ticket|issue)\b/)) selected.add('update_task')
  }
  if (has(text, /\b(move|drag|shift|transfer|promote|advance|progress|backlog to|to do|in progress|review|done|complete)\b/))
    selected.add('move_task')
  if (has(text, /\b(archive|complete|finish|close|done|wrap up)\b.{0,35}\b(task|ticket|issue)\b/))
    selected.add('archive_task')
  if (has(text, /\b(delete|remove|destroy|drop|wipe)\b.{0,35}\b(task|ticket|issue)\b/)) selected.add('delete_task')
  if (has(text, /\b(label|tag)\b/) && /\b(set|apply|attach|assign|tag|add|remove|change)\b/.test(text))
    selected.add('set_task_labels')

  // ---- collaboration ------------------------------------------------------
  if (has(text, /\b(comment|comments|note|notes|reply|replies|discuss\w*|message)\b/)) {
    if (readOnly || !wantsWrite) selected.add('list_comments')
    if (wantsWrite || /^(comment|note)\b/.test(text)) selected.add('add_comment')
  }
  if (has(text, /\b(block|blocks|blocked|blocking|depend\w*|dependency|dependencies|relates? to|related|duplicate|duplicates|links?|linked|link)\b/)) {
    if (has(text, /\b(unlink|disconnect|remove link|break link|stop blocking|unblock)\b/)) selected.add('unlink_task')
    else if (wantsWrite) selected.add('link_tasks')
  }

  // A new task cannot be created without a project. On an empty board expose
  // project creation in the same first request, so the agent can bootstrap the
  // board instead of claiming the capability is missing.
  if (createWorkRequested && context.activeProjectCount === 0) selected.add('create_project')

  // ---- custom fields ------------------------------------------------------
  if (has(text, /\b(custom field|field|fields|property|properties|metadata|attribute)\b/)) {
    if (readOnly || !wantsWrite) selected.add('set_custom_field_value')
  }
  if (has(text, /\b(define|create|add|new|make)\b.{0,35}\b(custom field|field|property)\b/))
    selected.add('define_custom_field')

  // ---- subtasks -----------------------------------------------------------
  if (has(text, /\b(sub-?task|subtask|sub-task|child|children|nested|break ?down|checklist item)\b/)) {
    if (readOnly || !wantsWrite) selected.add('list_subtasks')
    if (wantsWrite) selected.add('add_subtask')
  }

  // ---- discovery ----------------------------------------------------------
  if (has(text, /\b(search|find|look for|lookup|locate|grep|query|filter by|match)\b/)) selected.add('search_tasks')
  if (has(text, /\b(summari[sz]e|summary|overview|status of|how.{0,10}(going|faring)|state of|what.{0,15}(left|next|pending)|everything)\b/))
    selected.add('board_summary')
  if (has(text, /\b(log|track|spent|time|capacity|effort|duration|hours worked)\b/)) {
    if (wantsWrite) selected.add('log_time')
  }

  // ---- export & views -----------------------------------------------------
  if (has(text, /\b(export|download|csv|markdown|\.ics|ical|calendar feed|json)\b/)) selected.add('export_board')
  if (has(text, /\b(view|saved view|filter preset|preset|saved filter)\b/)) {
    if (readOnly || !wantsWrite) selected.add('list_saved_views')
  }
  if (has(text, /\b(create|add|save|new)\b.{0,30}\b(saved view|view|preset)\b/)) selected.add('create_saved_view')
  if (has(text, /\b(apply|use|switch to|show)\b.{0,30}\b(saved view|view|preset)\b/)) selected.add('apply_saved_view')
  if (has(text, /\b(delete|remove|drop)\b.{0,30}\b(saved view|view|preset)\b/)) selected.add('delete_saved_view')

  // ---- attachments --------------------------------------------------------
  if (has(text, /\b(attachment|attachments|file|files|upload|uploaded|document|documents|asset)\b/))
    selected.add('list_attachments')

  // ---- people -------------------------------------------------------------
  if (has(text, /\b(member|members|people|assignee|assignees|owner|owners|who|person|persons|team workload)\b/)) {
    if (readOnly || !wantsWrite) selected.add('list_members')
  }
  if (has(text, /\b(add|create|invite|new)\b.{0,30}\b(member|person|people|assignee|owner)\b/))
    selected.add('create_member')
  if (has(text, /\b(remove|delete|drop)\b.{0,30}\b(member|person|people|assignee|owner)\b/))
    selected.add('delete_member')
  if (has(text, /\b(assign|unassign|reassign|give|hand)\b.{0,35}\b(task|ticket|issue)\b|\b(task|ticket)\b.{0,30}\b(to|owner|assign)\b/))
    selected.add('assign_task')
  if (has(text, /\b(my tasks|assigned to me|my work|my task list|what do i have|my queue)\b/))
    selected.add('my_tasks')

  // ---- duplication --------------------------------------------------------
  if (has(text, /\b(duplicate|duplicates|duplicating|copy of|clone|repeat)\b/)) selected.add('duplicate_task')

  // ---- bulk ---------------------------------------------------------------
  if (has(text, /\b(bulk|batch|all the|every task|selected|multiple tasks|all tasks|these tasks|whole column)\b/))
    selected.add('bulk_update_tasks')

  // ---- external links -----------------------------------------------------
  if (has(text, /\b(external link|external links|linked issue|linked pr|pull request|branch|issue link|repo link)\b/)) {
    if (has(text, /\b(remove|delete|unlink|drop)\b/)) selected.add('remove_external_link')
    else if (has(text, /\b(add|link|attach|connect|create)\b/)) selected.add('add_external_link')
    else selected.add('list_external_links')
  }

  // ---- activity -----------------------------------------------------------
  if (has(text, /\b(what changed|activity|history|recent changes|what happened|log of|audit)\b/))
    selected.add('activity_feed')

  // A single turn can legitimately need several board operations. An ambiguous
  // action keeps every tool available rather than risking a partial result
  // because a local keyword rule guessed too narrowly.
  if (selected.size === 0 && wantsWrite) return [...TASK_TOOL_NAMES]
  if (selected.size === 0) return ['list_projects', 'list_tasks', 'board_summary', 'search_tasks']

  return TASK_TOOL_NAMES.filter((name) => selected.has(name))
}

export function selectTaskTools<T extends { name: string }>(
  instruction: string,
  tools: readonly T[],
  context: TaskToolRoutingContext = {},
): T[] {
  const names = new Set<string>(selectTaskToolNames(instruction, context))
  return tools.filter((tool) => names.has(tool.name))
}
