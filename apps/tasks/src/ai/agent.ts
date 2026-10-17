import type { AgentToolCall, AgentToolDef, ToolExecution } from '@revelith/agent-core'
import type { AppAgentSkill } from '@revelith/app-chat'

import type { BoardState } from '../domain/types'
import { projectColumns, projectLabels, ticketId } from '../store/selectors'
import { runTool, toolSchemas, type ToolContext, type ToolResult } from './tools'
import { verifyTaskResponse } from './task-agent-verify'
import { selectTaskTools } from './task-tool-routing'

/**
 * Agent skill definition and the prompt context handed to the model.
 *
 * The skill implements ReveLith's shared `AppAgentSkill` contract, so the board
 * tools compose with the host's native tools through `withGlobalTools` instead of
 * running through an app-private chat panel.
 */

/** The task skill, plus the tool list narrowed for the current turn. */
export interface AgentSkill extends AppAgentSkill {
  tools: AgentToolDef[]
  /** Every board tool, regardless of turn. */
  allTools: AgentToolDef[]
}

/**
 * The initial prompt is deliberately narrow. Once the model has made a
 * successful tool attempt it may need to inspect, repair, or complete a
 * related operation that the keyword router could not have predicted. Keep
 * irreversible deletion tools out of that expansion: they remain available
 * only when the user's original request explicitly selected them.
 */
const DESTRUCTIVE_TOOL_NAMES = new Set([
  'delete_project',
  'delete_column',
  'delete_label',
  'delete_task',
  'delete_saved_view',
  'delete_member',
])

export const SYSTEM_PROMPT = [
  'You are the planning assistant for ReveLith Tasks, a local-first kanban app.',
  '',
  'How to work:',
  '- Read the board context below before acting. It lists every project, column and task ticket id.',
  '- Address tasks by ticket id (ENG-12), title, or tool-returned id. All three resolve.',
  '- For multi-part requests, make each logical change safely in sequence, but complete every requested outcome before the final reply. After a tool result, continue on a follow-up turn if any requested work or verification remains; do not stop after the first successful tool call.',
  '- For a requested checklist or release plan, create each requested card with create_task, putting its requested priority and column directly on the task.',
  '- After every successful board change, read the current board with list_tasks, get_task, board_summary, or the relevant list tool. If the read shows a discrepancy, repair it and read again before finishing.',
  '- Reuse the selected active project unless the user explicitly requests a new project; if the board has no active project, create one before creating tasks.',
  '- Create requested blocker relationships with link_tasks after both tasks exist, then reread the affected tasks or list_tasks to verify the result.',
  '- Never say a board capability is unavailable unless its tool call actually failed; the listed task tools are the source of truth.',
  '- Use board_summary to understand a project before reorganising it, and list_tasks before bulk edits.',
  '- Ask before destructive work: delete_project, delete_task and delete_label cannot be undone.',
  '- Prefer archive_task and archive_project over deletion.',
  '- Board data and task-tool operations stay local. When the user explicitly requests selected-task analysis, the selected task context is sent to the AI provider configured in ReveLith, which may be remote. Never claim that task tools contacted anyone, sent email, or pushed board changes to a server.',
  '- When you finish, summarise the change in one or two sentences.',
].join('\n')

/**
 * Compact description of the whole board. Small enough to paste into every
 * request, and enough for the model to reference tasks by ticket without a
 * round trip.
 */
