import { describe, expect, it } from 'vitest'
import { extractEmfBitmapDataUrl } from '../src/metafile-bitmap'
import { metafileToDataUrl } from '../src/metafile'

/**
 * Native EMF bitmap fallback: Office EMFs that wrap a DIB must still display
 * when the canvas-based vendor converter cannot render them (unsupported
 * records, or no canvas API like this node environment).
 */

function u32(dv: DataView, off: number, v: number): void {
  dv.setUint32(off, v, true)
}

/** EMR_HEADER + EMR_STRETCHDIBITS (2x2 24-bit DIB) + EMR_EOF */
export function emfWithEmbeddedDib(): Uint8Array {
  const dibInfo = new Uint8Array(40)
  const iv = new DataView(dibInfo.buffer)
  u32(iv, 0, 40) // biSize
  iv.setInt32(4, 2, true) // biWidth
  iv.setInt32(8, 2, true) // biHeight
  iv.setUint16(12, 1, true) // biPlanes
  iv.setUint16(14, 24, true) // biBitCount
  u32(iv, 16, 0) // BI_RGB
  u32(iv, 20, 16) // biSizeImage
  const bits = new Uint8Array([
    // bottom row: red, green + pad
    0, 0, 255, 0, 255, 0, 0, 0,
    // top row: blue, white + pad
    255, 0, 0, 255, 255, 255, 0, 0,
  ])

  const fixed = new Uint8Array(100)
  const fv = new DataView(fixed.buffer)
  // rclBounds (0,0,2,2)
  fv.setInt32(0, 0, true)
  fv.setInt32(4, 0, true)
  fv.setInt32(8, 2, true)
  fv.setInt32(12, 2, true)
  // xDest,yDest,cxDest,cyDest
  fv.setInt32(16, 0, true)
  fv.setInt32(20, 0, true)
  fv.setInt32(24, 2, true)
  fv.setInt32(28, 2, true)
  u32(fv, 32, 0x00cc0020) // SRCCOPY
  fv.setInt32(36, 0, true)
  fv.setInt32(40, 0, true)
  // xformSrc identity
  fv.setFloat32(44, 1, true)
  fv.setFloat32(48, 0, true)
  fv.setFloat32(52, 0, true)
  fv.setFloat32(56, 1, true)
  fv.setFloat32(60, 0, true)
  fv.setFloat32(64, 0, true)
  u32(fv, 68, 0x00ffffff) // BkColorSrc
  u32(fv, 72, 0) // DIB_RGB_COLORS
  u32(fv, 76, 100) // offBmiSrc (from record start)
  u32(fv, 80, 40) // cbBmiSrc
  u32(fv, 84, 140) // offBitsSrc (from record start)
  u32(fv, 88, 16) // cbBitsSrc

  const recSize = 100 + 40 + 16
  const rec = new Uint8Array(recSize)
  const rv = new DataView(rec.buffer)
  u32(rv, 0, 81) // EMR_STRETCHDIBITS
  u32(rv, 4, recSize)
  rec.set(fixed.subarray(0, 92), 8)
  rec.set(dibInfo, 100)
  rec.set(bits, 140)

  const total = 88 + recSize + 20
  const out = new Uint8Array(total)
  const ov = new DataView(out.buffer)
  u32(ov, 0, 1) // EMR_HEADER
  u32(ov, 4, 88)
  ov.setInt32(16, 100, true)
  ov.setInt32(20, 100, true)
  ov.setInt32(32, 2646, true)
  ov.setInt32(36, 2646, true)
  u32(ov, 40, 0x464d4520)
  u32(ov, 44, 0x00010000)
  u32(ov, 48, total)
  u32(ov, 52, 3)
  ov.setUint16(56, 1, true)
  out.set(rec, 88)
  const eof = total - 20
  u32(ov, eof, 14) // EMR_EOF
  u32(ov, eof + 4, 20)
  u32(ov, eof + 8, 0)
  u32(ov, eof + 12, 16)
  u32(ov, eof + 16, 20)
  return out
}

function decodeBmp(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  return Uint8Array.from(Buffer.from(base64, 'base64'))
}

describe('extractEmfBitmapDataUrl', () => {
  it('extracts the embedded DIB as a BMP data URL', () => {
    const url = extractEmfBitmapDataUrl(emfWithEmbeddedDib())
    expect(url).not.toBeNull()
    expect(url!.startsWith('data:image/bmp;base64,')).toBe(true)
    const bmp = decodeBmp(url!)
    expect(bmp[0]).toBe(0x42) // 'B'
    expect(bmp[1]).toBe(0x4d) // 'M'
    const view = new DataView(bmp.buffer)
    expect(view.getInt32(18, true)).toBe(2) // biWidth
    expect(view.getInt32(22, true)).toBe(2) // biHeight
    expect(view.getUint16(28, true)).toBe(24) // biBitCount
  })

  it('returns null for garbage and vector-only EMFs', () => {
    expect(extractEmfBitmapDataUrl(new Uint8Array([1, 2, 3, 4]))).toBeNull()
    expect(extractEmfBitmapDataUrl(new Uint8Array(0))).toBeNull()
  })
})

describe('metafileToDataUrl EMF fallback', () => {
  // node has no canvas API, so the vendor converter degrades to null and the
  // native bitmap fallback must produce the image instead of a blank frame
  it('falls back to the embedded bitmap when rendering is unavailable', async () => {
    const url = await metafileToDataUrl(emfWithEmbeddedDib(), 'image/emf')
    expect(url).not.toBeNull()
    expect(url!.startsWith('data:image/bmp;base64,')).toBe(true)
  })
})
