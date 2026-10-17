import { mkdirSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { xlsxSidecarPath } from '../src/resources'

describe('CLI native resource discovery', () => {
  const originalCargoTarget = process.env.CARGO_TARGET_DIR
  const originalSidecarPath = process.env.XLSX_SIDECAR_PATH
  let testRoot: string | null = null

  afterEach(() => {
    if (testRoot) {
      const releaseDir = join(testRoot, 'release')
      const sidecar = join(
        releaseDir,
        process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar',
      )
      unlinkSync(sidecar)
      rmdirSync(releaseDir)
      rmdirSync(testRoot)
      testRoot = null
    }
    if (originalCargoTarget === undefined) delete process.env.CARGO_TARGET_DIR
    else process.env.CARGO_TARGET_DIR = originalCargoTarget
    if (originalSidecarPath === undefined) delete process.env.XLSX_SIDECAR_PATH
    else process.env.XLSX_SIDECAR_PATH = originalSidecarPath
  })

  it('uses the configured Cargo release target before the workspace fallback', () => {
    testRoot = mkdtempSync(join(tmpdir(), 'revelith-cli-sidecar-'))
    const releaseDir = join(testRoot, 'release')
    const sidecar = join(
      releaseDir,
      process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar',
    )
    mkdirSync(releaseDir)
    writeFileSync(sidecar, 'test executable path')
    process.env.CARGO_TARGET_DIR = testRoot
    delete process.env.XLSX_SIDECAR_PATH

    expect(xlsxSidecarPath()).toBe(sidecar)
  })
})
