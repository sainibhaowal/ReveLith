import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Windows security software can briefly hold esbuild's random files in the
// system temp directory. Keep build-time scratch files in the ignored
// workspace temp directory so Vite/electron-vite builds are deterministic.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tempDir = resolve(repoRoot, '.tmp', 'esbuild')
await mkdir(tempDir, { recursive: true })

const [command, ...args] = process.argv.slice(2)
if (!command) throw new Error('Usage: node tools/run-with-local-temp.mjs <command> [args...]')

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: { ...process.env, TEMP: tempDir, TMP: tempDir },
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
