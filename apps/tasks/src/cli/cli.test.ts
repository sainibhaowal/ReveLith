import { describe, expect, it } from 'vitest'

import { handleRpc, type McpContext } from '../ai/mcp'
import { CLI_HELP, runCli, type CliIo } from './index'
import { buildBoard, firstColumnId, projectId } from '../test/fixtures'
import type { BoardState } from '../domain/types'
import { reduce } from '../store/reducer'

function seedBoardCli(): BoardState {
  const base = buildBoard({ kind: 'project/create', name: 'Site', key: 'SITE' })
  const id = projectId(base)
  const column = firstColumnId(base)
  return [
    { kind: 'member/create', name: 'Ada Lovelace', color: 'violet' } as const,
    { kind: 'task/create', projectId: id, columnId: column, title: 'Write the spec' } as const,
  ].reduce(reduce, base)
}

function makeIo(initial: BoardState | null = seedBoardCli()) {
  const out: string[] = []
  const err: string[] = []
  let saved: BoardState | null = initial
  const files: Record<string, string> = {}

  const io: CliIo = {
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    read: () => saved,
    write: (state) => {
      saved = state
    },
    readFile: (path) => files[path] ?? null,
  }
  return {
    io,
    files,
    out,
    err,
    saved: () => saved,
  }
}

describe('MCP server', () => {
  function ctx(initial: BoardState | null = seedBoardCli()): McpContext & { board: () => BoardState } {
    let state = initial ?? seedBoardCli()
    return {
      getState: () => state,
      dispatch: (action) => {
        state = reduce(state, action as never)
      },
      board: () => state,
    }
  }

  it('initialises with the protocol version and server info', () => {
    const response = handleRpc(ctx(), { jsonrpc: '2.0', id: 1, method: 'initialize' })
    expect(response?.result).toMatchObject({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'revelith-tasks' },
    })
  })

  it('lists every board tool with an inputSchema', () => {
    const response = handleRpc(ctx(), { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const tools = (response?.result as { tools: { name: string; inputSchema: unknown }[] }).tools
    expect(tools.length).toBeGreaterThanOrEqual(49)
    expect(tools.every((tool) => tool.inputSchema)).toBe(true)
    expect(tools.map((tool) => tool.name)).toContain('assign_task')
  })

  it('calls a tool and returns its text content', () => {
    const c = ctx()
    const response = handleRpc(c, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_projects', arguments: {} },
    })
    const result = response?.result as { content: { text: string }[]; isError: boolean }
    expect(result.isError).toBe(false)
    expect(result.content[0].text).toContain('SITE')
  })

  it('actually mutates the board through a tool call', () => {
    const c = ctx()
    handleRpc(c, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'assign_task', arguments: { task: 'SITE-1', member: 'Ada Lovelace' } },
    })
    expect(c.board().tasks[0].assigneeId).not.toBeNull()
  })

  it('reports a tool error without throwing', () => {
    const response = handleRpc(ctx(), {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'nope', arguments: {} },
    })
    const result = response?.result as { isError: boolean; content: { text: string }[] }
    expect(result.isError).toBe(true)
  })

  it('rejects a call with no tool name', () => {
    const response = handleRpc(ctx(), { jsonrpc: '2.0', id: 6, method: 'tools/call', params: {} })
    expect(response?.error?.code).toBe(-32602)
  })

  it('rejects non-object arguments', () => {
    const response = handleRpc(ctx(), {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'list_projects', arguments: 'nope' },
    })
    expect(response?.error?.code).toBe(-32602)
  })

  it('returns an error for an unknown method', () => {
    const response = handleRpc(ctx(), { jsonrpc: '2.0', id: 8, method: 'nope' })
    expect(response?.error?.code).toBe(-32601)
  })

  it('does not answer a notification', () => {
    const response = handleRpc(ctx(), { jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(response).toBeNull()
  })

  it('rejects a request that is not JSON-RPC 2.0', () => {
    const response = handleRpc(ctx(), { jsonrpc: '1.0', id: 9, method: 'ping' } as never)
    expect(response?.error?.code).toBe(-32600)
  })
})

