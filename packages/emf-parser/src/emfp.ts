/**
 * EMF+ Parser Implementation
 *
 * Parses Enhanced Metafile Format Plus Extensions (EMF+) records.
 * Based on [MS-EMFPLUS] specification.
 */

import { BinaryReader } from './utils'
import type { EmfPlusHeader, ParsedEmfPlusRecord } from './index'

// ─── EMF+ Record Type Constants ────────────────────────────────

const EMPFPLUS_RECORD_TYPES: Record<number, string> = {
  // Object records
  0x00000001: 'EmfPlusSerializableObject',
  0x00000002: 'EmfPlusTerminalServerObject',
  0x00000003: 'EmfPlusObject',
  // Drawing records
  0x00000010: 'EmfPlusDrawLines',
  0x00000011: 'EmfPlusDrawRects',
  0x00000012: 'EmfPlusDrawEllipses',
  0x00000013: 'EmfPlusDrawArcs',
  0x00000014: 'EmfPlusDrawBeziers',
  0x00000015: 'EmfPlusDrawPath',
  0x00000016: 'EmfPlusDrawImage',
  0x00000017: 'EmfPlusDrawImagePoints',
  0x00000018: 'EmfPlusDrawString',
  0x00000019: 'EmfPlusDrawDriverString',
  // Fill records
  0x00000020: 'EmfPlusFillRects',
  0x00000021: 'EmfPlusFillEllipses',
  0x00000022: 'EmfPlusFillPath',
  0x00000023: 'EmfPlusFillPie',
  0x00000024: 'EmfPlusFillRegion',
  0x00000025: 'EmfPlusFillPolygon',
  // State records
  0x00000030: 'EmfPlusSetWorldTransform',
  0x00000031: 'EmfPlusResetWorldTransform',
  0x00000032: 'EmfPlusMultiplyWorldTransform',
  0x00000033: 'EmfPlusTranslateWorldTransform',
  0x00000034: 'EmfPlusScaleWorldTransform',
  0x00000035: 'EmfPlusRotateWorldTransform',
  0x00000036: 'EmfPlusSetClipRect',
  0x00000037: 'EmfPlusSetClipPath',
  0x00000038: 'EmfPlusSetClipRegion',
  0x00000039: 'EmfPlusOffsetClip',
  0x0000003A: 'EmfPlusSetRenderingOrigin',
  0x0000003B: 'EmfPlusSetAntiAliasMode',
  0x0000003C: 'EmfPlusSetTextRenderingHint',
  0x0000003D: 'EmfPlusSetTextContrast',
  0x0000003E: 'EmfPlusSetInterpolationMode',
  0x0000003F: 'EmfPlusSetPixelOffsetMode',
  0x00000040: 'EmfPlusSetCompositingMode',
  0x00000041: 'EmfPlusSetCompositingQuality',
  0x00000042: 'EmfPlusSetSmoothingMode',
  0x00000043: 'EmfPlusSetPageUnit',
  0x00000044: 'EmfPlusSetPageScale',
  // Object records
  0x00000050: 'EmfPlusFillRectangles',
  0x00000051: 'EmfPlusFillEllipse',
  0x00000052: 'EmfPlusFillPie',
  0x00000053: 'EmfPlusFillClosedCurve',
  // Brush/Pen
  0x00000060: 'EmfPlusSolidBrush',
  0x00000061: 'EmfPlusHatchBrush',
  0x00000062: 'EmfPlusTextureBrush',
  0x00000063: 'EmfPlusPathGradientBrush',
  0x00000064: 'EmfPlusLinearGradientBrush',
  0x00000065: 'EmfPlusPen',
  // Font/Image
  0x00000070: 'EmfPlusFont',
  0x00000071: 'EmfPlusImage',
  0x00000072: 'EmfPlusImageAttributes',
  // Region
  0x00000080: 'EmfPlusRegion',
  // Path
  0x00000090: 'EmfPlusPath',
  0x00000091: 'EmfPlusDrawPath',
  // StringFormat
  0x000000A0: 'EmfPlusStringFormat',
  // Metafile
  0x000000F0: 'EmfPlusHeader',
  0x000000F1: 'EmfPlusEndOfFile',
  0x000000F2: 'EmfPlusComment',
}

// ─── EMF+ Header ──────────────────────────────────────────────

export function parseEmfPlusHeader(buffer: Uint8Array): EmfPlusHeader {
  const reader = new BinaryReader(buffer)

  const type = reader.readUint16()
  const flags = reader.readUint16()
  const size = reader.readUint32()

  if (type !== 0xF0) throw new Error('Not an EMF+ header record')

  const version = reader.readUint32()
  const emfPlusFlags = reader.readUint32()
  const width = reader.readUint32()
  const height = reader.readUint32()
  const dpiX = reader.readUint32()
  const dpiY = reader.readUint32()
  const maxRecord = reader.readUint32()

  return { version, emfPlusFlags, width, height, dpiX, dpiY, maxRecord }
}

export function parseEmfPlusRecords(buffer: Uint8Array): any[] {
  const reader = new BinaryReader(buffer)
  const records: any[] = []

  while (reader.remaining >= 12) {
    const typeValue = reader.readUint16()
    const flags = reader.readUint16()
    const size = reader.readUint32()

    if (size < 12) break

    const dataSize = size - 12
    if (reader.remaining < dataSize) break

    const type = EMPFPLUS_RECORD_TYPES[typeValue] ?? ('UNKNOWN_' + typeValue.toString(16))
    const data = reader.readBytes(dataSize)
    reader.align(4)

    records.push({ type, typeValue, flags, size, data })

    if (type === 'EmfPlusEndOfFile') break
  }

  return records
}

export function parseEmfPlus(buffer: Uint8Array): { header: any; records: any[] } {
  const header = parseEmfPlusHeader(buffer)
  const records = parseEmfPlusRecords(buffer.slice(16))
  return { header, records }
}

export function emfPlusToSvg(emfPlusData: any, options: any = {}): any {
  return {
    width: 800,
    height: 600,
    viewBox: '0 0 800 600',
    elements: [],
    defs: [],
  }
}