/**
 * Windows Explorer shell menu ("Open with ReveLith").
 *
 * Install path: the NSIS installer registers the verbs
 * (apps/shell/build/installer.nsh, via nsis.include). This module is the
 * runtime repair path for packaged runs whose keys are missing anyway
 * (portable exe, moved install directory), plus the testable source of the
 * key/command shapes both paths share.
 *
 * Verb location (per install mode, HKCU or HKLM — SHCTX in the installer,
 * HKCU here since a running app can always write its own user hive):
 *   Software\Classes\SystemFileAssociations\.<ext>\shell\ReveLith
 *     (Default) = "Open with ReveLith"
 *     Icon      = "<exe>,0"
 *     command\(Default) = "<exe>" "%1"
 *
 * SystemFileAssociations verbs never steal the default association; they
 * only add the right-click entry. Everything is keyed off reg.exe, so there
 * are no native dependencies. Electron-free on purpose (platform/packaged
 * are parameters) so vitest can exercise it on any OS.
 */
import { execFile } from 'node:child_process'

/**
 * Formats with an "Open with ReveLith" verb. Must stay in sync with
 * fileAssociations in electron-builder.cjs, installer.nsh, and the
 * supported-file regexes in index.ts (docx/xlsx/xls/csv/pptx/pdf/md/markdown).
 */
export const SHELL_MENU_EXTS = [
  'docx',
  'xlsx',
  'xls',
  'csv',
  'pptx',
  'pdf',
  'md',
  'markdown',
] as const

export type ShellMenuExt = (typeof SHELL_MENU_EXTS)[number]

export const SHELL_VERB_NAME = 'ReveLith'
export const SHELL_VERB_LABEL = 'Open with ReveLith'

export type RegRunner = (args: string[]) => Promise<{ stdout: string }>

function defaultRunner(args: string[]): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile('reg', args, { windowsHide: true }, (err, stdout) => {
      if (err) reject(err)
      else resolve({ stdout: String(stdout) })
    })
  })
}

/** HKCU path of the verb key for an extension (reg.exe wants the HKCU prefix). */
export function shellVerbKey(ext: ShellMenuExt): string {
  return `HKCU\\Software\\Classes\\SystemFileAssociations\\.${ext}\\shell\\${SHELL_VERB_NAME}`
}

/** Command line stored under the verb's command key; quotes survive spaces. */
export function shellVerbCommand(exePath: string): string {
  return `"${exePath}" "%1"`
}

export function shellVerbIcon(exePath: string): string {
  return `${exePath},0`
}

/**
 * Read a `reg query <key> /ve` default value. Only the REG_SZ payload is
 * matched, so non-English reg.exe locales ((Standard), (Predeterminado), …)
 * parse the same as English ((Default)).
 */
export function parseRegDefault(stdout: string): string | null {
  const match = String(stdout).match(/REG_SZ\s+(.+?)\s*$/m)
  return match ? match[1].trim() : null
}

async function queryDefault(
  runner: RegRunner,
  key: string,
): Promise<string | null> {
  try {
    const { stdout } = await runner(['query', key, '/ve'])
    return parseRegDefault(stdout)
  } catch {
    return null
  }
}

/** True when every verb key exists (and launches exePath, when given). */
export async function isShellMenuRegistered(
  options: { exePath?: string; runner?: RegRunner; platform?: NodeJS.Platform } = {},
): Promise<boolean> {
  const { exePath, runner = defaultRunner, platform = process.platform } = options
  if (platform !== 'win32') return false
  const wantCommand = exePath ? shellVerbCommand(exePath).toLowerCase() : null
  for (const ext of SHELL_MENU_EXTS) {
    const key = shellVerbKey(ext)
    const label = await queryDefault(runner, key)
    if (label !== SHELL_VERB_LABEL) return false
    if (wantCommand !== null) {
      const command = await queryDefault(runner, `${key}\\command`)
      if (!command || command.toLowerCase() !== wantCommand) return false
    }
  }
  return true
}

/** Create/overwrite the verb keys. Per-key errors abort (caller decides). */
export async function registerShellMenu(
  options: { exePath: string; runner?: RegRunner; platform?: NodeJS.Platform } = {
    exePath: process.execPath,
  },
): Promise<void> {
  const { exePath, runner = defaultRunner, platform = process.platform } = options
  if (platform !== 'win32') return
  const label = SHELL_VERB_LABEL
  const icon = shellVerbIcon(exePath)
  const command = shellVerbCommand(exePath)
  for (const ext of SHELL_MENU_EXTS) {
    const key = shellVerbKey(ext)
    await runner(['add', key, '/ve', '/d', label, '/f'])
    await runner(['add', key, '/v', 'Icon', '/d', icon, '/f'])
    await runner(['add', `${key}\\command`, '/ve', '/d', command, '/f'])
  }
}

/** Remove the verb keys. Missing keys are fine (reg.exe errors swallowed). */
export async function unregisterShellMenu(
  options: { runner?: RegRunner; platform?: NodeJS.Platform } = {},
): Promise<void> {
  const { runner = defaultRunner, platform = process.platform } = options
  if (platform !== 'win32') return
  for (const ext of SHELL_MENU_EXTS) {
    try {
      await runner(['delete', shellVerbKey(ext), '/f'])
    } catch {
      // already gone : nothing to remove
    }
  }
}

export type EnsureShellMenuStatus = 'already' | 'registered' | 'skipped' | 'failed'

/**
 * Repair-only entry point for app startup: registers the verbs when (and
 * only when) they are missing or point at another exe. Never throws;
 * no-ops outside packaged Windows runs.
 */
export async function ensureShellMenu(
  options: {
    exePath?: string
    packaged?: boolean
    runner?: RegRunner
    platform?: NodeJS.Platform
  } = {},
): Promise<EnsureShellMenuStatus> {
  const {
    exePath = process.execPath,
    packaged = false,
    runner = defaultRunner,
    platform = process.platform,
  } = options
  if (platform !== 'win32' || !packaged) return 'skipped'
  try {
    if (await isShellMenuRegistered({ exePath, runner, platform })) return 'already'
    await registerShellMenu({ exePath, runner, platform })
    return 'registered'
  } catch {
    return 'failed'
  }
}
