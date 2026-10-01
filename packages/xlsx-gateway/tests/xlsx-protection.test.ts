import { describe, expect, it } from 'vitest'
import {
  applyProtectedRanges,
  applySheetProtection,
  applyWorkbookProtection,
  SheetProtectionError,
} from '../src/gateway/xlsx-protection'

const SHEET = '<worksheet><sheetData><row r="1"><c r="A1"/></row></sheetData></worksheet>'
const WORKBOOK = '<workbook><bookViews><workbookView/></bookViews><sheets/></workbook>'

describe('sheet protection', () => {
  it('adds the element after sheetData', () => {
    const out = applySheetProtection(SHEET, true)
    expect(out).toContain('<sheetProtection sheet="1" objects="1" scenarios="1"/>')
    expect(out.indexOf('sheetProtection')).toBeGreaterThan(out.indexOf('</sheetData>'))
  })

  it('puts the element after sheetCalcPr when present', () => {
    const withCalc = '<worksheet><sheetData/><sheetCalcPr/></worksheet>'
    const out = applySheetProtection(withCalc, true)
    expect(out.indexOf('sheetProtection')).toBeGreaterThan(out.indexOf('sheetCalcPr'))
  })

  it('removes it again', () => {
    expect(applySheetProtection(applySheetProtection(SHEET, true), false)).toBe(SHEET)
  })

  it('is idempotent', () => {
    const once = applySheetProtection(SHEET, true)
    expect(applySheetProtection(once, true)).toBe(once)
  })

  it('upgrades an existing element that is not locked', () => {
    const present = '<worksheet><sheetProtection objects="1"/><sheetData/></worksheet>'
    expect(applySheetProtection(present, true)).toContain('sheet="1"')
  })

  it('refuses to unprotect a password-protected sheet', () => {
    // the hash cannot be recovered, so removing it would leave a file that
    // still claims to be locked
    const locked = '<worksheet><sheetProtection sheet="1" password="ABCD"/><sheetData/></worksheet>'
    expect(() => applySheetProtection(locked, false)).toThrow(SheetProtectionError)
  })

  it('refuses when there is no sheetData to anchor to', () => {
    expect(() => applySheetProtection('<worksheet></worksheet>', true)).toThrow(/no sheetData/)
  })
})

describe('workbook structure protection', () => {
  it('locks the structure before bookViews', () => {
    const out = applyWorkbookProtection(WORKBOOK, true)
    expect(out).toContain('<workbookProtection lockStructure="1"/>')
    expect(out.indexOf('workbookProtection')).toBeLessThan(out.indexOf('bookViews'))
  })

  it('unlocks by dropping the attribute', () => {
    const locked = applyWorkbookProtection(WORKBOOK, true)
    const out = applyWorkbookProtection(locked, false)
    expect(out).not.toContain('lockStructure')
    expect(out).toContain('<bookViews>')
  })

  it('removes the element entirely once no attribute is left', () => {
    // an empty <workbookProtection/> carries no meaning
    const out = applyWorkbookProtection('<workbook><workbookProtection/></workbook>', false)
    expect(out).toBe('<workbook></workbook>')
  })

  it('keeps other workbookProtection attributes verbatim', () => {
    // lockStructure is one attribute among several; the rest are not ours to drop
    const withLock = '<workbook><workbookProtection lockStructure="1" windows="1"/></workbook>'
    const out = applyWorkbookProtection(withLock, false)
    expect(out).toContain('windows="1"')
    expect(out).not.toContain('lockStructure')
  })

  it('is idempotent', () => {
    const once = applyWorkbookProtection(WORKBOOK, true)
    expect(applyWorkbookProtection(once, true)).toBe(once)
  })

  it('refuses to unlock a password-protected structure', () => {
    const locked = '<workbook><workbookProtection workbookPassword="ABCD"/></workbook>'
    expect(() => applyWorkbookProtection(locked, false)).toThrow(SheetProtectionError)
  })

  it('leaves an unprotected workbook alone when asked to unlock', () => {
    expect(applyWorkbookProtection(WORKBOOK, false)).toBe(WORKBOOK)
  })
})

describe('allow-edit ranges', () => {
  const ranges = [{ name: 'Inputs', sqref: 'B2:B10' }]

  it('writes the ranges after sheetData', () => {
    const out = applyProtectedRanges(SHEET, ranges)
    expect(out).toContain('<protectedRanges><protectedRange sqref="B2:B10" name="Inputs"/>')
    expect(out.indexOf('protectedRanges')).toBeGreaterThan(out.indexOf('</sheetData>'))
  })

  it('places them after sheetProtection, per the schema order', () => {
    const locked = applySheetProtection(SHEET, true)
    const out = applyProtectedRanges(locked, ranges)
    expect(out.indexOf('protectedRanges')).toBeGreaterThan(out.indexOf('sheetProtection'))
  })

  it('replaces rather than merges, so a removed range stops being editable', () => {
    const first = applyProtectedRanges(SHEET, [...ranges, { name: 'Stale', sqref: 'C1:C5' }])
    const out = applyProtectedRanges(first, ranges)
    expect(out).not.toContain('Stale')
    expect(out).toContain('Inputs')
  })

  it('removes the element for an empty set', () => {
    const withRanges = applyProtectedRanges(SHEET, ranges)
    expect(applyProtectedRanges(withRanges, [])).toBe(SHEET)
  })

  it('escapes attribute values', () => {
    const out = applyProtectedRanges(SHEET, [{ name: 'a"b&c', sqref: '<A1>' }])
    expect(out).toContain('name="a&quot;b&amp;c"')
    expect(out).toContain('sqref="&lt;A1&gt;"')
  })

  it('refuses password-protected ranges', () => {
    const protectedSheet =
      '<worksheet><sheetData/><protectedRanges><protectedRange sqref="A1" password="X"/></protectedRanges></worksheet>'
    expect(() => applyProtectedRanges(protectedSheet, ranges)).toThrow(SheetProtectionError)
  })

  it('refuses ranges carrying a security descriptor', () => {
    // per-user permissions would be dropped, silently widening who can edit
    const permitted =
      '<worksheet><sheetData/><protectedRanges><protectedRange sqref="A1" name="P" securityDescriptor="D"/></protectedRanges></worksheet>'
    expect(() => applyProtectedRanges(permitted, ranges)).toThrow(/permission-protected/)
  })

  it('leaves a sheet with no ranges untouched for an empty set', () => {
    expect(applyProtectedRanges(SHEET, [])).toBe(SHEET)
  })
})
