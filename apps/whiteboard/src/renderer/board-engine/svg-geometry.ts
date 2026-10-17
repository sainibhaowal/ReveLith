/**
 * 2D geometry kernel for SVG -> native board shape decomposition.
 *
 * The decomposer can only emit Excalidraw primitives (rectangle, ellipse, line
 * with relative points, text). Everything richer in SVG — arcs, rotation and
 * skew, gradients, masks and clip paths — has to be projected onto those
 * primitives. This module holds the maths that makes that possible:
 *
 *  - affine matrices and their decomposition (a rotated rect is still a
 *    quadrilateral, so it stays editable rather than falling back to a bitmap)
 *  - the SVG endpoint arc parameterisation, sampled into a polyline
 *  - convex polygon clipping (Sutherland-Hodgman), the basis for clip paths,
 *    masks and gradient bands
 *  - gradient stop sampling, so a gradient becomes a bounded set of solid
 *    native shapes instead of one rasterised image
 *
 * Pure and dependency-free: no DOM, no board API.
 */

export type Point = readonly [number, number]
export type Matrix = readonly [number, number, number, number, number, number]

export const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0]

export function multiplyMatrix(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

export function applyMatrix(m: Matrix, point: Point): Point {
  return [m[0] * point[0] + m[2] * point[1] + m[4], m[1] * point[0] + m[3] * point[1] + m[5]]
}

export function isIdentityMatrix(m: Matrix, epsilon = 1e-9): boolean {
  return m.every((value, index) => Math.abs(value - IDENTITY_MATRIX[index]!) < epsilon)
}

/** True when the matrix has no rotation or skew (only translate and scale). */
export function isAxisAligned(m: Matrix, epsilon = 1e-9): boolean {
  return Math.abs(m[1]) < epsilon && Math.abs(m[2]) < epsilon
}

/** |det|^(1/2): the uniform length scale the matrix applies, used for stroke widths and font sizes. */
export function matrixScale(m: Matrix): number {
  const determinant = Math.abs(m[0] * m[3] - m[1] * m[2])
  return determinant > 0 ? Math.sqrt(determinant) : 1
}

/**
 * SVG elliptical arc (endpoint parameterisation, spec section F.6.5) sampled
 * into a polyline. Returns null for a degenerate arc, which the caller treats
 * as a straight line.
 */
export function sampleArc(
  from: Point,
  rx: number,
  ry: number,
  xAxisRotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
  steps = 24,
): Point[] | null {
  let radiusX = Math.abs(rx)
  let radiusY = Math.abs(ry)
  if (radiusX < 1e-9 || radiusY < 1e-9) return null

  const phi = ((xAxisRotationDeg % 360) * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)

  const dx2 = (from[0] - to[0]) / 2
  const dy2 = (from[1] - to[1]) / 2
  // mid-point transform into the ellipse's own frame
  const x1p = cosPhi * dx2 + sinPhi * dy2
  const y1p = -sinPhi * dx2 + cosPhi * dy2

  // scale radii up if they cannot span the chord (spec F.6.6)
  const lambda = (x1p * x1p) / (radiusX * radiusX) + (y1p * y1p) / (radiusY * radiusY)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    radiusX *= scale
    radiusY *= scale
  }

  const sign = largeArc === sweep ? -1 : 1
  const numerator = radiusX * radiusX * radiusY * radiusY - radiusX * radiusX * y1p * y1p - radiusY * radiusY * x1p * x1p
  const denominator = radiusX * radiusX * y1p * y1p + radiusY * radiusY * x1p * x1p
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator))
  const cxp = (coefficient * radiusX * y1p) / radiusY
  const cyp = (-coefficient * radiusY * x1p) / radiusX

  const centerX = cosPhi * cxp - sinPhi * cyp + (from[0] + to[0]) / 2
  const centerY = sinPhi * cxp + cosPhi * cyp + (from[1] + to[1]) / 2

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy
    const length = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    const ratio = length > 0 ? Math.max(-1, Math.min(1, dot / length)) : 1
    const sign = ux * vy - uy * vx < 0 ? -1 : 1
    return sign * Math.acos(ratio)
  }

  const startAngle = angle(1, 0, (x1p - cxp) / radiusX, (y1p - cyp) / radiusY)
  let deltaAngle = angle(
    (x1p - cxp) / radiusX,
    (y1p - cyp) / radiusY,
    (-x1p - cxp) / radiusX,
    (-y1p - cyp) / radiusY,
  )
  if (!sweep && deltaAngle > 0) deltaAngle -= 2 * Math.PI
  else if (sweep && deltaAngle < 0) deltaAngle += 2 * Math.PI

  const count = Math.max(2, Math.min(96, Math.round(steps)))
  const points: Point[] = []
  for (let index = 0; index <= count; index += 1) {
    const theta = startAngle + (deltaAngle * index) / count
    const cosTheta = Math.cos(theta)
    const sinTheta = Math.sin(theta)
    points.push([
      centerX + radiusX * cosTheta * cosPhi - radiusY * sinTheta * sinPhi,
      centerY + radiusX * cosTheta * sinPhi + radiusY * sinTheta * cosPhi,
    ])
  }
  return points
}

