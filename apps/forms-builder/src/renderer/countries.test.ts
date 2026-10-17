import { describe, expect, it } from 'vitest'
import { getCountryNames } from './countries'

describe('country selector data', () => {
  it('produces a stable, broad locale-aware list with common countries', () => {
    const names = getCountryNames('en')
    expect(names.length).toBeGreaterThan(200)
    expect(names).toContain('Germany')
    expect(names).toContain('India')
    expect(names).toContain('United States')
    expect(new Set(names).size).toBe(names.length)
  })

  it('falls back to English for an invalid locale', () => {
    expect(getCountryNames('not_a_locale')).toContain('France')
  })
})
