import { describe, expect, it } from 'vitest'
import { StylesheetEditor } from '../src/gateway/xlsx-styles'
import { parseStylesheetFormats } from '../src/gateway/xlsx-style-read'
import { MINIMAL_STYLESHEET_XML } from '../src/gateway/xlsx-default-styles'
import { resolveStyleColor, DEFAULT_THEME_PALETTE } from '../src/domain/style-color'
import type { WorkbookStyleEdit } from '../src/shared/edit-schemas'

/** Resolve a style delta against cellXfs entry 0, then serialize the sheet. */
function edited(delta: WorkbookStyleEdit): string {
  const editor = new StylesheetEditor(MINIMAL_STYLESHEET_XML)
  editor.resolveStyle(0, delta)
  return editor.serialize()
}

describe('writing a theme color', () => {
  it('stores a literal as an opaque rgb', () => {
    const out = edited({ fontColor: '#112233' })
    expect(out).toContain('<color rgb="FF112233"/>')
  })

  it('stores a theme slot as theme, not as a resolved rgb', () => {
    // flattening to a literal would freeze the color against theme changes
    const out = edited({ fontColor: { theme: 4 } })
    expect(out).toContain('<color theme="4"/>')
    expect(out).not.toContain('rgb=')
  })

  it('carries the tint alongside the slot', () => {
    const out = edited({ fontColor: { theme: 4, tint: -0.25 } })
    expect(out).toContain('<color theme="4" tint="-0.25"/>')
  })

  it('omits a zero tint, matching what the reader produces', () => {
    // a reader/writer disagreement here would make a round trip non-idempotent
    const out = edited({ fontColor: { theme: 4, tint: 0 } })
    expect(out).toContain('<color theme="4"/>')
    expect(out).not.toContain('tint=')
  })

  it('writes a theme color into a fill', () => {
    const out = edited({ fillColor: { theme: 5, tint: 0.4 } })
    expect(out).toContain('<fgColor theme="5" tint="0.4"/>')
  })

  it('writes a theme color into a border edge', () => {
    const out = edited({ borderTop: { style: 'thin', color: { theme: 1 } } })
    expect(out).toContain('<color theme="1"/>')
  })

  it('round-trips a theme color through the reader', () => {
    const out = edited({ fontColor: { theme: 4, tint: -0.25 } })
    const read = parseStylesheetFormats(out)
    // the reader must recover the slot and tint, not just an rgb
    const colors = read.fontColors.filter(
      (c): c is { theme: number; tint?: number } => typeof c === 'object' && c !== null,
    )
    expect(colors.some((c) => c.theme === 4 && c.tint === -0.25)).toBe(true)
  })

  it('resolves a written theme color to the same rgb Excel would show', () => {
    const read = parseStylesheetFormats(edited({ fontColor: { theme: 4, tint: -0.25 } }))
    const stored = read.fontColors.find(
      (c): c is { theme: number; tint?: number } => typeof c === 'object' && c !== null,
    )
    if (!stored) throw new Error('expected a theme color to be stored')
    // accent1 lightened 25% against the default palette
    expect(resolveStyleColor(stored, DEFAULT_THEME_PALETTE)).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('null still clears a color rather than writing one', () => {
    const out = edited({ fontColor: null })
    expect(out).not.toContain('<color ')
  })
})
