import type { AgentSkill } from './skill'
import type {
  AgentImage,
  AgentMessage,
  AgentStreamHandle,
  AgentToolCall,
  AgentToolDef,
  AgentToolResult,
  AgentTransport,
  ToolExecution,
} from './types'

export interface ToolExecutedEvent<TSnapshot> {
  call: AgentToolCall
  execution: ToolExecution
  /**
   * Snapshot captured just before this tool ran; present only on the first
   * mutating tool of a run (hook for one-click rollback UIs).
   */
  snapshotBefore?: TSnapshot | undefined
}

export interface AgentRunResult {
  /** final assistant text of the run ('' when cut off) */
  text: string
  cancelled: boolean
  /** true when maxTurns was reached; text is the partial answer from the no-tools finalizing turn */
  turnLimit: boolean
  /** the final turn hit the token limit (stop_reason max_tokens): text is incomplete; set only when true */
  truncated?: boolean
}

export interface AgentLoopEvents<TSnapshot> {
  /** cumulative assistant text of the current turn (call per delta) */
  onText?(text: string): void
  /** a tool is about to execute (UI shows a live "running" indicator; onToolExecuted always follows) */
  onToolStart?(call: AgentToolCall): void
  onToolExecuted?(event: ToolExecutedEvent<TSnapshot>): void
  /** a turn requested tools and they ran; the loop is going back to the model */
  onTurnEnd?(): void
  onDone?(result: AgentRunResult): void
  onError?(error: string): void
}

/** Context compaction config (budget tracked in UTF-8 bytes rather than message count) */
export interface CompactionOptions {
  /** History size that triggers compaction (UTF-8 bytes, default 256KB) */
  maxBytes?: number
  /** Size of recent messages kept after compaction (bytes, default 96KB, cut at a user boundary) */
  keepRecentBytes?: number
  /** Disable LLM summarization and use only the mechanical digest (for tests/offline) */
  disableLlmSummary?: boolean
}

export interface AgentLoopOptions<TSnapshot = unknown> {
  transport: AgentTransport
  skill: AgentSkill
  events?: AgentLoopEvents<TSnapshot>
  /** hard cap on model round-trips per run (default DEFAULT_MAX_TURNS) */
  maxTurns?: number
  /** history cap in messages, trimmed at user-turn boundaries (default 40) */
  maxHistory?: number
  /** Context compaction; false disables it (enabled by default with default thresholds) */
  compaction?: CompactionOptions | false
  /** capture rollback state; invoked right before tools run (see snapshotBefore) */
  captureSnapshot?(): TSnapshot
  /** wrap instruction + skill context into the user message text */
  formatUserMessage?(instruction: string, context: string): string
  /** appended to the system prompt each turn (e.g. reply-language directive following the UI language) */
  systemSuffix?(): string
}

const COMPACT_MAX_BYTES = 256 * 1024
const COMPACT_KEEP_RECENT_BYTES = 96 * 1024
/** Pre-truncation of each tool output in the summary request (the compaction request itself must not blow up on huge outputs) */
const SUMMARIZE_TOOL_OUTPUT_MAX = 2_000
const SUMMARIZE_TIMEOUT_MS = 30_000
/** When over budget mid-run, keep the last N tool messages verbatim and truncate earlier outputs to this length */
const STALE_TOOL_KEEP_RECENT = 2
const STALE_TOOL_OUTPUT_MAX = 1_000

/** Cap on consecutive tool-input parse failures (a successful parse resets it); abort beyond it (keeps the model from burning turns on bad JSON) */
const MAX_INPUT_PARSE_RETRIES = 3

/**
 * Default turn budget for a run, shared by every chat panel (an app may still
 * pass its own `maxTurns`).
 *
 * Named rather than inlined: this was previously a literal 8 duplicated at two
 * call sites, which meant the two could drift and neither was discoverable from
 * the outside. A long document task legitimately needs far more than 8 model
 * round-trips — the budget is a runaway backstop, not a working limit, and the
 * degenerate-loop guards below are what actually stop a stuck run early.
 */
export const DEFAULT_MAX_TURNS = 100

