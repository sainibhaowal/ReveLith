import { describe, expect, it } from 'vitest'
import { decodeXlsxEscapes, encodeXlsxEscapes } from '../src/gateway/xlsx-escapes'
import {
  ensureRelationshipNamespace,
  normalizeOoxmlPartPrefix,
} from '../src/gateway/xlsx-namespace'
import { spillsDynamicArray, withFutureFunctionMarkers } from '../src/gateway/future-functions'
import { parseStylesheetFormats } from '../src/gateway/xlsx-style-read'
import { MINIMAL_STYLESHEET_XML } from '../src/gateway/xlsx-default-styles'
import { DEFAULT_THEME_XML } from '../src/gateway/xlsx-default-theme'
import { applyThemeState, ThemeStateError } from '../src/gateway/xlsx-theme'

describe('xlsx escapes', () => {
  it('round-trips a control character', () => {
    const original = `a${String.fromCharCode(7)}b`
    expect(decodeXlsxEscapes(encodeXlsxEscapes(original))).toBe(original)
  })

  it('escapes CR, which a parser would otherwise fold into LF', () => {
    expect(encodeXlsxEscapes('a\rb')).toBe('a_x000D_b')
  })

  it('escapes a literal _x that would otherwise read as an escape', () => {
    // "_x000D_" written literally would decode to a CR that was never there
    const literal = '_x000D_'
    expect(encodeXlsxEscapes(literal)).toBe('_x005F_x000D_')
    expect(decodeXlsxEscapes(encodeXlsxEscapes(literal))).toBe(literal)
  })

  it('leaves a surrogate escape alone', () => {
    // no single-character representation exists; substituting would corrupt it
    expect(decodeXlsxEscapes('_xD800_')).toBe('_xD800_')
  })

  it('returns plain text untouched', () => {
    const text = 'nothing to escape here'
    expect(encodeXlsxEscapes(text)).toBe(text)
    expect(decodeXlsxEscapes(text)).toBe(text)
  })
})

describe('namespace normalization', () => {
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

  it('strips a prefix and re-declares it as the default', () => {
    const xml = `<x:workbook xmlns:x="${NS}"><x:sheets/></x:workbook>`
    const out = normalizeOoxmlPartPrefix(xml)
    expect(out).toContain(`xmlns="${NS}"`)
    expect(out).toContain('<sheets/>')
    expect(out).not.toContain('<x:')
  })

  it('leaves an unprefixed part alone', () => {
    const xml = `<workbook xmlns="${NS}"><sheets/></workbook>`
    expect(normalizeOoxmlPartPrefix(xml)).toBe(xml)
  })

  it('refuses when a default binding already exists', () => {
    // the de-prefixed elements would land in the wrong namespace
    const xml = `<x:workbook xmlns="${NS}" xmlns:x="${NS}"><x:sheets/></x:workbook>`
    expect(normalizeOoxmlPartPrefix(xml)).toBe(xml)
  })

  it('refuses when the prefix is rebound to another namespace deeper down', () => {
    const xml = `<x:a xmlns:x="${NS}"><x:b xmlns:x="urn:other"/></x:a>`
    expect(normalizeOoxmlPartPrefix(xml)).toBe(xml)
  })

  it('refuses on CDATA or a comment, where substitution could corrupt content', () => {
    for (const body of ['<![CDATA[x]]>', '<!-- x -->']) {
      const xml = `<x:workbook xmlns:x="${NS}">${body}</x:workbook>`
      expect(normalizeOoxmlPartPrefix(xml)).toBe(xml)
    }
  })

  it('adds a relationship binding on the root for the spreadsheet namespace', () => {
    const out = normalizeOoxmlPartPrefix(`<x:workbook xmlns:x="${NS}"/>`)
    expect(out).toContain(
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    )
  })

  it('is a no-op for a non-normalizable namespace', () => {
    const xml = '<dgm:relIds xmlns:dgm="urn:custom"/>'
    expect(normalizeOoxmlPartPrefix(xml)).toBe(xml)
  })

  it('adds xmlns:r when the root lacks it', () => {
    const out = ensureRelationshipNamespace('<workbook><sheets/></workbook>')
    expect(out).toContain(
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    )
  })

  it('does not add xmlns:r twice', () => {
    const once = ensureRelationshipNamespace('<workbook/>')
    expect(ensureRelationshipNamespace(once)).toBe(once)
  })
})

