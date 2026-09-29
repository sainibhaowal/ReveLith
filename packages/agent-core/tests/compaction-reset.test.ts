import { describe, expect, it, vi } from 'vitest'
import { AgentLoop } from '../src'
import type { AgentMessage, AgentSkill, AgentStreamCallbacks, AgentTransport } from '../src'

/**
 * Compaction runs a second, summarising request through the same transport.
 * This one is scripted by message content so a test can tell the summarising
 * call apart from the real turn, and hold the summary open while it asserts
 * what a concurrent reset() does to it.
 */
function compactionTransport(opts: {
  /** gate the summarising call until released */
  holdSummary?: boolean
  summary?: string
}) {
  let realTurns = 0
  const summaries: string[] = []
  const realRequests: string[] = []
  let releaseSummary: (() => void) | null = null
  let summarySeen = 0

  const transport: AgentTransport = {
    stream(request: { messages: AgentMessage[]; system: string }, cb: AgentStreamCallbacks) {
      const isSummary = request.system.includes('conversation compressor')
      if (isSummary) {
        summarySeen++
        summaries.push(request.system)
        const emit = (): void => {
          cb.onDelta(opts.summary ?? 'SUMMARY')
          cb.onDone()
        }
        if (opts.holdSummary) releaseSummary = emit
        else queueMicrotask(emit)
        return { cancel: () => undefined }
      }
      realTurns++
      // a tool-role message has results, not text
      const last = request.messages.at(-1)
      realRequests.push((last && last.role !== 'tool' ? last.text : '') ?? '')
      queueMicrotask(() => {
        cb.onDelta('answer')
        cb.onDone()
      })
      return { cancel: () => undefined }
    },
  }
  return {
    transport,
    summaries,
    realRequests,
    get realTurns() {
      return realTurns
    },
    get summarySeen() {
      return summarySeen
    },
    release: () => {
      const r = releaseSummary
      releaseSummary = null
      r?.()
    },
  }
}

const flush = async (n = 8) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0))
}

/** A skill whose context alone is enough to blow a tiny byte budget. */
function bulkySkill(): AgentSkill {
  return {
    id: 'test',
    systemPrompt: 'system',
    tools: [],
    buildContext: () => 'C'.repeat(400),
    executeTool: () => ({ output: 'ok', summary: 'x' }),
  }
}

/** Fill history past maxBytes so the next run compacts. */
async function grow(loop: AgentLoop, turns: number): Promise<void> {
  for (let i = 0; i < turns; i++) {
    loop.run(`message ${i}`)
    await flush()
  }
}

describe('compaction across a reset', () => {
  it('keeps history empty when reset cancels a pending summary', async () => {
    const t = compactionTransport({ holdSummary: true })
    const loop = new AgentLoop({
      transport: t.transport,
      skill: bulkySkill(),
      // a tiny budget so the second run always compacts
      compaction: { maxBytes: 200, keepRecentBytes: 80, disableLlmSummary: false },
      events: { onDone: vi.fn(), onError: vi.fn() },
    })

    await grow(loop, 2)
    expect(t.realTurns).toBeGreaterThan(0)
    expect(loop.messages.length).toBeGreaterThan(0)

    // start a run, then reset while its summarising request is still open
    loop.run('this will compact')
    await flush(2)
    expect(t.summarySeen).toBeGreaterThan(0)

    loop.reset()
    // the summary lands after the reset: it must not repopulate history
    t.release()
    await flush()

    expect(loop.messages).toEqual([])
    expect(loop.busy).toBe(false)
  })

  it('preserves a new conversation started right after a reset', async () => {
    const t = compactionTransport({ holdSummary: true })
    const loop = new AgentLoop({
      transport: t.transport,
      skill: bulkySkill(),
      compaction: { maxBytes: 200, keepRecentBytes: 80 },
      events: { onDone: vi.fn(), onError: vi.fn() },
    })

    await grow(loop, 2)
    loop.run('compacting run')
    await flush(2)

    loop.reset()
    loop.run('brand new question')
    t.release()
    await flush()

    // the new run's own turn is what history holds, and it is intact
    const users = loop.messages.filter((m) => m.role === 'user').map((m) => m.text)
    expect(users.some((u) => u.startsWith('brand new question'))).toBe(true)
  })

  it('retains the summary and recent messages when the conversation is not reset', async () => {
    const t = compactionTransport({ summary: 'EARLIER WORK SUMMARY' })
    const loop = new AgentLoop({
      transport: t.transport,
      skill: bulkySkill(),
      compaction: { maxBytes: 200, keepRecentBytes: 80 },
      events: { onDone: vi.fn(), onError: vi.fn() },
    })

    await grow(loop, 3)
    await flush()

    // compaction happened and its digest stayed in history
    expect(t.summarySeen).toBeGreaterThan(0)
    const dump = JSON.stringify(loop.messages)
    expect(dump).toContain('EARLIER WORK SUMMARY')
    // and the conversation is still usable afterwards
    expect(loop.busy).toBe(false)
  })

  it('can be disabled entirely', async () => {
    const t = compactionTransport({})
    const loop = new AgentLoop({
      transport: t.transport,
      skill: bulkySkill(),
      compaction: false,
      events: { onDone: vi.fn(), onError: vi.fn() },
    })
    await grow(loop, 3)
    await flush()
    expect(t.summarySeen).toBe(0)
  })
})
