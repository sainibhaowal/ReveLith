/**
 * Per-document-type icon generator (zero dependencies, pure Node).
 *
 * Produces build/icons/{docx,xlsx,pptx,pdf,md,html}.{ico,icns,png}: 256px artwork
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
  /** `scale` multiplies every coordinate, so one artwork function renders at any
   *  resolution (the 256px space the artwork is written in stays the reference). */
  constructor(size, scale = 1) {
    this.size = size
    this.scale = scale
    this.pixels = new Uint8Array(size * size * 4)
  }
  rect(x, y, w, h, hex, alpha = 255) {
    const [r, g, b] = hexRgb(hex)
    const s = this.size
    const k = this.scale
    const x0 = Math.round(x * k)
    const y0 = Math.round(y * k)
    const x1 = Math.round((x + w) * k)
    const y1 = Math.round((y + h) * k)
    for (let j = Math.max(0, y0); j < Math.min(s, y1); j++) {
      for (let i = Math.max(0, x0); i < Math.min(s, x1); i++) {
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
    const k = this.scale
    const x = cx * k
    const y = cy * k
    const rad = r * k
    for (let j = Math.max(0, Math.floor(y - rad)); j < Math.min(s, Math.ceil(y + rad)); j++) {
      for (let i = Math.max(0, Math.floor(x - rad)); i < Math.min(s, Math.ceil(x + rad)); i++) {
        if ((i - x) * (i - x) + (j - y) * (j - y) <= rad * rad) {
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
    const k = this.scale
    ax *= k; ay *= k; bx *= k; by *= k; cx *= k; cy *= k
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)))
    const maxY = Math.min(s, Math.ceil(Math.max(ay, by, cy)))
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
  /** A rotated bar (x1,y1)→(x2,y2) with a given thickness, as two triangles:
   *  the diagonal strokes (check marks, brush strokes) no primitive covers. */
  bar(x1, y1, x2, y2, thickness, hex) {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * (thickness / 2)
    const ny = (dx / len) * (thickness / 2)
    const p = [
      [x1 + nx, y1 + ny],
      [x2 + nx, y2 + ny],
      [x2 - nx, y2 - ny],
      [x1 - nx, y1 - ny],
    ]
    this.triangle(p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1], hex)
    this.triangle(p[0][0], p[0][1], p[2][0], p[2][1], p[3][0], p[3][1], hex)
  }
  /** Rounded-square base; corners outside the radius stay transparent. */
  base(hex, radius) {
    const s = this.size
    const [r, g, b] = hexRgb(hex)
    const k = this.scale
    const rad = radius * k
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        const cx = Math.min(Math.max(i, rad), s - rad)
        const cy = Math.min(Math.max(j, rad), s - rad)
        if ((i - cx) * (i - cx) + (j - cy) * (j - cy) > rad * rad) continue
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

function artHtml(c) {
  // teal matches the in-app file-html.svg tile; solid angle brackets read as
  // code at 16px where stroked chevrons would blur together
  c.base('#0FA3A3', 48)
  c.rect(66, 42, 124, 172, WHITE) // page
  c.triangle(126, 106, 126, 164, 90, 135, '#0FA3A3') // <
  c.triangle(130, 106, 130, 164, 166, 135, '#0FA3A3') // >
}

// ─── The three AI apps (forms / tasks / draw) ─────────────────────
// One artwork per app feeds every surface: the Explorer file-association
// icon, the native menu item, the home/tab tile SVG and the app's own icon,
// so an app cannot look like one thing here and another thing there.

function artForm(c) {
  const PURPLE = '#7C3AED'
  c.base(PURPLE, 48)
  c.rect(58, 40, 140, 176, WHITE) // form sheet
  // three filled rows with their checkbox squares, then a wide signature line
  for (let i = 0; i < 3; i++) {
    c.rect(76, 68 + i * 38, 24, 24, PURPLE)
    c.rect(112, 72 + i * 38, 66, 16, PURPLE)
  }
  c.rect(76, 186, 102, 14, PURPLE)
}

function artTasks(c) {
  const GREEN = '#059669'
  c.base(GREEN, 48)
  // bold check: two bars, the short stroke rising into the long one
  c.bar(70, 138, 112, 180, 30, WHITE)
  c.bar(112, 180, 190, 84, 30, WHITE)
}

function artDraw(c) {
  const BLUE = '#0284C7'
  c.base(BLUE, 48)
  // pencil: body, ferrule band, tip — reads as "draw" even at 16px
  c.rect(104, 46, 48, 104, WHITE)
  c.rect(104, 150, 48, 14, '#075985')
  c.triangle(104, 164, 152, 164, 128, 212, WHITE)
}

const ART = {
  docx: artDocx,
  xlsx: artXlsx,
  pptx: artPptx,
  pdf: artPdf,
  md: artMd,
  html: artHtml,
  form: artForm,
  tasks: artTasks,
  draw: artDraw,
}

/** The three AI apps, in the order the shell lists them (kind → icon key). */
export const APP_ICON_NAMES = { forms: 'form', tasks: 'tasks', drawboard: 'draw' }

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

// ─── SVG tiles (the same artwork the renderer shows) ──────────────

const SHELL_ASSETS = join(HERE, '..', 'src', 'renderer', 'src', 'assets')
const MENU_ASSETS = join(HERE, '..', 'src', 'main', 'assets')
const APPS_DIR = join(HERE, '..', '..')

/** Records the Canvas calls as SVG elements, so an app's tile and its .ico can
 *  never drift apart (same artwork function draws both). */
class SvgCanvas {
  constructor() {
    this.parts = []
  }
  rect(x, y, w, h, hex, alpha = 255) {
    const op = alpha === 255 ? '' : ` fill-opacity="${(alpha / 255).toFixed(2)}"`
    this.parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${hex}"${op}/>`,
    )
  }
  circle(cx, cy, r, hex) {
    this.parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${hex}"/>`)
  }
  triangle(ax, ay, bx, by, cx, cy, hex) {
    this.parts.push(`<polygon points="${ax},${ay} ${bx},${by} ${cx},${cy}" fill="${hex}"/>`)
  }
  bar(x1, y1, x2, y2, thickness, hex) {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * (thickness / 2)
    const ny = (dx / len) * (thickness / 2)
    const p = [
      [x1 + nx, y1 + ny],
      [x2 + nx, y2 + ny],
      [x2 - nx, y2 - ny],
      [x1 - nx, y1 - ny],
    ]
    this.parts.push(
      `<polygon points="${p.map(([x, y]) => `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`).join(' ')}" fill="${hex}"/>`,
    )
  }
  base(hex, radius) {
    this.parts.unshift(
      `<rect x="0" y="0" width="256" height="256" rx="${radius}" fill="${hex}"/>`,
    )
  }
}

function svgTile(draw) {
  const c = new SvgCanvas()
  draw(c)
  return [
    '<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">',
    ...c.parts,
    '</svg>',
    '',
  ].join('\n')
}

/** Renderer tiles: the home/tab artwork, named after the file type they mark. */
function writeSvgTiles() {
  const written = []
  for (const [name, draw] of Object.entries(ART)) {
    const file = join(SHELL_ASSETS, `file-${name}.svg`)
    // only the AI-app tiles are generated; the office file tiles are hand-authored
    if (!['form', 'tasks', 'draw'].includes(name)) continue
    writeFileSync(file, svgTile(draw))
    written.push(`src/renderer/src/assets/file-${name}.svg`)
  }
  return written
}

/** Native menu icons, at the 16/32px the office menu icons use (the AI apps
 *  shipped 20/40px art, which is why they looked oversized in the menu). */
function writeMenuIcons() {
  const written = []
  for (const name of ['form', 'tasks', 'draw']) {
    const master = new Canvas(SIZE)
    ART[name](master)
    for (const [suffix, size] of [['', 16], ['@2x', 32]]) {
      const png = encodePng(master.downscale(size))
      writeFileSync(join(MENU_ASSETS, `menu-${name}${suffix}.png`), png)
      written.push(`src/main/assets/menu-${name}${suffix}.png`)
    }
  }
  return written
}

/** Standalone app icons for the three apps' own installers (electron-builder
 *  takes a PNG ≥256px); rendered at 512 from the same artwork. */
function writeAppIcons() {
  const written = []
  for (const [kind, name] of Object.entries(APP_ICON_NAMES)) {
    const slug = { forms: 'forms-builder', tasks: 'tasks', drawboard: 'drawboard' }[kind]
    const master = new Canvas(512, 2)
    ART[name](master)
    const dir = join(APPS_DIR, slug, 'build')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'icon.png'), encodePng(master))
    written.push(`apps/${slug}/build/icon.png`)
  }
  return written
}