/** Signed area; negative means clockwise in a y-down coordinate system. */
export function polygonArea(points: readonly Point[]): number {
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    total += current[0] * next[1] - next[0] * current[1]
  }
  return total / 2
}

type Edge = (point: Point) => number

/**
 * Sutherland-Hodgman clipping of a subject polygon against a CONVEX clip
 * polygon. Non-convex clip regions must be split by the caller. Used for clip
 * paths, masks and gradient bands.
 */
export function clipPolygon(subject: readonly Point[], clip: readonly Point[]): Point[] {
  if (subject.length < 3 || clip.length < 3) return []
  // Inside test per clip edge, derived from the edge direction so the winding
  // of the clip polygon does not matter.
  const winding = polygonArea(clip) >= 0 ? 1 : -1
  const edges: Edge[] = []
  for (let index = 0; index < clip.length; index += 1) {
    const a = clip[index]!
    const b = clip[(index + 1) % clip.length]!
    const edgeX = b[0] - a[0]
    const edgeY = b[1] - a[1]
    // cross(edge, point - a) * winding >= 0 means inside
    edges.push((point) => winding * (edgeX * (point[1] - a[1]) - edgeY * (point[0] - a[0])))
  }

  let output: Point[] = [...subject]
  for (const inside of edges) {
    if (!output.length) return []
    const input = output
    output = []
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!
      const previous = input[(index + input.length - 1) % input.length]!
      const currentInside = inside(current) >= 0
      const previousInside = inside(previous) >= 0
      if (currentInside) {
        if (!previousInside) {
          const intersection = intersectSegmentEdge(previous, current, inside)
          if (intersection) output.push(intersection)
        }
        output.push(current)
      } else if (previousInside) {
        const intersection = intersectSegmentEdge(previous, current, inside)
        if (intersection) output.push(intersection)
      }
    }
  }
  return output
}

/**
 * Where a segment crosses an edge's zero level. The edge function is linear
 * along the segment, so it is solved analytically: bisection here left ~1e-10
 * of error in clipped coordinates, which is visible in exact-fit geometry.
 */
function intersectSegmentEdge(from: Point, to: Point, inside: Edge): Point | null {
  const fromValue = inside(from)
  const delta = inside(to) - fromValue
  if (Math.abs(delta) < 1e-12) return Math.abs(fromValue) < 1e-12 ? from : null
  const raw = -fromValue / delta
  if (!Number.isFinite(raw)) return null
  const t = Math.max(0, Math.min(1, raw))
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
}

export function boundingBox(points: readonly Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

export interface GradientStop {
  offset: number
  color: string
  opacity: number
}

/**
 * Resolve a gradient at parameter t in [0,1], interpolating between the
 * surrounding stops. `colors` are already-normalised hex strings.
 */
export function sampleGradient(stops: readonly GradientStop[], t: number): { color: string; opacity: number } {
  if (!stops.length) return { color: '#808080', opacity: 1 }
  const sorted = [...stops].sort((a, b) => a.offset - b.offset)
  const clamped = Math.max(0, Math.min(1, t))
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  if (clamped <= first.offset) return { color: first.color, opacity: first.opacity }
  if (clamped >= last.offset) return { color: last.color, opacity: last.opacity }
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const a = sorted[index]!
    const b = sorted[index + 1]!
    if (clamped < a.offset || clamped > b.offset) continue
    const span = b.offset - a.offset
    const local = span > 1e-9 ? (clamped - a.offset) / span : 0
    return {
      color: mixHex(a.color, b.color, local),
      opacity: a.opacity + (b.opacity - a.opacity) * local,
    }
  }
  return { color: last.color, opacity: last.opacity }
}

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
const hex2 = (value: number) => clampByte(value).toString(16).padStart(2, '0')

