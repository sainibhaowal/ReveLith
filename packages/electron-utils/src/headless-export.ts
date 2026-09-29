/**
 * Headless export helpers for a renderer bundle (no Electron import: this file
 * is loaded by the renderer, which has no `require('electron')`).
 *
 * Flow, shared by every module that can export without a window (docs, sheets,
 * slides, markdown, html): the main process opens a hidden window on its own
 * renderer build, hands it a target through a consume channel, and waits for
 * the report. The renderer waits for its document to be ready, runs the same
 * export the File menu runs, and reports success or the failure reason.
 */

/** Output format of a headless export. */
export type HeadlessExportFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'html' | 'md'

/** What the main process queued for a hidden export window. */
export interface HeadlessExportTarget {
  /** absolute path to write; the renderer skips the save dialog for it */
  outPath: string
  format: HeadlessExportFormat
  /** the document the hidden window must open, when the export is file-backed */
  inputPath?: string
}

/** Report the renderer sends back; the main process quits on it. */
export interface HeadlessExportReport {
  ok: boolean
  error?: string
}

/** Readiness probe: return true once the document is usable, throw to fail. */
export type HeadlessReadinessProbe = () => boolean

export interface PollOptions {
  /** delay between probes, ms */
  intervalMs?: number
  /** give up after this long, ms */
  timeoutMs?: number
}

/**
 * Poll `probe` until it returns true. Throws `reason` (or a timeout message) so
 * the caller can hand a human-readable failure straight to the main process.
 */
export function pollUntilReady(
  probe: HeadlessReadinessProbe,
  reason = 'the document did not become ready',
  options: PollOptions = {},
): Promise<void> {
  const interval = options.intervalMs ?? 120
  const timeout = options.timeoutMs ?? 60_000
  const startedAt = Date.now()
  return new Promise<void>((resolve, reject) => {
    const tick = () => {
      let ready: boolean
      try {
        ready = probe()
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
        return
      }
      if (ready) {
        resolve()
        return
      }
      if (Date.now() - startedAt > timeout) {
        reject(new Error(`${reason} (timed out after ${timeout}ms)`))
        return
      }
      setTimeout(tick, interval)
    }
    tick()
  })
}

/**
 * Wait for the document, run `runExport`, and resolve with the report the main
 * process expects. Never throws: a readiness or export failure becomes
 * `{ok:false,error}`. The readiness step is a thunk so a caller can hand over
 * its own polling loop (or a single synchronous check) without wrapping it in a
 * promise it would have to create eagerly.
 */
export async function runHeadlessRendererExport(
  outPath: string,
  waitUntilReady: () => Promise<void>,
  runExport: (outPath: string) => Promise<boolean>,
): Promise<HeadlessExportReport> {
  try {
    await waitUntilReady()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  try {
    const written = await runExport(outPath)
    if (!written) return { ok: false, error: 'the export did not write a file' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