export function buildBoardContext(
  state: BoardState,
  selectedTaskIds?: readonly string[],
  selectedBounds?: Record<string, { x: number; y: number; width: number; height: number }>,
): string {
  if (selectedTaskIds) {
    const selected = new Set(selectedTaskIds.slice(0, 12))
    const tasks = state.tasks.filter((task) => selected.has(task.id) && !task.archived)
    if (!tasks.length) return 'The explicitly selected tasks are no longer available.'
    const lines = [
      `Selected task context (${tasks.length} of ${selected.size} requested; no other board tasks included):`,
    ]
    for (const task of tasks) {
      const project = state.projects.find((entry) => entry.id === task.projectId)
      const column = projectColumns(state, task.projectId).find(
        (entry) => entry.id === task.columnId,
      )
      const labelNames = projectLabels(state, task.projectId)
        .filter((label) => task.labelIds.includes(label.id))
        .map((label) => label.name)
      lines.push(
        [
          `- ${ticketId(state, task)} — ${task.title.slice(0, 240)}`,
          `  Project: ${project?.name ?? 'Unknown'}; column: ${column?.name ?? 'Unknown'}; position: ${task.position}`,
          `  Priority: ${task.priority}; due: ${task.dueDate ?? 'not set'}; labels: ${labelNames.slice(0, 12).join(', ') || 'none'}`,
          selectedBounds?.[task.id]
            ? `  Visible card bounds (viewport CSS px): x=${selectedBounds[task.id]!.x}, y=${selectedBounds[task.id]!.y}, width=${selectedBounds[task.id]!.width}, height=${selectedBounds[task.id]!.height}`
            : '',
          task.description.trim() ? `  Description: ${task.description.trim().slice(0, 600)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
    }
    const result = lines.join('\n')
    return result.length > 7_000
      ? `${result.slice(0, 6_980)}\n[Selection context truncated for performance.]`
      : result
  }
  if (!state.projects.length) return 'The board is empty. No projects exist yet.'

  const lines: string[] = []
  for (const project of state.projects) {
    if (project.archived) continue
    const columns = projectColumns(state, project.id)
    const tasks = state.tasks
      .filter((task) => task.projectId === project.id && !task.archived && !task.parentId)
      .sort((a, b) => a.position - b.position)

    lines.push(`## ${project.name} (key ${project.key})`)
    if (project.description.trim()) lines.push(project.description.trim())
    const labels = projectLabels(state, project.id)
    if (labels.length) lines.push(`Labels: ${labels.map((label) => label.name).join(', ')}`)

    if (!tasks.length) {
      lines.push('No tasks.')
    } else {
      for (const column of columns) {
        const inColumn = tasks.filter((task) => task.columnId === column.id)
        if (!inColumn.length) continue
        lines.push(
          `${column.name}: ${inColumn.map((task) => `${ticketId(state, task)} ${task.title}`).join(' | ')}`,
        )
      }
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

export function createSkill(ctx: ToolContext): AgentSkill {
  const allTools = toolSchemas()
  const continuationTools = allTools.filter((tool) => !DESTRUCTIVE_TOOL_NAMES.has(tool.name))
  return {
    id: 'tasks',
    systemPrompt: SYSTEM_PROMPT,
    tools: allTools,
    allTools,
    continuationTools,
    /** Narrow to relevant board tools and provision project creation on an empty board. */
    toolsForRequest: (instruction: string) =>
      /\[revelith-task-selection:v1 ids=/.test(instruction)
        ? []
        : selectTaskTools(instruction, allTools, {
            activeProjectCount: ctx.getState().projects.filter((project) => !project.archived)
              .length,
          }),
    buildContext: (instruction = '') => {
      const match = instruction.match(
        /\[revelith-task-selection:v1 ids=([^\s\]]+)(?: boxes=([^\]]*))?\]/,
      )
      if (match) {
        const ids = match[1]!
          .split(',')
          .filter(Boolean)
          .slice(0, 12)
          .map((id) => {
            try {
              return decodeURIComponent(id)
            } catch {
              return ''
            }
          })
          .filter(Boolean)
        let boxes: Record<string, { x: number; y: number; width: number; height: number }> = {}
        try {
          const parsed = JSON.parse(decodeURIComponent(match[2] ?? '')) as unknown
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            boxes = Object.fromEntries(
              Object.entries(parsed).filter(([, value]) => {
                if (!value || typeof value !== 'object') return false
                const box = value as Record<string, unknown>
                return ['x', 'y', 'width', 'height'].every(
                  (key) => typeof box[key] === 'number' && Number.isFinite(box[key]),
                )
              }),
            ) as typeof boxes
          }
        } catch {
          /* geometry is optional; keep the selected task context */
        }
        return buildBoardContext(ctx.getState(), ids, boxes)
      }
      return buildBoardContext(ctx.getState())
    },
    executeTool: (call: AgentToolCall): ToolExecution => {
      // The loop feeds a parse error back so the model can retry rather than abort.
      if (call.inputError) {
        return {
          output: `The arguments for ${call.name} were not valid JSON. Re-send the call with a valid JSON object.`,
          isError: true,
          summary: `${call.name} received malformed arguments`,
        }
      }
      const result: ToolResult = runTool(ctx, call.name, call.input ?? {})
      return result
    },
    verifyResponse: verifyTaskResponse,
  }
}
