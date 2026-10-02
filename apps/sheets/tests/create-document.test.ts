import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  buildCsv,
  buildGeneratedDocument,
  buildValuesXlsx,
  sanitizeGeneratedFileBase,
  uniquePathIn,
  writeGeneratedDocument,
} from '../src/main/create-document'

describe('buildValuesXlsx', () => {
  it('writes a minimal workbook that round-trips its values', async () => {
    const bytes = await buildValuesXlsx('Sales', [
      ['Name', 'Qty', 'Paid'],
      ['Acme, Inc.', 10, true],
      ['<Globex>', 2.5, false],
      [null, '', 0],
    ])
    const zip = await JSZip.loadAsync(bytes)
    // JSZip materializes implicit folder entries; only files matter here
    const files = Object.keys(zip.files).filter((name) => !name.endsWith('/')).sort()
    expect(files).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('text')
    expect(sheet).toContain('<t xml:space="preserve">Acme, Inc.</t>')
    expect(sheet).toContain('<c r="B2"><v>10</v></c>')
    expect(sheet).toContain('<c r="C2" t="b"><v>1</v></c>')
    expect(sheet).toContain('&lt;Globex&gt;')
    const workbook = await zip.file('xl/workbook.xml')!.async('text')
    expect(workbook).toContain('name="Sales"')
  })
})

describe('buildCsv', () => {
  it('quotes fields with commas, quotes, and line breaks', () => {
    expect(
      buildCsv([
        ['a', 'b,c', 'd"e', 'f\ng'],
        [1, null, true, ''],
      ]),
    ).toBe('a,"b,c","d""e","f\ng"\r\n1,,true,\r\n')
  })
})

describe('file naming', () => {
  it('sanitizes stems and uniquifies collisions', () => {
    expect(sanitizeGeneratedFileBase('  Report: Q1/2026  ')).toBe('Report_ Q1_2026')
    expect(sanitizeGeneratedFileBase('...')).toBe('Untitled')
    const dir = mkdtempSync(join(tmpdir(), 'revelith-create-doc-'))
    expect(uniquePathIn(dir, 'a.xlsx')).toBe(join(dir, 'a.xlsx'))
  })

  it('writes bytes or text to a collision-free path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'revelith-create-doc-'))
    const first = await writeGeneratedDocument(dir, { bytes: 'hello', fileName: 'note.md' })
    expect(first).toBe(join(dir, 'note.md'))
    const second = await writeGeneratedDocument(dir, { bytes: 'again', fileName: 'note.md' })
    expect(second).toBe(join(dir, 'note-2.md'))
  })

  it('rejects empty content and oversized grids', async () => {
    await expect(buildGeneratedDocument({ type: 'md', title: 'X', content: '  ' })).rejects.toThrow(
      'must not be empty',
    )
    await expect(
      buildGeneratedDocument({ type: 'docx' as 'xlsx', title: 'X' }),
    ).rejects.toThrow('Unsupported document type')
  })
})
