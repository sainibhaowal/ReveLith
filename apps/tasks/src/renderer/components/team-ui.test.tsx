import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Avatar, UnassignedAvatar } from './Avatar'
import { BulkBar } from './BulkBar'
import { ExternalLinksSection } from './ExternalLinks'
import { ListView } from './ListView'
import { MembersDialog } from './MembersDialog'
import { MyTasksView } from './MyTasksView'
import type { Action } from '../../store/actions'
import { reduce } from '../../store/reducer'
import type { BoardState } from '../../domain/types'
import { buildBoard, firstColumnId, projectId } from '../../test/fixtures'

/** Renders with a live store so dispatch assertions see real effects. */
function harness(state: BoardState) {
  let current = state
  const dispatch = vi.fn((action: Action) => {
    current = reduce(current, action)
  })
  return {
    dispatch,
    get: () => current,
    rerender: () => current,
  }
}

function seed() {
  const base = buildBoard({ kind: 'project/create', name: 'Site', key: 'SITE' })
  const id = projectId(base)
  const column = firstColumnId(base)
  return [
    { kind: 'member/create', name: 'Ada Lovelace', color: 'violet' } as Action,
    { kind: 'task/create', projectId: id, columnId: column, title: 'Write the spec' } as Action,
    { kind: 'task/create', projectId: id, columnId: column, title: 'Ship it' } as Action,
  ].reduce(reduce, base)
}

afterEach(() => {
  cleanup()
})

describe('Avatar', () => {
  it('shows two initials', () => {
    render(<Avatar name="Ada Lovelace" color="violet" />)
    expect(screen.getByLabelText('Ada Lovelace').textContent).toBe('AL')
  })

  it('renders a dashed placeholder when nobody owns the work', () => {
    render(<UnassignedAvatar />)
    expect(screen.getByLabelText('Unassigned').textContent).toBe('?')
  })
})

describe('MembersDialog', () => {
  it('adds a person', () => {
    const h = harness(seed())
    render(<MembersDialog state={h.get()} dispatch={h.dispatch} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('New person'), { target: { value: 'Grace Hopper' } })
    fireEvent.click(screen.getByText('Add'))

    expect(h.get().members.map((m) => m.name)).toContain('Grace Hopper')
  })

  it('shows workload counts', () => {
    const base = seed()
    const h = harness(
      reduce(base, {
        kind: 'task/setAssignee',
        id: base.tasks[0].id,
        assigneeId: base.members[0].id,
      }),
    )
    render(<MembersDialog state={h.get()} dispatch={h.dispatch} onClose={() => {}} />)
    expect(screen.getByText(/1 open/)).toBeTruthy()
  })

  it('keeps the task when a person is removed', () => {
    const h = harness(seed())
    render(<MembersDialog state={h.get()} dispatch={h.dispatch} onClose={() => {}} />)

    fireEvent.click(screen.getByText('Remove'))

    expect(h.get().members).toHaveLength(0)
    expect(h.get().tasks).toHaveLength(2)
  })
})

