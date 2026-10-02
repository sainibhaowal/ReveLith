/**
 * Minimal sfnt cmap reader: can this face map every character of a string?
 *
 * Formats 4 and 12 only, which covers every face the editors embed. A face
 * that does not cover the text cannot be used for it, so this is the gate the
 * font-fallback chain asks before embedding a candidate.
 */
import type { Buffer } from 'node:buffer'

const u16 = (b: Buffer, o: number) => b.readUInt16BE(o)
const u32 = (b: Buffer, o: number) => b.readUInt32BE(o)

export interface Subtable {
  offset: number
  format: number
}

/** Byte offset of a table in a standalone sfnt buffer; -1 when absent. */
export function tableOffset(font: Buffer, tag: string): number {
  const numTables = u16(font, 4)
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16
    if (font.toString('latin1', rec, rec + 4) === tag) return u32(font, rec + 8)
  }
  return -1
}

/** Best Unicode subtable of a standalone sfnt buffer: format 12 preferred. */
export function cmapSubtable(font: Buffer): Subtable | null {
  const cmap = tableOffset(font, 'cmap')
  if (cmap < 0) return null
  const n = u16(font, cmap + 2)
  let best: Subtable | null = null
  for (let i = 0; i < n; i += 1) {
    const rec = cmap + 4 + i * 8
    const platform = u16(font, rec)
    const encoding = u16(font, rec + 2)
    if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue
    const offset = cmap + u32(font, rec + 4)
    const format = u16(font, offset)
    if (format === 12) return { offset, format }
    if (format === 4 && !best) best = { offset, format }
  }
  return best
}

/** Glyph id for a codepoint; 0 = unmapped (.notdef). */
function glyphId(font: Buffer, sub: Subtable, cp: number): number {
  const o = sub.offset
  if (sub.format === 12) {
    const groups = u32(font, o + 12)
    for (let i = 0; i < groups; i += 1) {
      const g = o + 16 + i * 12
      if (cp < u32(font, g)) return 0 // groups are sorted ascending
      if (cp <= u32(font, g + 4)) return u32(font, g + 8) + (cp - u32(font, g))
    }
    return 0
  }
  if (cp > 0xffff) return 0
  const segX2 = u16(font, o + 6)
  const ends = o + 14
  const starts = ends + segX2 + 2
  const deltas = starts + segX2
  const rangeOffs = deltas + segX2
  for (let s = 0; s < segX2; s += 2) {
    if (cp > u16(font, ends + s)) continue
    if (cp < u16(font, starts + s)) return 0
    const ro = u16(font, rangeOffs + s)
    if (ro === 0) return (cp + font.readInt16BE(deltas + s)) & 0xffff
    const gi = u16(font, rangeOffs + s + ro + (cp - u16(font, starts + s)) * 2)
    return gi === 0 ? 0 : (gi + font.readInt16BE(deltas + s)) & 0xffff
  }
  return 0
}

/** True when the face maps every drawn char of text (unparseable face = false).
 *
 * Only line breaks are excluded: Unicode spaces (NBSP, U+3000, …) are drawn
 * like any glyph and must be mapped — `\s` would silently exempt them.
 */
export function fontCoversText(font: Buffer, text: string): boolean {
  const chars = [...text.replace(/[\r\n]/g, '')]
  if (chars.length === 0) return true
  try {
    const sub = cmapSubtable(font)
    return sub !== null && chars.every((c) => glyphId(font, sub, c.codePointAt(0)!) !== 0)
  } catch {
    return false
  }
}

/**
 * Tables whose presence marks a face as a color bitmap / color-glyph font. Such
 * a face can render text on screen but cannot be embedded into a PDF as
 * monochrome text, so the fallback chain skips it even when its cmap covers
 * the string (color emoji are the common case).
 */
export const COLOR_FONT_TABLES: readonly string[] = ['CBDT', 'CBLC', 'sbix', 'COLR', 'SVG ']
