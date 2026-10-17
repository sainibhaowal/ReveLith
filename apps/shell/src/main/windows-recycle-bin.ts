import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Windows fallback for Electron's shell.trashItem when SHFileOperation fails
 * on folder entries. The path is passed through a child-process environment
 * variable (never interpolated into PowerShell source), and NoDialogs keeps the
 * already-confirmed UI action from opening a second native prompt.
 */
export function moveToWindowsRecycleBin(targetPath: string): Promise<void> {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    "$target = [Environment]::GetEnvironmentVariable('REVELITH_TRASH_TARGET')",
    "if ([string]::IsNullOrWhiteSpace($target)) { throw 'Missing recycle target' }",
    '[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($target, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)',
    "if ([System.IO.Directory]::Exists($target) -or [System.IO.File]::Exists($target)) { throw 'The item remains after the recycle operation' }",
  ].join('; ')
  const env: NodeJS.ProcessEnv = { REVELITH_TRASH_TARGET: targetPath }
  for (const key of [
    'PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE',
    'LOCALAPPDATA', 'APPDATA', 'HOMEDRIVE', 'HOMEPATH',
  ]) {
    const value = process.env[key]
    if (value) env[key] = value
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-Command', script],
      { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    )
    let stderr = ''
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(new Error('Timed out while sending the folder to the Recycle Bin'))
    }, 30_000)
    timer.unref()
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4_000)
    })
    child.once('error', (error) => finish(error))
    child.once('close', (code, signal) => {
      if (code === 0 && !existsSync(targetPath)) return finish()
      const detail = stderr.trim()
      finish(new Error(detail || `Recycle Bin operation failed (${signal ?? code ?? 'unknown'})`))
    })
  })
}
