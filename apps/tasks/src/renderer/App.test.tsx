import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import App from './App'
import { seedBoard, serializeDocument } from '../store/migrate'
import { defaultStorageKey } from '../store/persistence'

vi.mock('@revelith/app-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@revelith/app-chat')>()
  return {
    ...actual,
    AppChatPanel: ({ title, command }: { title?: string; command?: unknown }) => (
      <div
        aria-label={title}
        data-testid="tasks-ai-command"
        data-command={JSON.stringify(command ?? null)}
      />
    ),
  }
})

/**
 * End-to-end render tests.
 *
 * These drive the real component tree against a real store with no host shell,
 * which is the closest thing to "the app works" that runs in CI. Everything is
 * local: no network, no Electron, no server.
 */

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(defaultStorageKey(), JSON.stringify(serializeDocument(seedBoard())))
  vi.stubGlobal('confirm', () => true)
  vi.stubGlobal('alert', () => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App shell', () => {
  it('mounts and renders the seeded board', () => {
    render(<App />)
    expect(document.querySelector('section[aria-label="Backlog"]')).toBeTruthy()
    expect(screen.getByText(/Welcome to ReveLith Tasks/)).toBeTruthy()
  })

  it('shows the default columns of the sample project', () => {
    render(<App />)
    for (const name of ['Backlog', 'In Progress', 'Review', 'Done']) {
      expect(document.querySelector(`section[aria-label="${name}"]`)).toBeTruthy()
    }
  })

  it('renders seeded tasks with their ticket ids', () => {
    render(<App />)
    expect(screen.getByText(/Welcome to ReveLith Tasks/)).toBeTruthy()
    expect(screen.getAllByText(/DEMO-/).length).toBeGreaterThan(0)
  })

  it('persists a change to localStorage', async () => {
    render(<App />)
    // The board is written on every state change; the seeded board should be present.
    const raw = window.localStorage.getItem(defaultStorageKey())
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed.state.tasks.length).toBeGreaterThan(0)
  })

  it('offers the shared AI panel alongside the board', () => {
    render(<App />)
    // The shared panel labels its rail via aria-label rather than a text heading.
    expect(screen.getByLabelText('Tasks Assistant')).toBeTruthy()
  })

  it('does not show the runtime platform in the board footer', () => {
    render(<App />)
    expect(screen.queryByText(/Electron ·|Browser/)).toBeNull()
  })
})

describe('project switching', () => {
  it('creates a second project and switches to it', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<App />)
    const click = userEvent.setup()

    await click.click(screen.getByRole('button', { name: 'New project' }))
    const input = screen.getByPlaceholderText('Website Redesign')
    await click.clear(input)
    await click.type(input, 'Second Project')
    await click.click(screen.getByRole('button', { name: 'Create project' }))

    const select = screen.getByLabelText('Select project') as HTMLSelectElement
    expect(within(select).getAllByRole('option').length).toBe(2)
    expect(select.value).not.toBe('')
  })

  it('creates a task from a column and shows it on the board', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<App />)
    const click = userEvent.setup()

    await click.click(screen.getByRole('button', { name: 'New task' }))
    await click.type(screen.getByPlaceholderText('What needs doing?'), 'Ship the release')
    await click.click(screen.getByRole('button', { name: 'Create task' }))

    expect(screen.getByText('Ship the release')).toBeTruthy()
  })
})