describe('future function markers', () => {
  it('marks a post-2007 function', () => {
    expect(withFutureFunctionMarkers('=CONCAT(A1:A2)')).toBe('=_xlfn.CONCAT(A1:A2)')
  })

  it('marks a worksheet-scope function with both markers', () => {
    expect(withFutureFunctionMarkers('=FILTER(A1:A9,B1:B9)')).toBe(
      '=_xlfn._xlws.FILTER(A1:A9,B1:B9)',
    )
  })

  it('leaves a 2007-era function alone', () => {
    expect(withFutureFunctionMarkers('=SUM(A1:A9)')).toBe('=SUM(A1:A9)')
  })

  it('leaves an already-marked call untouched', () => {
    const stored = '=_xlfn._xlws.FILTER(A1:A9,B1:B9)'
    expect(withFutureFunctionMarkers(stored)).toBe(stored)
  })

  it('stores the canonical uppercase name', () => {
    expect(withFutureFunctionMarkers('=concat(A1,A2)')).toBe('=_xlfn.CONCAT(A1,A2)')
  })

  it('never rewrites inside a string literal', () => {
    // the text looks like a call but is data
    expect(withFutureFunctionMarkers('="CONCAT("')).toBe('="CONCAT("')
    expect(withFutureFunctionMarkers('=IF(A1,"TEXTJOIN(",B1)')).toBe('=IF(A1,"TEXTJOIN(",B1)')
  })

  it('handles a doubled quote inside a literal', () => {
    expect(withFutureFunctionMarkers('="say ""CONCAT("""')).toBe('="say ""CONCAT("""')
  })

  it('marks several calls in one formula', () => {
    expect(withFutureFunctionMarkers('=CONCAT(TEXTJOIN(",",A1:A2),CONCAT("x"))')).toBe(
      '=_xlfn.CONCAT(_xlfn.TEXTJOIN(",",A1:A2),_xlfn.CONCAT("x"))',
    )
  })

  it('marks a call with whitespace before the parenthesis', () => {
    expect(withFutureFunctionMarkers('=CONCAT (A1,A2)')).toBe('=_xlfn.CONCAT (A1,A2)')
  })

  it('detects a spilling function, marked or not', () => {
    expect(spillsDynamicArray('=UNIQUE(A1:A9)')).toBe(true)
    expect(spillsDynamicArray('=SEQUENCE(3)')).toBe(true)
    expect(spillsDynamicArray('=SUM(A1:A9)')).toBe(false)
  })

  it('does not report a spill for a name that only appears in text', () => {
    expect(spillsDynamicArray('="UNIQUE"')).toBe(false)
  })

  it('handles an escaped sheet-name quote', () => {
    expect(withFutureFunctionMarkers("='My''Sheet'!A1+CONCAT(B1)")).toBe(
      "='My''Sheet'!A1+_xlfn.CONCAT(B1)",
    )
  })
})

describe('stylesheet read-back', () => {
  const sheet = (inner: string, tag: string) => `<${tag}>${inner}</${tag}>`

  it('reads fill and font indexes from cellXfs', () => {
    const xml = sheet(
      sheet('<xf fillId="2" fontId="1"/><xf fillId="0" fontId="0"/>', 'cellXfs'),
      'styleSheet',
    )
    const out = parseStylesheetFormats(xml)
    expect(out.xfs).toEqual([
      { fillId: 2, fontId: 1 },
      { fillId: 0, fontId: 0 },
    ])
  })

  it('reads a theme color with its tint', () => {
    const fills = sheet(
      sheet(
        '<fill><patternFill patternType="solid"><fgColor theme="4" tint="-0.249977"/></patternFill></fill>',
        'fills',
      ),
      'styleSheet',
    )
    const out = parseStylesheetFormats(fills)
    expect(out.fills[0]).toEqual({ pattern: 'solid', fg: { theme: 4, tint: -0.249977 } })
  })

  it('reads a literal rgb, dropping the alpha byte', () => {
    const fills = sheet(
      sheet(
        '<fill><patternFill patternType="solid"><fgColor rgb="FF112233"/></patternFill></fill>',
        'fills',
      ),
      'styleSheet',
    )
    expect(parseStylesheetFormats(fills).fills[0]).toEqual({ pattern: 'solid', fg: '#112233' })
  })

  it('reports the none pattern as no fill', () => {
    const fills = sheet(
      sheet('<fill><patternFill patternType="none"/></fill>', 'fills'),
      'styleSheet',
    )
    expect(parseStylesheetFormats(fills).fills[0]).toBeNull()
  })

  it('treats a pattern with no foreground as automatic, not a choice', () => {
    const fills = sheet(
      sheet('<fill><patternFill patternType="solid"/></fill>', 'fills'),
      'styleSheet',
    )
    expect(parseStylesheetFormats(fills).fills[0]).toBeNull()
  })

  it('reads a gradient with two or more stops', () => {
    const fills = sheet(
      sheet(
        '<fill><gradientFill degree="90"><stop position="0"><color rgb="FF000000"/></stop><stop position="1"><color rgb="FFFFFFFF"/></stop></gradientFill></fill>',
        'fills',
      ),
      'styleSheet',
    )
    const fill = parseStylesheetFormats(fills).fills[0]
    expect(fill && isGradient(fill)).toBe(true)
    if (fill && 'gradient' in fill) {
      expect(fill.gradient.angle).toBe(90)
      expect(fill.gradient.stops).toHaveLength(2)
    }
  })

  it('refuses a gradient with fewer than two stops', () => {
    const fills = sheet(
      sheet(
        '<fill><gradientFill><stop position="0"><color rgb="FF000000"/></stop></gradientFill></fill>',
        'fills',
      ),
      'styleSheet',
    )
    expect(parseStylesheetFormats(fills).fills[0]).toBeNull()
  })

  it('returns empty lists for a stylesheet with no sections', () => {
    const out = parseStylesheetFormats('<styleSheet/>')
    expect(out.xfs).toEqual([])
    expect(out.fills).toEqual([])
    expect(out.fontColors).toEqual([])
  })
})

