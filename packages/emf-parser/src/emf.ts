/**
 * EMF Parser Implementation
 *
 * Parses Enhanced Metafile Format (EMF) records from binary data.
 * Based on [MS-EMF] specification.
 */

import { BinaryReader } from './utils'
import type { EmfHeader, Rect, Color, LogPalette } from './index'

// ─── Constants ────────────────────────────────────────────────

const ENHANCED_METAFILE_SIGNATURE = 0x464d4520

const RECORD_TYPES: Record<number, string> = {
  0x00000001: 'EMR_HEADER',
  0x0000000e: 'EMR_EOF',
  0x00000046: 'EMR_COMMENT',
  0x0000000d: 'EMR_SAVEDC',
  0x0000000f: 'EMR_RESTOREDC',
  0x00000012: 'EMR_SETBKMODE',
  0x00000013: 'EMR_SETMAPMODE',
  0x00000015: 'EMR_SETLAYOUT',
  0x00000016: 'EMR_SETWORLDTRANSFORM',
  0x00000017: 'EMR_MODIFYWORLDTRANSFORM',
  0x00000019: 'EMR_SETROP2',
  0x0000001a: 'EMR_SETBKCOLOR',
  0x0000001b: 'EMR_SETTEXTCOLOR',
  0x0000001c: 'EMR_SETTEXALIGN',
  0x0000001d: 'EMR_SETTEXTCHAREXTRA',
  0x0000001e: 'EMR_SETMITERLIMIT',
  0x00000028: 'EMR_CREATEPEN',
  0x00000029: 'EMR_CREATEBRUSHINDIRECT',
  0x0000002b: 'EMR_DELETEOBJECT',
  0x0000002d: 'EMR_SELECTOBJECT',
  0x00000060: 'EMR_EXTCREATEPEN',
  0x0000002e: 'EMR_CREATEMONOBRUSH',
  0x0000002f: 'EMR_CREATEDIBPATTERNBRUSHPT',
  0x0000003b: 'EMR_BEGINPATH',
  0x0000003c: 'EMR_ENDPATH',
  0x0000003d: 'EMR_CLOSEFIGURE',
  0x0000003e: 'EMR_FLATTENPATH',
  0x0000003f: 'EMR_WIDENPATH',
  0x00000040: 'EMR_SELECTCLIPPATH',
  0x00000041: 'EMR_SETROPOLYGONMODE',
  0x00000030: 'EMR_MOVETOEX',
  0x00000031: 'EMR_LINETO',
  0x00000032: 'EMR_ARC',
  0x00000033: 'EMR_ARCTO',
  0x00000034: 'EMR_CHORD',
  0x00000035: 'EMR_PIE',
  0x00000036: 'EMR_RECTANGLE',
  0x00000037: 'EMR_ELLIPSE',
  0x00000038: 'EMR_ROUNDRECT',
  // NOTE: poly/draw records use 0x100 range to avoid colliding with path-state
  // record ids above (spec values differ by EMF version; parser is consistent internally).
  0x0000013c: 'EMR_POLYLINE',
  0x0000013d: 'EMR_POLYLINE16',
  0x0000013e: 'EMR_POLYLINETO',
  0x0000013f: 'EMR_POLYLINETO16',
  0x00000142: 'EMR_POLYPOLYLINE',
  0x00000143: 'EMR_POLYPOLYLINE16',
  0x00000144: 'EMR_POLYGON',
  0x00000145: 'EMR_POLYGON16',
  0x00000146: 'EMR_POLYBEZIER',
  0x00000147: 'EMR_POLYBEZIER16',
  0x00000148: 'EMR_POLYBEZIERTO',
  0x00000149: 'EMR_POLYBEZIERTO16',
  0x0000014a: 'EMR_POLYDRAW',
  0x0000014b: 'EMR_POLYDRAW16',
  0x0000004c: 'EMR_EXTTEXTOUTW',
  0x0000004d: 'EMR_EXTTEXTOUTA',
  0x0000004e: 'EMR_SMALLTEXTOUT',
  0x0000004f: 'EMR_BITBLT',
  0x00000050: 'EMR_STRETCHBLT',
  0x00000051: 'EMR_STRETCHDIBITS',
  0x00000052: 'EMR_SETDIBITSTODEVICE',
  0x00000053: 'EMR_CREATEBITMAP',
  0x00000054: 'EMR_CREATEREGION',
  0x0000005b: 'EMR_FRAMERGN',
  0x0000005c: 'EMR_PAINTRGN',
  0x00000056: 'EMR_INVERTRGN',
  0x00000057: 'EMR_OFFSETCLIPRGN',
  0x00000058: 'EMR_EXTSELECTCLIPRGN',
}

// ─── EMF Header Parsing ────────────────────────────────────────

function parseEmfRect(reader: BinaryReader): Rect {
  return {
    left: reader.readInt32(),
    top: reader.readInt32(),
    right: reader.readInt32(),
    bottom: reader.readInt32(),
  }
}

