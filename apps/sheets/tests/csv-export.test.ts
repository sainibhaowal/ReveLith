import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import ExcelJS from 'exceljs'
import { buildCsvText } from '../src/renderer/csv-export-action'
import { exportWorksheetToCsv } from '../src/main/csv-export'

describe('buildCsvText', () => {
  it('encodes simple strings and numbers into CRLF separated CSV', () => {
    const rows = [
      ['Name', 'Age', 'Score'],
      ['Alice', 30, 95.5],
      ['Bob', 25, 88],
    ]
    const text = buildCsvText(rows)
    expect(text).toBe('Name,Age,Score\r\nAlice,30,95.5\r\nBob,25,88\r\n')
  })

  it('escapes cells containing commas, double quotes, and newlines', () => {
    const rows = [
      ['Description', 'Notes'],
      ['Item, with comma', 'Line 1\nLine 2'],
      ['Item with "quotes"', 'Normal note'],
    ]
    const text = buildCsvText(rows)
    expect(text).toBe(
      'Description,Notes\r\n' +
      '"Item, with comma","Line 1\nLine 2"\r\n' +
      '"Item with ""quotes""",Normal note\r\n'
    )
  })

  it('handles null, undefined, and booleans cleanly', () => {
    const rows = [
      ['Col A', 'Col B', 'Col C'],
      [null, undefined, true],
      [false, '', 'Done'],
    ]
    const text = buildCsvText(rows)
    expect(text).toBe(
      'Col A,Col B,Col C\r\n' +
      ',,true\r\n' +
      'false,,Done\r\n'
    )
  })

  it('correctly handles Unicode and CJK characters', () => {
    const rows = [
      ['城市', '人口 (万)', '备注'],
      ['北京', 2189, '首都'],
      ['Tokyo (東京)', 3700, '日本語テスト'],
      ['Zürich', 43, 'Grüezi!'],
    ]
    const text = buildCsvText(rows)
    expect(text).toContain('城市,人口 (万),备注\r\n')
    expect(text).toContain('北京,2189,首都\r\n')
    expect(text).toContain('Tokyo (東京),3700,日本語テスト\r\n')
    expect(text).toContain('Zürich,43,Grüezi!\r\n')
  })
})

describe('exportWorksheetToCsv', () => {
  it('converts an ExcelJS workbook on disk to RFC-4180 CSV with UTF-8 BOM', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'csv-test-'))
    const xlsxPath = path.join(tempDir, 'test.xlsx')
    const csvPath = path.join(tempDir, 'output.csv')

    try {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Q1 Revenue')
      ws.addRow(['Quarter', 'Region', 'Revenue', 'Notes'])
      ws.addRow(['Q1', 'North', 120000, 'All good'])
      ws.addRow(['Q1', 'South', 85000, 'Exceeded target, "high priority"'])
      await wb.xlsx.writeFile(xlsxPath)

      await exportWorksheetToCsv(xlsxPath, csvPath)

      const csvBytes = await fs.readFile(csvPath)
      // Check UTF-8 BOM
      expect(csvBytes[0]).toBe(0xef)
      expect(csvBytes[1]).toBe(0xbb)
      expect(csvBytes[2]).toBe(0xbf)

      const text = csvBytes.toString('utf8')
      expect(text).toContain('Quarter,Region,Revenue,Notes')
      expect(text).toContain('120000')
      expect(text).toContain('85000')
      expect(text).toContain('"Exceeded target, ""high priority"""')
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })
})
