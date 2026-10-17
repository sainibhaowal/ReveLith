import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Keep sidecar tests aligned with Cargo's configurable artifact directory. */
export function sidecarBinaryPath(): string {
  const executable = process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar'
  const targetDir = process.env.CARGO_TARGET_DIR
    ? resolve(process.env.CARGO_TARGET_DIR)
    : fileURLToPath(new URL('../native/xlsx-engine/target', import.meta.url))
  return join(targetDir, 'release', executable)
}
