/**
 * SVG -> native board geometry.
 *
 * `add_vector_artwork` used to rasterise every drawing into one image element,
 * so nothing an AI drew could be re-edited: you could move or scale the picture
 * but never touch a single stroke. This module splits the SVG subset that maps
 * cleanly onto Excalidraw primitives (rect, circle, ellipse, line, polyline,
 * polygon, path, text) into real board elements.
 *
 * It is deliberately conservative: anything that cannot be represented
 * faithfully - filters, gradients, patterns, masks, clip paths, images, reuse,
 * arc commands, or a transform on a non-point shape - returns null so the
 * caller keeps the exact rendered SVG as a single scalable object instead of
 * silently degrading the artwork.
 */

import {
  IDENTITY_MATRIX,
  applyMatrix as applyToPoint,
  boundingBox,
  circlePolygon,
  clipPolygon,
  clipSegmentToConvex,
  gradientBandPolygon,
  isAxisAligned,
  insetPolygon,
  isConvexPolygon,
  matrixScale,
  multiplyMatrix,
  sampleArc,
  sampleGradient,
  type Matrix,
  type Point,
} from './svg-geometry'

export interface RectPrimitive {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}

export interface EllipsePrimitive {
  kind: 'ellipse'
  cx: number
  cy: number
  rx: number
  ry: number
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}

export interface PolylinePrimitive {
  kind: 'polyline'
  points: Array<[number, number]>
  closed: boolean
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
  dash: boolean
}

export interface TextPrimitive {
  kind: 'text'
  x: number
  y: number
  text: string
  fontSize: number
  fill: string
  anchor: 'left' | 'center' | 'right'
  opacity: number
}

export type Primitive = RectPrimitive | EllipsePrimitive | PolylinePrimitive | TextPrimitive

export interface DecomposedArtwork {
  primitives: Primitive[]
  width: number
  height: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const MAX_PRIMITIVES = 1200
const CURVE_STEPS = 16

/** Tags we can turn into native geometry. `g` is a pure container. */
const DECOMPOSABLE_TAGS = new Set([
  'svg',
  'g',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
  'tspan',
  'use',
])

/**
 * Elements that define reusable content rather than drawing it. They are read
 * by the definitions pre-pass and skipped while walking, instead of aborting
 * the whole artwork the way an unknown tag does.
 */
const DEFINITION_TAGS = new Set([
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'symbol',
  'filter',
  'pattern',
  'marker',
  'title',
  'desc',
  'metadata',
  'style',
])

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  gray: '#808080',
  grey: '#808080',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  silver: '#c0c0c0',
  maroon: '#800000',
  navy: '#000080',
  teal: '#008080',
  olive: '#808000',
  lime: '#00ff00',
  indigo: '#4b0082',
  violet: '#ee82ee',
  gold: '#ffd700',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  salmon: '#fa8072',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  crimson: '#dc143c',
  steelblue: '#4682b4',
  skyblue: '#87ceeb',
  seagreen: '#2e8b57',
  darkgreen: '#006400',
  darkblue: '#00008b',
  darkred: '#8b0000',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  slategray: '#708090',
  slategrey: '#708090',
}

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
const hex2 = (value: number) => clampByte(value).toString(16).padStart(2, '0')

function hslToHex(h: number, s: number, l: number): string {
  const sat = Math.max(0, Math.min(100, s)) / 100
  const light = Math.max(0, Math.min(100, l)) / 100
  const chroma = (1 - Math.abs(2 * light - 1)) * sat
  const hue = ((h % 360) + 360) % 360
  const sector = hue / 60
  const x = chroma * (1 - Math.abs((sector % 2) - 1))
  const base =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x]
  const m = light - chroma / 2
  return `#${hex2((base[0]! + m) * 255)}${hex2((base[1]! + m) * 255)}${hex2((base[2]! + m) * 255)}`
}

/**
 * Normalise an SVG paint value to hex or 'transparent'.
 * Returns null when the value is a gradient/pattern reference or unknown, which
 * makes the caller fall back to rendering the whole SVG as one image.
 */
