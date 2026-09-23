import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  chunkRowsFor,
  dedupeSheetName,
  mergeSources,
  type MergeRunnerDeps,
} from '../src/renderer/merge-workbooks'
import { createMergeSkill, spreadsheetAttachmentIndexes } from '../src/renderer/ai/merge-skill'
import type { AttachmentMeta } from '../src/shared/desktop-api'

describe('dedupeSheetName', () => {
  it('suffixes collisions Excel-style within the 31-char cap', () => {
    expect(dedupeSheetName('Sales', new Set(['Sheet1']))).toBe('Sales')
    expect(dedupeSheetName('Sales', new Set(['sales']))).toBe('Sales (2)')
    expect(dedupeSheetName('Sales', new Set(['sales', 'sales (2)']))).toBe('Sales (3)')
    const long = 'A'.repeat(31)
    expect(dedupeSheetName(long, new Set([long])).length).toBeLessThanOrEqual(31)
  })

  it('sizes read chunks under the IPC cell cap', () => {
    expect(chunkRowsFor(1)).toBe(90000)
    expect(chunkRowsFor(100)).toBe(900)
    expect(chunkRowsFor(0)).toBe(90000)
  })
})

function runnerDeps(over: Partial<MergeRunnerDeps> = {}): MergeRunnerDeps & { proposed: Record<string, unknown>[][] } {
  const proposed: Record<string, unknown>[][] = []
  const deps: MergeRunnerDeps = {
    existingNames: () => ['Sheet1'],
    readSourceRange: async () => [
      { row: 0, column: 0, value: 'Name' },
      { row: 1, column: 0, value: 'Acme' },
      { row: 1, column: 1, value: 10 },
    ],
    propose: async (operations) => {
      proposed.push(operations)
      return { ok: true }
    },
    resolveSheetId: () => 'new-sheet-1',
    closeSession: async () => {},
    ...over,
  }
  return Object.assign(deps, { proposed })
}

const files = (names: string[] = ['Data']) => [
  {
    sessionId: '00000000-0000-4000-8000-000000000001',
    name: 'report.xlsx',
    sheets: names.map((name, index) => ({
      id: `src-sheet-${index}`,
      name,
      rowCount: 2,
      columnCount: 2,
    })),
  },
]

describe('mergeSources', () => {
  it('imports every sheet through journaled batches and closes sessions', async () => {
    const deps = runnerDeps()
    const closed: string[] = []
    deps.closeSession = async (sessionId) => {
      closed.push(sessionId)
    }
    const outcome = await mergeSources(deps, files(['Data', 'Data']))
    expect(outcome.imported.map((sheet) => sheet.as)).toEqual(['Data', 'Data (2)'])
    expect(outcome.skipped).toEqual([])
    expect(closed).toEqual(['00000000-0000-4000-8000-000000000001'])
    // add_sheet first per sheet, then set_range batches referencing the resolved id
    expect(deps.proposed[0]).toEqual([{ op: 'add_sheet', name: 'Data' }])
    const writes = deps.proposed.filter(
      (batch) => (batch[0] as { op: string }).op === 'set_range',
    )
    expect(writes.length).toBeGreaterThan(0)
    for (const batch of writes) {
      expect(batch[0]).toMatchObject({ op: 'set_range', sheetId: 'new-sheet-1' })
    }
  })

  it('keeps =-leading source text literal and skips empties', async () => {
    const deps = runnerDeps({
      readSourceRange: async () => [{ row: 0, column: 0, value: '=1+1' }],
    })
    const outcome = await mergeSources(deps, files())
    expect(outcome.imported).toHaveLength(1)
    const values = (deps.proposed[1]![0] as { values: unknown[][] }).values
    expect(values).toEqual([["'=1+1"]])
  })

  it('skips empty sheets and reports failures without stopping', async () => {
    const deps = runnerDeps({
      propose: async (operations) =>
        (operations[0] as { op: string }).op === 'add_sheet' && deps.proposed.push(operations)
          ? { ok: true }
          : { ok: false, error: 'write failed' },
    })
    const outcome = await mergeSources(deps, [
      {
        sessionId: '00000000-0000-4000-8000-000000000002',
        name: 'a.xlsx',
        sheets: [
          { id: 's0', name: 'Empty', rowCount: 0, columnCount: 0 },
          { id: 's1', name: 'Data', rowCount: 2, columnCount: 2 },
        ],
      },
    ])
    expect(outcome.skipped.some((note) => note.includes('(empty)'))).toBe(true)
    expect(outcome.skipped.some((note) => note.includes('partial'))).toBe(true)
    expect(outcome.imported).toEqual([])
  })
})

