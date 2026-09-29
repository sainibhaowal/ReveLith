import type { AgentStreamHandle, AgentStreamRequest, AgentTransport } from './types'

/**
 * One tool-less streaming request whose reply body IS the payload (a JSON
 * brief, a whole HTML page, a long document). Tool-less on purpose: tool
 * arguments are buffered provider-side until the JSON is complete, so a
 * document-sized argument can sit silent long enough for a gateway to cut the
 * connection, while text deltas stream continuously.
 */

/** What the caller wants back after a completed turn. */
export interface StreamTextExtractResult {
  /** cleaned payload (fences/chatter stripped) */
  text: string
  /**
   * true when the payload looks finished, not truncated mid-way. A payload
   * with no recognizable terminator (a plain document, say) is taken as
   * complete unless the extractor says otherwise, so callers that do not track
   * structure can omit it.
   */
  complete?: boolean | undefined
}

export interface StreamTextOptions {
  transport: AgentTransport
  system: string
  user: string
  signal?: AbortSignal
  /** hard cap on accumulated characters; the stream is cancelled past it */
  maxChars?: number
  /** strip fences / chatter from the raw stream (called on every delta batch) */
  extract: (raw: string) => StreamTextExtractResult
  /** throttled progress: receives the cumulative extracted text */
  onProgress?(text: string): void
}

export type StreamTextOutcome =
  | { status: 'complete'; text: string }
  | {
      status: 'partial'
      text: string
      /** why the stream ended early */
      reason: 'error' | 'stopped' | 'max_tokens'
      error?: string
    }
  | { status: 'empty'; error: string }

/** Progress callbacks fire at most this often while deltas stream in. */
const PROGRESS_THROTTLE_MS = 120

/**
 * Stream one tool-less turn and resolve with the extracted payload.
 * Never throws: transport errors, aborts and the output cap all come back as a
 * discriminated result so callers can show partial work instead of a dead end.
 */
export function streamText(opts: StreamTextOptions): Promise<StreamTextOutcome> {
  const { transport, system, user, signal, maxChars, extract, onProgress } = opts
  return new Promise<StreamTextOutcome>((resolve) => {
    let raw = ''
    let settled = false
    let sawStopReason: string | undefined
    let lastError: string | undefined
    let aborted = signal?.aborted ?? false
    let capped = false
    let lastProgress = 0

    const finish = (outcome: StreamTextOutcome) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      resolve(outcome)
    }

    const publish = (force = false) => {
      if (!onProgress) return
      const now = Date.now()
      if (!force && now - lastProgress < PROGRESS_THROTTLE_MS) return
      lastProgress = now
      onProgress(extract(raw).text)
    }

    /** Runs the shared end-of-stream bookkeeping once the transport settles. */
    const settle = (status: 'done' | 'error') => {
      const { text, complete = true } = extract(raw)
      if (!text) {
        finish(
          status === 'error'
            ? { status: 'empty', error: lastError ?? 'the model returned no content' }
            : { status: 'empty', error: 'the model returned no content' },
        )
        return
      }
      if (status === 'done' && complete) {
        finish({ status: 'complete', text })
        return
      }
      const truncatedByLimit = sawStopReason === 'max_tokens' || capped
      const reason: 'error' | 'stopped' | 'max_tokens' =
        status === 'error' ? 'error' : truncatedByLimit ? 'max_tokens' : 'stopped'
      finish({ status: 'partial', text, reason, ...(lastError ? { error: lastError } : {}) })
    }

    // A transport that emits deltas synchronously (an already-replayed buffer)
    // can reach the cancel paths before `stream()` returns, so the handle lives
    // in a holder that is initialized before the call rather than in a `const`
    // whose binding would still be in the temporal dead zone.
    const live: { handle?: AgentStreamHandle } = {}
    live.handle = transport.stream(
      { system, messages: [{ role: 'user', text: user }], tools: [] } satisfies AgentStreamRequest,
      {
        onDelta: (delta) => {
          if (settled || aborted) return
          raw += delta
          if (maxChars !== undefined && raw.length > maxChars) {
            raw = raw.slice(0, maxChars)
            capped = true
            // a synchronous transport that already finished has no live handle; the
            // transport must still emit onDone, which settle() below consumes
            live.handle?.cancel()
            publish(true)
            settle('done')
            return
          }
          publish()
        },
        onToolCall: () => {
          // tool-less request: a stray call is ignored, the model only owes text
        },
        onStopReason: (reason) => {
          sawStopReason = reason
        },
        onDone: () => {
          if (settled) return
          if (capped || aborted) {
            settle('done')
            return
          }
          publish(true)
          settle('done')
        },
        onError: (error) => {
          if (settled) return
          lastError = error
          if (aborted) {
            settle('done')
            return
          }
          publish(true)
          settle('error')
        },
      },
    )

    function onAbort() {
      if (settled) return
      aborted = true
      live.handle?.cancel()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (aborted) onAbort()
  })
}