export function paintToHex(value: string | null | undefined, fallback: string): string | null {
  if (value === null || value === undefined) return fallback
  const paint = value.trim().toLowerCase()
  if (!paint) return fallback
  if (paint === 'none' || paint === 'transparent') return 'transparent'
  if (paint.startsWith('url(')) return null
  if (/^#[0-9a-f]{3}$/.test(paint))
    return `#${paint[1]}${paint[1]}${paint[2]}${paint[2]}${paint[3]}${paint[3]}`
  if (/^#[0-9a-f]{6}$/.test(paint)) return paint
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(paint)
  if (fn) {
    const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean)
    if (fn[1]!.startsWith('rgb') && parts.length >= 3) {
      const channel = (raw: string) =>
        raw.endsWith('%') ? (Number.parseFloat(raw) / 100) * 255 : Number.parseFloat(raw)
      const [r, g, b] = [channel(parts[0]!), channel(parts[1]!), channel(parts[2]!)]
      if ([r, g, b].every(Number.isFinite)) return `#${hex2(r)}${hex2(g)}${hex2(b)}`
      return null
    }
    if (parts.length >= 3) {
      const h = Number.parseFloat(parts[0]!)
      const s = Number.parseFloat(parts[1]!)
      const l = Number.parseFloat(parts[2]!)
      if ([h, s, l].every(Number.isFinite)) return hslToHex(h, s, l)
    }
    return null
  }
  return NAMED_COLORS[paint] ?? null
}

// Affine maths, arc sampling and polygon clipping live in the shared geometry
// kernel so the decomposer, the 3D projector and the CAD layer cannot drift.
const EMPTY_MATRIX: Matrix = IDENTITY_MATRIX
const IDENTITY: Matrix = EMPTY_MATRIX

const applyMatrix = (m: Matrix, x: number, y: number): [number, number] => {
  const point = applyToPoint(m, [x, y])
  return [point[0], point[1]]
}

/** Only translate/scale/matrix/skew are supported; rotate is accepted too. */
function parseTransform(value: string | null | undefined): Matrix | null {
  if (value === null || value === undefined || !value.trim()) return IDENTITY
  let result: Matrix = IDENTITY
  const pattern = /(translate|scale|rotate|matrix|skewX|skewY)\(\s*([^)]*)\)/g
  let consumed = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    consumed += match[0].length
    const args = match[2]!
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    if (!args.every(Number.isFinite)) return null
    switch (match[1]) {
      case 'translate':
        result = multiplyMatrix(result, [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0])
        break
      case 'scale': {
        const sx = args[0] ?? 1
        result = multiplyMatrix(result, [sx, 0, 0, args[1] ?? sx, 0, 0])
        break
      }
      case 'rotate': {
        const angle = ((args[0] ?? 0) * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const cx = args[1] ?? 0
        const cy = args[2] ?? 0
        result = multiplyMatrix(result, [1, 0, 0, 1, cx, cy])
        result = multiplyMatrix(result, [cos, sin, -sin, cos, 0, 0])
        result = multiplyMatrix(result, [1, 0, 0, 1, -cx, -cy])
        break
      }
      case 'matrix':
        if (args.length < 6) return null
        result = multiplyMatrix(result, [
          args[0]!,
          args[1]!,
          args[2]!,
          args[3]!,
          args[4]!,
          args[5]!,
        ] as Matrix)
        break
      case 'skewX':
        result = multiplyMatrix(result, [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0])
        break
      case 'skewY':
        result = multiplyMatrix(result, [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0])
        break
      default:
        return null
    }
  }
  if (consumed < value.replace(/\s+/g, '').length - 1) {
    // Unparsed tail: refuse rather than guess.
    const leftovers = value.replace(pattern, '').trim()
    if (leftovers && leftovers !== ',') return null
  }
  return result
}

const num = (value: string | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function opacityOf(element: Element): number | null {
  const raw = element.getAttribute('opacity')
  if (raw === null || raw === '') return 100
  const value = raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw)
  if (!Number.isFinite(value) || value < 0 || value > 1) return null
  return Math.round(value * 100)
}

/** Sample cubic/quadratic curves into straight segments. */
function samplePath(d: string): Array<{ points: Array<[number, number]>; closed: boolean }> | null {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtZzAa]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)
  if (!tokens) return null
  const subpaths: Array<{ points: Array<[number, number]>; closed: boolean }> = []
  let current: Array<[number, number]> = []
  let closed = false
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let lastCubic: [number, number] | null = null
  let lastQuad: [number, number] | null = null
  let index = 0

  const readNumber = (): number => Number.parseFloat(tokens[index++] ?? '0')
  const push = (px: number, py: number) => {
    current.push([px, py])
  }
  const flush = () => {
    if (current.length > 1) subpaths.push({ points: current, closed })
    current = []
    closed = false
  }

  while (index < tokens.length) {
    const command = tokens[index]!
    if (!/[MmLlHhVvCcSsQqTtZzAa]/.test(command)) return null
    index += 1
    const relative = command === command.toLowerCase()
    switch (command.toUpperCase()) {
      case 'M': {
        flush()
        const nx = readNumber()
        const ny = readNumber()
        x = relative ? x + nx : nx
        y = relative ? y + ny : ny
        startX = x
        startY = y
        push(x, y)
        lastCubic = null
        lastQuad = null
        break
      }
      case 'L': {
        const nx = readNumber()
        const ny = readNumber()
        x = relative ? x + nx : nx
        y = relative ? y + ny : ny
        push(x, y)
        lastCubic = null
        lastQuad = null
        break
      }
      case 'H': {
        const nx = readNumber()
        x = relative ? x + nx : nx
        push(x, y)
        lastCubic = null
        lastQuad = null
        break
      }
      case 'V': {
        const ny = readNumber()
        y = relative ? y + ny : ny
        push(x, y)
        lastCubic = null
        lastQuad = null
        break
      }
      case 'C': {
        const c1x = readNumber()
        const c1y = readNumber()
        const c2x = readNumber()
        const c2y = readNumber()
        const ex = readNumber()
        const ey = readNumber()
        const ax = relative ? x + c1x : c1x
        const ay = relative ? y + c1y : c1y
        const bx = relative ? x + c2x : c2x
        const by = relative ? y + c2y : c2y
        const dx = relative ? x + ex : ex
        const dy = relative ? y + ey : ey
        for (let step = 1; step <= CURVE_STEPS; step += 1) {
          const t = step / CURVE_STEPS
          const u = 1 - t
          push(
            u * u * u * x + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * dx,
            u * u * u * y + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * dy,
          )
        }
        lastCubic = [bx, by]
        lastQuad = null
        x = dx
        y = dy
        break
      }
      case 'S': {
        const c2x = readNumber()
        const c2y = readNumber()
        const ex = readNumber()
        const ey = readNumber()
        const ax = lastCubic ? 2 * x - lastCubic[0] : x
        const ay = lastCubic ? 2 * y - lastCubic[1] : y
        const bx = relative ? x + c2x : c2x
        const by = relative ? y + c2y : c2y
        const dx = relative ? x + ex : ex
        const dy = relative ? y + ey : ey
        for (let step = 1; step <= CURVE_STEPS; step += 1) {
          const t = step / CURVE_STEPS
          const u = 1 - t
          push(
            u * u * u * x + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * dx,
            u * u * u * y + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * dy,
          )
        }
        lastCubic = [bx, by]
        lastQuad = null
        x = dx
        y = dy
        break
      }
      case 'Q': {
        const c1x = readNumber()
        const c1y = readNumber()
        const ex = readNumber()
        const ey = readNumber()
        const ax = relative ? x + c1x : c1x
        const ay = relative ? y + c1y : c1y
        const dx = relative ? x + ex : ex
        const dy = relative ? y + ey : ey
        for (let step = 1; step <= CURVE_STEPS; step += 1) {
          const t = step / CURVE_STEPS
          const u = 1 - t
          push(u * u * x + 2 * u * t * ax + t * t * dx, u * u * y + 2 * u * t * ay + t * t * dy)
        }
        lastQuad = [ax, ay]
        lastCubic = null
        x = dx
        y = dy
        break
      }
      case 'T': {
        const ex = readNumber()
        const ey = readNumber()
        // Annotated explicitly: `ax`/`ay` feed `lastQuad`, which feeds them back,
        // so inference would otherwise report a circular initializer.
        const ax: number = lastQuad ? 2 * x - lastQuad[0] : x
        const ay: number = lastQuad ? 2 * y - lastQuad[1] : y
        const dx = relative ? x + ex : ex
        const dy = relative ? y + ey : ey
        for (let step = 1; step <= CURVE_STEPS; step += 1) {
          const t = step / CURVE_STEPS
          const u = 1 - t
          push(u * u * x + 2 * u * t * ax + t * t * dx, u * u * y + 2 * u * t * ay + t * t * dy)
        }
        lastQuad = [ax, ay]
        lastCubic = null
        x = dx
        y = dy
        break
      }
      case 'Z': {
        closed = true
        x = startX
        y = startY
        flush()
        break
      }
      case 'A': {
        const radiusX = readNumber()
        const radiusY = readNumber()
        const rotation = readNumber()
        const largeArc = readNumber() !== 0
        const sweep = readNumber() !== 0
        const ex = readNumber()
        const ey = readNumber()
        const toX = relative ? x + ex : ex
        const toY = relative ? y + ey : ey
        const arc = sampleArc(
          [x, y],
          radiusX,
          radiusY,
          rotation,
          largeArc,
          sweep,
          [toX, toY],
          CURVE_STEPS * 2,
        )
        // A zero radius degenerates to a straight line (spec F.6.6).
        if (arc) {
          for (let step = 1; step < arc.length; step += 1) push(arc[step]![0], arc[step]![1])
        } else {
          push(toX, toY)
        }
        lastCubic = null
        lastQuad = null
        x = toX
        y = toY
        break
      }
      default:
        // A command we do not implement: refuse rather than approximate, so the
        // caller keeps the exact rendered SVG instead of a wrong drawing.
        return null
    }
  }
  flush()
  return subpaths.length ? subpaths : null
}

