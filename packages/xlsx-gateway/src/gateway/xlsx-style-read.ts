/**
 * Read-only view of `xl/styles.xml`, reporting colors the way the file stores
 * them — a theme slot with its tint, a pattern, a gradient — rather than only
 * the resolved rgb.
 *
 * That distinction is the whole reason this exists. A headless formula engine
 * reports the resolved value, which is enough to paint a cell but not enough to
 * tell you what to change: a cell reading `#4472C4` might be a literal color, or
 * `accent1`, or `accent1 - 25%`, and those need completely different edits.
 */
import type { FillSpec, PatternType, StyleColor } from '../domain/style-color'
import { PATTERN_TYPES } from '../domain/style-color'

export interface StylesheetFormats {
  /** `cellXfs` entries, each pointing at a fill and a font by list index */
  xfs: readonly { fillId: number; fontId: number }[]
  /** `fills` list; null for the `none` pattern or a fill that cannot be read */
  fills: readonly (FillSpec | null)[]
  /** `fonts` list paired with each font's explicit color, undefined when it has none */
  fontColors: readonly (StyleColor | undefined)[]
}

export function parseStylesheetFormats(stylesXml: string): StylesheetFormats {
  const xfs = elements(sectionInner(stylesXml, 'cellXfs'), 'xf').map((xf) => ({
    fillId: Number(attribute(xf, 'fillId') ?? 0),
    fontId: Number(attribute(xf, 'fontId') ?? 0),
  }))
  const fills = elements(sectionInner(stylesXml, 'fills'), 'fill').map(parseFill)
  const fontColors = elements(sectionInner(stylesXml, 'fonts'), 'font').map((font) => {
    const color = /<color\b[^>]*\/?>/.exec(font)?.[0]
    return color === undefined ? undefined : parseColor(color)
  })
  return { xfs, fills, fontColors }
}

function parseFill(fillXml: string): FillSpec | null {
  const gradient = /<gradientFill\b([^>]*)>([\s\S]*?)<\/gradientFill>/.exec(fillXml)
  if (gradient) {
    const attrs = gradient[1] ?? ''
    const stops = [
      ...(gradient[2] ?? '').matchAll(/<stop\b[^>]*position="([^"]*)"[^>]*>([\s\S]*?)<\/stop>/g),
    ]
      .map((stop) => {
        const color = parseColor(/<color\b[^>]*\/?>/.exec(stop[2] ?? '')?.[0] ?? '')
        return color === undefined ? null : { position: Number(stop[1]), color }
      })
      // a stop with no readable color would leave a hole in the ramp
      .filter((stop): stop is { position: number; color: StyleColor } => stop !== null)
    // fewer than two stops is not a gradient; reporting it as one would let a
    // caller write a ramp that renders as a single flat color
    if (stops.length < 2) return null
    const type = attribute(attrs, 'type') === 'path' ? 'path' : undefined
    const num = (name: string): number | undefined => {
      const value = attribute(attrs, name)
      return value === undefined ? undefined : Number(value)
    }
    return {
      gradient: {
        ...(type ? { type } : {}),
        ...(type ? {} : num('degree') !== undefined ? { angle: num('degree') } : {}),
        ...(type && num('left') !== undefined ? { left: num('left') } : {}),
        ...(type && num('right') !== undefined ? { right: num('right') } : {}),
        ...(type && num('top') !== undefined ? { top: num('top') } : {}),
        ...(type && num('bottom') !== undefined ? { bottom: num('bottom') } : {}),
        stops,
      },
    }
  }
  const pattern = /<patternFill\b([^>]*?)(?:\/>|>([\s\S]*?)<\/patternFill>)/.exec(fillXml)
  if (!pattern) return null
  const patternType = attribute(pattern[1] ?? '', 'patternType')
  if (patternType === undefined || patternType === 'none') return null
  if (!(PATTERN_TYPES as readonly string[]).includes(patternType)) return null
  const inner = pattern[2] ?? ''
  const fg = parseColor(/<fgColor\b[^>]*\/?>/.exec(inner)?.[0] ?? '')
  const bg = parseColor(/<bgColor\b[^>]*\/?>/.exec(inner)?.[0] ?? '')
  // A pattern with no foreground is Excel's automatic color, which is not a
  // choice the user made and so has nothing to echo back.
  if (fg === undefined) return null
  return { pattern: patternType as PatternType, fg, ...(bg === undefined ? {} : { bg }) }
}

/**
 * CT_Color to StyleColor. Indexed, `auto` and `system` colors are dropped:
 * they depend on a palette or a system setting this side does not have, so
 * inventing a value would be a guess.
 */
function parseColor(colorXml: string): StyleColor | undefined {
  if (colorXml === '') return undefined
  const theme = attribute(colorXml, 'theme')
  if (theme !== undefined) {
    const index = Number(theme)
    if (!Number.isInteger(index) || index < 0 || index > 11) return undefined
    const tint = attribute(colorXml, 'tint')
    const value = tint === undefined ? 0 : Number(tint)
    // rounding to six decimals keeps a read/write round trip stable
    return value === 0 || !Number.isFinite(value)
      ? { theme: index }
      : { theme: index, tint: Math.round(value * 1e6) / 1e6 }
  }
  const rgb = attribute(colorXml, 'rgb')
  if (rgb === undefined) return undefined
  // the first two bytes are the alpha channel
  const hex = rgb.length === 8 ? rgb.slice(2) : rgb
  return /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex.toUpperCase()}` : undefined
}

function sectionInner(xml: string, tag: string): string {
  return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1] ?? ''
}

function elements(inner: string, tag: string): string[] {
  return [
    ...inner.matchAll(new RegExp(`<${tag}\\b[^>]*/>|<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'g')),
  ].map((match) => match[0])
}

/** Read an attribute, requiring a name boundary so `fillId` cannot match `xfillId`. */
function attribute(element: string, name: string): string | undefined {
  return new RegExp(`(?<![\\w:.-])${name}="([^"]*)"`).exec(element)?.[1]
}