/**
 * Degenerate-loop guards. A weak model (a local endpoint or a BYOK provider
 * especially) can repeat the exact same turn forever, or keep issuing tool
 * calls that all fail. With a 100-turn budget those must abort early instead of
 * quietly consuming the whole budget.
 */
const MAX_IDENTICAL_TURNS = 3
const MAX_ALL_ERROR_TURNS = 8

const TURN_LIMIT_NOTE =
  '[System] The tool-call turn limit for this request has been reached; no more tools may be called this turn. ' +
  'Answer directly from the information already gathered; if the task is unfinished, briefly state what is done and what remains.'

/**
 * Tool result recorded when the run was stopped while this tool was still
 * executing. Distinct from the "not executed" message used for a tool that had
 * not started yet: here the work was genuinely in flight and its result thrown
 * away, and the model needs to know the difference so it does not assume the
 * tool never ran.
 */
export const TOOL_ABORTED_OUTPUT =
  '(the user stopped the run while this tool was still executing; its result was discarded)'

const TOOL_ABORTED = Symbol('tool-aborted')

/**
 * Wait for a tool, but stop waiting the moment the user aborts.
 *
 * A tool that honours the signal rejects on its own, but one that ignores it
 * (a long render, a shell-out, a buggy handler) would otherwise keep the run
 * blocked until it finished on its own — the UI looks stuck after Stop and the
 * run does not end. The in-flight promise is not cancelled (JavaScript cannot),
 * so its eventual rejection is swallowed to avoid an unhandled rejection.
 */
