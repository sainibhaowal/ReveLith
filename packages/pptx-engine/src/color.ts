/**
 * Color node resolution (srgbClr/schemeClr/sysClr + lumMod/lumOff/tint/shade/alpha modifiers).
 * Extracted from parse.ts into a shared module: used by both parse (run/fill colors) and
 * placeholder (lstStyle defRPr default colors) to avoid a circular dependency.
 */
import { type Theme, resolveSchemeColor } from './theme'
import { asXmlNode, type XmlNode } from './xml-utils'

export const PRESET_COLORS: Record<string, string> = {
  aliceblue: '#F0F8FF',
  antiquewhite: '#FAEBD7',
  aqua: '#00FFFF',
  aquamarine: '#7FFFD4',
  azure: '#F0FFFF',
  beige: '#F5F5DC',
  bisque: '#FFE4C4',
  black: '#000000',
  blanchedalmond: '#FFEBCD',
  blue: '#0000FF',
  blueviolet: '#8A2BE2',
  brown: '#A52A2A',
  burlywood: '#DEB887',
  cadetblue: '#5F9EA0',
  chartreuse: '#7FFF00',
  chocolate: '#D2691E',
  coral: '#FF7F50',
  cornflowerblue: '#6495ED',
  cornsilk: '#FFF8DC',
  crimson: '#DC143C',
  cyan: '#00FFFF',
  darkblue: '#00008B',
  darkcyan: '#008B8B',
  darkgoldenrod: '#B8860B',
  darkgray: '#A9A9A9',
  darkgrey: '#A9A9A9',
  darkgreen: '#006400',
  darkkhaki: '#BDB76B',
  darkmagenta: '#8B008B',
  darkolivegreen: '#556B2F',
  darkorange: '#FF8C00',
  darkorchid: '#9932CC',
  darkred: '#8B0000',
  darksalmon: '#E9967A',
  darkseagreen: '#8FBC8F',
  darkslateblue: '#483D8B',
  darkslategray: '#2F4F4F',
  darkslategrey: '#2F4F4F',
  darkturquoise: '#00CED1',
  darkviolet: '#9400D3',
  deeppink: '#FF1493',
  deepskyblue: '#00BFFF',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1E90FF',
  firebrick: '#B22222',
  floralwhite: '#FFFAF0',
  forestgreen: '#228B22',
  fuchsia: '#FF00FF',
  gainsboro: '#DCDCDC',
  ghostwhite: '#F8F8FF',
  gold: '#FFD700',
  goldenrod: '#DAA520',
  gray: '#808080',
  grey: '#808080',
  green: '#008000',
  greenyellow: '#ADFF2F',
  honeydew: '#F0FFF0',
  hotpink: '#FF69B4',
  indianred: '#CD5C5C',
  indigo: '#4B0082',
  ivory: '#FFFFF0',
  khaki: '#F0E68C',
  lavender: '#E6E6FA',
  lavenderblush: '#FFF0F5',
  lawngreen: '#7CFC00',
  lemonchiffon: '#FFFACD',
  lightblue: '#ADD8E6',
  lightcoral: '#F08080',
  lightcyan: '#E0FFFF',
  lightgoldenrodyellow: '#FAFAD2',
  lightgray: '#D3D3D3',
  lightgrey: '#D3D3D3',
  lightgreen: '#90EE90',
  lightpink: '#FFB6C1',
  lightsalmon: '#FFA07A',
  lightseagreen: '#20B2AA',
  lightskyblue: '#87CEFA',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#B0C4DE',
  lightyellow: '#FFFFE0',
  lime: '#00FF00',
  limegreen: '#32CD32',
  linen: '#FAF0E6',
  magenta: '#FF00FF',
  maroon: '#800000',
  mediumaquamarine: '#66CDAA',
  mediumblue: '#0000CD',
  mediumorchid: '#BA55D3',
  mediumpurple: '#9370DB',
  mediumseagreen: '#3CB371',
  mediumslateblue: '#7B68EE',
  mediumspringgreen: '#00FA9A',
  mediumturquoise: '#48D1CC',
  mediumvioletred: '#C71585',
  midnightblue: '#191970',
  mintcream: '#F5FFFA',
  mistyrose: '#FFE4E1',
  moccasin: '#FFE4B5',
  navajowhite: '#FFDEAD',
  navy: '#000080',
  oldlace: '#FDF5E6',
  olive: '#808000',
  olivedrab: '#6B8E23',
  orange: '#FFA500',
  orangered: '#FF4500',
  orchid: '#DA70D6',
  palegoldenrod: '#EEE8AA',
  palegreen: '#98FB98',
  paleturquoise: '#AFEEEE',
  palevioletred: '#DB7093',
  papayawhip: '#FFEFD5',
  peachpuff: '#FFDAB9',
  peru: '#CD853F',
  pink: '#FFC0CB',
  plum: '#DDA0DD',
  powderblue: '#B0E0E6',
  purple: '#800080',
  red: '#FF0000',
  rosybrown: '#BC8F8F',
  royalblue: '#4169E1',
  saddlebrown: '#8B4513',
  salmon: '#FA8072',
  sandybrown: '#F4A460',
  seagreen: '#2E8B57',
  seashell: '#FFF5EE',
  sienna: '#A0522D',
  silver: '#C0C0C0',
  skyblue: '#87CEEB',
  slateblue: '#6A5ACD',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#FFFAFA',
  springgreen: '#00FF7F',
  steelblue: '#4682B4',
  tan: '#D2B48C',
  teal: '#008080',
  thistle: '#D8BFD8',
  tomato: '#FF6347',
  turquoise: '#40E0D0',
  violet: '#EE82EE',
  wheat: '#F5DEB3',
  white: '#FFFFFF',
  whitesmoke: '#F5F5F5',
  yellow: '#FFFF00',
  yellowgreen: '#9ACD32',
  dkblue: '#00008B',
  dkgreen: '#006400',
  dkred: '#8B0000',
  ltblue: '#ADD8E6',
  ltgray: '#D3D3D3',
  ltgrey: '#D3D3D3',
  medblue: '#0000CD',
}