function pointsFromList(raw: string | null): Array<[number, number]> | null {
  if (!raw) return null
  const numbers = raw
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
  if (numbers.length < 4 || numbers.length % 2 !== 0 || !numbers.every(Number.isFinite)) return null
  const points: Array<[number, number]> = []
  for (let i = 0; i < numbers.length; i += 2) points.push([numbers[i]!, numbers[i + 1]!])
  return points
}

function collectText(element: Element): string {
  let text = ''
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 3) text += node.textContent ?? ''
    else if (node.nodeType === 1) text += collectText(node as Element)
  }
  return text.replace(/\s+/g, ' ').trim()
}

/** A paint server resolved from the document's definitions. */
export interface GradientDef {
  kind: 'linear' | 'radial'
  stops: Array<{ offset: number; color: string; opacity: number }>
  x1: number
  y1: number
  x2: number
  y2: number
  cx: number
  cy: number
  radius: number
  /** coordinates are fractions of the shape bounding box */
  objectBoundingBox: boolean
  transform: Matrix | null
}

/**
 * The filter subset that has a faithful native approximation: a blurred and/or
 * offset copy of the shape painted behind it. Everything else (turbulence,
 * displacement, morphology, blend, composite, tile, colour matrices, lighting)
 * has no native equivalent and marks the filter unsupported, which keeps the
 * whole-artwork image fallback rather than drawing something visibly wrong.
 */
export interface FilterDef {
  /** total standard deviation requested, in user units */
  blur: number
  offsetX: number
  offsetY: number
  /** the filter paints a shadow behind the source (feDropShadow / feFlood) */
  shadow: boolean
  color: string
  colorOpacity: number
  unsupported: boolean
}

interface Definitions {
  byId: Map<string, Element>
  gradients: Map<string, GradientDef>
  /** convex clip/mask outlines in the clip's own user space */
  clips: Map<string, Point[]>
  filters: Map<string, FilterDef>
}

const GRADIENT_STEPS = 14

function elementId(element: Element): string {
  return (element.getAttribute('id') ?? '').trim()
}

