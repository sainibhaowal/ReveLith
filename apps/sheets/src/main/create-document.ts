import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'
import type { CellScalar } from '../domain/workbook.types'

export type GeneratedDocumentType = 'xlsx' | 'csv' | 'md' | 'html'

export interface GenerateDocumentInput {
  type: GeneratedDocumentType
  /** File-name stem (sanitized); sheet exports default to the worksheet name */
  title: string
  /** Worksheet display grid for xlsx/csv (row-major, null = empty) */
  rows?: CellScalar[][]
  /** Worksheet name for the xlsx sheet tab */
  sheetName?: string
  /** Authored source for md/html */
  content?: string
}

export interface GeneratedDocument {
  bytes: Uint8Array | string
  fileName: string
}

/** File-name stem scrub (same rules as shell home lists) */
export function sanitizeGeneratedFileBase(title: string): string {
  const cleaned = String(title ?? '')
    // eslint-disable-next-line no-control-regex -- generated file names must reject controls
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 80)
    .trim()
  if (!cleaned || /^\.+$/.test(cleaned)) return 'Untitled'
  return cleaned
}

export function uniquePathIn(dir: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  let candidate = join(dir, fileName)
  for (let i = 2; existsSync(candidate); i += 1) candidate = join(dir, `${base}-${i}${ext}`)
  return candidate
}

const xmlEscape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const colLabel = (column: number): string => {
  let label = ''
  let remaining = column + 1
  while (remaining > 0) {
    remaining -= 1
    label = String.fromCharCode(65 + (remaining % 26)) + label
    remaining = Math.floor(remaining / 26)
  }
  return label
}

/**
 * Minimal values-only .xlsx (inline strings; no styles/theme). Opens in
 * Excel, LibreOffice, and ReveLith Sheets itself.
 */
export async function buildValuesXlsx(sheetName: string, rows: CellScalar[][]): Promise<Uint8Array> {
  const safeName = sheetName.trim().slice(0, 31) || 'Sheet1'
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${xmlEscape(safeName)}" sheetId="1" r:id="rId1"/></sheets>` +
      '</workbook>',
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',
  )
  const sheetRows = rows
    .map((cells, r) => {
      const address = cells
        .map((value, c) => {
          if (value === null || value === '') return ''
          const ref = `${colLabel(c)}${r + 1}`
          if (typeof value === 'number' && Number.isFinite(value)) {
            return `<c r="${ref}"><v>${value}</v></c>`
          }
          if (typeof value === 'boolean') {
            return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${address}</row>`
    })
    .join('')
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${sheetRows}</sheetData></worksheet>`,
  )
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))
}

/** RFC-4180 CSV (comma, double-quote escaping, CRLF rows) */
export function buildCsv(rows: CellScalar[][]): string {
  const field = (value: CellScalar): string => {
    if (value === null) return ''
    const text = String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return `${rows.map((cells) => cells.map(field).join(',')).join('\r\n')}\r\n`
}

const MAX_GRID_CELLS = 500_000

export function checkGridSize(rows: CellScalar[][]): void {
  const cells = rows.reduce((total, row) => total + row.length, 0)
  if (cells > MAX_GRID_CELLS) {
    throw new Error('The worksheet is too large to export as a standalone file.')
  }
}

/** Build the file bytes + name; writing + tab-opening stay with the caller. */
export async function buildGeneratedDocument(input: GenerateDocumentInput): Promise<GeneratedDocument> {
  const title = sanitizeGeneratedFileBase(input.title)
  switch (input.type) {
    case 'xlsx': {
      const rows = input.rows ?? []
      checkGridSize(rows)
      return {
        bytes: await buildValuesXlsx(input.sheetName?.trim() || title, rows),
        fileName: `${title}.xlsx`,
      }
    }
    case 'csv': {
      const rows = input.rows ?? []
      checkGridSize(rows)
      return { bytes: buildCsv(rows), fileName: `${title}.csv` }
    }
    case 'md':
    case 'html': {
      const content = String(input.content ?? '')
      if (!content.trim()) throw new Error('content must not be empty')
      if (content.length > 2_000_000) throw new Error('content is too large (2MB limit)')
      return { bytes: content, fileName: `${title}.${input.type}` }
    }
    default:
      throw new Error(`Unsupported document type: ${String(input.type)}`)
  }
}

/** Write into dir with a collision-free name; creates dir on demand. */
export async function writeGeneratedDocument(dir: string, doc: GeneratedDocument): Promise<string> {
  await mkdir(dir, { recursive: true })
  const path = uniquePathIn(dir, doc.fileName)
  await writeFile(path, doc.bytes)
  return path
}
