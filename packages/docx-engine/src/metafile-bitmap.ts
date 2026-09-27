/**
 * Native EMF bitmap fallback (no canvas needed).
 *
 * A large share of real-world .emf parts are GDI wrappers around an embedded
 * device-independent bitmap (EMR_STRETCHDIBITS): Office chart/picture exports
 * in particular. When the canvas-based vendor converter cannot render a file
 * (unsupported records, no canvas API), extracting that bitmap still shows
 * the picture instead of a blank frame: DIB bytes + a 14-byte BMP file
 * header is a BMP Chromium renders directly.
 *
 * Record layout follows [MS-EMF] 2.3.5.3 (offsets below are relative to the
 * record start; the parser strips the 8-byte type+size header from `data`).
 */
import { parseEmf } from '@revelith/emf-parser'

/** Fixed part of EMR_STRETCHDIBITS through cbBitsSrc, from the record start. */
const STRETCHDIBITS_FIXED_SIZE = 100
/** BITMAPINFOHEADER size; only BI_RGB (compression 0) is extracted. */
const BITMAPINFOHEADER_SIZE = 40
const BI_RGB = 0

function base64Of(bytes: Uint8Array): string {
  const bufferCtor = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(e: string): string } } }).Buffer
  if (bufferCtor) return bufferCtor.from(bytes).toString('base64')
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Scan EMF records for the first EMR_STRETCHDIBITS carrying a BI_RGB DIB and
 * return it as a `data:image/bmp` URL. Null when absent or malformed.
 */
export function extractEmfBitmapDataUrl(input: Uint8Array): string | null {
  let parsed: { records?: Array<{ type?: string; size?: number; data?: Uint8Array }> }
  try {
    parsed = parseEmf(input)
  } catch {
    return null
  }
  if (!parsed || !Array.isArray(parsed.records)) return null

  for (const record of parsed.records) {
    const url = stretchDibToBmp(record?.data)
    if (url) return url
  }
  return null
}

function stretchDibToBmp(data: Uint8Array | undefined): string | null {
  if (!data || data.length < STRETCHDIBITS_FIXED_SIZE - 8) return null
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    // spec offsets minus the stripped 8-byte record header
    const offBmi = view.getUint32(84 - 8, true)
    const cbBmi = view.getUint32(88 - 8, true)
    const offBits = view.getUint32(92 - 8, true)
    const cbBits = view.getUint32(96 - 8, true)
    const recordSize = data.length + 8

    if (
      offBmi < STRETCHDIBITS_FIXED_SIZE ||
      cbBmi < BITMAPINFOHEADER_SIZE ||
      offBits < STRETCHDIBITS_FIXED_SIZE ||
      cbBits === 0 ||
      offBmi + cbBmi > recordSize ||
      offBits + cbBits > recordSize
    ) {
      return null
    }

    const dibInfo = data.subarray(offBmi - 8, offBmi - 8 + cbBmi)
    const dibView = new DataView(dibInfo.buffer, dibInfo.byteOffset, dibInfo.byteLength)
    if (dibView.getUint32(0, true) < BITMAPINFOHEADER_SIZE) return null
    // biCompression at +16: only uncompressed RGB is repackaged blindly
    if (dibView.getUint32(16, true) !== BI_RGB) return null
    const bits = data.subarray(offBits - 8, offBits - 8 + cbBits)

    const fileHeader = new Uint8Array(14)
    const headerView = new DataView(fileHeader.buffer)
    headerView.setUint8(0, 0x42) // 'B'
    headerView.setUint8(1, 0x4d) // 'M'
    headerView.setUint32(2, 14 + cbBmi + cbBits, true)
    headerView.setUint32(10, 14 + cbBmi, true)

    const bmp = new Uint8Array(14 + cbBmi + cbBits)
    bmp.set(fileHeader, 0)
    bmp.set(dibInfo, 14)
    bmp.set(bits, 14 + cbBmi)
    return `data:image/bmp;base64,${base64Of(bmp)}`
  } catch {
    return null
  }
}
