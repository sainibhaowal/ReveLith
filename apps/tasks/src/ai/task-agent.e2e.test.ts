import { describe, expect, it } from 'vitest'
import { AgentLoop, type AgentStreamRequest, type AgentTransport } from '@revelith/agent-core'
import { BoardStore } from '../store/store'
import { boardWithProject } from '../test/fixtures'
import { createSkill } from './agent'

describe('Tasks agent loop end to end', () => {
  it('expands from focused tools, then forces a native read-back before completion', async () => {
    const store = new BoardStore(boardWithProject())
    const taskSkill = createSkill(store)
    const prompt = 'Create a high-priority task named Ship release notes.'
    const initialTools = taskSkill.toolsForRequest!(prompt)
    const requests: AgentStreamRequest[] = []
    let continuationEnabled = false

    const transport: AgentTransport = {
      stream(request, callbacks) {
        requests.push(request)
        const turn = requests.length - 1
        queueMicrotask(() => {
          if (turn === 0) {
            callbacks.onToolCall({
              id: 'create-release-notes',
              name: 'create_task',
              input: { title: 'Ship release notes', priority: 'high' },
            })
          } else if (turn === 1) {
            // The verifier must reject this premature completion because the
            // board has changed but has not been reread yet.
            callbacks.onDelta('Created the release-notes task.')
          } else if (turn === 2) {
            callbacks.onToolCall({
              id: 'verify-board',
              name: 'list_tasks',
              input: { ticket: true },
            })
          } else {
            callbacks.onDelta(
              'Created Ship release notes as high priority and verified it on the board.',
            )
          }
          callbacks.onDone()
        })
        return { cancel: () => undefined }
      },
    }

    let resolveRun!: (value: { text: string; cancelled: boolean; turnLimit: boolean }) => void
    const completed = new Promise<{ text: string; cancelled: boolean; turnLimit: boolean }>(
      (resolve) => {
        resolveRun = resolve
      },
    )
    const loop = new AgentLoop({
      transport,
      skill: {
        id: taskSkill.id,
        systemPrompt: taskSkill.systemPrompt,
        get tools() {
          if (!continuationEnabled) return initialTools
          return [
            ...new Map(
              [...initialTools, ...(taskSkill.continuationTools ?? [])].map((tool) => [
                tool.name,
                tool,
              ]),
            ).values(),
          ]
        },
        buildContext: taskSkill.buildContext,
        executeTool: taskSkill.executeTool,
        verifyResponse: taskSkill.verifyResponse,
      },
      events: {
        onDone: resolveRun,
        onToolExecuted: () => {
          continuationEnabled = true
        },
      },
      compaction: false,
      maxTurns: 6,
    })

    loop.run(prompt)
    const result = await Promise.race([
      completed,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tasks verification run did not finish')), 5000),
      ),
    ])

    expect(result).toMatchObject({ cancelled: false, turnLimit: false })
    expect(result.text).toContain('verified')
    expect(requests).toHaveLength(4)
    expect(requests[0]!.tools.map((tool) => tool.name)).toContain('create_task')
    expect(requests[0]!.tools.map((tool) => tool.name)).not.toContain('board_summary')
    // This is the same focused-first / full-safe-follow-up policy used by the
    // shared AppChatPanel in production.
    expect(requests[1]!.tools.map((tool) => tool.name)).toContain('board_summary')
    expect(requests[1]!.tools.map((tool) => tool.name)).toContain('bulk_update_tasks')
    expect(requests[1]!.tools.map((tool) => tool.name)).not.toContain('delete_task')
    expect(store.getState().tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Ship release notes', priority: 'high' }),
      ]),
    )
  })
})
