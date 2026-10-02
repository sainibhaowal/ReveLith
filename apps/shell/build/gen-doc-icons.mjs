/**
 * Per-document-type icon generator (zero dependencies, pure Node).
 *
 * Produces build/icons/{docx,xlsx,pptx,pdf,md}.{ico,icns,png}: 256px artwork
 * rasterized in-process, PNG-encoded with node:zlib, then wrapped as Windows
 * ICO (16/32/48/256px PNG-compressed entries) and macOS ICNS (ic07/ic08 PNG
 * elements). The .ico files are referenced by `fileAssociations[].icon` in
 * electron-builder.cjs so each type gets its own Explorer icon.
 *
 * Usage: node build/gen-doc-icons.mjs [--check]
 *   --check validates the committed artifacts instead of regenerating them
 *   (used by apps/shell/tests/doc-icons.test.ts).
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, 'icons')
const SIZE = 256

// ─── Tiny RGBA canvas ─────────────────────────────────────────────

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

class Canvas {
  constructor(size) {
    this.size = size
    this.pixels = new Uint8Array(size * size * 4)
  }
  rect(x, y, w, h, hex, alpha = 255) {
    const [r, g, b] = hexRgb(hex)
    const s = this.size
    for (let j = Math.max(0, y); j < Math.min(s, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(s, x + w); i++) {
        const o = (j * s + i) * 4
        this.pixels[o] = r
        this.pixels[o + 1] = g
        this.pixels[o + 2] = b
        this.pixels[o + 3] = alpha
      }
    }
  }
  circle(cx, cy, r, hex) {
    const [cr, cg, cb] = hexRgb(hex)
    const s = this.size
    for (let j = Math.max(0, cy - r); j < Math.min(s, cy + r); j++) {
      for (let i = Math.max(0, cx - r); i < Math.min(s, cx + r); i++) {
        if ((i - cx) * (i - cx) + (j - cy) * (j - cy) <= r * r) {
          const o = (j * s + i) * 4
          this.pixels[o] = cr
          this.pixels[o + 1] = cg
          this.pixels[o + 2] = cb
          this.pixels[o + 3] = 255
        }
      }
    }
  }
  triangle(ax, ay, bx, by, cx, cy, hex) {
    const [r, g, b] = hexRgb(hex)
    const s = this.size
    const minY = Math.max(0, Math.min(ay, by, cy))
    const maxY = Math.min(s, Math.max(ay, by, cy))
    const edge = (x0, y0, x1, y1, y) => (x0 + ((x1 - x0) * (y - y0)) / (y1 - y0 || 1))
    for (let j = minY; j < maxY; j++) {
      const xs = []
      if ((ay <= j) !== (by <= j)) xs.push(edge(ax, ay, bx, by, j))
      if ((by <= j) !== (cy <= j)) xs.push(edge(bx, by, cx, cy, j))
      if ((cy <= j) !== (ay <= j)) xs.push(edge(cx, cy, ax, ay, j))
      if (xs.length < 2) continue
      const x0 = Math.max(0, Math.floor(Math.min(...xs)))
      const x1 = Math.min(s, Math.ceil(Math.max(...xs)))
      for (let i = x0; i < x1; i++) {
        const o = (j * s + i) * 4
        this.pixels[o] = r
        this.pixels[o + 1] = g
        this.pixels[o + 2] = b
        this.pixels[o + 3] = 255
      }
    }
  }
  /** Rounded-square base; corners outside the radius stay transparent. */
  base(hex, radius) {
    const s = this.size
    const [r, g, b] = hexRgb(hex)
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        const cx = Math.min(Math.max(i, radius), s - radius)
        const cy = Math.min(Math.max(j, radius), s - radius)
        if ((i - cx) * (i - cx) + (j - cy) * (j - cy) > radius * radius) continue
        const o = (j * s + i) * 4
        this.pixels[o] = r
        this.pixels[o + 1] = g
        this.pixels[o + 2] = b
        this.pixels[o + 3] = 255
      }
    }
  }
  downscale(to) {
    const out = new Canvas(to)
    const k = this.size / to
    for (let j = 0; j < to; j++) {
      for (let i = 0; i < to; i++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0
        for (let y = Math.floor(j * k); y < Math.floor((j + 1) * k); y++) {
          for (let x = Math.floor(i * k); x < Math.floor((i + 1) * k); x++) {
            const o = (y * this.size + x) * 4
            r += this.pixels[o]
            g += this.pixels[o + 1]
            b += this.pixels[o + 2]
            a += this.pixels[o + 3]
            n++
          }
        }
        const o = (j * to + i) * 4
        out.pixels[o] = Math.round(r / n)
        out.pixels[o + 1] = Math.round(g / n)
        out.pixels[o + 2] = Math.round(b / n)
        out.pixels[o + 3] = Math.round(a / n)
      }
    }
    return out
  }
}

