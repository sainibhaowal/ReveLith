import { describe, expect, it, vi } from 'vitest'
import { streamText } from '../src/stream-text'
import type { AgentStreamCallbacks, AgentTransport } from '../src/types'

/**
 * Transport that records what was sent and lets a test drive the callbacks.
 * `auto` steps run on a microtask, so a test can script a whole turn.
 */
function fakeTransport(auto?: (cb: AgentStreamCallbacks) => void) {
  const calls: Array<{ system: string; messages: unknown[]; tools: unknown[] }> = []
  let cancels = 0
  let last: AgentStreamCallbacks | null = null
  const transport: AgentTransport = {
    stream(request, cb) {
      calls.push(request as never)
      last = cb
      if (auto) queueMicrotask(() => auto(cb))
      return {
        cancel: () => {
          cancels++
        },
      }
    },
  }
  return {
    transport,
    calls,
    // The callbacks are captured synchronously by stream(), so any test that
    // reads them has already started a request.
    current: (): AgentStreamCallbacks => {
      if (!last) throw new Error('the transport has not been asked to stream yet')
      return last
    },
    get cancels() {
      return cancels
    },
  }
}

/** Passthrough extractor: everything is the payload, always complete. */
const passthrough = (raw: string) => ({ text: raw, complete: true })

describe('streamText', () => {
  it('sends a tool-less request and returns the full text', async () => {
    const t = fakeTransport((cb) => {
      cb.onDelta('Hello')
      cb.onDelta(' world')
      cb.onDone()
    })
    const out = await streamText({
      transport: t.transport,
      system: 'sys',
      user: 'hi',
      extract: passthrough,
    })
    expect(out).toEqual({ status: 'complete', text: 'Hello world' })
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0].tools).toEqual([])
    expect(t.calls[0].messages).toEqual([{ role: 'user', text: 'hi' }])
    expect(t.calls[0].system).toBe('sys')
  })

  it('ignores a stray tool call: the reply body is the payload', async () => {
    const t = fakeTransport((cb) => {
      cb.onToolCall({ id: 'x', name: 'nope', input: {} })
      cb.onDelta('text only')
      cb.onDone()
    })
    const out = await streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      extract: passthrough,
    })
    expect(out).toEqual({ status: 'complete', text: 'text only' })
  })

  it('treats a payload with no terminator as complete', async () => {
    const t = fakeTransport((cb) => {
      cb.onDelta('# A whole document')
      cb.onDone()
    })
    const out = await streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      extract: (raw) => ({ text: raw }),
    })
    expect(out.status).toBe('complete')
  })

  it('honours an explicit complete:false over a normal stop reason', async () => {
    const t = fakeTransport((cb) => {
      cb.onDelta('half a json')
      cb.onStopReason?.('end_turn')
      cb.onDone()
    })
    const out = await streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      extract: (raw) => ({ text: raw, complete: false }),
    })
    // complete:false is the extractor's call, and end_turn does not override it
    expect(out).toMatchObject({ status: 'partial', reason: 'stopped' })
  })

  it('reports max_tokens as partial', async () => {
    const t = fakeTransport((cb) => {
      cb.onDelta('cut off')
      cb.onStopReason?.('max_tokens')
      cb.onDone()
    })
    const out = await streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      extract: (raw) => ({ text: raw, complete: false }),
    })
    expect(out).toMatchObject({ status: 'partial', reason: 'max_tokens' })
  })

  it('keeps partial text when the connection drops, and reports empty for no content', async () => {
    const dropped = fakeTransport((cb) => {
      cb.onDelta('half')
      cb.onError('socket closed')
    })
    expect(
      await streamText({
        transport: dropped.transport,
        system: 's',
        user: 'u',
        extract: passthrough,
      }),
    ).toMatchObject({ status: 'partial', text: 'half', reason: 'error', error: 'socket closed' })

    const nothing = fakeTransport((cb) => cb.onError('socket closed'))
    expect(
      await streamText({
        transport: nothing.transport,
        system: 's',
        user: 'u',
        extract: passthrough,
      }),
    ).toMatchObject({ status: 'empty' })
  })

  it('cancels on stop, keeps what arrived, and ignores later deltas', async () => {
    const controller = new AbortController()
    const t = fakeTransport()
    const pending = streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      signal: controller.signal,
      extract: passthrough,
    })
    t.current().onDelta('before stop')
    controller.abort()
    expect(t.cancels).toBe(1)
    // a transport that keeps talking after cancel must not resurrect the result
    t.current().onDelta(' after stop')
    t.current().onDone()
    expect(await pending).toMatchObject({ status: 'partial', text: 'before stop' })
  })

  it('does not start the transport when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const t = fakeTransport()
    const out = await streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      signal: controller.signal,
      extract: passthrough,
    })
    expect(out).toMatchObject({ status: 'empty' })
    // no request at all: a cancelled run must not be billed
    expect(t.calls).toHaveLength(0)
  })

  it('reports progress with the cumulative text', async () => {
    const onProgress = vi.fn()
    const t = fakeTransport((cb) => {
      cb.onDelta('one ')
      cb.onDelta('two')
      cb.onDone()
    })
    await streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      extract: passthrough,
      onProgress,
    })
    // the final forced publish always fires with the whole reply
    expect(onProgress).toHaveBeenCalled()
    expect(onProgress.mock.calls.at(-1)?.[0]).toBe('one two')
  })

  it('caps the reply and explains why', async () => {
    const t = fakeTransport((cb) => {
      cb.onDelta('0123456789')
      cb.onDone()
    })
    const out = await streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      maxChars: 4,
      extract: passthrough,
    })
    expect(out).toMatchObject({ status: 'partial', text: '0123', reason: 'max_tokens' })
    expect((out as { error?: string }).error).toContain('4')
    expect(t.cancels).toBeGreaterThan(0)
  })
})

