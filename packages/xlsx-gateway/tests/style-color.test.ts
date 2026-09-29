import { describe, expect, it } from 'vitest'
import {
  applyTint,
  DEFAULT_THEME_PALETTE,
  describeStyleColor,
  echoStyleColor,
  fillDisplayColor,
  isGradientFill,
  isThemeColor,
  normalizeStyleColor,
  PATTERN_TYPES,
  resolveStyleColor,
  themeSlotIndex,
  themeSlotName,
} from '../src/domain/style-color'

describe('theme slots', () => {
  it('maps every slot name to its index and back', () => {
    const names = [
      'lt1',
      'dk1',
      'lt2',
      'dk2',
      'accent1',
      'accent2',
      'accent3',
      'accent4',
      'accent5',
      'accent6',
      'hlink',
      'folHlink',
    ]
    names.forEach((name, index) => {
      expect(themeSlotIndex(name)).toBe(index)
      expect(themeSlotName(index)).toBe(name)
    })
  })

  it('accepts the alias spellings', () => {
    expect(themeSlotIndex('bg1')).toBe(0)
    expect(themeSlotIndex('text1')).toBe(1)
    expect(themeSlotIndex('followedHyperlink')).toBe(11)
    expect(themeSlotIndex('nope')).toBeUndefined()
  })

  it('falls back for an out-of-range index rather than returning undefined', () => {
    expect(themeSlotName(99)).toBe('accent1')
  })
})

describe('normalizeStyleColor', () => {
  it('uppercases a hex color and leaves it a string', () => {
    expect(normalizeStyleColor('#aabbcc')).toBe('#AABBCC')
  })

  it('parses a bare slot name', () => {
    expect(normalizeStyleColor('accent1')).toEqual({ theme: 4 })
  })

  it('parses a signed percentage into a tint', () => {
    expect(normalizeStyleColor('accent1+40%')).toEqual({ theme: 4, tint: 0.4 })
    expect(normalizeStyleColor('dk2-25%')).toEqual({ theme: 3, tint: -0.25 })
  })

  it('rounds a tint to six decimals so a read/write round trip is stable', () => {
    // The shorthand grammar is integer percentages, so a high-precision tint
    // arrives through the object form: a double parsed out of a workbook.
    expect(normalizeStyleColor({ theme: 4, tint: 0.33333333333 })).toEqual({
      theme: 4,
      tint: 0.333333,
    })
    // applying it again is idempotent
    expect(normalizeStyleColor({ theme: 4, tint: 0.333333 })).toEqual({
      theme: 4,
      tint: 0.333333,
    })
  })

  it('rejects a fractional percentage in the shorthand form', () => {
    // the grammar is \d{1,3}%, so this is an unknown color rather than a tint
    expect(() => normalizeStyleColor('accent1+33.5%')).toThrow(/Unknown color/)
  })

  it('rejects a tint outside -1..1', () => {
    expect(() => normalizeStyleColor('accent1+200%')).toThrow(/outside/)
  })

  it('rejects an unknown name and a short hex', () => {
    expect(() => normalizeStyleColor('chartreuse')).toThrow(/Unknown color/)
    expect(() => normalizeStyleColor('#abc')).toThrow(/Unknown color/)
  })

  it('rejects an out-of-range numeric theme index', () => {
    expect(() => normalizeStyleColor({ theme: 12 })).toThrow(/Unknown theme color/)
    expect(() => normalizeStyleColor({ theme: -1 })).toThrow(/Unknown theme color/)
    expect(() => normalizeStyleColor({ theme: 1.5 })).toThrow(/Unknown theme color/)
  })

  it('omits a zero tint rather than storing it', () => {
    expect(normalizeStyleColor({ theme: 4, tint: 0 })).toEqual({ theme: 4 })
  })
})