function parseHexSafe(value: string): [number, number, number] {
  const hex = value.replace('#', '')
  const full = hex.length === 3 ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}` : hex
  if (full.length < 6) return [128, 128, 128]
  return [
    Number.parseInt(full.slice(0, 2), 16) || 0,
    Number.parseInt(full.slice(2, 4), 16) || 0,
    Number.parseInt(full.slice(4, 6), 16) || 0,
  ]
}

/** Linear RGB-space blend between two hex colours. */
export function mixHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = parseHexSafe(from)
  const [r2, g2, b2] = parseHexSafe(to)
  const ratio = Math.max(0, Math.min(1, t))
  return `#${hex2(r1 + (r2 - r1) * ratio)}${hex2(g1 + (g2 - g1) * ratio)}${hex2(b1 + (b2 - b1) * ratio)}`
}

/**
 * Move a polygon's vertices toward (positive) or away from (negative) its
 * centroid by an absolute distance. Negative insets are what a fake-blur stack
 * needs: each successive copy is grown slightly to build a halo.
 */
export function insetPolygon(points: readonly Point[], inset: number): Point[] {
  if (points.length < 3 || inset === 0) return [...points]
  const { minX, minY, maxX, maxY } = boundingBox(points)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  return points.map((point) => {
    const dx = centerX - point[0]
    const dy = centerY - point[1]
    const length = Math.hypot(dx, dy)
    if (length < 1e-9) return point
    // never invert through the centre
    const scale = Math.max(0, (length - inset) / length)
    return [point[0] + dx * (1 - scale), point[1] + dy * (1 - scale)] as Point
  })
}

/**
 * A convex slab covering the band between two parameter positions along the
 * gradient axis, extended `cover` perpendicular to the axis so it contains the
 * whole shape. Clipping the shape against this quad yields exactly the part of
 * the shape inside the band, which is how a linear gradient becomes a bounded
 * set of solid native shapes. Convexity matters: Sutherland-Hodgman only
 * requires the CLIP to be convex, so the subject shape may be concave.
 */
export function gradientBandPolygon(
  from: Point,
  to: Point,
  tStart: number,
  tEnd: number,
  cover: number,
): Point[] {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  if (!(length > 1e-9) || !(cover > 0)) return []
  const ux = dx / length
  const uy = dy / length
  const nx = -uy
  const ny = ux
  const at = (t: number, side: number): Point => [
    from[0] + ux * length * t + nx * cover * side,
    from[1] + uy * length * t + ny * cover * side,
  ]
  return [at(tStart, -1), at(tStart, 1), at(tEnd, 1), at(tEnd, -1)]
}

/** A convex polygon approximation of a circle, used to step a radial gradient. */
export function circlePolygon(cx: number, cy: number, radius: number, steps = 48): Point[] {
  if (!(radius > 0)) return []
  const count = Math.max(8, Math.min(128, Math.round(steps)))
  const points: Point[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  return points
}

/** True when every turn of the polygon has the same sign, i.e. the region is convex. */
export function isConvexPolygon(points: readonly Point[]): boolean {
  if (points.length < 3) return false
  let sign = 0
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!
    const b = points[(index + 1) % points.length]!
    const c = points[(index + 2) % points.length]!
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-9) continue
    const current = cross > 0 ? 1 : -1
    if (sign === 0) sign = current
    else if (sign !== current) return false
  }
  return sign !== 0
}

/**
 * Clip a segment against a convex polygon (Liang-Barsky style half-plane
 * intersection). A convex region can cut a segment in at most one interval, so
 * the result is zero or one sub-segment. This is what a clipped STROKE needs:
 * polygon clipping would fill the cut line instead of shortening it.
 */
export function clipSegmentToConvex(
  from: Point,
  to: Point,
  clip: readonly Point[],
): Array<[Point, Point]> {
  if (clip.length < 3) return []
  const winding = polygonArea(clip) >= 0 ? 1 : -1
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  let tMin = 0
  let tMax = 1
  for (let index = 0; index < clip.length; index += 1) {
    const a = clip[index]!
    const b = clip[(index + 1) % clip.length]!
    const edgeX = b[0] - a[0]
    const edgeY = b[1] - a[1]
    // positive inside this edge's half-plane
    const value = (point: Point) => winding * (edgeX * (point[1] - a[1]) - edgeY * (point[0] - a[0]))
    const startValue = value(from)
    const delta = value(to) - startValue
    if (Math.abs(delta) < 1e-12) {
      // parallel to the edge: either wholly inside it or wholly outside
      if (startValue < 0) return []
      continue
    }
    const crossing = -startValue / delta
    if (delta > 0) {
      if (crossing > tMin) tMin = crossing
    } else if (crossing < tMax) {
      tMax = crossing
    }
    if (tMin > tMax) return []
  }
  if (tMin > tMax) return []
  const at = (t: number): Point => [from[0] + dx * t, from[1] + dy * t]
  return [[at(tMin), at(tMax)]]
}