/** electron-builder resolves a fileAssociations `icon: 'name'` to
 *  build/name.ico (NSIS DefaultIcon) and build/name.icns (mac
 *  CFBundleDocumentTypes) — NOT to build/icons/, which feeds the linux icon set
 *  and the validation report. The office types' root copies predate this
 *  generator (different artwork tool), so only the AI apps are mirrored here:
 *  leaving the office files alone keeps their shipped Explorer icons untouched.
 */
function writePackagerAssociationIcons() {
  const written = []
  for (const name of ['form', 'tasks', 'draw']) {
    const full = new Canvas(SIZE)
    ART[name](full)
    writeFileSync(join(HERE, `${name}.ico`), encodeIco(
      [16, 32, 48, 256].map((s) => ({ size: s, png: encodePng(s === 256 ? full : full.downscale(s)) })),
    ))
    writeFileSync(join(HERE, `${name}.icns`), encodeIcns(encodePng(full), encodePng(full.downscale(128))))
    written.push(`build/${name}.ico`, `build/${name}.icns`)
  }
  return written
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
  const derived = [
    ...writeSvgTiles(),
    ...writeMenuIcons(),
    ...writeAppIcons(),
    ...writePackagerAssociationIcons(),
  ]
  console.log(`icons written to ${OUT_DIR}`)
  console.log(`derived artwork written: ${derived.length} file(s)`)
  for (const file of derived) console.log(`  ${file}`)
  console.log(JSON.stringify(validateIconSet(OUT_DIR), null, 2))
}

const args = process.argv.slice(2)
if (args.includes('--check')) {
  if (!existsSync(OUT_DIR)) {
    console.error(`missing ${OUT_DIR}: run node build/gen-doc-icons.mjs first`)
    process.exit(1)
  }
  console.log(JSON.stringify(validateIconSet(OUT_DIR), null, 2))
} else if (args.includes('--packager-only')) {
  // Packaging (dist:*) only needs the association icons electron-builder
  // resolves against build/; regenerating them here keeps a fresh clone's
  // installer correct without rewriting the rendered source tiles.
  const written = writePackagerAssociationIcons()
  console.log(`association icons written: ${written.join(', ')}`)
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generate()
}
