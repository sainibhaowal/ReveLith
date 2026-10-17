import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ActivityFeed, BacklogView } from './BacklogViews'
import { CommandPalette, buildCommands } from './CommandPalette'
import { CalendarView, GanttView } from './ScheduleViews'
import { reduce } from '../../store/reducer'
import { addDays, today } from '../../store/dates'
import type { BoardState } from '../../domain/types'
import { buildBoard, firstColumnId, projectId } from '../../test/fixtures'

afterEach(() => cleanup())

function seed(): BoardState {
  const base = buildBoard({ kind: 'project/create', name: 'Site', key: 'SITE' })
  const id = projectId(base)
  const backlog = firstColumnId(base)
  const done = base.columns.find((column) => column.isDone)!.id

  const withMember = reduce(base, { kind: 'member/create', name: 'Ada Lovelace', color: 'violet' })
  const withTask = reduce(withMember, {
    kind: 'task/create',
    projectId: id,
    columnId: backlog,
    title: 'Write the spec',
  })
  const withDate = reduce(withTask, {
    kind: 'task/update',
    id: withTask.tasks[0].id,
    patch: { startDate: today(), dueDate: addDays(today(), 4) },
  })
  return reduce(withDate, {
    kind: 'task/create',
    projectId: id,
    columnId: done,
    title: 'Ship it',
  })
}

describe('CalendarView', () => {
  it('renders a month grid with the task titles', () => {
    const board = seed()
    render(<CalendarView state={board} tasks={board.tasks} onOpen={() => {}} />)
    expect(screen.getAllByText('Write the spec').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Next month' })).toBeTruthy()
  })

  it('opens a task when its pill is clicked', () => {
    const board = seed()
    const onOpen = vi.fn()
    render(<CalendarView state={board} tasks={board.tasks} onOpen={onOpen} />)
    fireEvent.click(screen.getAllByTitle(/Write the spec/)[0]!)
    expect(onOpen).toHaveBeenCalledWith(board.tasks[0].id)
  })

  it('reports how many tasks are dated', () => {
    const board = seed()
    render(<CalendarView state={board} tasks={board.tasks} onOpen={() => {}} />)
    expect(screen.getByText('1 dated')).toBeTruthy()
  })
})

describe('GanttView', () => {
  it('renders a bar per scheduled task', () => {
    const board = seed()
    render(<GanttView state={board} tasks={board.tasks} onOpen={() => {}} onShift={() => {}} />)
    expect(screen.getByRole('button', { name: /Reschedule Write the spec/ })).toBeTruthy()
    expect(screen.getByText('1 scheduled')).toBeTruthy()
  })

  it('shifts a task one day through the keyboard path', () => {
    const board = seed()
    const onShift = vi.fn()
    render(<GanttView state={board} tasks={board.tasks} onOpen={() => {}} onShift={onShift} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: /Reschedule Write the spec/ }))
    fireEvent.click(screen.getByText('Shift +1 day'))
    expect(onShift).toHaveBeenCalledWith(board.tasks[0].id, addDays(today(), 1))
  })

  it('prompts when nothing is scheduled', () => {
    const board = seed()
    render(<GanttView state={board} tasks={[]} onOpen={() => {}} onShift={() => {}} />)
    expect(screen.getByText(/Nothing scheduled/)).toBeTruthy()
  })
})

describe('BacklogView', () => {
  it('splits planned from finished work', () => {
    const board = seed()
    render(
      <BacklogView
        state={board}
        tasks={board.tasks}
        dispatch={() => {}}
        onOpen={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
      />,
    )
    expect(screen.getByText('Planned')).toBeTruthy()
    expect(screen.getByText(/1 planned/)).toBeTruthy()
  })

  it('reveals archived work on demand', () => {
    const board = seed()
    render(
      <BacklogView
        state={board}
        tasks={board.tasks}
        dispatch={() => {}}
        onOpen={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
      />,
    )
    expect(screen.queryByText('Archived')).toBeNull()
    fireEvent.click(screen.getByText('Show archived'))
    expect(screen.getByText('Archived')).toBeTruthy()
    expect(screen.getByText('Ship it')).toBeTruthy()
  })
})

describe('ActivityFeed', () => {
  it('lists recent activity and opens the task behind an entry', () => {
    const board = seed()
    const onOpenTask = vi.fn()
    render(<ActivityFeed state={board} onOpenTask={onOpenTask} />)
    expect(screen.getByText('Activity')).toBeTruthy()
    fireEvent.click(screen.getByText(/SITE-1/))
    expect(onOpenTask).toHaveBeenCalledWith(board.tasks[0].id)
  })

  it('says so when there is no history', () => {
    render(<ActivityFeed state={{ ...seed(), activity: [] }} onOpenTask={() => {}} />)
    expect(screen.getByText(/Nothing has happened yet/)).toBeTruthy()
  })
})

describe('CommandPalette', () => {
  const actions = () => ({
    openTask: vi.fn(),
    setView: vi.fn(),
    newTask: vi.fn(),
    newProject: vi.fn(),
    newLabel: vi.fn(),
    newColumn: vi.fn(),
    people: vi.fn(),
    myTasks: vi.fn(),
    exportBoard: vi.fn(),
    clearFilters: vi.fn(),
    openMember: vi.fn(),
    projectId: null,
  })

  it('builds commands for tasks, people, views and actions', () => {
    const board = seed()
    const commands = buildCommands(board, actions())
    expect(commands.some((c) => c.title.includes('Write the spec'))).toBe(true)
    expect(commands.some((c) => c.title === 'Go to Calendar')).toBe(true)
    expect(commands.some((c) => c.title === 'Manage people')).toBe(true)
    expect(commands.some((c) => c.title.startsWith('My tasks'))).toBe(true)
  })

  it('renders nothing while closed', () => {
    const { container } = render(
      <CommandPalette state={seed()} open={false} commands={[]} onClose={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('filters as you type', () => {
    const board = seed()
    render(
      <CommandPalette
        state={board}
        open
        commands={buildCommands(board, actions())}
        onClose={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText('Command palette search'), { target: { value: 'spec' } })
    expect(screen.getAllByText(/Write the spec/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Manage people')).toBeNull()
  })

  it('runs the highlighted command on Enter', () => {
    const board = seed()
    const a = actions()
    render(
      <CommandPalette state={board} open commands={buildCommands(board, a)} onClose={() => {}} />,
    )

    const input = screen.getByLabelText('Command palette search')
    fireEvent.change(input, { target: { value: 'Manage people' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(a.people).toHaveBeenCalled()
  })

  it('switches view from the command list', () => {
    const board = seed()
    const a = actions()
    render(
      <CommandPalette state={board} open commands={buildCommands(board, a)} onClose={() => {}} />,
    )

    fireEvent.change(screen.getByLabelText('Command palette search'), {
      target: { value: 'Go to Gantt' },
    })
    fireEvent.keyDown(screen.getByLabelText('Command palette search'), { key: 'Enter' })
    expect(a.setView).toHaveBeenCalledWith('gantt')
  })

  it('closes on Escape', () => {
    const board = seed()
    const onClose = vi.fn()
    render(
      <CommandPalette
        state={board}
        open
        commands={buildCommands(board, actions())}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('Command palette search'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('says so when nothing matches', () => {
    const board = seed()
    render(
      <CommandPalette
        state={board}
        open
        commands={buildCommands(board, actions())}
        onClose={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText('Command palette search'), { target: { value: 'zzzz' } })
    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
  })
})
