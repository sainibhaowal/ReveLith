import { describe, it, expect } from 'vitest'
import { BinaryReader } from '../src/utils'
import { parseEmf } from '../src/emf'
import { parseEmfPlusHeader, parseEmfPlusRecords } from '../src/emfp'

function makeMinimalEmf(): Uint8Array {
  // EMR_HEADER per [MS-EMF] 2.2.2.2 (88 bytes) + EMR_EOF (20 bytes)
  const buf = new Uint8Array(108)
  const view = new DataView(buf.buffer)
  let o = 0
  const u32 = (v: number) => {
    view.setUint32(o, v, true)
    o += 4
  }
  const i32 = (v: number) => {
    view.setInt32(o, v, true)
    o += 4
  }
  const u16 = (v: number) => {
    view.setUint16(o, v, true)
    o += 2
  }
  u32(1) // iType = EMR_HEADER
  u32(88) // nSize
  // rclBounds
  i32(0)
  i32(0)
  i32(100)
  i32(100)
  // rclFrame
  i32(0)
  i32(0)
  i32(100)
  i32(100)
  u32(0x464d4520) // dSignature
  u32(0x00010000) // nVersion
  u32(108) // nBytes
  u32(2) // nRecords (header + EOF)
  u16(1) // nHandles
  u16(0) // sReserved
  u32(0) // nDescription
  u32(0) // offDescription
  u32(0) // nPalEntries
  i32(0)
  i32(0) // szlDevice
  i32(0)
  i32(0) // szlMillimeters
  // EMR_EOF record
  u32(0x0000000e)
  u32(20)
  u32(0) // nPalEntries
  u32(16) // offPalEntries
  u32(20) // nSizeLast
  return buf
}

describe('BinaryReader', () => {
  it('reads primitives and tracks remaining', () => {
    const buf = new Uint8Array([1, 0, 0, 0, 2, 0])
    const r = new BinaryReader(buf)
    expect(r.readUint32()).toBe(1)
    expect(r.remaining).toBe(2)
    expect(r.readUint16()).toBe(2)
    expect(r.remaining).toBe(0)
  })

  it('throws on buffer underflow', () => {
    const r = new BinaryReader(new Uint8Array([1]))
    expect(() => r.readUint32()).toThrow()
  })
})

describe('parseEmf', () => {
  it('parses a minimal header without errors', () => {
    const result = parseEmf(makeMinimalEmf())
    expect(result.errors).toEqual([])
    expect(result.header.recordsCount).toBe(2)
    expect(result.header.size.width).toBe(100)
    expect(result.records.length).toBe(1)
    expect(result.records[0].type).toBe('EMR_EOF')
  })

  it('returns errors for invalid signature', () => {
    const result = parseEmf(new Uint8Array(88))
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.records).toEqual([])
  })

  it('returns errors for truncated buffer', () => {
    const result = parseEmf(new Uint8Array([1, 2, 3]))
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('emfplus', () => {
  it('rejects non-header buffers', () => {
    expect(() => parseEmfPlusHeader(new Uint8Array(16))).toThrow()
  })

  it('returns empty records for empty buffer', () => {
    expect(parseEmfPlusRecords(new Uint8Array(0))).toEqual([])
  })
})