/** `url(#id)` reference, or null when the value is not a local paint reference. */
function paintReference(value: string | null): string | null {
  if (!value) return null
  const match = /^url\(\s*#([\w.-]{1,80})\s*\)$/i.exec(value.trim())
  return match ? match[1]! : null
}

function collectStops(element: Element): Array<{ offset: number; color: string; opacity: number }> {
  const stops: Array<{ offset: number; color: string; opacity: number }> = []
  for (const child of Array.from(element.children)) {
    if (child.localName !== 'stop') continue
    const rawOffset = (child.getAttribute('offset') ?? '0').trim()
    const offset = rawOffset.endsWith('%')
      ? Number.parseFloat(rawOffset) / 100
      : Number.parseFloat(rawOffset)
    const color = paintToHex(child.getAttribute('stop-color'), '#000000')
    const rawOpacity = (child.getAttribute('stop-opacity') ?? '1').trim()
    const opacity = rawOpacity.endsWith('%')
      ? Number.parseFloat(rawOpacity) / 100
      : Number.parseFloat(rawOpacity)
    stops.push({
      offset: Number.isFinite(offset) ? Math.max(0, Math.min(1, offset)) : 0,
      color: color ?? '#000000',
      opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1,
    })
  }
  return stops
}

/**
 * Read every id'd gradient, clip path and reusable element once. Gradients may
 * inherit stops and geometry from another gradient through href (the shape
 * Inkscape and Illustrator emit), so the chain is followed before defaults are
 * applied.
 */
function parseFilter(filterElement: Element): FilterDef {
  const def: FilterDef = {
    blur: 0,
    offsetX: 0,
    offsetY: 0,
    shadow: false,
    color: '#000000',
    colorOpacity: 1,
    unsupported: false,
  }
  const readOpacity = (raw: string | null): void => {
    if (!raw) return
    const parsed = raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw)
    if (Number.isFinite(parsed)) def.colorOpacity = Math.max(0, Math.min(1, parsed))
  }
  const visit = (element: Element): void => {
    for (const child of Array.from(element.children)) {
      switch (child.localName) {
        case 'feGaussianBlur':
          def.blur += Math.max(0, num(child.getAttribute('stdDeviation'), 0))
          break
        case 'feOffset':
          def.offsetX += num(child.getAttribute('dx'), 0)
          def.offsetY += num(child.getAttribute('dy'), 0)
          break
        case 'feDropShadow': {
          def.shadow = true
          def.offsetX += num(child.getAttribute('dx'), 0)
          def.offsetY += num(child.getAttribute('dy'), 0)
          def.blur += Math.max(0, num(child.getAttribute('stdDeviation'), 0))
          const shadowColor = paintToHex(child.getAttribute('flood-color'), '#000000')
          if (shadowColor) def.color = shadowColor
          readOpacity(child.getAttribute('flood-opacity'))
          break
        }
        case 'feFlood': {
          def.shadow = true
          const floodColor = paintToHex(child.getAttribute('flood-color'), '#000000')
          if (floodColor) def.color = floodColor
          readOpacity(child.getAttribute('flood-opacity'))
          break
        }
        case 'feMerge':
        case 'feMergeNode':
          // how a shadow and its source recombine: nothing extra to model
          break
        default:
          def.unsupported = true
          break
      }
      visit(child)
    }
  }
  visit(filterElement)
  return def
}

function collectDefinitions(root: Element): Definitions {
  const byId = new Map<string, Element>()
  const collect = (element: Element) => {
    const id = elementId(element)
    if (id && !byId.has(id)) byId.set(id, element)
    for (const child of Array.from(element.children)) collect(child)
  }
  collect(root)

  const gradients = new Map<string, GradientDef>()
  const gradientOf = (element: Element, seen: Set<Element>): GradientDef | null => {
    if (seen.has(element)) return null
    seen.add(element)
    const inheritedId = paintReference(
      element.getAttribute('href') ?? element.getAttribute('xlink:href'),
    )
    const parent = inheritedId ? byId.get(inheritedId) : undefined
    const inherited = parent ? gradientOf(parent, seen) : null

    const radial = element.localName === 'radialGradient'
    const own = collectStops(element)
    const stops = own.length ? own : (inherited?.stops ?? [])
    if (!stops.length) return null

    const unitsAttr = (element.getAttribute('gradientUnits') ?? '').trim()
    const usesBoundingBox = unitsAttr
      ? unitsAttr === 'objectBoundingBox'
      : inherited
        ? inherited.objectBoundingBox
        : true
    const value = (name: string, fallback: number): number => {
      const raw = element.getAttribute(name)
      if (raw === null || raw === '') return fallback
      const parsed = Number.parseFloat(
        raw.endsWith('%') ? String(Number.parseFloat(raw) / 100) : raw,
      )
      return Number.isFinite(parsed) ? parsed : fallback
    }
    const transformAttr = element.getAttribute('gradientTransform')
    return {
      kind: radial ? 'radial' : 'linear',
      stops,
      x1: value('x1', radial ? 0 : (inherited?.x1 ?? 0)),
      y1: value('y1', radial ? 0 : (inherited?.y1 ?? 0)),
      x2: value('x2', radial ? 0 : (inherited?.x2 ?? 1)),
      y2: value('y2', radial ? 0 : (inherited?.y2 ?? 0)),
      cx: value('cx', inherited?.cx ?? 0.5),
      cy: value('cy', inherited?.cy ?? 0.5),
      radius: value('r', inherited?.radius ?? 0.5),
      objectBoundingBox: usesBoundingBox,
      transform: transformAttr ? parseTransform(transformAttr) : (inherited?.transform ?? null),
    }
  }

  const clips = new Map<string, Point[]>()
  const filters = new Map<string, FilterDef>()
  for (const [id, element] of byId) {
    if (element.localName === 'filter') {
      filters.set(id, parseFilter(element))
      continue
    }
    if (element.localName === 'linearGradient' || element.localName === 'radialGradient') {
      const gradient = gradientOf(element, new Set())
      if (gradient) gradients.set(id, gradient)
      continue
    }
    if (element.localName === 'clipPath' || element.localName === 'mask') {
      // Only a single convex child is representable: Sutherland-Hodgman needs a
      // convex clip, and unioned/nested clips would not be faithful.
      const children = Array.from(element.children)
      if (children.length !== 1) continue
      const child = children[0]!
      const unitScale = 1
      const shape = outlineOf(child.localName, child, IDENTITY_MATRIX, unitScale)
      if (!shape || shape.length < 3 || !isConvexPolygon(shape)) continue
      clips.set(id, shape)
    }
  }

  return { byId, gradients, clips, filters }
}