// ─── Artwork (white glyphs on type colors) ────────────────────────

const WHITE = '#FFFFFF'

function artDocx(c) {
  c.base('#2B579A', 48)
  c.rect(66, 42, 124, 172, WHITE) // page
  c.triangle(148, 42, 190, 84, 148, 84, '#B0C4DE') // folded corner
  for (let i = 0; i < 3; i++) c.rect(84, 116 + i * 26, 88, 10, '#2B579A') // text lines
}

function artXlsx(c) {
  c.base('#217346', 48)
  c.rect(46, 66, 164, 124, WHITE) // sheet
  c.rect(46, 66, 164, 30, '#217346') // header band
  for (let i = 1; i < 4; i++) c.rect(46, 96 + i * 24, 164, 4, '#217346') // grid rows
  for (let i = 1; i < 3; i++) c.rect(46 + i * 55, 66, 4, 124, '#217346') // grid cols
}

function artPptx(c) {
  c.base('#D24726', 48)
  c.rect(48, 78, 160, 100, WHITE) // slide
  const bars = [34, 56, 44]
  bars.forEach((h, i) => c.rect(68 + i * 42, 158 - h, 28, h, '#D24726')) // bar chart
}

function artPdf(c) {
  c.base('#C0392B', 48)
  c.rect(66, 42, 124, 172, WHITE) // page
  c.rect(66, 42, 124, 46, '#C0392B') // top band
  for (let i = 0; i < 3; i++) c.rect(84, 116 + i * 26, 88, 10, '#C0392B') // text lines
}

function artMd(c) {
  c.base('#475569', 48)
  c.rect(66, 42, 124, 172, WHITE) // page
  // '#' heading marker from bars
  c.rect(104, 66, 10, 52, '#475569')
  c.rect(132, 66, 10, 52, '#475569')
  c.rect(94, 82, 68, 9, '#475569')
  c.rect(94, 100, 68, 9, '#475569')
  for (let i = 0; i < 2; i++) c.rect(84, 140 + i * 26, 88, 10, '#475569') // text lines
}

const ART = { docx: artDocx, xlsx: artXlsx, pptx: artPptx, pdf: artPdf, md: artMd }

// ─── PNG encoder (raw RGBA → PNG, CRC32 + zlib from node) ─────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(data).copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])), 8 + data.length)
  return out
}

