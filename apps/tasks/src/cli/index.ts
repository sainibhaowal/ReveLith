import { readFileSync, writeFileSync } from 'node:fs'

import type { BoardState } from '../domain/types'
import { EMPTY_FILTERS } from '../domain/types'
import { boardToJson, boardToMarkdown, projectToCsv } from '../store/export'
import { boardToHtml } from '../store/publicBoard'
import { runImport, type ImportFormat } from '../store/importers'
import { reduce } from '../store/reducer'
import { boardTasks, ticketId } from '../store/selectors'
import { emptyBoard } from '../store/migrate'
import { runTool, toolSchemas } from '../ai/tools'
import type { Action } from '../store/actions'

/**
 * The command line for the board.
 *
 * Runs against a local JSON file and writes it back — no server, no account, no
 * network. Every command goes through the same reducer the UI uses, so the
 * board can never be left in a state the app itself could not produce.
 */

export interface CliIo {
  /** Write a line of normal output. */
  out(text: string): void
  /** Write a line of error output. */
  err(text: string): void
  /** Read the board, or null when the file does not exist yet. */
  read(): BoardState | null
  /** Persist the board. */
  write(state: BoardState): void
  /** Read a file argument, used by import. */
  readFile?(path: string): string | null
}

export interface CliResult {
  code: number
}

export const CLI_HELP = `revelith-tasks — local-first task board

Usage:
  revelith-tasks <command> [args] [--file <board.json>]

Commands:
  summary                          Board contents as markdown
  projects                         List projects
  tasks [--project <key>]          List tasks
  add <title>                      Create a task
  done <ticket>                    Move a task to a done column
  members                          List people and their workload
  assign <ticket> <member>         Assign a task
  my <member>                      List one person's open work
  import <json|csv|trello> <file>  Read another board's export
  export markdown|csv|json|html    Write the board out
  tools                            List the AI tool surface
  help                             Show this message

There is no server and no login. The board is a local JSON file.`

/** A working copy of the board plus the tools that act on it. */
function session(io: CliIo) {
  const loaded = io.read()
  // A new local file starts empty; creating the first task provisions a real
  // project rather than showing tutorial/demo content.
  let state: BoardState = loaded ?? emptyBoard()

  return {
    /** True when a board already existed on disk. */
    existed: loaded !== null,
    get current(): BoardState {
      return state
    },
    dispatch(action: Action): void {
      state = reduce(state, action)
    },
    save(): void {
      io.write(state)
    },
    tool(name: string, input: Record<string, unknown> = {}) {
      return runTool(
        {
          getState: () => state,
          dispatch: (action: Action) => {
            state = reduce(state, action)
          },
        },
        name,
        input,
      )
    },
  }
}

