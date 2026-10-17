import { describe, expect, it } from 'vitest'
import { startsStandaloneBuild } from './request-context'

describe('standalone draw request context', () => {
  it('resets stale creative context for an explicit new build', () => {
    expect(startsStandaloneBuild('NOW ONLY BUILD Create a tall educational infographic titled Energy Basics')).toBe(true)
  })
  it('keeps history when the user is editing current work', () => {
    expect(startsStandaloneBuild('Fix the previous infographic and add one section')).toBe(false)
    expect(startsStandaloneBuild('Continue editing the diagram above')).toBe(false)
  })
})