async function awaitToolOrAbort(
  tool: ToolExecution | Promise<ToolExecution>,
  signal: AbortSignal | undefined,
): Promise<ToolExecution | typeof TOOL_ABORTED> {
  if (!signal) return tool
  if (signal.aborted) return TOOL_ABORTED
  const running = Promise.resolve(tool)
  return new Promise<ToolExecution | typeof TOOL_ABORTED>((resolve, reject) => {
    const onAbort = (): void => {
      resolve(TOOL_ABORTED)
      running.catch(() => undefined)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    running.then(
      (execution) => {
        signal.removeEventListener('abort', onAbort)
        resolve(execution)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/**
 * Fields a tool's schema marks required but the model did not supply.
 *
 * Catching this before executing is what turns a silent no-op into a targeted
 * retry: a tool called with a missing argument would otherwise run, do nothing
 * useful, and report success.
 */
export function missingRequiredFields(
  tool: AgentToolDef | undefined,
  input: Record<string, unknown>,
): string[] {
  const required = tool?.inputSchema.required
  if (!Array.isArray(required)) return []
  return required.filter(
    (field): field is string => typeof field === 'string' && input[field] === undefined,
  )
}

/**
 * Date preamble prepended to the system prompt.
 *
 * A model with no clock resolves "next quarter" or "this year's report" against
 * its training cutoff, which is why date-sensitive requests come back anchored
 * to the wrong year. Exported so an app can reuse the same wording in its own
 * prompts rather than drifting from the loop's.
 */
export function runtimePreamble(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `Today's date is ${date}; the current year is ${now.getFullYear()}.\n\n`
}

/**
 * Terminal assistant text when tools mutated the artifact (or an edits-only
 * turn was restored) and the model returned no prose. Must be non-empty so
 * provider message converters never emit empty assistant content, which breaks
 * multi-turn follow-ups (see finishTurn / restore).
 * Exported so apps can substitute a localized / tool-derived summary in the UI.
 */
export const COMPLETED_VIA_TOOLS_TEXT = '(completed tool actions; no text reply)'

const SUMMARIZE_SYSTEM =
  'You are a conversation compressor. Compress this editing session between the user and the AI assistant into a concise summary so later turns can continue with context. ' +
  "Keep: the user's goals and key instructions, completed changes (which files/pages/elements were modified), important facts and data, and outstanding items. " +
  'For specific figures/statistics, mark their provenance: figures from the user or from tool results (e.g. web_search) keep their source; figures the assistant produced without a source must be marked "(unverified)" so later turns do not treat them as established facts. ' +
  'Omit: pleasantries, tool-call details, and intermediate trial and error. Use a bullet list of at most 400 words. Write the summary in the same language as the conversation. Output only the summary body, with no preamble.'

/** Prefix of the synthetic user message that carries the compacted-history summary */
const COMPACT_SUMMARY_PREFIX = '[Summary of earlier conversation'
const COMPACT_SUMMARY_HEADER = '[Summary of earlier conversation (auto-compacted)]'
const COMPACT_SUMMARY_ACK = 'Understood, continuing from the progress so far.'

/** Approximate UTF-8 byte count (ASCII 1 byte, CJK etc. 3; surrogate pairs count as 6 : slight overestimate is harmless) */
function utf8Size(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3
  }
  return n
}

/** Approximate byte cost of one message (text + tool inputs/outputs + image base64) */
function messageSize(m: AgentMessage): number {
  if (m.role === 'tool') {
    return m.results.reduce((n, r) => n + utf8Size(r.output) + 40, 0)
  }
  let n = utf8Size(m.text)
  if (m.role === 'user' && m.images) {
    n += m.images.reduce((s, img) => s + img.base64.length, 0)
  }
  if (m.role === 'assistant' && m.toolCalls) {
    for (const c of m.toolCalls) {
      try {
        n += utf8Size(JSON.stringify(c.input)) + 40
      } catch {
        n += 40
      }
    }
  }
  return n
}

function historySize(messages: readonly AgentMessage[]): number {
  return messages.reduce((n, m) => n + messageSize(m), 0)
}

/** Mechanical digest when LLM summarization is unavailable: bullet list of user instructions + final replies */
function mechanicalDigest(dropped: readonly AgentMessage[]): string {
  const lines: string[] = []
  for (const m of dropped) {
    if (m.role === 'user' && !m.text.startsWith(COMPACT_SUMMARY_PREFIX)) {
      lines.push(`- User: ${m.text.slice(0, 200)}`)
    } else if (m.role === 'assistant' && m.text && !m.toolCalls?.length) {
      lines.push(`  Reply: ${m.text.slice(0, 200)}`)
    }
  }
  return lines.join('\n').slice(0, 4_000) || '(earlier conversation omitted)'
}

/**
 * Generic ReAct loop: user message -> model turn (text + tool calls) ->
 * execute tools -> feed results back -> repeat until the model answers with
 * plain text. History persists across runs, so follow-up questions work.
 */
export class AgentLoop<TSnapshot = unknown> {
  private readonly options: AgentLoopOptions<TSnapshot>
  private history: AgentMessage[] = []
  private handle: AgentStreamHandle | null = null
  private running = false
  private cancelled = false
  private turns = 0
  /** Finalizing turn after hitting the turn limit: no tools, let the model answer from what it has read */
  private finalizing = false
  private mutationSeen = false
  private inputParseFails = 0
  /** tools executed this run (for response verification) */
  private runExecuted: { name: string; ok: boolean }[] = []
  /** response verification already ran once this run (caps it at one extra turn) */
  private verifyDone = false
  private turnStopReason: string | null = null
  private turnText = ''
  private toolCalls: AgentToolCall[] = []
  /** user message of the in-flight run; a failed run rolls it (and everything after) back out of history */
  private runUserMsg: AgentMessage | null = null
  /** invalidates stale transport callbacks after cancel/reset */
  private generation = 0
  /** per-run abort: aborted on cancel(); long tools (e.g. generate_deck) use it to break internal loops */
  private abortController: AbortController | null = null
  /** consecutive turns in which every tool call failed; a turn with any success resets it */
  private allErrorTurns = 0
  /** consecutive turns byte-identical to the one before (and which changed nothing) */
  private identicalTurns = 0
  /** signature of the last comparable turn, for the identical-turn guard */
  private lastTurnSig: string | null = null

  constructor(options: AgentLoopOptions<TSnapshot>) {
    this.options = options
  }

  get busy(): boolean {
    return this.running
  }

  get messages(): readonly AgentMessage[] {
    return this.history
  }

  /**
   * Seed the conversation with restored history (e.g. transcript reloaded from
   * disk when a document reopens), so follow-up instructions keep their context.
   * No-op unless the loop is idle with an empty history.
   * Old messages over the compaction budget fold into a mechanical digest
   * (no LLM request on restore, guaranteeing zero latency).
   */
  restore(messages: readonly AgentMessage[]): void {
    if (this.running || this.history.length > 0 || messages.length === 0) return
    // Edits-only runs persist an assistant message with no text; give it a placeholder
    // so the turn stays paired and providers never see an empty assistant content block
    const normalized = messages.map((m) =>
      m.role === 'assistant' && !m.text ? { ...m, text: COMPLETED_VIA_TOOLS_TEXT } : m,
    )
    // Unanswered user messages (a failed or interrupted run persisted them without a
    // reply) must not re-enter the model context: trailing ones would pair with the
    // next instruction as one turn, adjacent ones read as a combined instruction
    this.history = normalized.filter(
      (m, i) => m.role !== 'user' || (normalized[i + 1] && normalized[i + 1]!.role !== 'user'),
    )
    if (this.history.length === 0) return
    if (this.compactionEnabled()) {
      const { maxBytes, keepRecentBytes } = this.compactBudget()
      if (historySize(this.history) > maxBytes) {
        const cut = this.findCompactCut(keepRecentBytes)
        if (cut > 0) {
          const digest = mechanicalDigest(this.history.slice(0, cut))
          this.history = [
            { role: 'user', text: `${COMPACT_SUMMARY_HEADER}\n${digest}` },
            { role: 'assistant', text: COMPACT_SUMMARY_ACK },
            ...this.history.slice(cut),
          ]
        }
      }
    }
    this.trimHistory()
  }

  /** images: inline attachments for this user turn (vision input; see AgentImage) */
  run(instruction: string, images?: AgentImage[]): void {
    if (this.running || !instruction) return
    this.running = true
    this.cancelled = false
    this.turns = 0
    this.finalizing = false
    this.mutationSeen = false
    this.inputParseFails = 0
    // Guards are per-run: a streak that aborted the previous request must not
    // carry over and abort this one on its first turn
    this.allErrorTurns = 0
    this.identicalTurns = 0
    this.lastTurnSig = null
    this.runExecuted = []
    this.verifyDone = false
    this.abortController = new AbortController()
    const context = this.options.skill.buildContext?.() ?? ''
    const format =
      this.options.formatUserMessage ??
      ((instr: string, ctx: string) => (ctx ? `${instr}\n\n${ctx}` : instr))
    const userMsg: AgentMessage = {
      role: 'user',
      text: format(instruction, context),
      ...(images?.length ? { images } : {}),
    }
    void this.beginRun(userMsg)
  }

  /** Compact (if needed), push the user message, then start the turn. Compaction failure doesn't block the run. */
  private async beginRun(userMsg: AgentMessage): Promise<void> {
    const generation = this.generation
    try {
      await this.maybeCompact()
    } catch {
      // Proceed with the run even if compaction fails (an over-budget history only costs more, it's still correct)
    }
    if (generation !== this.generation) return // reset during compaction
    if (this.cancelled) {
      this.running = false
      this.options.events?.onDone?.({ text: '', cancelled: true, turnLimit: false })
      return
    }
    // Leftover unanswered user message (a previous run failed before replying):
    // drop it so the model never sees two adjacent user turns as one combined instruction
    while (this.history.at(-1)?.role === 'user') this.history.pop()
    this.trimHistory()
    if (userMsg.role === 'user') {
      userMsg = { ...userMsg, text: sanitizeAgentPayload(userMsg.text) }
    }
    this.runUserMsg = userMsg
    this.history.push(userMsg)
    this.startTurn()
  }

  /**
   * A run failed: remove its user message and every message after it, so the
   * failed instruction can't be silently re-executed by the next run.
   */
  private rollbackFailedRun(): void {
    const msg = this.runUserMsg
    this.runUserMsg = null
    if (!msg) return
    const i = this.history.lastIndexOf(msg)
    if (i >= 0) this.history.splice(i)
  }

  // ── Context compaction: fold old conversation into a summary, keep recent messages verbatim ──

  private compactionEnabled(): boolean {
    return this.options.compaction !== false
  }

  private compactBudget(): { maxBytes: number; keepRecentBytes: number } {
    const opt = this.options.compaction === false ? undefined : this.options.compaction
    return {
      maxBytes: opt?.maxBytes ?? COMPACT_MAX_BYTES,
      keepRecentBytes: opt?.keepRecentBytes ?? COMPACT_KEEP_RECENT_BYTES,
    }
  }

  /**
   * Find the compaction cut at a user boundary: accumulate from the tail up to keepRecentBytes.
   * Returns the start index of the kept segment; if no suitable boundary exists,
   * fall back to keeping the last user turn.
   */
  private findCompactCut(keepRecentBytes: number): number {
    let kept = 0
    let cut = -1
    for (let i = this.history.length - 1; i >= 0; i--) {
      kept += messageSize(this.history[i]!)
      if (kept > keepRecentBytes && cut >= 0) break
      if (this.history[i]!.role === 'user') cut = i
    }
    if (cut < 0) {
      for (let i = this.history.length - 1; i >= 0; i--) {
        if (this.history[i]!.role === 'user') return i
      }
    }
    return cut
  }

  private async maybeCompact(): Promise<void> {
    if (!this.compactionEnabled()) return
    const { maxBytes, keepRecentBytes } = this.compactBudget()
    if (historySize(this.history) <= maxBytes) return
    const cut = this.findCompactCut(keepRecentBytes)
    if (cut <= 0) return // no foldable prefix
    // A reset() while the summarising request is in flight must not resurrect
    // the conversation the user just discarded. beginRun checks the generation
    // after awaiting us, but that is too late: the write below has already
    // happened, so the summary and its ack would reappear in a fresh session.
    const generation = this.generation
    const dropped = this.history.slice(0, cut)
    const opt = this.options.compaction === false ? undefined : this.options.compaction
    let summary: string | null = null
    if (!opt?.disableLlmSummary) summary = await this.summarizeViaLlm(dropped)
    if (generation !== this.generation) return
    if (!summary) summary = mechanicalDigest(dropped)
    this.history = [
      { role: 'user', text: `${COMPACT_SUMMARY_HEADER}\n${summary}` },
      { role: 'assistant', text: COMPACT_SUMMARY_ACK },
      ...this.history.slice(cut),
    ]
  }

  /** Hand the folded conversation to the model for a summary; returns null on failure/timeout (falls back to the mechanical digest). */
  private summarizeViaLlm(dropped: readonly AgentMessage[]): Promise<string | null> {
    // Slim down the summary request itself: pre-truncate tool outputs, strip images
    const slim: AgentMessage[] = dropped.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          results: m.results.map((r) => ({
            ...r,
            output: r.output.slice(0, SUMMARIZE_TOOL_OUTPUT_MAX),
          })),
        }
      }
      if (m.role === 'user' && m.images?.length) return { role: 'user' as const, text: m.text }
      return m
    })
    return new Promise((resolve) => {
      let text = ''
      let settled = false
      const finish = (v: string | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(v)
      }
      const timer = setTimeout(() => finish(null), SUMMARIZE_TIMEOUT_MS)
      try {
        // Attach to this.handle so cancel() can abort the summary request when the user clicks stop
        this.handle = this.options.transport.stream(
          {
            system: SUMMARIZE_SYSTEM,
            messages: [
              ...slim,
              { role: 'user', text: 'Compress the conversation above as instructed.' },
            ],
            tools: [],
          },
          {
            onDelta: (t) => {
              text += t
            },
            onToolCall: () => {
              /* the summary turn gets no tools */
            },
            onDone: () => finish(text.trim() || null),
            onError: () => finish(null),
          },
        )
      } catch {
        finish(null)
      }
    })
  }

  /**
   * When over budget mid-run (between tool turns), truncate stale tool outputs:
   * keep structure (tool_use/tool_result pairs intact), cut content only,
   * and keep the most recent N verbatim.
   */
  private squashStaleToolOutputs(): void {
    if (!this.compactionEnabled()) return
    const { maxBytes } = this.compactBudget()
    if (historySize(this.history) <= maxBytes) return
    let recent = 0
    for (let i = this.history.length - 1; i >= 0; i--) {
      const m = this.history[i]!
      if (m.role !== 'tool') continue
      recent++
      if (recent <= STALE_TOOL_KEEP_RECENT) continue
      m.results = m.results.map((r) =>
        r.output.length > STALE_TOOL_OUTPUT_MAX
          ? {
              ...r,
              output: `${r.output.slice(0, STALE_TOOL_OUTPUT_MAX)}\n…(output truncated: too long)`,
            }
          : r,
      )
    }
  }

  cancel(): void {
    if (!this.running) return
    this.cancelled = true
    // abort lets long tools mid-execution (internal LLM loops etc.) stop promptly
    this.abortController?.abort()
    // the transport emits onDone after aborting, which finalizes the run
    this.handle?.cancel()
  }

  /** drop the conversation (e.g. when a different document is opened) */
  reset(): void {
    this.generation++
    this.abortController?.abort()
    this.handle?.cancel()
    this.handle = null
    this.running = false
    this.cancelled = false
    this.history = []
    this.runUserMsg = null
  }

  /** Runs at run boundaries only (restore / before a new user message): a long run's tail is all assistant/tool messages, and cutting mid-run would empty the request. */
  private trimHistory(): void {
    const max = this.options.maxHistory ?? 40
    if (this.history.length <= max) return
    // cut only at a user message so tool_use/tool_result pairs stay intact
    let i = this.history.length - max
    while (i < this.history.length && this.history[i]!.role !== 'user') i++
    if (i >= this.history.length) return // no user boundary in the window: keep history over budget
    const next = this.history.slice(i)
    if (this.runUserMsg && !next.includes(this.runUserMsg)) return
    this.history = next
  }

  private startTurn(): void {
    const generation = this.generation
    this.turnText = ''
    this.toolCalls = []
    this.turnStopReason = null
    // Some transports emit an extra onDone after cancel : this turn may finalize only once
    let settled = false
    this.handle = this.options.transport.stream(
      {
        system:
          // The model has no clock of its own, so date-relative requests
          // ("next quarter", "this year's report") otherwise resolve against its
          // training cutoff. Prepending the date is the cheapest fix.
          runtimePreamble() +
          this.options.skill.systemPrompt +
          (this.options.systemSuffix?.() ?? ''),
        messages: [...this.history],
        tools: this.finalizing ? [] : this.options.skill.tools,
      },
      {
        onDelta: (text) => {
          if (generation !== this.generation || settled) return
          this.turnText += text
          this.options.events?.onText?.(this.turnText)
        },
        onToolCall: (call) => {
          if (generation !== this.generation || settled) return
          this.toolCalls.push(call)
        },
        onStopReason: (reason) => {
          if (generation !== this.generation || settled) return
          this.turnStopReason = reason
        },
        onDone: () => {
          if (generation !== this.generation || settled) return
          settled = true
          void this.finishTurn()
        },
        onError: (error) => {
          if (generation !== this.generation || settled) return
          settled = true
          this.running = false
          this.rollbackFailedRun()
          this.options.events?.onError?.(error)
        },
      },
    )
  }

  private async finishTurn(): Promise<void> {
    const { events, skill, captureSnapshot } = this.options
    const toolCalls = this.toolCalls

    // final turn: no tools requested, the user stopped the run, or the
    // no-tools finalizing turn after hitting the limit
    // (a cancelled turn drops its tool calls : no results would follow)
    if (toolCalls.length === 0 || this.cancelled || this.finalizing) {
      // Response verification (claimed-action backstop): one extra turn max
      if (!this.cancelled && !this.finalizing && !this.verifyDone) {
        const correction = skill.verifyResponse?.(this.turnText, this.runExecuted)
        if (correction && this.turns < (this.options.maxTurns ?? DEFAULT_MAX_TURNS)) {
          this.verifyDone = true
          this.history.push({ role: 'assistant', text: this.turnText || COMPLETED_VIA_TOOLS_TEXT })
          this.history.push({ role: 'user', text: correction })
          this.turns++
          events?.onTurnEnd?.()
          this.startTurn()
          return
        }
      }
      // Models often end a tool-using run with an empty text turn ("I'm done").
      // Leaving assistant text empty in history then poisons the next user
      // prompt: Anthropic rejects empty content arrays, Gemini rejects empty
      // parts, and OpenAI-compatible routes send content:null with no tool_calls :
      // all of which make follow-up turns fail or return empty again (see
      // revelith#12 / #22: first prompt works, second shows "no summary").
      // Same normalization as restore(), applied unconditionally: cancelled and
      // read-only empty turns poison follow-ups just the same. onDone still
      // reports the raw turn text so app UIs keep their localized fallbacks
      // instead of surfacing this English placeholder.
      this.history.push({ role: 'assistant', text: this.turnText || COMPLETED_VIA_TOOLS_TEXT })
      this.running = false
      this.runUserMsg = null
      events?.onDone?.({
        text: this.turnText,
        cancelled: this.cancelled,
        turnLimit: this.finalizing,
        // set only when true so exact-shape consumers/tests stay unaffected
        ...(this.turnStopReason === 'max_tokens' && !this.cancelled ? { truncated: true } : {}),
      })
      return
    }

    this.history.push({ role: 'assistant', text: this.turnText, toolCalls })
    const generation = this.generation
    const results: AgentToolResult[] = []
    let turnMutated = false
    for (const call of toolCalls) {
      // The user hit stop while an earlier tool was running: skip remaining tools,
      // but fill in paired error results to keep tool_use/tool_result pairs valid for the next request
      if (this.cancelled) {
        results.push({
          id: call.id,
          name: call.name,
          output: '(the user stopped the run; this tool was not executed)',
          isError: true,
        })
        this.runExecuted.push({ name: call.name, ok: false })
        continue
      }
      // Unusable input: truncated by the token limit, JSON that failed to parse,
      // or a required argument the model simply omitted. Don't execute; feed a
      // targeted error back so the model retries correctly.
      const missing =
        call.truncated || call.inputError
          ? []
          : missingRequiredFields(
              skill.tools.find((t) => t.name === call.name),
              call.input,
            )
      if (call.truncated || call.inputError || missing.length > 0) {
        this.inputParseFails++
        const output = call.truncated
          ? 'Tool arguments were cut off by the output length limit; the tool was not executed. Split this operation into several smaller tool calls (less content per call) and try again.'
          : call.inputError
            ? `Tool input JSON failed to parse; the tool was not executed: ${call.inputError}\nFix the arguments (make sure quotes inside strings are escaped) and call again.`
            : `Required argument${missing.length > 1 ? 's are' : ' is'} missing (${missing.join(', ')}); the tool was not executed. Supply ${missing.length > 1 ? 'them' : 'it'} and call again.`
        results.push({ id: call.id, name: call.name, output, isError: true })
        this.runExecuted.push({ name: call.name, ok: false })
        events?.onToolExecuted?.({
          call,
          execution: { output, isError: true, summary: call.name },
        })
        continue
      }
      this.inputParseFails = 0
      events?.onToolStart?.(call)
      const snapshot = !this.mutationSeen ? captureSnapshot?.() : undefined
      let raced: ToolExecution | typeof TOOL_ABORTED
      try {
        // Race the tool against the abort signal so a tool that ignores the
        // signal cannot keep the run blocked after the user pressed stop
        raced = await awaitToolOrAbort(
          skill.executeTool(call, this.abortController?.signal),
          this.abortController?.signal,
        )
      } catch (e) {
        raced = {
          output: e instanceof Error ? e.message : String(e),
          isError: true,
          summary: call.name,
        }
      }
      if (generation !== this.generation) return // reset while a tool was running
      if (raced === TOOL_ABORTED) {
        const aborted: ToolExecution = {
          output: TOOL_ABORTED_OUTPUT,
          isError: true,
          summary: call.name,
        }
        this.runExecuted.push({ name: call.name, ok: false })
        results.push({ id: call.id, name: call.name, output: TOOL_ABORTED_OUTPUT, isError: true })
        events?.onToolExecuted?.({ call, execution: aborted })
        continue
      }
      const execution = raced
      const firstMutation = !!execution.mutated && !this.mutationSeen
      if (execution.mutated) {
        this.mutationSeen = true
        turnMutated = true
      }
      results.push({
        id: call.id,
        name: call.name,
        output: execution.output,
        isError: execution.isError,
      })
      this.runExecuted.push({ name: call.name, ok: !execution.isError })
      events?.onToolExecuted?.({
        call,
        execution,
        snapshotBefore: firstMutation ? snapshot : undefined,
      })
    }
    this.history.push({ role: 'tool', results })

    // Cancelled while tools were executing: finish immediately, no further model request
    if (this.cancelled) {
      this.running = false
      this.runUserMsg = null
      events?.onDone?.({ text: this.turnText, cancelled: true, turnLimit: false })
      return
    }

    // Bad-input retries hit the cap: abort instead of burning more turns
    if (this.inputParseFails >= MAX_INPUT_PARSE_RETRIES) {
      this.running = false
      this.rollbackFailedRun()
      events?.onError?.(
        `Tool input was unusable (unparseable, truncated or missing required arguments) ${MAX_INPUT_PARSE_RETRIES} times in a row; retries stopped, please send the request again`,
      )
      return
    }

    // A turn where every tool call failed makes no progress. A long streak —
    // an unknown-tool loop from a malformed local stream, a hallucinated tool
    // name — would otherwise re-error its way through the whole turn budget.
    this.allErrorTurns = results.every((r) => r.isError) ? this.allErrorTurns + 1 : 0
    if (this.allErrorTurns >= MAX_ALL_ERROR_TURNS) {
      this.running = false
      this.rollbackFailedRun()
      events?.onError?.(
        `Every tool call failed for ${MAX_ALL_ERROR_TURNS} turns in a row; the run was stopped. Please send the request again`,
      )
      return
    }

    // Identical-turn guard: a model re-emitting the same text, tool calls AND
    // tool outputs is looping, not progressing. Turns that mutated the artifact
    // are exempt — repeating an identical edit is legitimate progress — and a
    // changed tool output breaks the streak, so poll-style tools survive.
    const turnSig = JSON.stringify([
      this.turnText,
      toolCalls.map(({ name, input }) => [name, input]),
      results.map((r) => r.output),
    ])
    if (turnSig === this.lastTurnSig && !turnMutated) {
      if (++this.identicalTurns >= MAX_IDENTICAL_TURNS) {
        this.running = false
        this.rollbackFailedRun()
        events?.onError?.(
          'The model kept repeating the exact same turn without making progress; the run was stopped. Please send the request again',
        )
        return
      }
    } else {
      this.lastTurnSig = turnSig
      this.identicalTurns = 0
    }

    this.turns++
    if (this.turns >= (this.options.maxTurns ?? DEFAULT_MAX_TURNS)) {
      // Don't throw away the context already gathered: append one no-tools turn for a partial answer
      this.finalizing = true
      this.history.push({ role: 'user', text: TURN_LIMIT_NOTE })
    }
    // Long runs (e.g. page-by-page generation) over budget mid-way: truncate stale tool outputs so each turn doesn't resend a huge payload
    this.squashStaleToolOutputs()
    events?.onTurnEnd?.()
    this.startTurn()
  }
}

/**
 * Redact secret-looking tokens from an outgoing user message so accidentally
 * pasted API keys, URL credentials, and password assignments don't reach
 * remote model APIs verbatim.
 *
 * Imported from public PR #32 (BuiltByHarshil), with the credential pattern
 * narrowed to URL userinfo (scheme://user:pass@host) so ordinary "a:b@c"
 * prose is never rewritten.
 */
export function sanitizeAgentPayload(payload: string): string {
  return payload
    .replace(/\b(?:sk-|AIza|ghp_|secret_)[A-Za-z0-9_-]{16,}/g, '[REDACTED_API_KEY]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+):[^\s@/]+@/gi, '$1:[REDACTED_CREDENTIALS]@')
    .replace(
      /(password|passwd|secret_key|private_key)(\s*[:=]\s*)["'][^"']+["']/gi,
      '$1$2"[REDACTED_SECURE_TOKEN]"',
    )
}