/** Run one command line. Returns an exit code rather than exiting. */
export function runCli(argv: string[], io: CliIo): CliResult {
  const [command = 'help', ...rest] = argv
  const { flags, positional } = parseArgs(rest)
  const s = session(io)

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      io.out(CLI_HELP)
      return { code: 0 }

    case 'summary': {
      if (!s.existed) return fail(io, 'No board yet. Run `add <title>` to create one.')
      const state = s.current
      const project =
        state.projects.find((entry) => entry.id === state.selectedProjectId) ?? state.projects[0]
      io.out(project ? boardToMarkdown(state, project.id) : 'Board is empty.')
      return { code: 0 }
    }

    case 'projects': {
      if (!s.existed) return fail(io, 'No board yet.')
      for (const project of s.current.projects) {
        io.out(`${project.key.padEnd(8)} ${project.archived ? '(archived) ' : ''}${project.name}`)
      }
      return { code: 0 }
    }

    case 'tasks': {
      if (!s.existed) return fail(io, 'No board yet.')
      const state = s.current
      const wanted = flags.project
        ? state.projects.find(
            (entry) => entry.key.toLowerCase() === String(flags.project).toLowerCase(),
          )
        : (state.projects.find((entry) => entry.id === state.selectedProjectId) ??
          state.projects[0])
      if (!wanted) return fail(io, 'No project found.')

      for (const task of boardTasks(state, wanted.id, EMPTY_FILTERS, 'position')) {
        if (task.archived || task.parentId) continue
        const labels = state.labels
          .filter((label) => task.labelIds.includes(label.id))
          .map((l) => l.name)
        io.out(
          `${ticketId(state, task).padEnd(10)} ${task.priority.padEnd(7)} ${task.title}${labels.length ? `  [${labels.join(', ')}]` : ''}`,
        )
      }
      return { code: 0 }
    }

    case 'add': {
      const title = positional.join(' ').trim()
      if (!title) return fail(io, 'Usage: add <title>')
      let state = s.current
      let project =
        state.projects.find((entry) => entry.id === state.selectedProjectId) ?? state.projects[0]
      if (!project) {
        s.dispatch({ kind: 'project/create', name: 'Tasks' })
        state = s.current
        project =
          state.projects.find((entry) => entry.id === state.selectedProjectId) ?? state.projects[0]
      }
      const column = state.columns.find((entry) => entry.projectId === project?.id)
      if (!project || !column) return fail(io, 'That project has no columns.')

      s.dispatch({ kind: 'task/create', projectId: project.id, columnId: column.id, title })
      s.save()
      io.out(`Created ${title}`)
      return { code: 0 }
    }

    case 'done': {
      const ticket = positional[0]
      if (!ticket) return fail(io, 'Usage: done <ticket>')
      if (!s.existed) return fail(io, 'No board yet.')
      const state = s.current
      const task = state.tasks.find((entry) => matchesTicket(state, entry, ticket))
      if (!task) return fail(io, `No task matches "${ticket}".`)
      const column = state.columns.find(
        (entry) => entry.projectId === task.projectId && entry.isDone,
      )
      if (!column) return fail(io, 'That project has no done column.')

      s.dispatch({ kind: 'task/move', id: task.id, columnId: column.id })
      s.save()
      io.out(`Completed ${ticket}`)
      return { code: 0 }
    }

    case 'members': {
      if (!s.existed) return fail(io, 'No board yet.')
      const state = s.current
      if (!state.members.length) io.out('No one on the board yet.')
      for (const member of state.members) {
        const open = state.tasks.filter((t) => t.assigneeId === member.id && !t.archived).length
        io.out(`${member.name.padEnd(22)} ${open} open`)
      }
      return { code: 0 }
    }

    case 'assign': {
      const [ticket, who] = positional
      if (!ticket || !who) return fail(io, 'Usage: assign <ticket> <member>')
      if (!s.existed) return fail(io, 'No board yet.')
      const result = s.tool('assign_task', { task: ticket, member: who })
      if (result.isError) return fail(io, result.output)
      s.save()
      io.out(result.output)
      return { code: 0 }
    }

    case 'my': {
      const who = positional.join(' ')
      if (!who) return fail(io, 'Usage: my <member>')
      if (!s.existed) return fail(io, 'No board yet.')
      const result = s.tool('my_tasks', { member: who })
      if (result.isError) return fail(io, result.output)
      io.out(result.output)
      return { code: 0 }
    }

    case 'tools': {
      io.out(`${toolSchemas().length} tools`)
      for (const tool of toolSchemas()) {
        io.out(`${tool.name.padEnd(24)} ${tool.description.split('\n')[0]}`)
      }
      return { code: 0 }
    }

    case 'import': {
      const format = positional[0] as ImportFormat | undefined
      const file = positional[1]
      if (!format || !file) return fail(io, 'Usage: import <json|csv|trello> <file>')
      if (!io.readFile) return fail(io, 'This host cannot read files.')
      const text = io.readFile(file)
      if (text === null) return fail(io, `Cannot read ${file}.`)
      const report = runImport(format, text)
      if (!report.ok) return fail(io, report.warnings.join(' '))
      io.out(
        `Read ${report.tasks} task(s), ${report.columns} column(s), ${report.labels} label(s) from ${file}.`,
      )
      for (const warning of report.warnings) io.out(`  ! ${warning}`)
      return { code: 0 }
    }

    case 'export': {
      const format = positional[0] ?? 'markdown'
      if (!s.existed) return fail(io, 'No board yet.')
      const state = s.current
      const project =
        state.projects.find((entry) => entry.id === state.selectedProjectId) ?? state.projects[0]
      if (!project) return fail(io, 'No project to export.')

      if (format === 'markdown') io.out(boardToMarkdown(state, project.id))
      else if (format === 'csv') io.out(projectToCsv(state, project.id))
      else if (format === 'json') io.out(boardToJson(state))
      else if (format === 'html') io.out(boardToHtml(state, project.id))
      else return fail(io, 'Format must be markdown, csv, json or html.')
      return { code: 0 }
    }

    default:
      io.err(`Unknown command: ${command}`)
      io.out(CLI_HELP)
      return { code: 1 }
  }
}

function matchesTicket(
  state: BoardState,
  task: { number: number; projectId: string },
  ticket: string,
): boolean {
  const project = state.projects.find((entry) => entry.id === task.projectId)
  if (!project) return false
  const upper = ticket.toUpperCase()
  return `${project.key.toUpperCase()}-${task.number}` === upper || String(task.number) === ticket
}

/**
 * Split `--flag value` pairs from positional arguments.
 *
 * A flag's value must not also count as a positional, or `--file board.json`
 * would append the path to whatever text the command was building.
 */
function parseArgs(args: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = args[i + 1]
    if (next && !next.startsWith('--')) {
      flags[key] = next
      i += 1
    } else flags[key] = 'true'
  }
  return { flags, positional }
}

function fail(io: CliIo, message: string): CliResult {
  io.err(message)
  return { code: 1 }
}

/** Entry point used by the `bin` script. */
export function main(argv: string[]): void {
  const { flags } = parseArgs(argv)
  const boardPath = flags.file ?? 'board.json'
  const io: CliIo = {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
    read: () => {
      try {
        const payload = JSON.parse(readFileSync(boardPath, 'utf8')) as {
          state?: BoardState
        } & BoardState
        return payload.state ?? payload
      } catch {
        return null
      }
    },
    write: (state) => {
      writeFileSync(boardPath, JSON.stringify({ version: 2, state }, null, 2), 'utf8')
    },
    readFile: (target) => {
      try {
        return readFileSync(target, 'utf8')
      } catch {
        return null
      }
    },
  }
  process.exitCode = runCli(argv, io).code
}

if (require.main === module) main(process.argv.slice(2))