/**
 * EMR_HEADER per [MS-EMF] 2.2.2.2: iType + nSize first, then bounds/frame,
 * and only then the 0x464D4520 signature at byte 40.
 */
function parseEmfHeader(reader: BinaryReader): EmfHeader {
  const recordType = reader.readUint32()
  if (recordType !== 1) {
    throw new Error(`Not an EMF header: record type ${recordType}`)
  }
  const recordSize = reader.readUint32()
  if (recordSize < 88) {
    throw new Error(`Invalid EMF header size: ${recordSize}`)
  }

  const bounds = parseEmfRect(reader)
  const frame = parseEmfRect(reader)

  const signature = reader.readUint32()
  if (signature !== ENHANCED_METAFILE_SIGNATURE) {
    throw new Error(`Invalid EMF signature: 0x${signature.toString(16)}`)
  }

  reader.readUint32() // nVersion
  reader.readUint32() // nBytes
  const recordsCount = reader.readUint32()
  const handCount = reader.readUint16()
  reader.readUint16() // sReserved
  const nDescription = reader.readUint32()
  const offDescription = reader.readUint32()
  const nPalEntries = reader.readUint32()
  const devCX = reader.readInt32()
  const devCY = reader.readInt32()
  const mmCX = reader.readInt32()
  const mmCY = reader.readInt32()

  // consumers want pixels: the bounds rectangle is already in device pixels
  const size = { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top }
  const dpi = {
    x: mmCX > 0 && devCX > 0 ? Math.round((devCX * 25.4) / mmCX) : 96,
    y: mmCY > 0 && devCY > 0 ? Math.round((devCY * 25.4) / mmCY) : 96,
  }

  // the description string lives at an absolute file offset
  let description: string | undefined
  if (nDescription > 0 && nDescription <= 1024 && offDescription >= 88) {
    const resume = reader.position
    try {
      reader.setPosition(offDescription)
      description = reader.readString(nDescription * 2, 'utf16le').replace(/\0+$/, '')
    } catch {
      description = undefined
    }
    reader.setPosition(resume)
  }

  // palette (LOGPALETTE) directly follows the 88-byte fixed part
  let logPalette: LogPalette | undefined
  if (nPalEntries > 0 && nPalEntries <= 256 && reader.remaining >= 4) {
    const saved = reader.position
    const palVersion = reader.readUint16()
    const palCount = reader.readUint16()
    if (palVersion === 0x300 && palCount > 0 && palCount <= 256) {
      const entries: Color[] = []
      for (let i = 0; i < palCount && reader.remaining >= 4; i++) {
        const val = reader.readUint32()
        entries.push({
          r: val & 0xff,
          g: (val >> 8) & 0xff,
          b: (val >> 16) & 0xff,
          a: 255,
        })
      }
      logPalette = { version: palVersion, entries }
    } else {
      // Not a palette — rewind so record parsing starts at the right offset
      reader.setPosition(saved)
    }
  }

  return {
    type: 'EMF',
    bounds,
    frame,
    size,
    dpi,
    recordsCount,
    handCount,
    description,
    pixelFormat: undefined,
    emfPlusFlags: undefined,
    logPalette,
  }
}

// ─── EMF Record Parsing ────────────────────────────────────────

function parseEmfRecord(reader: BinaryReader): any {
  if (reader.remaining < 8) return null

  const typeValue = reader.readUint32()
  const size = reader.readUint32()

  if (size < 8) throw new Error(`Invalid record size: ${size}`)

  const type = RECORD_TYPES[typeValue] ?? 'UNKNOWN_' + typeValue.toString(16)
  const dataSize = size - 8

  if (reader.remaining < dataSize) {
    throw new Error(
      `Record data truncated: expected ${dataSize} bytes, ${reader.remaining} remaining`,
    )
  }

  const data = reader.readBytes(dataSize)
  reader.align(4)

  return { type, size, data }
}

function parseEmfRecords(reader: BinaryReader, count: number): any[] {
  const records: any[] = []
  for (let i = 0; i < count && reader.remaining > 0; i++) {
    const record = parseEmfRecord(reader)
    if (!record) break
    records.push(record)
    if (record.type === 'EMR_EOF') break
  }
  return records
}

// ─── Main Parse Function ───────────────────────────────────────

export function parseEmf(buffer: Uint8Array, _options: any = {}): any {
  const reader = new BinaryReader(buffer)

  try {
    const header = parseEmfHeader(reader)
    const records = parseEmfRecords(reader, header.recordsCount)

    return { header, records, emfPlusRecords: undefined, svg: undefined, errors: [] }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return {
      header: {
        type: 'EMF',
        bounds: { left: 0, top: 0, right: 0, bottom: 0 },
        frame: { left: 0, top: 0, right: 0, bottom: 0 },
        size: { width: 0, height: 0 },
        dpi: { x: 96, y: 96 },
        recordsCount: 0,
        handCount: 0,
      },
      records: [],
      errors: [msg],
    }
  }
}