describe('spreadsheetAttachmentIndexes', () => {
  it('picks spreadsheet attachments by extension', () => {
    const list = [
      { path: '/a.docx', name: 'a.docx', ext: 'docx', sizeBytes: 1 },
      { path: '/b.xlsx', name: 'b.xlsx', ext: 'xlsx', sizeBytes: 1 },
      { path: '/c.csv', name: 'c.csv', ext: 'csv', sizeBytes: 1 },
    ] as AttachmentMeta[]
    expect(spreadsheetAttachmentIndexes(list)).toEqual([1, 2])
    expect(spreadsheetAttachmentIndexes([])).toEqual([])
  })
})

describe('createMergeSkill', () => {
  const attachments: AttachmentMeta[] = [
    { path: '/tmp/report.xlsx', name: 'report.xlsx', ext: 'xlsx', sizeBytes: 10 },
    { path: '/tmp/notes.txt', name: 'notes.txt', ext: 'txt', sizeBytes: 10 },
  ]

  beforeEach(() => {
    ;(globalThis as unknown as { window: unknown }).window = {
      desktopApi: {
        openWorkbooksForMerge: vi.fn(async () => ({ files: files() })),
        readWorkbookRange: vi.fn(async () => ({ cells: [] })),
        closeWorkbook: vi.fn(async () => {}),
      },
    }
  })

  const skillDeps = (over: Record<string, unknown> = {}) => {
    // Live sheet list: add_sheet proposals register, like the real apply path
    const liveSheets = [{ id: 'sheet-1', name: 'Sheet1' }]
    return {
      getActiveSheetInfo: () => ({
        mode: 'demo' as const,
        sheetId: 'sheet-1',
        sheetName: 'Sheet1',
        knownAddresses: [],
        sheets: liveSheets,
      }),
      readCells: () => ({}),
      readSheetGrid: () => null,
      goToRange: () => null,
      createDocument: async () => ({ ok: false as const, error: 'x' }),
      readFormats: () => ({}),
      readSheetFeatures: () => '',
      proposeOperations: vi.fn((operations: { op: string; name?: string }[]) => {
        for (const op of operations) {
          if (op.op === 'add_sheet' && op.name) {
            liveSheets.push({ id: `new-${liveSheets.length}`, name: op.name })
          }
        }
        return { ok: true, plan: { warnings: [] } }
      }),
      getAttachments: () => attachments,
      ...over,
    }
  }

  const call = (name: string, input: Record<string, unknown> = {}) => ({ id: 't1', name, input })

  it('merges spreadsheet attachments by default', async () => {
    const skill = createMergeSkill(skillDeps() as never)
    const result = await skill.executeTool(call('merge_attached_workbooks', {}))
    expect(result.isError).toBeFalsy()
    expect(result.output).toContain('report.xlsx')
    expect(result.mutated).toBe(true)
  })

  it('errors when nothing mergeable is attached', async () => {
    const skill = createMergeSkill(skillDeps({ getAttachments: () => [] }) as never)
    const result = await skill.executeTool(call('merge_attached_workbooks', {}))
    expect(result.isError).toBe(true)
    expect(result.output).toContain('No spreadsheet attachments')
  })

  it('rejects unknown tools', async () => {
    const skill = createMergeSkill(skillDeps() as never)
    expect((await skill.executeTool(call('nope'))).isError).toBe(true)
  })
})