describe('CLI', () => {
  it('prints help by default and exits 0', () => {
    const t = makeIo()
    expect(runCli([], t.io).code).toBe(0)
    expect(t.out.join('\n')).toBe(CLI_HELP)
  })

  it('lists projects', () => {
    const t = makeIo()
    expect(runCli(['projects'], t.io).code).toBe(0)
    expect(t.out.join('\n')).toContain('SITE')
  })

  it('lists tasks with ticket ids', () => {
    const t = makeIo()
    runCli(['tasks'], t.io)
    expect(t.out.join('\n')).toContain('SITE-1')
    expect(t.out.join('\n')).toContain('Write the spec')
  })

  it('creates a task and persists it', () => {
    const t = makeIo()
    expect(runCli(['add', 'Brand', 'new', 'thing'], t.io).code).toBe(0)
    expect(t.saved()!.tasks.some((task) => task.title === 'Brand new thing')).toBe(true)
  })

  it('does not treat a flag value as part of the title', () => {
    const t = makeIo()
    // `--file` takes a path; that path must not end up glued to the title.
    expect(runCli(['add', 'Clean', 'title', '--file', 'board.json'], t.io).code).toBe(0)
    expect(t.saved()!.tasks.some((task) => task.title === 'Clean title')).toBe(true)
    expect(t.saved()!.tasks.some((task) => task.title.includes('board.json'))).toBe(false)
  })

it('refuses to add without a title', () => {
    const t = makeIo()
    expect(runCli(['add'], t.io).code).toBe(1)
    expect(t.err.join(' ')).toContain('Usage')
  })

  it('completes a task by ticket id', () => {
    const t = makeIo()
    expect(runCli(['done', 'SITE-1'], t.io).code).toBe(0)
    const done = t.saved()!.tasks[0]
    expect(t.saved()!.columns.find((c) => c.id === done.columnId)?.isDone).toBe(true)
  })

  it('reports an unknown ticket rather than guessing', () => {
    const t = makeIo()
    expect(runCli(['done', 'NOPE-9'], t.io).code).toBe(1)
    expect(t.err.join(' ')).toContain('No task matches')
  })

  it('assigns a task through the same tool the app uses', () => {
    const t = makeIo()
    expect(runCli(['assign', 'SITE-1', 'Ada Lovelace'], t.io).code).toBe(0)
    expect(t.saved()!.tasks[0].assigneeId).not.toBeNull()
  })

  it('lists members and their workload', () => {
    const t = makeIo()
    runCli(['members'], t.io)
    expect(t.out.join('\n')).toContain('Ada Lovelace')
  })

  it('lists the tool surface', () => {
    const t = makeIo()
    runCli(['tools'], t.io)
    expect(t.out.join('\n')).toContain('assign_task')
    expect(t.out[0]).toMatch(/^\d+ tools$/)
  })

  it('exports markdown, csv, json and html', () => {
    for (const format of ['markdown', 'csv', 'json', 'html']) {
      const t = makeIo()
      expect(runCli(['export', format], t.io).code).toBe(0)
      expect(t.out.length).toBeGreaterThan(0)
    }
  })

  it('rejects an unknown export format', () => {
    const t = makeIo()
    expect(runCli(['export', 'pdf'], t.io).code).toBe(1)
  })

  it('imports a CSV file from disk', () => {
    const t = makeIo()
    t.files['in.csv'] = 'title,status\nA,Backlog'
    expect(runImport('csv', t.io, 'in.csv').code).toBe(0)
    expect(t.out.join('\n')).toContain('1 task(s)')
  })

  it('reports a missing import file', () => {
    const t = makeIo()
    expect(runCli(['import', 'csv', 'missing.csv'], t.io).code).toBe(1)
    expect(t.err.join(' ')).toContain('Cannot read')
  })

  it('exits 1 and shows help for an unknown command', () => {
    const t = makeIo()
    expect(runCli(['frobnicate'], t.io).code).toBe(1)
    expect(t.err.join(' ')).toContain('Unknown command')
  })

  it('keeps new files blank until a task is added, then creates a real project', () => {
    const t = makeIo(null)
    // Reading commands report that there is nothing yet...
    expect(runCli(['projects'], t.io).code).toBe(1)
    expect(t.err.join(' ')).toContain('No board yet')
    // ...and the first write creates a local project without demo cards.
    expect(runCli(['add', 'First'], t.io).code).toBe(0)
    expect(t.saved()!.tasks.some((task) => task.title === 'First')).toBe(true)
    expect(t.saved()!.projects).toHaveLength(1)
    expect(t.saved()!.projects[0]!.name).toBe('Tasks')
    expect(t.saved()!.tasks).toHaveLength(1)
  })

  it('mentions no server and no login in its help', () => {
    expect(CLI_HELP).toContain('no server and no login')
  })
})

/** Helper mirroring the CLI's own import branch, for the test above. */
function runImport(format: 'json' | 'csv' | 'trello', io: CliIo, file: string): { code: number } {
  return runCli(['import', format, file], io)
}
