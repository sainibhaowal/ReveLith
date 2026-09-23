import { describe, expect, it } from 'vitest'
import { parseSheetNavHref, SHEET_NAV_SCHEME } from '../src/renderer/ai/sheet-nav'

describe('parseSheetNavHref', () => {
  it('accepts bare ranges', () => {
    expect(parseSheetNavHref('sheetnav://B12')).toEqual({ range: 'B12' })
    expect(parseSheetNavHref('sheetnav://a1:d20')).toEqual({ range: 'A1:D20' })
    expect(parseSheetNavHref(`${SHEET_NAV_SCHEME}://$C$5`)).toEqual({ range: '$C$5' })
  })

  it('accepts Sheet! prefixed targets', () => {
    expect(parseSheetNavHref('sheetnav://Summary!B2')).toEqual({ range: 'B2', sheetName: 'Summary' })
    expect(parseSheetNavHref("sheetnav://'My Sheet'!A1:A5")).toEqual({
      range: 'A1:A5',
      sheetName: 'My Sheet',
    })
  })

  it('rejects malformed hrefs', () => {
    expect(parseSheetNavHref('https://example.com')).toBeNull()
    expect(parseSheetNavHref('sheetnav://')).toBeNull()
    expect(parseSheetNavHref('sheetnav://ZZZ')).toBeNull()
    expect(parseSheetNavHref('sheetnav://!B2')).toBeNull()
    expect(parseSheetNavHref('sheetnav://B2!')).toBeNull()
  })
})
