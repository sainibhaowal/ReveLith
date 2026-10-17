import { describe, expect, it } from 'vitest'
import { verifyTaskResponse } from './task-agent-verify'

describe('task agent verification', () => {
  it('requires a board read after a task mutation', () => {
    expect(verifyTaskResponse('Done', [{ name: 'create_task', ok: true }])).toContain('list_tasks')
  })

  it('accepts a task mutation after a successful current-board read', () => {
    expect(verifyTaskResponse('Done', [
      { name: 'create_task', ok: true }, { name: 'list_tasks', ok: true },
    ])).toBeNull()
  })

  it('requires another read if a repair changes the board after verification', () => {
    expect(verifyTaskResponse('Done', [
      { name: 'create_task', ok: true }, { name: 'board_summary', ok: true },
      { name: 'link_tasks', ok: true },
    ])).toContain('board changed')
  })

  it('accepts the specific native read tools for related board changes', () => {
    expect(verifyTaskResponse('Done', [
      { name: 'create_member', ok: true }, { name: 'list_members', ok: true },
    ])).toBeNull()
    expect(verifyTaskResponse('Done', [
      { name: 'add_external_link', ok: true }, { name: 'list_external_links', ok: true },
    ])).toBeNull()
  })

  it('does not demand verification for a read-only answer or failed change', () => {
    expect(verifyTaskResponse('There are two tasks.', [{ name: 'list_tasks', ok: true }])).toBeNull()
    expect(verifyTaskResponse('Could not create it.', [{ name: 'create_task', ok: false }])).toBeNull()
  })
})