describe('BulkBar', () => {
  it('renders nothing with no selection', () => {
    const { container } = render(
      <BulkBar
        state={seed()}
        selectedIds={[]}
        projectId={null}
        dispatch={() => {}}
        onAskAI={() => {}}
        onClear={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('reports how many are selected', () => {
    const h = harness(seed())
    render(
      <BulkBar
        state={h.get()}
        selectedIds={[h.get().tasks[0].id]}
        projectId={h.get().selectedProjectId}
        dispatch={h.dispatch}
        onAskAI={() => {}}
        onClear={() => {}}
      />,
    )
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('routes Ask AI only the explicit selected task IDs', () => {
    const h = harness(seed())
    const ids = [h.get().tasks[1].id]
    const ask = vi.fn()
    render(
      <BulkBar
        state={h.get()}
        selectedIds={ids}
        projectId={h.get().selectedProjectId}
        dispatch={h.dispatch}
        onAskAI={ask}
        onClear={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI about selected' }))
    expect(ask).toHaveBeenCalledWith(ids)
  })

  it('applies a priority to the whole selection', () => {
    const h = harness(seed())
    const ids = h.get().tasks.map((t) => t.id)
    render(
      <BulkBar
        state={h.get()}
        selectedIds={ids}
        projectId={h.get().selectedProjectId}
        dispatch={h.dispatch}
        onAskAI={() => {}}
        onClear={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText('Set priority'), { target: { value: 'urgent' } })
    expect(h.get().tasks.every((t) => t.priority === 'urgent')).toBe(true)
  })

  it('assigns the whole selection in one dispatch', () => {
    const h = harness(seed())
    const ada = h.get().members[0].id
    const ids = h.get().tasks.map((t) => t.id)
    render(
      <BulkBar
        state={h.get()}
        selectedIds={ids}
        projectId={h.get().selectedProjectId}
        dispatch={h.dispatch}
        onAskAI={() => {}}
        onClear={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText('Set assignee'), { target: { value: ada } })
    expect(h.get().tasks.every((t) => t.assigneeId === ada)).toBe(true)
  })
})

describe('ListView', () => {
  it('groups tasks under their columns', () => {
    const board = seed()
    render(
      <ListView
        state={board}
        tasks={board.tasks}
        projectId={board.selectedProjectId}
        onOpen={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
      />,
    )
    expect(screen.getByText('Backlog')).toBeTruthy()
    expect(screen.getByText('Write the spec')).toBeTruthy()
  })

  it('selects a task from its checkbox', () => {
    const board = seed()
    const onToggle = vi.fn()
    render(
      <ListView
        state={board}
        tasks={board.tasks}
        projectId={board.selectedProjectId}
        onOpen={() => {}}
        selectedIds={[]}
        onToggleSelect={onToggle}
        onSelectAll={() => {}}
      />,
    )
    fireEvent.click(screen.getByLabelText('Select SITE-1'))
    expect(onToggle).toHaveBeenCalledWith(board.tasks[0].id)
  })
})

describe('MyTasksView', () => {
  it('buckets overdue work first', () => {
    let board = seed()
    const ada = board.members[0].id
    board = reduce(board, { kind: 'task/setAssignee', id: board.tasks[0].id, assigneeId: ada })
    board = reduce(board, {
      kind: 'task/update',
      id: board.tasks[0].id,
      patch: { dueDate: '2020-01-01' },
    })

    render(
      <MyTasksView
        state={board}
        memberId={ada}
        onOpen={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
      />,
    )
    expect(screen.getByText('Overdue')).toBeTruthy()
  })

  it('prompts when no person is selected', () => {
    render(
      <MyTasksView
        state={seed()}
        memberId={null}
        onOpen={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
      />,
    )
    expect(screen.getByText('No person selected.')).toBeTruthy()
  })

  it('can regroup by project', () => {
    const base = seed()
    const board = reduce(base, {
      kind: 'task/setAssignee',
      id: base.tasks[0].id,
      assigneeId: base.members[0].id,
    })
    render(
      <MyTasksView
        state={board}
        memberId={board.members[0].id}
        onOpen={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText('Group my tasks by'), { target: { value: 'project' } })
    expect(screen.getByText('Site')).toBeTruthy()
  })
})

describe('ExternalLinksSection', () => {
  it('adds a link and lists it', () => {
    const h = harness(seed())
    const taskId = h.get().tasks[0].id
    const { rerender } = render(
      <ExternalLinksSection state={h.get()} taskId={taskId} dispatch={h.dispatch} />,
    )

    fireEvent.click(screen.getByText('Add link'))
    fireEvent.change(screen.getByLabelText('Link url'), {
      target: { value: 'https://github.com/o/r/issues/9' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(h.get().externalLinks).toHaveLength(1)
    rerender(<ExternalLinksSection state={h.get()} taskId={taskId} dispatch={h.dispatch} />)
    expect(screen.getByRole('link', { name: /issues\/9/ })).toBeTruthy()
  })

  it('removes a link', () => {
    const h = harness(seed())
    const taskId = h.get().tasks[0].id
    h.dispatch({
      kind: 'externalLink/add',
      taskId,
      type: 'issue',
      url: 'https://example.com/1',
      externalId: '1',
    })

    render(<ExternalLinksSection state={h.get()} taskId={taskId} dispatch={h.dispatch} />)
    fireEvent.click(screen.getByLabelText('Remove link to 1'))
    expect(h.get().externalLinks).toHaveLength(0)
  })
})
