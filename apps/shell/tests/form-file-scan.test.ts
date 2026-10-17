import { describe, expect, it } from 'vitest'
import { classifyDefenderResult } from '../src/main/form-file-scan'

describe('Defender scan result classification', () => {
  it('marks a file clean only when the scan command returns success', () => {
    expect(classifyDefenderResult(0, false)).toEqual({ status: 'clean' })
  })

  it('reports a threat only from a structured detection matched to the scanned file', () => {
    expect(classifyDefenderResult(2, true)).toMatchObject({ status: 'threat' })
    expect(classifyDefenderResult(0, true)).toMatchObject({ status: 'threat' })
  })

  it('fails closed when the scan or detection lookup is ambiguous', () => {
    expect(classifyDefenderResult(2, false)).toMatchObject({ status: 'unavailable' })
    expect(classifyDefenderResult(1, false)).toMatchObject({ status: 'unavailable' })
    expect(classifyDefenderResult(null, false)).toMatchObject({ status: 'unavailable' })
  })
})
