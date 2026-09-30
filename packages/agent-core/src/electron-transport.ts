import type {
  AgentStreamRequest,
  AgentToolCall,
  AgentToolDef,
  AgentTransport,
  AgentMessage,
} from './types'

/**
 * One streamed chunk pushed back over an Electron IPC bridge. Structurally
 * identical to ai-provider's AiStreamChunk; declared here so this package
 * stays dependency-free.
 */
export interface IpcStreamChunk {
  requestId: string
  /** 'ping' = wire-level keepalive; re-arms the silence watchdog and carries no payload;
   * 'reasoning' = model thinking delta (text carries it) */
  type: 'delta' | 'reasoning' | 'tool-call' | 'done' | 'error' | 'ping'
  text?: string
  toolCall?: AgentToolCall
  error?: string
  /** machine-readable error cause; maps to the localized timeout/credits/network/overloaded message */
  errorCode?: 'timeout' | 'credits' | 'network' | 'overloaded'
  /** normalized stop reason on 'done' ('max_tokens' = cut off by the token limit) */
  stopReason?: string
}

/** The request forwarded to the main process to start one streaming turn. */
export interface IpcStreamStart<S> {
  requestId: string
  /** Stable for the lifetime of one renderer-side transport. Providers with
   * native conversations can reuse it across the tool loop and follow-ups. */
  sessionId: string
  settings: S
  system: string
  messages: AgentMessage[]
  tools: AgentToolDef[]
}

/**
 * Renderer-side silence watchdog: the main process re-arms it with keepalive
 * pings on wire activity, so firing means the turn is dead (main-process stall,
 * lost chunks) and the run must fail instead of leaving the UI busy forever.
 * Longer than the main-process idle timeout (180s) so that one (localized) wins.
 */
export const IPC_STREAM_SILENCE_TIMEOUT_MS = 240_000

export interface IpcTransportOptions<S> {
  /** subscribe to stream chunks; returns the unsubscribe function */
  onStream(listener: (chunk: IpcStreamChunk) => void): () => void
  /** forward the start request to the main process; a returned promise reports handler failure */
  start(request: IpcStreamStart<S>): void | Promise<unknown>
  /** abort the in-flight turn in the main process */
  cancel(requestId: string): void
  getSettings(): S
  /** localized fallback when an error chunk carries no message */
  unknownErrorText(): string
  /** localized message for timeouts (errorCode 'timeout' and the silence watchdog) */
  timeoutErrorText?(): string
  /** localized message for exhausted credits (errorCode 'credits') */
  creditsErrorText?(): string
  /**
   * localized message for network connectivity failures (errorCode 'network',
   * and transport-level failures that never reached the main process). Without
   * it a raw transport message would surface in the chat UI.
   */
  networkErrorText?(): string
  /** localized message when the provider reports itself busy/overloaded */
  overloadedErrorText?(): string
}

/**
 * AgentTransport over an Electron IPC bridge: the main process talks to the
 * LLM providers (avoids renderer CORS) and streams chunks back per requestId.
 * Each app wires in its own preload bridge and i18n via the options.
 */
export function createIpcTransport<S>(options: IpcTransportOptions<S>): AgentTransport {
  const timeoutText = () => options.timeoutErrorText?.() ?? options.unknownErrorText()
  /**
   * A failure that never reached the model (bridge rejected, no handler, socket
   * gone) is a local/connection problem, not something the user can act on in
   * the provider's dashboard; only a real provider message is passed through.
   */
  const startFailureText = (err: unknown) =>
    err instanceof Error && err.message
      ? err.message
      : (options.networkErrorText?.() ?? options.unknownErrorText())
  const sessionId = crypto.randomUUID()
  return {
    stream(request: AgentStreamRequest, cb) {
      const requestId = crypto.randomUUID()
      let settled = false
      let silenceTimer: ReturnType<typeof setTimeout> | undefined
      const settle = () => {
        settled = true
        clearTimeout(silenceTimer)
        unsubscribe()
      }
      const fail = (error: string) => {
        if (settled) return
        settle()
        cb.onError(error)
      }
      const armSilence = () => {
        clearTimeout(silenceTimer)
        silenceTimer = setTimeout(() => {
          options.cancel(requestId)
          fail(timeoutText())
        }, IPC_STREAM_SILENCE_TIMEOUT_MS)
      }
      const unsubscribe = options.onStream((chunk) => {
        if (chunk.requestId !== requestId || settled) return
        if (chunk.type === 'ping') {
          armSilence()
        } else if (chunk.type === 'delta') {
          armSilence()
          cb.onDelta(chunk.text ?? '')
        } else if (chunk.type === 'reasoning') {
          armSilence()
          if (chunk.text) cb.onReasoning?.(chunk.text)
        } else if (chunk.type === 'tool-call') {
          armSilence()
          if (chunk.toolCall) cb.onToolCall(chunk.toolCall)
        } else if (chunk.type === 'done') {
          settle()
          if (chunk.stopReason) cb.onStopReason?.(chunk.stopReason)
          cb.onDone()
        } else {
          settle()
          if (chunk.errorCode === 'timeout') {
            cb.onError(timeoutText())
          } else if (chunk.errorCode === 'credits') {
            cb.onError(options.creditsErrorText?.() ?? chunk.error ?? options.unknownErrorText())
          } else if (chunk.errorCode === 'overloaded') {
            cb.onError(options.overloadedErrorText?.() ?? chunk.error ?? options.unknownErrorText())
          } else if (chunk.errorCode === 'network') {
            // connectivity failures get the localized wording when the app has one
            cb.onError(options.networkErrorText?.() ?? chunk.error ?? options.unknownErrorText())
          } else if (chunk.error) {
            cb.onError(chunk.error)
          } else {
            // no message came back: a dropped connection, not a provider refusal
            cb.onError(options.networkErrorText?.() ?? options.unknownErrorText())
          }
        }
      })
      armSilence()
      try {
        // a rejected/thrown start would otherwise leave the run pending until the watchdog
        Promise.resolve(
          options.start({
            requestId,
            sessionId,
            settings: options.getSettings(),
            system: request.system,
            messages: request.messages,
            tools: request.tools,
          }),
        ).catch((err: unknown) => {
          fail(startFailureText(err))
        })
      } catch (err) {
        fail(startFailureText(err))
      }
      return { cancel: () => options.cancel(requestId) }
    },
  }
}
