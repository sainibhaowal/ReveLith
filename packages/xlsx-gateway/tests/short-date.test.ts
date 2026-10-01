import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORT_DATE,
  getSystemShortDate,
  setSystemShortDate,
  shortDateNumFmtId,
  shortDatePatternForSystemLocale,
} from '../src/shared/short-date'

afterEach(() => {
  // module-level singleton: leave it as found so order cannot leak between tests
  setSystemShortDate(DEFAULT_SHORT_DATE)
})

describe('shortDatePatternForSystemLocale', () => {
  it('derives the US pattern from en-US', () => {
    expect(shortDatePatternForSystemLocale('en-US')).toBe('m/d/yyyy')
  })

  it('derives the day-first pattern from en-GB', () => {
    // The probe date is 9 March 2016, so the day and month parts are zero
    // padded ("09", "03") and the rule maps a padded part to "dd"/"mm". That is
    // what makes the pattern match what the locale actually renders.
    expect(shortDatePatternForSystemLocale('en-GB')).toBe('dd/mm/yyyy')
  })

  it('uses the region, not the language', () => {
    // an English UI on a Chinese machine still shows the Chinese pattern:
    // the region drives the format, the language does not
    const fromEnOnCn = shortDatePatternForSystemLocale('en-CN')
    const fromZhOnCn = shortDatePatternForSystemLocale('zh-CN')
    expect(fromEnOnCn).toBe(fromZhOnCn)
  })

  it('never returns a pattern without all three date parts', () => {
    for (const locale of ['en-US', 'en-GB', 'ja-JP', 'de-DE', 'ar-EG', 'zh-CN']) {
      const pattern = shortDatePatternForSystemLocale(locale)
      expect(pattern).toMatch(/y/)
      expect(pattern).toMatch(/m/)
      expect(pattern).toMatch(/d/)
    }
  })

  it('falls back to the default for an unusable tag', () => {
    expect(shortDatePatternForSystemLocale('not a locale')).toBe(DEFAULT_SHORT_DATE)
    expect(shortDatePatternForSystemLocale('')).toBe(DEFAULT_SHORT_DATE)
  })
})

describe('shortDateNumFmtId', () => {
  it('maps the system short date to builtin 14', () => {
    setSystemShortDate('d/m/yyyy')
    expect(shortDateNumFmtId('d/m/yyyy')).toBe(14)
  })

  it('maps the system short date with a time to builtin 22', () => {
    setSystemShortDate('d/m/yyyy')
    expect(shortDateNumFmtId('d/m/yyyy hh:mm')).toBe(22)
    // documents saved before the leading-zero calibration
    expect(shortDateNumFmtId('d/m/yyyy h:mm')).toBe(22)
  })

  it('returns undefined for a pattern that is not the system short date', () => {
    setSystemShortDate('d/m/yyyy')
    // a custom pattern has to be stored as a numFmt, or the cell would
    // silently re-render in the reader's own regional format
    expect(shortDateNumFmtId('yyyy-mm-dd')).toBeUndefined()
    expect(shortDateNumFmtId('0.00')).toBeUndefined()
  })

  it('follows the system setting rather than a baked-in pattern', () => {
    setSystemShortDate('m/d/yyyy')
    expect(shortDateNumFmtId('m/d/yyyy')).toBe(14)
    // the same pattern is a custom format once the system says otherwise
    setSystemShortDate('d.m.yyyy')
    expect(shortDateNumFmtId('m/d/yyyy')).toBeUndefined()
  })

  it('getSystemShortDate reflects what was set', () => {
    setSystemShortDate('yyyy/m/d')
    expect(getSystemShortDate()).toBe('yyyy/m/d')
  })
})