function encodePng(canvas) {
  const s = canvas.size
  const raw = Buffer.alloc(s * (s * 4 + 1))
  for (let j = 0; j < s; j++) {
    raw[j * (s * 4 + 1)] = 0 // filter: none
    Buffer.from(canvas.pixels.subarray(j * s * 4, (j + 1) * s * 4)).copy(raw, j * (s * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(s, 0)
  ihdr.writeUInt32BE(s, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)]
  const compressed = deflateSync(raw)
  const MAX = 2 ** 31 - 1
  for (let i = 0; i < compressed.length; i += MAX) {
    parts.push(chunk('IDAT', compressed.subarray(i, Math.min(i + MAX, compressed.length))))
  }
  parts.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

// ─── ICO + ICNS writers (PNG-compressed entries) ──────────────────

function encodeIco(pngs) {
  // pngs: [{size, png}] sizes ascending
  const header = Buffer.alloc(6 + pngs.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = 6 + pngs.length * 16
  pngs.forEach((p, i) => {
    const o = 6 + i * 16
    header[o] = p.size >= 256 ? 0 : p.size
    header[o + 1] = p.size >= 256 ? 0 : p.size
    header[o + 2] = 0
    header[o + 3] = 0
    header.writeUInt16LE(1, o + 4)
    header.writeUInt16LE(32, o + 6)
    header.writeUInt32LE(p.png.length, o + 8)
    header.writeUInt32LE(offset, o + 12)
    offset += p.png.length
  })
  return Buffer.concat([header, ...pngs.map((p) => p.png)])
}

function icnsElement(tag, png) {
  const out = Buffer.alloc(8 + png.length)
  out.write(tag, 0, 'ascii')
  out.writeUInt32BE(8 + png.length, 4)
  png.copy(out, 8)
  return out
}

function encodeIcns(png256, png128) {
  const els = [icnsElement('ic08', png256), icnsElement('ic07', png128)]
  const total = 8 + els.reduce((n, e) => n + e.length, 0)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(total, 4)
  return Buffer.concat([header, ...els])
}

// ─── Validation (shared by --check and tests) ─────────────────────

function readPngSize(png) {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  // walk chunks to IHDR (first chunk)
  const len = png.readUInt32BE(8)
  if (png.toString('ascii', 12, 16) !== 'IHDR' || len !== 13) throw new Error('missing IHDR')
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) }
}

function validateIco(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('bad ICO header')
  const count = buf.readUInt16LE(4)
  if (count < 1) throw new Error('ICO has no entries')
  const sizes = []
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16
    const w = buf[o] === 0 ? 256 : buf[o]
    const len = buf.readUInt32LE(o + 8)
    const off = buf.readUInt32LE(o + 12)
    const { w: pw, h: ph } = readPngSize(buf.subarray(off, off + len))
    if (pw !== w || ph !== w) throw new Error(`ICO entry ${w}px holds ${pw}x${ph} PNG`)
    sizes.push(w)
  }
  return sizes
}

function validateIcns(buf) {
  if (buf.toString('ascii', 0, 4) !== 'icns') throw new Error('bad ICNS magic')
  if (buf.readUInt32BE(4) !== buf.length) throw new Error('ICNS length mismatch')
  const tags = []
  let o = 8
  while (o + 8 <= buf.length) {
    const tag = buf.toString('ascii', o, o + 4)
    const len = buf.readUInt32BE(o + 4)
    if (len < 8 || o + len > buf.length) throw new Error(`ICNS element ${tag} overruns`)
    readPngSize(buf.subarray(o + 8, o + len))
    tags.push(tag)
    o += len
  }
  return tags
}

export function validateIconSet(dir) {
  const report = {}
  for (const name of Object.keys(ART)) {
    const ico = readFileSync(join(dir, `${name}.ico`))
    const icns = readFileSync(join(dir, `${name}.icns`))
    report[name] = { ico: validateIco(ico), icns: validateIcns(icns) }
  }
  return report
}

// ─── Main ─────────────────────────────────────────────────────────

function generate() {
  mkdirSync(OUT_DIR, { recursive: true })
  const manifest = {}
  for (const [name, draw] of Object.entries(ART)) {
    const full = new Canvas(SIZE)
    draw(full)
    const png256 = encodePng(full)
    const png128 = encodePng(full.downscale(128))
    const ico = encodeIco(
      [16, 32, 48, 256].map((s) => ({
        size: s,
        png: encodePng(s === 256 ? full : full.downscale(s)),
      })),
    )
    const icns = encodeIcns(png256, png128)
    writeFileSync(join(OUT_DIR, `${name}.png`), png256)
    writeFileSync(join(OUT_DIR, `${name}.ico`), ico)
    writeFileSync(join(OUT_DIR, `${name}.icns`), icns)
    manifest[name] = {
      sha256: createHash('sha256').update(ico).digest('hex').slice(0, 12),
      pngBytes: png256.length,
      icoBytes: ico.length,
      icnsBytes: icns.length,
    }
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`icons written to ${OUT_DIR}`)
  console.log(JSON.stringify(validateIconSet(OUT_DIR), null, 2))
}

const args = process.argv.slice(2)
if (args.includes('--check')) {
  if (!existsSync(OUT_DIR)) {
    console.error(`missing ${OUT_DIR}: run node build/gen-doc-icons.mjs first`)
    process.exit(1)
  }
  console.log(JSON.stringify(validateIconSet(OUT_DIR), null, 2))
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generate()
}
