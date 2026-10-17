import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const cargoBin = join(homedir(), '.cargo', 'bin')
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
const currentPath = process.env[pathKey] ?? ''
const pathEntries = currentPath.split(delimiter).filter(Boolean)
const env = {
  ...process.env,
  // Keep this override scoped to the test process. On locked-down Windows
  // profiles, the in-repo Cargo target can be executable but not writable.
  CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? join(tmpdir(), 'ReveLith-Sheets-CargoTarget'),
}
// The CLI test suite consumes the same Windows binary built by the Sheets
// package above. Point it at Cargo's isolated target rather than a stale or
// policy-blocked executable under the repository checkout.
const sidecarExecutable = process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar'
env.XLSX_SIDECAR_PATH ??= join(env.CARGO_TARGET_DIR, 'release', sidecarExecutable)

if (
  existsSync(cargoBin) &&
  !pathEntries.some((entry) => entry.toLowerCase() === cargoBin.toLowerCase())
) {
  env[pathKey] = [cargoBin, ...pathEntries].join(delimiter)
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const child = spawn(npm, ['run', 'test:inner'], {
  cwd: repoRoot,
  env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
