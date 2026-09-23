import type { AgentSkill } from '@revelith/agent-core'
import type {
  AttachmentMeta,
  MergeSourcesResult,
  WorkbookRangeRequest,
  WorkbookRangeResult,
} from '../../shared/desktop-api'
import { mergeSources } from '../merge-workbooks'
import type { SheetsSkillDeps } from './tools'

export const SPREADSHEET_ATTACHMENT_EXTS = new Set(['xlsx', 'xlsm', 'xls', 'csv'])

const MERGE_SYSTEM_PROMPT = `## Merging attached spreadsheets
When the user attaches spreadsheet files (xlsx/xlsm/xls/csv) and asks to merge, combine, consolidate, or process them together:
- Call merge_attached_workbooks FIRST. It imports every sheet of the chosen attachments into the current workbook engine-side (fast, exact) and reports the new sheet names. Never reconstruct spreadsheet contents from read_attachment text for merging — that path is lossy and slow.
- Afterwards the data IS in the current workbook: use get_workbook_context / read_range / aggregate_range on the reported sheets, and create_document to emit new files if the user wants separate outputs.
- Formulas in the sources arrive as their computed values.`

/** Attachment indexes that are spreadsheets (the tool's default selection) */
export function spreadsheetAttachmentIndexes(list: readonly AttachmentMeta[]): number[] {
  const indexes: number[] = []
  for (let index = 0; index < list.length; index += 1) {
    const attachment = list[index]
    if (attachment && SPREADSHEET_ATTACHMENT_EXTS.has(attachment.ext)) indexes.push(index)
  }
  return indexes
}

export interface MergeSkillDeps extends SheetsSkillDeps {
  getAttachments(): readonly AttachmentMeta[]
}

/** Renderer bridge (window in production, absent under node tests) */
function bridge():
  | {
      openWorkbooksForMerge(paths: string[]): Promise<MergeSourcesResult>
      readWorkbookRange(request: {
        sessionId: string
        sheetId: string
        range: { startRow: number; endRow: number; startColumn: number; endColumn: number }
      }): Promise<WorkbookRangeResult>
      closeWorkbook(sessionId: string): Promise<void>
    }
  | null {
  const api = (globalThis as unknown as { window?: { desktopApi?: Record<string, unknown> } }).window
    ?.desktopApi
  if (
    !api ||
    typeof api.openWorkbooksForMerge !== 'function' ||
    typeof api.readWorkbookRange !== 'function' ||
    typeof api.closeWorkbook !== 'function'
  ) {
    return null
  }
  return api as unknown as {
    openWorkbooksForMerge(paths: string[]): Promise<MergeSourcesResult>
    readWorkbookRange(request: {
      sessionId: string
      sheetId: string
      range: { startRow: number; endRow: number; startColumn: number; endColumn: number }
    }): Promise<WorkbookRangeResult>
    closeWorkbook(sessionId: string): Promise<void>
  }
}

/** AI-driven workbook merging over chat attachments + the Data-pipeline importer. */
export function createMergeSkill(deps: MergeSkillDeps): AgentSkill {
  return {
    id: 'merge',
    systemPrompt: MERGE_SYSTEM_PROMPT,
    tools: [
      {
        name: 'merge_attached_workbooks',
        description:
          'Import every sheet of attached spreadsheet files into the current workbook (new sheets, journaled and undoable). ' +
          'Use it first when the user attaches spreadsheets and asks to merge/combine/process them together; afterwards work on the reported sheets with the normal workbook tools.',
        inputSchema: {
          type: 'object',
          properties: {
            attachment_indexes: {
              type: 'array',
              items: { type: 'integer' },
              description: 'Attachment indexes to merge; defaults to all spreadsheet attachments',
            },
          },
        },
      },
    ],
    executeTool: async (call) => {
      if (call.name !== 'merge_attached_workbooks') {
        return { output: `Unknown tool: ${call.name}`, isError: true, summary: call.name }
      }
      const desktop = bridge()
      if (!desktop) {
        return { output: 'desktop bridge unavailable', isError: true, summary: call.name }
      }
      const list = deps.getAttachments()
      const picked = Array.isArray(call.input.attachment_indexes)
        ? (call.input.attachment_indexes as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < list.length)
        : spreadsheetAttachmentIndexes(list)
      const paths = [...new Set(picked.map((index) => list[index]!.path))]
      if (paths.length === 0) {
        return {
          output: 'No spreadsheet attachments to merge (attach xlsx/xlsm/xls/csv files first)',
          isError: true,
          summary: 'Merge workbooks',
        }
      }
      let sources: MergeSourcesResult
      try {
        sources = await desktop.openWorkbooksForMerge(paths)
      } catch (error) {
        return {
          output: `Could not open merge sources: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
          summary: 'Merge workbooks',
        }
      }
      const outcome = await mergeSources(
        {
          existingNames: () => deps.getActiveSheetInfo().sheets.map((sheet) => sheet.name),
          readSourceRange: async (sessionId, sheetId, range) => {
            const request: WorkbookRangeRequest = { sessionId, sheetId, range }
            const result: WorkbookRangeResult = await desktop.readWorkbookRange(request)
            return result.cells.map((cell) => ({ row: cell.row, column: cell.column, value: cell.value }))
          },
          propose: (operations, summary) =>
            deps.proposeOperations(
              operations as unknown as Parameters<SheetsSkillDeps['proposeOperations']>[0],
              summary,
            ),
          resolveSheetId: (name) =>
            deps.getActiveSheetInfo().sheets.find((sheet) => sheet.name === name)?.id ?? null,
          closeSession: (sessionId) => desktop.closeWorkbook(sessionId),
        },
        sources.files,
      )
      const lines = outcome.imported.map(
        (sheet) => `- ${sheet.file} / ${sheet.sheet} → ${sheet.as} (${sheet.cells} cells)`,
      )
      for (const skipped of outcome.skipped) lines.push(`- skipped: ${skipped}`)
      return {
        output: lines.join('\n') || '(nothing imported)',
        mutated: outcome.imported.length > 0,
        summary: 'Merge workbooks',
      }
    },
  }
}
