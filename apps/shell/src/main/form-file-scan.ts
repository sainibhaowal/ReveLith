import { app, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { accessSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

type ScanResult =
  | { status: 'clean' }
  | { status: 'threat'; detail: string }
  | { status: 'unavailable'; detail: string }

export function classifyDefenderResult(code: number | null, targetDetected: boolean): ScanResult {
  // MpCmdRun returns 2 both for detections and scan errors. Only a structured
  // Defender detection record for this exact, randomly named scan file is
  // enough to call it a threat; command text is localized and can mention
  // threats while also reporting that the scan failed.
  if (targetDetected)
    return {
      status: 'threat',
      detail: 'Microsoft Defender detected a threat. Do not use this file.',
    }
  if (code === 0) return { status: 'clean' }
  return {
    status: 'unavailable',
    detail:
      'Microsoft Defender could not confirm a clean result. Check Windows Security and try again.',
  }
}

function defenderPath(): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.resolve(null)
  const programData = process.env.ProgramData || 'C:\\ProgramData'
  const platformDir = join(programData, 'Microsoft', 'Windows Defender', 'Platform')
  return readdir(platformDir, { withFileTypes: true })
    .then((entries) => {
      const folders = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      const latest = folders.map((folder) => join(platformDir, folder, 'MpCmdRun.exe'))
      const fallback = join(
        process.env.ProgramFiles || 'C:\\Program Files',
        'Windows Defender',
        'MpCmdRun.exe',
      )
      return (
        [...latest, fallback].find((path) => {
          try {
            accessSync(path)
            return true
          } catch {
            return false
          }
        }) ?? null
      )
    })
    .catch(() => null)
}

function runDefender(
  executable: string,
  target: string,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-Scan', '-ScanType', '3', '-File', target], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-32_000)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Defender scan timed out.'))
    }, 120_000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
  })
}

function defenderDetectedTarget(target: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Query Defender's structured threat history and match only the unique
    // temporary target. A query error is not evidence that the file is clean.
    const targetBase64 = Buffer.from(target, 'utf8').toString('base64')
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$target = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${targetBase64}'))`,
      '$needle = [regex]::Escape($target)',
      '$detections = @(Get-MpThreatDetection | Where-Object { ($_.Resources -join "`n") -match $needle })',
      '$detections | Select-Object ThreatID, ThreatName, InitialDetectionTime, Resources | ConvertTo-Json -Depth 5 -Compress',
    ].join('; ')
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64')
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-64_000)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8_000)
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Defender detection query timed out.'))
    }, 30_000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      // Windows PowerShell can emit non-error progress records to its stderr
      // stream as CLIXML while Defender's management module initializes.
      if (code !== 0) return reject(new Error(stderr.trim() || 'Defender detection query failed.'))
      try {
        resolve(stdout.trim().length > 0 && stdout.trim() !== 'null')
      } catch (error) {
        reject(error)
      }
    })
  })
}

export function registerFormFileScan(): void {
  ipcMain.handle('forms:scan-file', async (_event, raw: unknown): Promise<ScanResult> => {
    if (!(raw instanceof Uint8Array) || raw.byteLength === 0 || raw.byteLength > 50 * 1024 * 1024)
      return { status: 'unavailable', detail: 'Scan accepts files up to 50 MB.' }
    const executable = await defenderPath()
    if (!executable)
      return { status: 'unavailable', detail: 'Microsoft Defender is unavailable on this device.' }
    const directory = await mkdtemp(join(app.getPath('temp') || tmpdir(), 'revelith-form-scan-'))
    const target = join(directory, `${randomUUID()}.bin`)
    try {
      await writeFile(target, Buffer.from(raw))
      const result = await runDefender(executable, target)
      const targetDetected = await defenderDetectedTarget(target)
      return classifyDefenderResult(result.code, targetDetected)
    } catch (error) {
      console.error(
        '[forms:scan-file] Defender scan or result verification failed:',
        error instanceof Error ? error.message : 'Unknown scanner error',
      )
      return {
        status: 'unavailable',
        detail: 'Microsoft Defender scan did not complete. Check Windows Security and try again.',
      }
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => {})
    }
  })
}
