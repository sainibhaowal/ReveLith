/**
 * Headless-export mode: a process started by the CLI to convert a file without
 * a window (`--headless-export`). Only a process flag decides this, so a normal
 * launch is never affected.
 */
const HEADLESS_FLAG = '--headless-export'

/** True when this process was started to export one file and exit. */
export function isHeadlessMode(): boolean {
  return process.argv.includes(HEADLESS_FLAG)
}

/** The `--headless-export=<format>` value, when the flag carries one. */
export function headlessExportFormatArg(): string | null {
  for (const arg of process.argv) {
    if (arg.startsWith(`${HEADLESS_FLAG}=`)) return arg.slice(HEADLESS_FLAG.length + 1)
  }
  return null
}