/** Points around an ellipse under an arbitrary matrix. */
function ellipseOutline(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  matrix: Matrix,
  steps = 48,
): Point[] {
  const points: Point[] = []
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2
    points.push(applyMatrix(matrix, cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)))
  }
  return points
}

/**
 * The outline of one drawable element in the caller's user space, used as the
 * subject polygon for gradient fills and clip paths. Returns null when the
 * element cannot be reduced to a single outline.
 */
function outlineOf(tag: string, element: Element, matrix: Matrix, _unitScale = 1): Point[] | null {
  if (tag === 'rect') {
    const w = num(element.getAttribute('width'))
    const h = num(element.getAttribute('height'))
    if (!(w > 0) || !(h > 0)) return null
    const ox = num(element.getAttribute('x'))
    const oy = num(element.getAttribute('y'))
    return [
      applyMatrix(matrix, ox, oy),
      applyMatrix(matrix, ox + w, oy),
      applyMatrix(matrix, ox + w, oy + h),
      applyMatrix(matrix, ox, oy + h),
    ]
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const rx = tag === 'circle' ? num(element.getAttribute('r')) : num(element.getAttribute('rx'))
    const ry = tag === 'circle' ? rx : num(element.getAttribute('ry'))
    if (!(rx > 0) || !(ry > 0)) return null
    return ellipseOutline(
      num(element.getAttribute('cx')),
      num(element.getAttribute('cy')),
      rx,
      ry,
      matrix,
    )
  }
  if (tag === 'line') {
    return [
      applyMatrix(matrix, num(element.getAttribute('x1')), num(element.getAttribute('y1'))),
      applyMatrix(matrix, num(element.getAttribute('x2')), num(element.getAttribute('y2'))),
    ]
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const raw = pointsFromList(element.getAttribute('points'))
    return raw ? raw.map((point) => applyMatrix(matrix, point[0], point[1])) : null
  }
  if (tag === 'path') {
    const d = element.getAttribute('d')
    if (!d) return null
    const subpaths = samplePath(d)
    if (!subpaths || !subpaths.length) return null
    // A filled multi-subpath shape relies on hole winding, which native board
    // polygons cannot express, so the largest closed loop is used as the
    // outline (the closest faithful single-region approximation).
    const closed = subpaths.filter((subpath) => subpath.closed)
    const candidates = closed.length ? closed : subpaths
    const chosen = candidates.reduce((best, current) =>
      current.points.length > best.points.length ? current : best,
    )
    return chosen.points.map((point) => applyMatrix(matrix, point[0], point[1]))
  }
  return null
}

/**
 * Why an artwork could not become native shapes.
 *
 * The decomposer returns null without saying which construct defeated it, so
 * "it arrived as one image" was undiagnosable for the user and for the model.
 * This names the cause so the next attempt can avoid it.
 */