describe('streamText guards', () => {
  /**
   * A cap that is not a usable positive number must fall back, not disable
   * itself. `NaN` is the dangerous one: it usually comes from a token
   * calculation, and `length > NaN` is false forever, so the stream would run
   * unbounded with no error anywhere.
   */
  it('falls back to a default cap for a NaN limit instead of never firing', async () => {
    const t = fakeTransport()
    const pending = streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      maxChars: Number.NaN,
      extract: passthrough,
    })
    // 200k+ chars: under a working cap this must stop, not accumulate
    t.current().onDelta('x'.repeat(250_000))
    t.current().onDone()
    const out = await pending
    expect(out.status).toBe('partial')
    expect((out as { text: string }).text.length).toBeLessThan(250_000)
  })

  it('falls back for a zero or negative limit rather than truncating to nothing', async () => {
    for (const maxChars of [0, -1]) {
      const t = fakeTransport((cb) => {
        cb.onDelta('real content')
        cb.onDone()
      })
      const out = await streamText({
        transport: t.transport,
        system: 's',
        user: 'u',
        maxChars,
        extract: passthrough,
      })
      expect(out).toEqual({ status: 'complete', text: 'real content' })
    }
  })

  it('falls back for an Infinity limit', async () => {
    const t = fakeTransport((cb) => {
      cb.onDelta('ok')
      cb.onDone()
    })
    const out = await streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      maxChars: Number.POSITIVE_INFINITY,
      extract: passthrough,
    })
    expect(out).toEqual({ status: 'complete', text: 'ok' })
  })

  it('settles with the raw reply when extract throws, instead of hanging', async () => {
    const t = fakeTransport((cb) => {
      cb.onDelta('the raw reply')
      cb.onDone()
    })
    const out = await streamText({
      transport: t.transport,
      system: 's',
      user: 'u',
      extract: () => {
        throw new Error('bad fence')
      },
    })
    // the payload is not lost, and the promise still settles
    expect(out).toMatchObject({ text: 'the raw reply' })
  })

  it('survives extract throwing on a progress callback too', async () => {
    const t = fakeTransport((cb) => {
      cb.onDelta('chunk')
      cb.onDone()
    })
    await expect(
      streamText({
        transport: t.transport,
        system: 's',
        user: 'u',
        extract: () => {
          throw new Error('bad fence')
        },
        onProgress: () => undefined,
      }),
    ).resolves.toBeDefined()
  })
})
