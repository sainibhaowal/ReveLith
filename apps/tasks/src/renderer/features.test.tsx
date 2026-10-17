import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { SHORTCUT_HELP } from './useKeyboardShortcuts'
import { seedBoard, serializeDocument } from '../store/migrate'
import { defaultStorageKey } from '../store/persistence'
import { getBlob, listBlobIds } from '../store/attachments'
import { clearAll } from '../store/attachments'

/**
 * Feature-level render tests for undo, saved views, notifications, keyboard
 * shortcuts and attachments, driven through the real component tree.
 */

beforeEach(async () => {
  window.localStorage.clear()
  window.localStorage.setItem(defaultStorageKey(), JSON.stringify(serializeDocument(seedBoard())))
  await clearAll()
  vi.stubGlobal('confirm', () => true)
  vi.stubGlobal('alert', () => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function click(name: string) {
  const { default: userEvent } = await import('@testing-library/user-event')
  const instance = userEvent.setup()
  await instance.click(screen.getByRole('button', { name }))
  return instance
}
void click

describe('undo and redo', () => {
  it('starts disabled and enables after an edit', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    const undo = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement
    expect(undo.disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByPlaceholderText('What needs doing?'), 'Undoable work')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(screen.getByText('Undoable work')).toBeTruthy()

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    )
  })

  it('restores a deleted task', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByPlaceholderText('What needs doing?'), 'Temporary')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(screen.getByText('Temporary')).toBeTruthy()

    await user.dblClick(screen.getByText('Temporary'))
    await user.click(screen.getByRole('button', { name: 'Delete task' }))
    expect(screen.queryByText('Temporary')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    // Undo restores the whole snapshot, so the detail panel reopens too; assert
    // on the board itself rather than the text appearing exactly once.
    const backlog = await waitFor(() => {
      const column = document.querySelector('section[aria-label="Backlog"]') as HTMLElement
      expect(within(column).getByText('Temporary')).toBeTruthy()
      return column
    })
    expect(within(backlog).getByText('Temporary')).toBeTruthy()
  })

  it('redoes after undoing', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByPlaceholderText('What needs doing?'), 'Redoable')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    // Open the card first; the detail panel also renders the title.
    await user.dblClick(screen.getByText('Redoable'))
    await user.click(screen.getByRole('button', { name: 'Delete task' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    const column = document.querySelector('section[aria-label="Backlog"]') as HTMLElement
    expect(within(column).getByText('Redoable')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(screen.queryByText('Redoable')).toBeNull())
  })
})

describe('saved views', () => {
  /** The manage dialog, scoped so its "Done" button beats the column named Done. */
  const manageDialog = () => screen.getByRole('dialog', { name: 'Saved views' })

  it('saves the current search and reapplies it', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: 'View' }))
    await user.type(screen.getByLabelText('Search tasks'), 'columns')
    await user.click(screen.getByRole('button', { name: 'Manage' }))

    await user.type(within(manageDialog()).getByLabelText('Save current filters as'), 'Narrow')
    await user.click(within(manageDialog()).getByRole('button', { name: 'Save view' }))
    await user.click(within(manageDialog()).getByRole('button', { name: 'Done' }))

    const viewButton = await screen.findByRole('button', { name: 'Narrow' })
    // Move the search somewhere else so the saved view is clearly doing work.
    await user.clear(screen.getByLabelText('Search tasks'))
    await user.type(screen.getByLabelText('Search tasks'), 'nothing matches this')
    await waitFor(() => expect(screen.queryByText('Customise your columns')).toBeNull())

    await user.click(viewButton)
    expect((screen.getByLabelText('Search tasks') as HTMLInputElement).value).toBe('columns')
    expect(screen.getByText('Customise your columns')).toBeTruthy()
  })

  it('will not save a view with no filters set', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: 'View' }))
    await user.click(screen.getByRole('button', { name: 'Manage' }))

    const field = within(manageDialog()).getByLabelText('Save current filters as')
    await user.type(field, 'Empty')
    expect(within(manageDialog()).getByRole('button', { name: 'Save view' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('drops the view badge once the filters are edited away', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.click(screen.getByRole('tab', { name: 'View' }))
    await user.type(screen.getByLabelText('Search tasks'), 'columns')
    await user.click(screen.getByRole('button', { name: 'Manage' }))

    await user.type(within(manageDialog()).getByLabelText('Save current filters as'), 'Narrow')
    await user.click(within(manageDialog()).getByRole('button', { name: 'Save view' }))
    await user.click(within(manageDialog()).getByRole('button', { name: 'Done' }))

    const viewButton = await screen.findByRole('button', { name: 'Narrow' })
    expect(viewButton.getAttribute('aria-pressed')).toBe('true')

    await user.type(screen.getByLabelText('Search tasks'), '!')
    await waitFor(() => expect(viewButton.getAttribute('aria-pressed')).toBe('false'))
  })
})