const isGradient = (f: unknown): boolean => typeof f === 'object' && f !== null && 'gradient' in f

describe('default stylesheet and theme', () => {
  it('declares every section a style edit expects to extend', () => {
    for (const tag of ['fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles']) {
      expect(MINIMAL_STYLESHEET_XML).toContain(`<${tag}`)
    }
  })

  it('parses with the read-back reader', () => {
    const out = parseStylesheetFormats(MINIMAL_STYLESHEET_XML)
    expect(out.xfs).toHaveLength(1)
    expect(out.fills).toHaveLength(2)
  })

  it('supplies a theme with all 12 color slots', () => {
    for (const slot of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent6', 'hlink', 'folHlink']) {
      expect(DEFAULT_THEME_XML).toContain(`<a:${slot}>`)
    }
  })
})

describe('applyThemeState', () => {
  const palette = [
    '#FFFFFF',
    '#000000',
    '#E7E6E6',
    '#44546A',
    '#111111',
    '#222222',
    '#333333',
    '#444444',
    '#555555',
    '#666666',
    '#777777',
    '#888888',
  ]

  it('writes colors in theme index order, not document order', () => {
    const out = applyThemeState(DEFAULT_THEME_XML, { colors: { name: 'Mine', values: palette } })
    // index 0 is lt1 and must land in the <a:lt1> slot, not <a:dk1>
    expect(out).toContain('<a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>')
    expect(out).toContain('<a:dk1><a:srgbClr val="000000"/></a:dk1>')
    expect(out).toContain('<a:accent1><a:srgbClr val="111111"/></a:accent1>')
  })

  it('renames the scheme', () => {
    const out = applyThemeState(DEFAULT_THEME_XML, { colors: { name: 'Mine', values: palette } })
    expect(out).toContain('<a:clrScheme name="Mine">')
  })

  it('rejects a palette that is not 12 colors', () => {
    expect(() =>
      applyThemeState(DEFAULT_THEME_XML, { colors: { name: 'x', values: ['#FFFFFF'] } }),
    ).toThrow(ThemeStateError)
  })

  it('rejects a malformed color', () => {
    const bad = [...palette]
    bad[4] = '#GGGGGG'
    expect(() =>
      applyThemeState(DEFAULT_THEME_XML, { colors: { name: 'x', values: bad } }),
    ).toThrow(/not a valid/)
  })

  it('rewrites the latin typefaces of both font schemes', () => {
    const out = applyThemeState(DEFAULT_THEME_XML, {
      fonts: { name: 'Mine', major: 'Big', minor: 'Small' },
    })
    expect(out).toContain('typeface="Big"')
    expect(out).toContain('typeface="Small"')
    expect(out).toContain('<a:fontScheme name="Mine">')
  })

  it('leaves the theme untouched when nothing is requested', () => {
    expect(applyThemeState(DEFAULT_THEME_XML, {})).toBe(DEFAULT_THEME_XML)
  })

  it('rejects a font rewrite on a theme with no font scheme', () => {
    const noFonts = '<a:theme><a:clrScheme name="c"/></a:theme>'
    expect(() =>
      applyThemeState(noFonts, { fonts: { name: 'x', major: 'a', minor: 'b' } }),
    ).toThrow(ThemeStateError)
  })
})
