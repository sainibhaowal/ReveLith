#!/usr/bin/env node
/**
 * Generate the per-file-type document icons from the shell renderer's own
 * file-type artwork, for the OS file associations (the `icon` field of
 * fileAssociations in apps/shell/electron-builder.cjs): `<type>.icns` for the
 * macOS document-type entry and `<type>.ico` for the Windows DefaultIcon
 * registry value.
 *
 * The source of truth is apps/shell/src/renderer/src/assets/file-*.svg, so
 * Finder and Explorer show the same visual language as the in-app recent-files
 * list instead of a second, separately maintained set of glyphs.
 *
 * NOTE: apps/shell/build/gen-doc-icons.mjs is the generator the repository
 * actually ships with. It draws its artwork in-process (pure Node, no browser
 * and no Playwright) and owns the committed files under apps/shell/build/icons,
 * plus a --check mode the icon test uses. This tool is the alternative that
 * derives the icons from the renderer artwork, kept for when the SVG tiles and
 * the shipped icons need to be re-aligned. Running it overwrites the committed
 * .ico/.icns, so regenerate with gen-doc-icons.mjs afterwards unless the SVG
 * change is the intended source of truth.
 *
 *   node tools/gen-file-association-icons.mjs
 *
 * Requires: playwright (a devDependency) and a local Chrome install, since the
 * SVGs are rasterized through the system browser. iconutil is macOS-only, so
 * the .icns output only completes there; the .ico files build anywhere.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svgDir = join(root, 'apps/shell/src/renderer/src/assets')
const outDir = join(root, 'apps/shell/build/icons')

// One icon per visual type. The xlsm/xls/csv/markdown associations reuse these
// through the fileAssociations `icon` field, so they need no entry of their own.
const TYPES = {
  docx: 'file-docx.svg',
  xlsx: 'file-xlsx.svg',
  pptx: 'file-pptx.svg',
  pdf: 'file-pdf.svg',
  md: 'file-md.svg',
}

// macOS icons carry the standard app-icon grid margin (824/1024 content, the
// same treatment as build/icon-mac.png) so they sit at the same optical size as
// their neighbours in Finder. Windows icons are conventionally full-bleed.
const MAC_CONTENT_RATIO = 824 / 1024
// canvas px -> .iconset entry names (16..1024 covers every @1x/@2x slot below)
const MAC_CANVAS_SIZES = [16, 32, 64, 128, 256, 512, 1024]
const ICONSET_ENTRIES = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]
const WIN_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** ICO container with PNG-compressed entries (readable since Windows Vista). */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = header.length + dir.length
  entries.forEach(({ size, png }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o) // 0 encodes 256
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt8(0, o + 2) // palette
    dir.writeUInt8(0, o + 3) // reserved
    dir.writeUInt16LE(1, o + 4) // planes
    dir.writeUInt16LE(32, o + 6) // bpp
    dir.writeUInt32LE(png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)])
}

async function renderPng(page, svgDataUrl, canvasSize, contentSize) {
  await page.setViewportSize({ width: canvasSize, height: canvasSize })
  await page.setContent(
    `<body style="margin:0"><div style="width:${canvasSize}px;height:${canvasSize}px;display:flex;align-items:center;justify-content:center">` +
      `<img src="${svgDataUrl}" style="width:${contentSize}px;height:${contentSize}px"></div></body>`,
  )
  return page.screenshot({ omitBackground: true })
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ deviceScaleFactor: 1 })
const tmp = mkdtempSync(join(tmpdir(), 'revelith-file-icons-'))

try {
  mkdirSync(outDir, { recursive: true })
  for (const [type, svgName] of Object.entries(TYPES)) {
    const svg = readFileSync(join(svgDir, svgName))
    const dataUrl = `data:image/svg+xml;base64,${svg.toString('base64')}`

    const macPngs = new Map()
    for (const size of MAC_CANVAS_SIZES) {
      macPngs.set(size, await renderPng(page, dataUrl, size, Math.round(size * MAC_CONTENT_RATIO)))
    }
    const iconset = join(tmp, `${type}.iconset`)
    mkdirSync(iconset, { recursive: true })
    for (const [name, size] of ICONSET_ENTRIES) {
      writeFileSync(join(iconset, name), macPngs.get(size))
    }
    try {
      execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(outDir, `${type}.icns`)])
    } catch (err) {
      console.warn(`  ${type}.icns skipped: iconutil needs macOS (${err.message.split('\n')[0]})`)
    }

    const winEntries = []
    for (const size of WIN_SIZES) {
      winEntries.push({ size, png: await renderPng(page, dataUrl, size, size) })
    }
    writeFileSync(join(outDir, `${type}.ico`), buildIco(winEntries))

    console.log(`generated ${type}.ico${type in TYPES ? ' (+ .icns where iconutil exists)' : ''}`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
  await browser.close()
}