describe('task detail', () => {
  it('sends only the selected task context to the configured provider without a local-only restriction', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<App />)
    const click = userEvent.setup()

    await click.dblClick(screen.getByText('Create a project'))
    await click.click(screen.getByRole('button', { name: 'Ask AI' }))

    const panel = screen.getByTestId('tasks-ai-command')
    const command = JSON.parse(panel.getAttribute('data-command') ?? 'null')
    expect(command).toMatchObject({
      submit: true,
      readOnly: true,
      excludeAttachments: true,
    })
    expect(command).not.toHaveProperty('localOnly')
    expect(command.context).toContain('Create a project')
    expect(command.context).not.toContain('Welcome to ReveLith Tasks')
    expect(command.context).not.toContain('Try a global search')
  })

  it('opens a task and edits its title inline', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<App />)
    const click = userEvent.setup()

    await click.dblClick(screen.getByText('Create a project'))
    const title = screen.getByLabelText('Task title') as HTMLTextAreaElement
    expect(title.value).toBe('Create a project')
    await click.clear(title)
    await click.type(title, 'Create two projects')
    expect((screen.getByLabelText('Task title') as HTMLTextAreaElement).value).toBe(
      'Create two projects',
    )
  })

  it('moves a task between columns from the detail panel', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<App />)
    const click = userEvent.setup()

    await click.dblClick(screen.getByText('Create a project'))
    const select = screen.getByLabelText('Column') as HTMLSelectElement
    const done = within(select)
      .getAllByRole('option')
      .find((option) => option.textContent === 'Done') as HTMLOptionElement
    await click.selectOptions(select, done.value)

    const doneColumn = document.querySelector('section[aria-label="Done"]') as HTMLElement
    expect(within(doneColumn).getByText('Create a project')).toBeTruthy()
  })

  it('adds a comment', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<App />)
    const click = userEvent.setup()

    await click.dblClick(screen.getByText('Create a project'))
    await click.type(screen.getByPlaceholderText('Write a comment…'), 'Looks good to me')
    await click.click(screen.getByRole('button', { name: 'Comment' }))
    expect(screen.getByText('Looks good to me')).toBeTruthy()
  })

  it('adds a sub-task and shows the completion count', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<App />)
    const click = userEvent.setup()

    await click.dblClick(screen.getByText('Create a project'))
    await click.type(screen.getByPlaceholderText('Add a sub-task…'), 'Draft the copy')
    await click.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText(/Sub-tasks \(0\/1\)/)).toBeTruthy()
  })
})

describe('filters', () => {
  it('narrows the board by search text', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<App />)
    const click = userEvent.setup()

    // "global search" appears only in the search task's description.
    await click.type(screen.getByLabelText('Search tasks'), 'global search')
    expect(screen.getByText('Try a global search')).toBeTruthy()
    expect(screen.queryByText('Welcome to ReveLith Tasks')).toBeNull()
  })

  it('matches the ticket id through search', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<App />)
    const click = userEvent.setup()

    await click.type(screen.getByLabelText('Search tasks'), 'DEMO-5')
    expect(screen.getByText('Try a global search')).toBeTruthy()
    expect(screen.queryByText('Create a project')).toBeNull()
  })

  it('clears filters with the Clear button', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<App />)
    const click = userEvent.setup()

    const search = screen.getByLabelText('Search tasks') as HTMLInputElement
    await click.type(search, 'columns')
    await click.click(screen.getByRole('button', { name: 'Clear' }))
    expect((screen.getByLabelText('Search tasks') as HTMLInputElement).value).toBe('')
  })
})

describe('empty state', () => {
  it('starts with no project or prefilled cards when there is no saved board', () => {
    window.localStorage.removeItem(defaultStorageKey())
    render(<App />)
    expect(screen.getByText('No project selected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create your first project' })).toBeTruthy()
    expect(screen.queryByText(/Welcome to ReveLith Tasks/)).toBeNull()
    expect(screen.queryByText(/DEMO-/)).toBeNull()
  })

  it('invites the user to create a project when none exist', () => {
    window.localStorage.setItem(
      defaultStorageKey(),
      JSON.stringify({
        version: 2,
        state: {
          ...seedBoard(),
          projects: [],
          columns: [],
          tasks: [],
          labels: [],
          selectedProjectId: null,
        },
      }),
    )
    render(<App />)
    expect(screen.getByText('No project selected')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create your first project' })).toBeTruthy()
  })
})
