/**
 * Shared utilities for EMF/EMF+ parsing
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Size {
  width: number
  height: number
}

export interface Color {
  r: number
  g: number
  b: number
  a?: number
}

export interface Matrix {
  m11: number
  m12: number
  m21: number
  m22: number
  dx: number
  dy: number
}

// Binary Reader utility class
export class BinaryReader {
  private view: DataView
  private offset: number = 0

  constructor(buffer: Uint8Array) {
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  }

  get remaining(): number {
    return this.view.byteLength - this.offset
  }

  get position(): number {
    return this.offset
  }

  setPosition(pos: number): void {
    this.offset = pos
  }

  private checkBounds(bytes: number): void {
    if (this.offset + bytes > this.view.byteLength) {
      throw new Error(`Buffer underflow: need ${bytes} bytes, ${this.remaining} remaining`)
    }
  }

  readUint8(): number {
    this.checkBounds(1)
    return this.view.getUint8(this.offset++)
  }

  readInt8(): number {
    this.checkBounds(1)
    return this.view.getInt8(this.offset++)
  }

  readUint16(): number {
    this.checkBounds(2)
    const val = this.view.getUint16(this.offset, true)
    this.offset += 2
    return val
  }

  readInt16(): number {
    this.checkBounds(2)
    const val = this.view.getInt16(this.offset, true)
    this.offset += 2
    return val
  }

  readUint32(): number {
    this.checkBounds(4)
    const val = this.view.getUint32(this.offset, true)
    this.offset += 4
    return val
  }

  readInt32(): number {
    this.checkBounds(4)
    const val = this.view.getInt32(this.offset, true)
    this.offset += 4
    return val
  }

  readFloat32(): number {
    this.checkBounds(4)
    const val = this.view.getFloat32(this.offset, true)
    this.offset += 4
    return val
  }

  readFloat64(): number {
    this.checkBounds(8)
    const val = this.view.getFloat64(this.offset, true)
    this.offset += 8
    return val
  }

  readBytes(count: number): Uint8Array {
    this.checkBounds(count)
    const result = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, count)
    this.offset += count
    return result
  }

  readString(length: number, encoding: 'utf8' | 'utf16le' = 'utf8'): string {
    const bytes = this.readBytes(length)
    if (encoding === 'utf16le') {
      return new TextDecoder('utf-16le').decode(bytes)
    }
    return new TextDecoder('utf-8').decode(bytes)
  }

  align(alignment: number = 4): void {
    const remainder = this.offset % alignment
    if (remainder !== 0) {
      this.offset += alignment - remainder
    }
  }
}

export function parseColorRef(data: Uint8Array): { r: number; g: number; b: number; a: number } {
  const reader = new BinaryReader(data)
  const val = reader.readUint32()
  return {
    r: val & 0xFF,
    g: (val >> 8) & 0xFF,
    b: (val >> 16) & 0xFF,
    a: 255,
  }
}

export function parseRect(data: Uint8Array): { left: number; top: number; right: number; bottom: number } {
  const reader = new BinaryReader(data)
  return {
    left: reader.readInt32(),
    top: reader.readInt32(),
    right: reader.readInt32(),
    bottom: reader.readInt32(),
  }
}

export function parsePoint(data: Uint8Array): { x: number; y: number } {
  const reader = new BinaryReader(data)
  return {
    x: reader.readInt32(),
    y: reader.readInt32(),
  }
}