/**
 * Resolve a color node + modifiers: srgbClr/schemeClr/sysClr/prstClr, supporting alpha
 * (→#RRGGBBAA) and lumMod/lumOff (tint/shade, common for theme colors).
 * Preset colors match case-insensitively.
 */
export function resolveColorNode(
  node: unknown,
  theme: Theme | undefined,
  phClr?: string,
): string | undefined {
  if (!node) return undefined
  const n = asXmlNode(node)
  let base: string | undefined
  let mods: XmlNode | undefined
  if (n['a:srgbClr']) {
    mods = asXmlNode(n['a:srgbClr'])
    base = '#' + String(mods['@_val']).toUpperCase()
  } else if (n['a:schemeClr']) {
    mods = asXmlNode(n['a:schemeClr'])
    base = resolveSchemeColor(String(mods['@_val']), theme, phClr)
  } else if (n['a:sysClr']) {
    mods = asXmlNode(n['a:sysClr'])
    base = '#' + String(mods['@_lastClr'] ?? '000000').toUpperCase()
  } else if (n['a:prstClr']) {
    mods = asXmlNode(n['a:prstClr'])
    const val = String(mods['@_val'] ?? '').toLowerCase()
    base = PRESET_COLORS[val]
  }
  if (!base) return undefined
  return applyColorMods(base, mods)
}

/** Apply lumMod/lumOff/tint/shade/satMod/alpha modifiers (percentages, in units of 1/1000%). */
export function applyColorMods(hex: string, mods: XmlNode | undefined): string {
  let { r, g, b } = hexToRgb(hex)
  const pct = (k: string): number | undefined => {
    const v = asXmlNode(mods?.[k])['@_val']
    return v != null ? (parseInt(String(v), 10) || 0) / 100000 : undefined
  }
  const lumMod = pct('a:lumMod')
  const lumOff = pct('a:lumOff')
  const shade = pct('a:shade')
  const tint = pct('a:tint')
  // satMod (frequent in theme gradient templates): HSL saturation multiplier
  const satMod = pct('a:satMod')
  if (satMod != null) {
    const { h, s, l } = rgbToHsl(r, g, b)
    const rgb2 = hslToRgb(h, Math.max(0, Math.min(1, s * satMod)), l)
    r = rgb2.r
    g = rgb2.g
    b = rgb2.b
  }
  if (lumMod != null) {
    r *= lumMod
    g *= lumMod
    b *= lumMod
  }
  if (lumOff != null) {
    r += 255 * lumOff
    g += 255 * lumOff
    b += 255 * lumOff
  }
  if (shade != null) {
    r *= shade
    g *= shade
    b *= shade
  }
  if (tint != null) {
    r = r * tint + 255 * (1 - tint)
    g = g * tint + 255 * (1 - tint)
    b = b * tint + 255 * (1 - tint)
  }
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  let out =
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  const alpha = pct('a:alpha')
  if (alpha != null && alpha < 1) {
    out += Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  }
  return out
}

/**
 * Resolve a theme style reference (a:fillRef idx → fmtScheme fillStyleLst):
 * solid template fills resolve to a color (with tint/shade/alpha mods);
 * gradients/patterns/blips have no flat equivalent → undefined (callers fall
 * back to explicit fills or the palette). The reference's own color resolves
 * phClr-style usages and is the last-resort fallback.
 */
export function resolveFillRefColor(spPr: unknown, theme: Theme | undefined): string | undefined {
  const ref = asXmlNode(asXmlNode(spPr)?.['a:fillRef'])
  if (!ref || typeof ref !== 'object') return undefined
  const idx = parseInt(String(ref['@_idx'] ?? '0'), 10) || 0
  const refColor = resolveColorNode(ref, theme) ?? undefined
  if (idx <= 0) return refColor
  const tpl = theme?.fillStyles?.[idx - 1]
  const solid = tpl ? findSolidFill(tpl) : undefined
  return (solid ? resolveColorNode(solid, theme) : undefined) ?? refColor
}

/** First a:solidFill anywhere inside a (possibly nested) style template node. */
function findSolidFill(node: unknown): XmlNode | undefined {
  const n = asXmlNode(node)
  if (!n || typeof n !== 'object') return undefined
  if (n['a:solidFill'] && typeof n['a:solidFill'] === 'object') {
    return asXmlNode(n['a:solidFill'])
  }
  for (const value of Object.values(n)) {
    if (value && typeof value === 'object') {
      const found = findSolidFill(value)
      if (found) return found
    }
  }
  return undefined
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, '')
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  }
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h, s, l }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 }
}