describe('notification centre', () => {
  it('shows a bell that opens the panel', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getByRole('complementary', { name: 'Notifications' })).toBeTruthy()
  })

  it('renders exactly one panel when open', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getAllByRole('complementary', { name: 'Notifications' })).toHaveLength(1)
  })

  it('reports a seeded task that is due soon', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Notifications/ }))
    const panel = screen.getByRole('complementary', { name: 'Notifications' })
    // Scoped to the panel: the same title also appears on a board card.
    expect(within(panel).getByText('Welcome to ReveLith Tasks')).toBeTruthy()
  })

  it('opens the task from a notification', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Notifications/ }))
    const panel = screen.getByRole('complementary', { name: 'Notifications' })
    await user.click(within(panel).getByText('Welcome to ReveLith Tasks'))
    expect(screen.getByLabelText('Task title')).toBeTruthy()
  })

  it('shows a count badge on the bell', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /Notifications: \d+/ })).toBeTruthy()
  })

  it('says so when nothing needs attention', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const clean = seedBoard()
    // Clear due dates and relations so no signal remains at all.
    for (const task of clean.tasks) {
      task.dueDate = null
      task.parentId = null
    }
    clean.relations = []
    window.localStorage.setItem(defaultStorageKey(), JSON.stringify(serializeDocument(clean)))

    render(<App />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByText('Nothing needs attention.')).toBeTruthy()
  })
})

describe('keyboard shortcuts', () => {
  it('opens the new task dialog with n', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.keyboard('n')
    expect(await screen.findByPlaceholderText('What needs doing?')).toBeTruthy()
  })

  it('does not type n into a text field', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    const search = screen.getByLabelText('Search tasks')
    await user.click(search)
    await user.keyboard('n')
    expect(screen.queryByPlaceholderText('What needs doing?')).toBeNull()
    expect((search as HTMLInputElement).value).toBe('n')
  })

  it('focuses search with /', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.keyboard('/')
    expect(document.activeElement).toBe(screen.getByLabelText('Search tasks'))
  })

  it('closes the open task with Escape', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.dblClick(screen.getByText('Create a project'))
    expect(screen.getByLabelText('Task title')).toBeTruthy()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByLabelText('Task title')).toBeNull())
  })

  it('moves the open task into a column with a number key', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.dblClick(screen.getByText('Create a project'))
    // Columns are Backlog, In Progress, Review, Done.
    await user.keyboard('4')
    await waitFor(() => {
      const done = document.querySelector('section[aria-label="Done"]') as HTMLElement
      expect(within(done).getByText('Create a project')).toBeTruthy()
    })
  })

  it('shows the shortcut help with ?', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.keyboard('?')
    expect(await screen.findByText(/Keyboard shortcuts/)).toBeTruthy()
    expect(screen.getByText(`Keyboard shortcuts (${SHORTCUT_HELP.length})`)).toBeTruthy()
    expect(screen.getByText('Move the open task to that column')).toBeTruthy()
  })

  it('undoes with the u key', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'New task' }))
    await user.type(screen.getByPlaceholderText('What needs doing?'), 'Keyboard undo')
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    await user.keyboard('u')
    await waitFor(() => expect(screen.queryByText('Keyboard undo')).toBeNull())
  })
})

describe('attachments', () => {
  it('shows the attachment section with no files', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.dblClick(screen.getByText('Create a project'))
    expect(screen.getByText(/Attachments \(0\)/)).toBeTruthy()
    expect(screen.getByText('No files')).toBeTruthy()
  })

  it('stores a chosen file in IndexedDB and on the task', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.dblClick(screen.getByText('Create a project'))

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText('Choose files to attach'), file)

    expect(await screen.findByText('notes.txt')).toBeTruthy()
    await waitFor(async () => expect(await listBlobIds()).toHaveLength(1))
    const blob = await getBlob((await listBlobIds())[0])
    expect(await blob!.text()).toBe('notes')
  })

  it('removes an attachment and deletes its blob', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    render(<App />)
    await user.dblClick(screen.getByText('Create a project'))

    const file = new File(['data'], 'data.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText('Choose files to attach'), file)
    expect(await screen.findByText('data.txt')).toBeTruthy()

    // Each attachment card has a Save and a remove button.
    const remove = screen.getAllByRole('button', { name: '✕' }).at(-1) as HTMLButtonElement
    await user.click(remove)
    await waitFor(async () => expect(await listBlobIds()).toHaveLength(0))
  })
})