export function explainVectorFallback(svg: string): string | null {
  let parsed: Document
  try {
    parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  } catch {
    return 'the SVG could not be parsed'
  }
  if (parsed.querySelector('parsererror')) return 'the SVG could not be parsed'
  const reasons: string[] = []
  const has = (selector: string): boolean => parsed.querySelector(selector) !== null
  if (has('pattern')) reasons.push('a <pattern> fill, which has no native equivalent')
  if (has('image')) reasons.push('an embedded raster <image>')
  const unapproximable = [
    'feTurbulence',
    'feDisplacementMap',
    'feMorphology',
    'feTile',
    'feComponentTransfer',
    'feBlend',
    'feComposite',
  ].filter((name) => has(name))
  if (unapproximable.length) {
    reasons.push(`a filter that cannot be approximated (${unapproximable.join(', ')})`)
  }
  for (const element of Array.from(parsed.querySelectorAll('*'))) {
    if (element.namespaceURI && element.namespaceURI !== SVG_NS) {
      reasons.push(`an element from another namespace (<${element.localName}>)`)
      break
    }
  }
  return reasons.length ? [...new Set(reasons)].join('; ') : null
}
export function decomposeVectorSvg(svg: string): DecomposedArtwork | null {
  if (typeof svg !== 'string' || !svg.trim()) return null
  let parsed: Document
  try {
    parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  } catch {
    return null
  }
  if (parsed.querySelector('parsererror')) return null
  const root = parsed.documentElement
  if (root.localName !== 'svg' || root.namespaceURI !== SVG_NS) return null

  const viewBox = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (
    viewBox.length !== 4 ||
    !viewBox.every(Number.isFinite) ||
    viewBox[2]! <= 0 ||
    viewBox[3]! <= 0
  )
    return null
  const width = viewBox[2]!
  const height = viewBox[3]!

  const primitives: Primitive[] = []
  const definitions = collectDefinitions(root)
  let useDepth = 0

  /** A gradient paint server for this attribute value, when one is referenced. */
  const gradientFor = (value: string | null): GradientDef | null => {
    const id = paintReference(value)
    return id ? (definitions.gradients.get(id) ?? null) : null
  }

  /**
   * Turn a gradient fill into a bounded set of solid native polygons: bands
   * across the axis for a linear gradient, nested caps for a radial one. This
   * is the fidelity cap that lets a gradient stay editable instead of being
   * rasterised — the artwork is stepped, not exact.
   */
  const emitGradientFill = (
    outline: readonly Point[],
    gradient: GradientDef,
    strokeColor: string,
    strokeWidthValue: number,
    elementOpacity: number,
    dashed: boolean,
  ): void => {
    if (outline.length < 3) return
    const box = boundingBox(outline)
    const boxWidth = box.maxX - box.minX
    const boxHeight = box.maxY - box.minY
    if (!(boxWidth > 0) || !(boxHeight > 0)) return
    const pushBand = (part: readonly Point[], t: number) => {
      if (part.length < 3) return
      const sample = sampleGradient(gradient.stops, t)
      primitives.push({
        kind: 'polyline',
        points: part.map((point) => [point[0], point[1]]),
        closed: true,
        fill: sample.color,
        stroke: 'transparent',
        strokeWidth: strokeWidthValue,
        opacity: Math.round(elementOpacity * sample.opacity),
        dash: false,
      })
    }

    if (gradient.kind === 'linear') {
      let from: Point = gradient.objectBoundingBox
        ? [box.minX + gradient.x1 * boxWidth, box.minY + gradient.y1 * boxHeight]
        : [gradient.x1, gradient.y1]
      let to: Point = gradient.objectBoundingBox
        ? [box.minX + gradient.x2 * boxWidth, box.minY + gradient.y2 * boxHeight]
        : [gradient.x2, gradient.y2]
      if (gradient.transform) {
        from = applyMatrix(gradient.transform, from[0], from[1])
        to = applyMatrix(gradient.transform, to[0], to[1])
      }
      const dx = to[0] - from[0]
      const dy = to[1] - from[1]
      const length = Math.hypot(dx, dy)
      if (!(length > 1e-9)) return
      const ux = dx / length
      const uy = dy / length
      // tile the axis across the outline's own projection, so the clamped end
      // colours cover the parts of the shape beyond the declared axis
      let tMin = Infinity
      let tMax = -Infinity
      for (const point of outline) {
        const t = ((point[0] - from[0]) * ux + (point[1] - from[1]) * uy) / length
        if (t < tMin) tMin = t
        if (t > tMax) tMax = t
      }
      if (!(tMax > tMin)) return
      const cover = Math.hypot(boxWidth, boxHeight) * 2 + 10
      for (let step = 0; step < GRADIENT_STEPS; step += 1) {
        const t0 = tMin + ((tMax - tMin) * step) / GRADIENT_STEPS
        const t1 = tMin + ((tMax - tMin) * (step + 1)) / GRADIENT_STEPS
        const slab = gradientBandPolygon(from, to, t0, t1, cover)
        if (!slab.length) continue
        pushBand(clipPolygon(outline, slab), Math.max(0, Math.min(1, (t0 + t1) / 2)))
      }
    } else {
      let center: Point = gradient.objectBoundingBox
        ? [box.minX + gradient.cx * boxWidth, box.minY + gradient.cy * boxHeight]
        : [gradient.cx, gradient.cy]
      let radius = gradient.objectBoundingBox
        ? (gradient.radius * Math.hypot(boxWidth, boxHeight)) / Math.SQRT2
        : gradient.radius
      if (gradient.transform) {
        center = applyMatrix(gradient.transform, center[0], center[1])
        radius *= matrixScale(gradient.transform)
      }
      if (!(radius > 1e-9)) return
      // outer cap first, then progressively smaller ones paint over it
      for (let step = GRADIENT_STEPS; step >= 1; step -= 1) {
        const ring = circlePolygon(center[0], center[1], (radius * step) / GRADIENT_STEPS, 64)
        if (!ring.length) continue
        pushBand(clipPolygon(outline, ring), step / GRADIENT_STEPS)
      }
    }

    // the outline itself is still stroked when the element asked for one
    if (strokeColor !== 'transparent') {
      primitives.push({
        kind: 'polyline',
        points: outline.map((point) => [point[0], point[1]]),
        closed: true,
        fill: 'transparent',
        stroke: strokeColor,
        strokeWidth: strokeWidthValue,
        opacity: elementOpacity,
        dash: dashed,
      })
    }
  }

  /**
   * A Gaussian blur has no native equivalent, so it is approximated by a stack
   * of successively grown translucent copies of the outline: the centre
   * accumulates every layer while the rim only the largest, which reads as a
   * soft edge. Same machinery covers a drop shadow, offset and in the shadow
   * colour, painted before the crisp source.
   */
  const emitFilterHalo = (
    outline: readonly Point[],
    filter: FilterDef,
    sourceFill: string,
    elementOpacity: number,
  ): void => {
    if (outline.length < 3) return
    const layers = 6
    const radius = Math.max(filter.blur, 0.5)
    const haloColor = filter.shadow ? filter.color : sourceFill
    if (haloColor === 'transparent') return
    const haloOpacity = filter.shadow ? filter.colorOpacity : 0.55
    for (let step = layers; step >= 1; step -= 1) {
      const expanded = insetPolygon(outline, -(radius * step) / layers)
      if (expanded.length < 3) continue
      primitives.push({
        kind: 'polyline',
        points: expanded.map((point) => [point[0] + filter.offsetX, point[1] + filter.offsetY]),
        closed: true,
        fill: haloColor,
        stroke: 'transparent',
        strokeWidth: 1,
        opacity: Math.max(1, Math.round((elementOpacity * haloOpacity) / layers)),
        dash: false,
      })
    }
  }

  const walk = (
    element: Element,
    inherited: Matrix,
    parentOpacity: number,
    clip: Point[] | null,
  ): boolean => {
    if (primitives.length > MAX_PRIMITIVES) return false
    const tag = element.localName
    // A foreign namespace is a real fidelity problem; a definition element is
    // not, so definitions are skipped instead of aborting the whole artwork.
    if (element.namespaceURI !== SVG_NS) return false
    if (DEFINITION_TAGS.has(tag)) return true
    if (!DECOMPOSABLE_TAGS.has(tag)) return false

    const local = parseTransform(element.getAttribute('transform'))
    if (local === null) return false
    const matrix = multiplyMatrix(inherited, local)

    const ownOpacity = opacityOf(element)
    if (ownOpacity === null) return false
    const opacity = Math.round((parentOpacity * ownOpacity) / 100)

    // A filter is approximated natively when it is a blur and/or an offset
    // shadow; anything else keeps the faithful single-image fallback.
    const filterAttr = (element.getAttribute('filter') ?? '').trim()
    let activeFilter: FilterDef | null = null
    if (filterAttr && filterAttr !== 'none') {
      const filterId = paintReference(filterAttr)
      const resolvedFilter = filterId ? definitions.filters.get(filterId) : undefined
      if (!resolvedFilter || resolvedFilter.unsupported) return false
      activeFilter = resolvedFilter
    }

    // A clip path or mask is applied natively when it resolves to one convex
    // outline; anything richer is not representable and falls back.
    let activeClip: Point[] | null = clip
    for (const attribute of ['clip-path', 'mask']) {
      const raw = (element.getAttribute(attribute) ?? '').trim()
      if (!raw || raw === 'none') continue
      const clipId = paintReference(raw)
      const resolved = clipId ? definitions.clips.get(clipId) : undefined
      if (!resolved) return false
      // nesting intersects; the subject may be concave, the clip may not
      activeClip = activeClip ? clipPolygon(activeClip, resolved) : resolved
      if (activeClip.length < 3) return true
    }

    const pointBased = tag === 'path' || tag === 'polyline' || tag === 'polygon' || tag === 'line'
    // Text cannot be rotated or skewed into an Excalidraw text box, so it still
    // needs an axis-aligned matrix. Rect and ellipse degrade gracefully to a
    // polygon under a general matrix instead of forcing the whole artwork back
    // to a bitmap, and a pure translate/scale keeps the native primitive.
    if (!pointBased && tag === 'text' && !isAxisAligned(matrix)) return false

    // A gradient paint server is decomposed into solid steps below; a pattern,
    // image or other server has no faithful native equivalent, so it still
    // falls back to the whole-artwork image.
    const gradientFill = gradientFor(element.getAttribute('fill'))
    let fill = paintToHex(element.getAttribute('fill'), 'transparent')
    if (fill === null) {
      if (!gradientFill) return false
      fill = 'transparent'
    }
    let stroke = paintToHex(
      element.getAttribute('stroke'),
      tag === 'line' ? '#000000' : 'transparent',
    )
    if (stroke === null) {
      const gradientStroke = gradientFor(element.getAttribute('stroke'))
      if (!gradientStroke) return false
      // a gradient stroke has no native equivalent: its middle stop stands in
      stroke = sampleGradient(gradientStroke.stops, 0.5).color
    }
    const strokeWidth = num(element.getAttribute('stroke-width'), 1)
    if (!Number.isFinite(strokeWidth) || strokeWidth < 0) return false
    const dash = Boolean(element.getAttribute('stroke-dasharray'))

    const mapPoint = ([px, py]: [number, number]): [number, number] => applyMatrix(matrix, px, py)

    /** An ellipse stays a native ellipse while the matrix is axis aligned; rotated or skewed it becomes a polygon. */
    const pushEllipse = (cx: number, cy: number, rx: number, ry: number): void => {
      const mapX = isAxisAligned(matrix)
      if (mapX) {
        const [ax, ay] = applyMatrix(matrix, cx, cy)
        primitives.push({
          kind: 'ellipse',
          cx: ax,
          cy: ay,
          rx: Math.abs(rx * matrix[0]),
          ry: Math.abs(ry * matrix[3]),
          fill,
          stroke,
          strokeWidth,
          opacity,
        })
        return
      }
      const steps = 48
      const points: Array<[number, number]> = []
      for (let index = 0; index < steps; index += 1) {
        const angle = (index / steps) * Math.PI * 2
        points.push(applyMatrix(matrix, cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)))
      }
      primitives.push({
        kind: 'polyline',
        points,
        closed: true,
        fill,
        stroke,
        strokeWidth,
        opacity,
        dash,
      })
    }

    if (activeFilter) {
      const filterOutline = outlineOf(tag, element, matrix)
      // text has no outline to blur, so it keeps the image fallback
      if (!filterOutline) return false
      emitFilterHalo(filterOutline, activeFilter, fill === 'transparent' ? stroke : fill, opacity)
      // a plain blur REPLACES the source; a shadow sits behind the crisp source
      if (!activeFilter.shadow) return true
    }

    // A gradient fill replaces the element's solid fill with stepped native
    // polygons, whatever shape it drew.
    if (gradientFill) {
      const gradientOutline = outlineOf(tag, element, matrix)
      if (!gradientOutline) return false
      const trimmed = activeClip ? clipPolygon(gradientOutline, activeClip) : gradientOutline
      if (trimmed.length < 3) return true
      emitGradientFill(trimmed, gradientFill, stroke, strokeWidth, opacity, dash)
      return true
    }

    // Containers and <use> push the clip down to whatever they draw.
    if (activeClip && tag !== 'g' && tag !== 'svg' && tag !== 'use') {
      // A text box cannot be cut by a clip path faithfully.
      if (tag === 'text') return false
      const outline = outlineOf(tag, element, matrix)
      if (!outline) return false
      if (fill !== 'transparent') {
        // Sutherland-Hodgman yields a single clipped region (no holes), so one
        // polygon is the whole result.
        const clipped = clipPolygon(outline, activeClip)
        if (clipped.length >= 3) {
          primitives.push({
            kind: 'polyline',
            points: clipped.map((point) => [point[0], point[1]]),
            closed: true,
            fill,
            stroke,
            strokeWidth,
            opacity,
            dash,
          })
        }
      } else {
        // A clipped stroke is shortened, never filled.
        const closedShape = tag !== 'line' && tag !== 'polyline'
        const segmentCount = closedShape ? outline.length : outline.length - 1
        for (let index = 0; index < segmentCount; index += 1) {
          const start = outline[index]!
          const end = outline[(index + 1) % outline.length]!
          for (const [from, to] of clipSegmentToConvex(start, end, activeClip)) {
            primitives.push({
              kind: 'polyline',
              points: [
                [from[0], from[1]],
                [to[0], to[1]],
              ],
              closed: false,
              fill: 'transparent',
              stroke,
              strokeWidth,
              opacity,
              dash,
            })
          }
        }
      }
      return true
    }

    switch (tag) {
      case 'rect': {
        const w = num(element.getAttribute('width'))
        const h = num(element.getAttribute('height'))
        if (w <= 0 || h <= 0) return true
        const originX = num(element.getAttribute('x'))
        const originY = num(element.getAttribute('y'))
        if (isAxisAligned(matrix)) {
          const [ax, ay] = applyMatrix(matrix, originX, originY)
          const [bx, by] = applyMatrix(matrix, originX + w, originY + h)
          primitives.push({
            kind: 'rect',
            x: Math.min(ax, bx),
            y: Math.min(ay, by),
            width: Math.abs(bx - ax),
            height: Math.abs(by - ay),
            fill,
            stroke,
            strokeWidth,
            opacity,
          })
        } else {
          // under rotation or skew a rectangle is exactly a quadrilateral
          primitives.push({
            kind: 'polyline',
            points: [
              applyMatrix(matrix, originX, originY),
              applyMatrix(matrix, originX + w, originY),
              applyMatrix(matrix, originX + w, originY + h),
              applyMatrix(matrix, originX, originY + h),
            ],
            closed: true,
            fill,
            stroke,
            strokeWidth,
            opacity,
            dash,
          })
        }
        return true
      }
      case 'circle': {
        const r = num(element.getAttribute('r'))
        if (r <= 0) return true
        pushEllipse(num(element.getAttribute('cx')), num(element.getAttribute('cy')), r, r)
        return true
      }
      case 'ellipse': {
        const rx = num(element.getAttribute('rx'))
        const ry = num(element.getAttribute('ry'))
        if (rx <= 0 || ry <= 0) return true
        pushEllipse(num(element.getAttribute('cx')), num(element.getAttribute('cy')), rx, ry)
        return true
      }
      case 'line': {
        const points: Array<[number, number]> = [
          mapPoint([num(element.getAttribute('x1')), num(element.getAttribute('y1'))]),
          mapPoint([num(element.getAttribute('x2')), num(element.getAttribute('y2'))]),
        ]
        primitives.push({
          kind: 'polyline',
          points,
          closed: false,
          fill: 'transparent',
          stroke,
          strokeWidth,
          opacity,
          dash,
        })
        return true
      }
      case 'polyline':
      case 'polygon': {
        const raw = pointsFromList(element.getAttribute('points'))
        if (!raw) return false
        primitives.push({
          kind: 'polyline',
          points: raw.map(mapPoint),
          closed: tag === 'polygon',
          fill,
          stroke,
          strokeWidth,
          opacity,
          dash,
        })
        return true
      }
      case 'path': {
        const d = element.getAttribute('d')
        if (!d) return true
        const subpaths = samplePath(d)
        if (!subpaths) return false
        for (const subpath of subpaths) {
          primitives.push({
            kind: 'polyline',
            points: subpath.points.map(mapPoint),
            closed: subpath.closed,
            fill,
            stroke,
            strokeWidth,
            opacity,
            dash,
          })
        }
        return true
      }
      case 'text': {
        const text = collectText(element)
        const anchorRaw = (element.getAttribute('text-anchor') ?? 'start').trim()
        const anchor = anchorRaw === 'middle' ? 'center' : anchorRaw === 'end' ? 'right' : 'left'
        // an axis-aligned scale must scale the glyphs too, or the text lands wrong-sized
        const fontSize = num(element.getAttribute('font-size'), 16) * matrixScale(matrix)
        const [tx, ty] = mapPoint([num(element.getAttribute('x')), num(element.getAttribute('y'))])
        if (text) {
          primitives.push({
            kind: 'text',
            x: tx,
            y: ty,
            text,
            fontSize,
            fill: stroke === 'transparent' ? fill : stroke,
            anchor,
            opacity,
          })
        }
        return true
      }
      case 'use': {
        const reference = element.getAttribute('href') ?? element.getAttribute('xlink:href')
        const targetId = reference && reference.startsWith('#') ? reference.slice(1) : null
        const target = targetId ? definitions.byId.get(targetId) : undefined
        // A missing target or a reference loop keeps the fallback rather than
        // drawing something wrong.
        if (!target || useDepth > 8) return false
        const useX = num(element.getAttribute('x'), 0)
        const useY = num(element.getAttribute('y'), 0)
        const useMatrix = multiplyMatrix(matrix, [1, 0, 0, 1, useX, useY])
        useDepth += 1
        let ok = true
        if (target.localName === 'symbol') {
          // a symbol is not drawable itself: it renders through its children
          for (const child of Array.from(target.children)) {
            if (!walk(child, useMatrix, opacity, activeClip)) {
              ok = false
              break
            }
          }
        } else {
          ok = walk(target, useMatrix, opacity, activeClip)
        }
        useDepth -= 1
        return ok
      }
      default:
        break
    }

    for (const child of Array.from(element.children)) {
      if (!walk(child, matrix, opacity, activeClip)) return false
    }
    return true
  }

  for (const child of Array.from(root.children)) {
    if (!walk(child, IDENTITY, 100, null)) return null
  }
  if (!primitives.length) return null
  return { primitives, width, height }
}
