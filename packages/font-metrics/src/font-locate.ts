/**
 * Locate an installed font matching a PDF font's PostScript name (nameID 6) or family
 * (nameID 1/16), for text-edit rebuilds that keep the original typeface.
 */
import { closeSync, openSync, readFileSync } from 'node:fs'

import { COLOR_FONT_TABLES, fontCoversText } from './cmap'
import {
  getFontIndex,
  norm,
  readTableDir,
  styleScore,
  styleTokens,
  OTTO_TAG,
  TTC_TAG,
} from './sfnt'

/** Picks FPDFText_LoadFont's font_type: glyf faces embed as FontFile2 (TRUETYPE),
    CFF faces as FontFile3 (TYPE1) */
export const isTruetype = (b: Buffer): boolean => b.length >= 4 && b.readUInt32BE(0) !== OTTO_TAG

/** Extract a single face from a ttc into a standalone sfnt (rewrite the table directory,
    copy table data; passthrough for plain ttf) */
function extractFace(buf: Buffer, offset: number): Buffer {
  if (buf.readUInt32BE(0) !== TTC_TAG) return buf
  const numTables = buf.readUInt16BE(offset + 4)
  let total = 12 + 16 * numTables
  const entries: Array<{ dirPos: number; tOff: number; tLen: number; newOff: number }> = []
  for (let t = 0; t < numTables; t += 1) {
    const e = offset + 12 + 16 * t
    const tLen = buf.readUInt32BE(e + 12)
    entries.push({ dirPos: e, tOff: buf.readUInt32BE(e + 8), tLen, newOff: total })
    total += (tLen + 3) & ~3
  }
  const out = Buffer.alloc(total)
  buf.copy(out, 0, offset, offset + 12)
  for (let t = 0; t < numTables; t += 1) {
    const e = entries[t]!
    buf.copy(out, 12 + 16 * t, e.dirPos, e.dirPos + 8)
    out.writeUInt32BE(e.newOff, 12 + 16 * t + 8)
    out.writeUInt32BE(e.tLen, 12 + 16 * t + 12)
    buf.copy(out, e.newOff, e.tOff, e.tOff + e.tLen)
  }
  return out
}

const faceCache = new Map<string, Buffer>()

/**
 * Standalone sfnt bytes of the installed font best matching (psName, family):
 * exact PostScript name first, then family with the PS name's style tokens
 * (Regular preferred when there are none). Null when nothing matches.
 */
export function findSystemFont(psName: string, family: string): Buffer | null {
  const index = getFontIndex()
  let face = psName ? index.byPs.get(norm(psName)) : undefined
  if (!face && family) {
    const candidates = index.byFamily.get(norm(family))
    if (candidates?.length) {
      const want = styleTokens(psName)
      face = [...candidates].sort((a, b) => styleScore(b, want) - styleScore(a, want))[0]
    }
  }
  return face ? faceBytes(face) : null
}

/** Standalone sfnt bytes of a face, cached like findSystemFont's result. */
function faceBytes(face: { path: string; offset: number }): Buffer | null {
  const key = `${face.path}#${face.offset}`
  const cached = faceCache.get(key)
  if (cached) return cached
  try {
    const bytes = extractFace(readFileSync(face.path), face.offset)
    if (faceCache.size >= 4) faceCache.clear()
    faceCache.set(key, bytes)
    return bytes
  } catch {
    return null
  }
}

/** Every distinct installed face, grouped by the file it lives in. */
function facesByFile(): Map<string, Array<{ offset: number }>> {
  const byFile = new Map<string, Array<{ offset: number }>>()
  for (const faces of getFontIndex().byFamily.values()) {
    for (const face of faces) {
      const group = byFile.get(face.path)
      if (group) {
        if (!group.some((f) => f.offset === face.offset)) group.push({ offset: face.offset })
      } else {
        byFile.set(face.path, [{ ...face }])
      }
    }
  }
  return byFile
}

/**
 * First installed monochrome font whose cmap covers every character of `text`.
 *
 * This is the last resort of the PDF text-edit fallback chain: the browser
 * preview resolves per-character fallback across every installed font, so text
 * the user already SEES has to find an embeddable face too. Color faces are
 * skipped (they display but cannot be embedded as PDF text). Null only when
 * nothing on the machine covers the string.
 */
export function findFontCovering(text: string): Buffer | null {
  if (text.replace(/[\r\n]/g, '').length === 0) return null
  for (const [path, faces] of facesByFile()) {
    // grouped by file: opening a few thousand font files one at a time, and
    // reading each whole, would dominate this scan
    let fd: number
    try {
      fd = openSync(path, 'r')
    } catch {
      continue
    }
    const candidates: Array<{ offset: number }> = []
    try {
      for (const face of faces) {
        const tables = readTableDir(fd, face.offset)
        if (!tables) continue
        if (COLOR_FONT_TABLES.some((tag) => tables.has(tag))) continue
        candidates.push(face)
      }
    } catch {
      /* unreadable or malformed file: skip */
    } finally {
      closeSync(fd)
    }
    for (const face of candidates) {
      const bytes = faceBytes({ path, offset: face.offset })
      if (bytes && fontCoversText(bytes, text)) return bytes
    }
  }
  return null
}
