import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { linuxTargetArch } = require('../build/linux-target-arch.cjs') as {
  linuxTargetArch: (hostArch: string) => 'arm64' | 'x64'
}

describe('Linux release architecture selection', () => {
  it('builds x64 packages on x64 runners', () => {
    expect(linuxTargetArch('x64')).toBe('x64')
  })

  it('builds ARM64 packages on ARM64 runners', () => {
    expect(linuxTargetArch('arm64')).toBe('arm64')
  })

  it('rejects unsupported host architectures instead of mislabeling their packages', () => {
    expect(() => linuxTargetArch('ia32')).toThrow('Unsupported Linux build host architecture: ia32')
  })
})