describe('resolveStyleColor', () => {
  it('resolves a slot against the default palette', () => {
    expect(resolveStyleColor({ theme: 4 })).toBe('#4472C4')
    expect(resolveStyleColor({ theme: 5 })).toBe('#ED7D31')
  })

  it('resolves against a custom palette', () => {
    const palette = DEFAULT_THEME_PALETTE.map(() => '#123456')
    expect(resolveStyleColor({ theme: 0 }, palette)).toBe('#123456')
  })

  it('falls back to black for an unknown literal', () => {
    expect(resolveStyleColor('not-a-color')).toBe('#000000')
  })

  it('isThemeColor distinguishes the two shapes', () => {
    expect(isThemeColor('#FFF')).toBe(false)
    expect(isThemeColor({ theme: 1 })).toBe(true)
    expect(isThemeColor(null)).toBe(false)
    expect(isThemeColor(undefined)).toBe(false)
  })
})

describe('applyTint', () => {
  it('is a no-op at tint 0', () => {
    expect(applyTint('#4472C4', 0)).toBe('#4472C4')
  })

  it('lightens toward white for a positive tint', () => {
    const lightened = applyTint('#4472C4', 0.5)
    expect(lightened).not.toBe('#4472C4')
    // every channel moves up toward white
    const channel = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
    expect(channel(lightened, 1)).toBeGreaterThan(channel('#4472C4', 1))
    expect(channel(lightened, 3)).toBeGreaterThan(channel('#4472C4', 3))
    expect(channel(lightened, 5)).toBeGreaterThan(channel('#4472C4', 5))
  })

  it('darkens toward black for a negative tint', () => {
    const darkened = applyTint('#4472C4', -0.5)
    const channel = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
    expect(channel(darkened, 1)).toBeLessThan(channel('#4472C4', 1))
  })

  it('returns pure white and pure black at the extremes', () => {
    expect(applyTint('#000000', 1)).toBe('#FFFFFF')
    expect(applyTint('#FFFFFF', -1)).toBe('#000000')
  })

  it('handles a grey: saturation is zero, so only the luminance moves', () => {
    expect(applyTint('#808080', 0.5)).toMatch(/^#([0-9A-F]{2})\1\1$/)
  })

  it('falls back to black for malformed hex rather than emitting NaN', () => {
    // a NaN channel would serialize as "NaN" inside a workbook and corrupt it
    for (const bad of ['#GGGGGG', '#12345', 'rgb(1,2,3)', '']) {
      const out = applyTint(bad, 0.5)
      expect(out).toBe('#000000')
      expect(out).not.toContain('NaN')
    }
  })

  it('always produces six uppercase hex digits', () => {
    for (const tint of [-1, -0.33, 0, 0.25, 0.9, 1]) {
      expect(applyTint('#1E7145', tint)).toMatch(/^#[0-9A-F]{6}$/)
    }
  })
})

describe('echo and describe', () => {
  it('echoes a literal with only its rgb', () => {
    expect(echoStyleColor('#112233')).toEqual({ rgb: '#112233' })
  })

  it('echoes a theme color with its slot, and the tint only when set', () => {
    expect(echoStyleColor({ theme: 4 })).toEqual({ rgb: '#4472C4', theme: 'accent1' })
    expect(echoStyleColor({ theme: 4, tint: -0.25 })).toEqual({
      rgb: expect.any(String),
      theme: 'accent1',
      tint: -0.25,
    })
  })

  it('describes a color the way a person would name it', () => {
    expect(describeStyleColor('#112233')).toBe('#112233')
    expect(describeStyleColor({ theme: 4 })).toBe('accent1')
    expect(describeStyleColor({ theme: 4, tint: 0.4 })).toBe('accent1+40%')
    expect(describeStyleColor({ theme: 3, tint: -0.25 })).toBe('dk2-25%')
  })
})

describe('fills', () => {
  it('lists the pattern types without none', () => {
    expect(PATTERN_TYPES).toContain('solid')
    expect(PATTERN_TYPES).not.toContain('none')
  })

  it('separates gradient from pattern fills', () => {
    const pattern = { pattern: 'solid' as const, fg: '#FFF' }
    const gradient = { gradient: { stops: [{ position: 0, color: '#FFF' }] } }
    expect(isGradientFill(pattern)).toBe(false)
    expect(isGradientFill(gradient)).toBe(true)
  })

  it('reports one display color for either kind', () => {
    expect(fillDisplayColor({ pattern: 'solid', fg: '#123456' })).toBe('#123456')
    expect(fillDisplayColor({ gradient: { stops: [{ position: 0, color: '#AAA' }] } })).toBe('#AAA')
  })
})
