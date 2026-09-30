import { describe, expect, it, vi } from 'vitest'
import {
  AgentLoop,
  DEFAULT_MAX_TURNS,
  missingRequiredFields,
  runtimePreamble,
  TOOL_ABORTED_OUTPUT,
  type AgentMessage,
  type AgentSkill,
  type AgentStreamCallbacks,
  type AgentToolCall,
  type AgentToolResult,
  type AgentTransport,
  type ToolExecution,
} from '../src'

/** Transport scripted turn by turn, so a test can drive an exact sequence. */
function scriptedTransport(script: Array<(cb: AgentStreamCallbacks) => void>): AgentTransport & {
  requests: Array<{ tools: number }>
  systems: string[]
} {
  let turn = 0
  const transport = {
    requests: [] as Array<{ tools: number }>,
    systems: [] as string[],
    stream(
      request: { messages: AgentMessage[]; tools: unknown[]; system: string },
      cb: AgentStreamCallbacks,
    ) {
      transport.requests.push({ tools: request.tools.length })
      transport.systems.push(request.system)
      const step = script[turn++]
      if (step) queueMicrotask(() => step(cb))
      return { cancel: () => queueMicrotask(() => cb.onDone()) }
    },
  }
  return transport
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function makeSkill(over: Partial<AgentSkill> = {}): AgentSkill {
  return {
    id: 'test',
    systemPrompt: 'system',
    tools: [{ name: 'do_thing', description: 'd', inputSchema: { type: 'object' } }],
    executeTool: () => ({ output: 'ok', summary: 'done' }),
    ...over,
  }
}

/** A turn that calls the tool once and finishes. */
function toolTurn(input: Record<string, unknown> = { a: 1 }): (cb: AgentStreamCallbacks) => void {
  return (cb) => {
    cb.onToolCall({ id: 't1', name: 'do_thing', input })
    cb.onDone()
  }
}

/**
 * Turns whose tool input differs every time.
 *
 * Both degenerate-loop guards watch consecutive turns, and a script that emits
 * the same call with the same output every turn trips the identical-turn guard
 * at turn 3 — before an all-error streak can reach 8. A test for the all-error
 * guard therefore has to vary the call, which is also the real case it exists
 * for (a stream naming a different unknown tool each turn).
 */
function varyingToolTurns(n: number): Array<(cb: AgentStreamCallbacks) => void> {
  return Array.from({ length: n }, (_, i) => toolTurn({ a: i }))
}

function plainTurn(text = 'done'): (cb: AgentStreamCallbacks) => void {
  return (cb) => {
    cb.onDelta(text)
    cb.onDone()
  }
}

/** Last tool results the loop fed back, read from its own history. */
function toolResults(loop: AgentLoop): AgentToolResult[] {
  for (let i = loop.messages.length - 1; i >= 0; i--) {
    const m = loop.messages[i]
    if (m.role === 'tool') return m.results
  }
  return []
}

describe('runtimePreamble', () => {
  it('states today and the current year, zero-padded', () => {
    expect(runtimePreamble(new Date(2026, 8, 29))).toBe(
      "Today's date is 2026-09-29; the current year is 2026.\n\n",
    )
  })

  it('pads single-digit months and days', () => {
    expect(runtimePreamble(new Date(2027, 0, 5))).toContain('2027-01-05')
  })

  it('is prepended to the system prompt the transport receives', async () => {
    const transport = scriptedTransport([plainTurn()])
    const loop = new AgentLoop({ transport, skill: makeSkill() })
    loop.run('hi')
    await flush()
    expect(transport.systems[0]).toMatch(/^Today's date is \d{4}-\d{2}-\d{2}/)
    expect(transport.systems[0]).toContain('system')
  })

  it('keeps systemSuffix after the prompt', async () => {
    const transport = scriptedTransport([plainTurn()])
    const loop = new AgentLoop({
      transport,
      skill: makeSkill(),
      systemSuffix: () => '\nSUFFIX',
    })
    loop.run('hi')
    await flush()
    expect(transport.systems[0].endsWith('system\nSUFFIX')).toBe(true)
  })
})

describe('missingRequiredFields', () => {
  const tool = (required?: string[]) => ({
    name: 't',
    description: 'd',
    inputSchema: { type: 'object' as const, ...(required ? { required } : {}) },
  })

  it('returns nothing when every required field is present', () => {
    expect(missingRequiredFields(tool(['a', 'b']), { a: 1, b: 2 })).toEqual([])
  })

  it('lists the absent required fields', () => {
    expect(missingRequiredFields(tool(['a', 'b', 'c']), { a: 1 })).toEqual(['b', 'c'])
  })

  it('treats an explicit undefined as missing but null as present', () => {
    expect(missingRequiredFields(tool(['a', 'b']), { a: undefined, b: null })).toEqual(['a'])
  })

  it('accepts falsy-but-present values', () => {
    expect(missingRequiredFields(tool(['a', 'b', 'c']), { a: 0, b: '', c: false })).toEqual([])
  })

  it('returns nothing for an unknown tool or a schema with no required list', () => {
    expect(missingRequiredFields(undefined, {})).toEqual([])
    expect(missingRequiredFields(tool(), { a: 1 })).toEqual([])
  })

  it('is reported to the model instead of running the tool', async () => {
    const executeTool = vi.fn(() => ({ output: 'ran', summary: 'x' }))
    const transport = scriptedTransport([toolTurn({ a: 1 })])
    const loop = new AgentLoop({
      transport,
      skill: makeSkill({
        tools: [
          {
            name: 'do_thing',
            description: 'd',
            inputSchema: { type: 'object', required: ['path'] },
          },
        ],
        executeTool: executeTool as unknown as AgentSkill['executeTool'],
      }),
      events: { onDone: vi.fn() },
    })
    loop.run('go')
    await flush()
    // the tool that was missing its argument must not have run
    expect(executeTool).not.toHaveBeenCalled()
    const out = toolResults(loop)[0]?.output ?? ''
    expect(out).toContain('missing the required argument(s) "path"')
    expect(out).toContain('do_thing')
  })

  it('still executes when the required field is supplied', async () => {
    const executeTool = vi.fn(() => ({ output: 'ran', summary: 'x' }))
    const transport = scriptedTransport([toolTurn({ path: 'a' }), plainTurn()])
    const loop = new AgentLoop({
      transport,
      skill: makeSkill({
        tools: [
          {
            name: 'do_thing',
            description: 'd',
            inputSchema: { type: 'object', required: ['path'] },
          },
        ],
        executeTool: executeTool as unknown as AgentSkill['executeTool'],
      }),
      events: { onDone: vi.fn() },
    })
    loop.run('go')
    await flush()
    expect(executeTool).toHaveBeenCalledTimes(1)
  })
})

describe('turn budget', () => {
  it('exports a shared default rather than an inline literal', () => {
    expect(DEFAULT_MAX_TURNS).toBe(100)
  })

  it('allows more than 8 turns by default', async () => {
    // 12 mutating turns plus a closing text turn: a document task legitimately
    // needs this many, and the old inline default of 8 would have cut it off.
    // Each turn mutates, so the identical-turn guard correctly stands aside.
    const onError = vi.fn()
    const loop = new AgentLoop({
      transport: scriptedTransport(varyingToolTurns(12).concat(plainTurn())),
      skill: makeSkill({
        executeTool: () => ({ output: 'ok', summary: 'done', mutated: true }),
      }),
      events: { onDone: vi.fn(), onError },
    })
    loop.run('go')
    for (let i = 0; i < 60; i++) await flush()
    expect(onError).not.toHaveBeenCalled()
    expect(loop.busy).toBe(false)
  })

  it('still honours an explicit maxTurns override', async () => {
    const loop = new AgentLoop({
      transport: scriptedTransport(varyingToolTurns(20)),
      skill: makeSkill({
        executeTool: () => ({ output: 'ok', summary: 'done', mutated: true }),
      }),
      maxTurns: 3,
      events: { onDone: vi.fn(), onError: vi.fn() },
    })
    loop.run('go')
    for (let i = 0; i < 40; i++) await flush()
    // the budget forces a final no-tools turn, so the run must end
    expect(loop.busy).toBe(false)
  })
})

describe('all-error guard', () => {
  it('aborts after 8 consecutive turns in which every tool failed', async () => {
    const onError = vi.fn()
    const loop = new AgentLoop({
      // varying calls, so this is the all-error guard and not the identical one
      transport: scriptedTransport(varyingToolTurns(20)),
      skill: makeSkill({ executeTool: () => ({ output: 'nope', isError: true, summary: 'x' }) }),
      events: { onDone: vi.fn(), onError },
    })
    loop.run('go')
    for (let i = 0; i < 60; i++) await flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatch(/Every tool call failed for 8 turns/)
    expect(loop.busy).toBe(false)
  })

  it('resets the streak after a turn that had any success', async () => {
    let call = 0
    const onError = vi.fn()
    const loop = new AgentLoop({
      transport: scriptedTransport(varyingToolTurns(20)),
      // fail 7, succeed, fail 7: the streak must never reach 8
      skill: makeSkill({
        executeTool: () => {
          call++
          const ok = call === 8 || call === 16
          return { output: ok ? 'ok' : 'nope', isError: !ok, summary: 'x' }
        },
      }),
      events: { onDone: vi.fn(), onError },
    })
    loop.run('go')
    for (let i = 0; i < 60; i++) await flush()
    expect(onError).not.toHaveBeenCalled()
  })

  it('does not carry a streak into the next run', async () => {
    const onError = vi.fn()
    const skill = makeSkill({
      executeTool: () => ({ output: 'nope', isError: true, summary: 'x' }),
    })
    const transport = scriptedTransport(varyingToolTurns(20))
    const loop = new AgentLoop({
      transport,
      skill,
      events: { onDone: vi.fn(), onError },
    })
    loop.run('first')
    for (let i = 0; i < 60; i++) await flush()
    expect(onError).toHaveBeenCalledTimes(1)
    // 8 model requests to reach the threshold
    expect(transport.requests).toHaveLength(8)

    // The counters must be per-run. A leaked streak is still sitting at the
    // threshold, so a second run would abort after a single turn instead of
    // eight — which is what the request count below distinguishes. (Counting
    // macrotasks cannot tell the two apart here: the whole eight-turn streak
    // drains inside one tick.)
    loop.run('second')
    for (let i = 0; i < 60; i++) await flush()
    expect(onError).toHaveBeenCalledTimes(2)
    expect(transport.requests).toHaveLength(16)
  })
})

describe('identical-turn guard', () => {
  it('aborts after 3 byte-identical turns that changed nothing', async () => {
    const onError = vi.fn()
    const loop = new AgentLoop({
      transport: scriptedTransport(Array.from({ length: 20 }, () => toolTurn())),
      // no mutation, constant output: a model stuck in a loop
      skill: makeSkill({ executeTool: () => ({ output: 'same', summary: 'x' }) }),
      events: { onDone: vi.fn(), onError },
    })
    loop.run('go')
    for (let i = 0; i < 60; i++) await flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatch(/repeating the exact same turn/)
  })

  it('exempts a turn that mutated the artifact', async () => {
    // repeating an identical edit is legitimate progress, not a loop
    const onError = vi.fn()
    const loop = new AgentLoop({
      transport: scriptedTransport(Array.from({ length: 12 }, () => toolTurn())),
      skill: makeSkill({
        executeTool: () => ({ output: 'same', summary: 'x', mutated: true }),
      }),
      events: { onDone: vi.fn(), onError },
    })
    loop.run('go')
    for (let i = 0; i < 40; i++) await flush()
    expect(onError).not.toHaveBeenCalled()
  })

  it('breaks the streak when a tool output changes', async () => {
    // poll-style tools return different text each turn and must survive
    let n = 0
    const onError = vi.fn()
    const loop = new AgentLoop({
      transport: scriptedTransport(Array.from({ length: 12 }, () => toolTurn())),
      skill: makeSkill({
        executeTool: () => ({ output: `poll ${++n}`, summary: 'x' }),
      }),
      events: { onDone: vi.fn(), onError },
    })
    loop.run('go')
    for (let i = 0; i < 40; i++) await flush()
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('tool abort', () => {
  it('stops waiting for a tool that ignores the signal when the user cancels', async () => {
    const errors: unknown[] = []
    process.on('unhandledRejection', (e) => errors.push(e))
    // a tool that never settles and ignores the abort signal
    const skill = makeSkill({ executeTool: () => new Promise<ToolExecution>(() => {}) })
    const transport = scriptedTransport([toolTurn()])
    const onDone = vi.fn()
    const loop = new AgentLoop({ transport, skill, events: { onDone } })

    loop.run('go')
    await flush()
    expect(loop.busy).toBe(true)
    loop.cancel()
    for (let i = 0; i < 20; i++) await flush()

    // the run must finish rather than stay blocked on the dead tool
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true }))
    expect(loop.busy).toBe(false)
    // the abandoned promise must not surface as an unhandled rejection
    expect(errors).toEqual([])
  })

  it('records a distinct message for a tool aborted mid-flight', async () => {
    // a tool that settles after the abort must not be mistaken for a result
    const skill = makeSkill({
      executeTool: (_call: AgentToolCall, _signal?: AbortSignal) =>
        new Promise<ToolExecution>((resolve) => {
          setTimeout(() => resolve({ output: 'late result', summary: 'x' }), 20)
        }),
    })
    const transport = scriptedTransport([toolTurn(), toolTurn()])
    const loop = new AgentLoop({ transport, skill, events: { onDone: vi.fn() } })
    loop.run('go')
    await flush()
    loop.cancel()
    for (let i = 0; i < 30; i++) await flush()
    const outputs = toolResults(loop).map((r) => r.output)
    expect(outputs).toContain(TOOL_ABORTED_OUTPUT)
    expect(outputs).not.toContain('late result')
  })

  it('distinguishes a not-started tool from an aborted one', () => {
    expect(TOOL_ABORTED_OUTPUT).toMatch(/while this tool was still executing/)
    expect(TOOL_ABORTED_OUTPUT).not.toBe('(the user stopped the run; this tool was not executed)')
  })
})
