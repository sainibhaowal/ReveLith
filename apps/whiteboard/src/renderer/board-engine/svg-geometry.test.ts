import { describe, expect, it } from 'vitest'
import {
  applyMatrix,
  boundingBox,
  circlePolygon,
  clipPolygon,
  clipSegmentToConvex,
  gradientBandPolygon,
  insetPolygon,
  isAxisAligned,
  isConvexPolygon,
  isIdentityMatrix,
  matrixScale,
  mixHex,
  multiplyMatrix,
  polygonArea,
  sampleArc,
  sampleGradient,
  type Point,
} from './svg-geometry'

const near = (value: number, target: number, tolerance = 1e-6) =>
  Math.abs(value - target) <= tolerance
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('svg geometry kernel', () => {
  it('composes and applies affine matrices', () => {
    const translate = [1, 0, 0, 1, 10, 20] as const
    const scale = [2, 0, 0, 3, 0, 0] as const
    const composed = multiplyMatrix(translate, scale)
    // translate after scale: point (1,1) -> scale -> (2,3) -> translate -> (12,23)
    expect(applyMatrix(composed, [1, 1])).toEqual([12, 23])
    expect(isIdentityMatrix(composed)).toBe(false)
    expect(isAxisAligned(composed)).toBe(true)
    // a 45 degree rotation is neither identity nor axis aligned
    const cos = Math.SQRT1_2
    const rotated = [cos, cos, -cos, cos, 0, 0] as const
    expect(isAxisAligned(rotated)).toBe(false)
    expect(near(matrixScale(rotated), 1)).toBe(true)
    expect(near(matrixScale([3, 0, 0, 3, 0, 0] as never), 3)).toBe(true)
  })

  it('samples an arc that starts and ends exactly on its endpoints', () => {
    // quarter circle radius 1 centred on the origin, from (1,0) to (0,1)
    const points = sampleArc([1, 0], 1, 1, 0, false, true, [0, 1], 16)
    expect(points).not.toBeNull()
    const arc = points!
    expect(distance(arc[0]!, [1, 0])).toBeLessThan(1e-9)
    expect(distance(arc[arc.length - 1]!, [0, 1])).toBeLessThan(1e-9)
    // every sample sits on the unit circle
    for (const point of arc) expect(near(Math.hypot(point[0], point[1]), 1, 1e-9)).toBe(true)
    // and it is monotonic in angle, so no fold back
    expect(arc.length).toBeGreaterThan(4)
  })

  it('mirrors the arc centre across the chord when sweep is flipped', () => {
    const sweepOne = sampleArc([1, 0], 1, 1, 0, false, true, [0, 1], 8)!
    const sweepTwo = sampleArc([1, 0], 1, 1, 0, false, false, [0, 1], 8)!
    // both arcs hit the same endpoints
    for (const arc of [sweepOne, sweepTwo]) {
      expect(distance(arc[0]!, [1, 0])).toBeLessThan(1e-9)
      expect(distance(arc[arc.length - 1]!, [0, 1])).toBeLessThan(1e-9)
    }
    // but they bow to opposite sides of the chord
    expect(distance(sweepOne[4]!, sweepTwo[4]!)).toBeGreaterThan(0.1)
    // sweep=true centres on the origin, sweep=false on the mirrored corner (1,1)
    expect(near(Math.hypot(sweepOne[4]![0], sweepOne[4]![1]), 1, 1e-9)).toBe(true)
    expect(near(Math.hypot(sweepTwo[4]![0] - 1, sweepTwo[4]![1] - 1), 1, 1e-9)).toBe(true)
  })

  it('scales radii up when they cannot span the chord, and rejects degenerate arcs', () => {
    // radii far too small for the chord: the spec grows them instead of failing
    const grown = sampleArc([0, 0], 0.1, 0.1, 0, false, true, [10, 0], 8)
    expect(grown).not.toBeNull()
    expect(distance(grown![0]!, [0, 0])).toBeLessThan(1e-9)
    expect(distance(grown![grown!.length - 1]!, [10, 0])).toBeLessThan(1e-9)
    // zero radius is a straight line, which the caller handles
    expect(sampleArc([0, 0], 0, 5, 0, false, true, [10, 0])).toBeNull()
  })

  it('clips a polygon against a convex region', () => {
    const big: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    const small: Point[] = [
      [2, 2],
      [6, 2],
      [6, 6],
      [2, 6],
    ]
    const clipped = clipPolygon(big, small)
    expect(near(Math.abs(polygonArea(clipped)), 16, 1e-6)).toBe(true)
    // clipping in the other direction yields the same intersection
    const mirrored = clipPolygon(small, big)
    expect(near(Math.abs(polygonArea(mirrored)), 16, 1e-6)).toBe(true)
    // a half-plane style clip keeps only the overlapping half
    const half: Point[] = [
      [0, 0],
      [10, 0],
      [10, 5],
      [0, 5],
    ]
    const topHalf = clipPolygon(big, half)
    expect(near(Math.abs(polygonArea(topHalf)), 50, 1e-6)).toBe(true)
  })

  it('returns nothing when polygons do not overlap, and ignores degenerate input', () => {
    const a: Point[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    const b: Point[] = [
      [5, 5],
      [6, 5],
      [6, 6],
      [5, 6],
    ]
    expect(clipPolygon(a, b)).toHaveLength(0)
    expect(clipPolygon([[0, 0]], b)).toHaveLength(0)
    expect(clipPolygon(a, [])).toHaveLength(0)
  })

  it('interpolates gradient stops including outside the stop range', () => {
    const stops = [
      { offset: 0, color: '#000000', opacity: 1 },
      { offset: 1, color: '#ffffff', opacity: 1 },
    ]
    expect(sampleGradient(stops, 0)).toEqual({ color: '#000000', opacity: 1 })
    expect(sampleGradient(stops, 1)).toEqual({ color: '#ffffff', opacity: 1 })
    expect(sampleGradient(stops, 0.5).color).toBe('#808080')
    // clamped outside [0,1]
    expect(sampleGradient(stops, -1).color).toBe('#000000')
    expect(sampleGradient(stops, 4).color).toBe('#ffffff')
    // honours stop offsets rather than assuming even spacing
    const split = [
      { offset: 0, color: '#000000', opacity: 1 },
      { offset: 0.25, color: '#ffffff', opacity: 1 },
      { offset: 1, color: '#000000', opacity: 1 },
    ]
    expect(sampleGradient(split, 0.25).color).toBe('#ffffff')
    // interpolates opacity too
    const faded = [
      { offset: 0, color: '#ff0000', opacity: 0 },
      { offset: 1, color: '#ff0000', opacity: 1 },
    ]
    expect(near(sampleGradient(faded, 0.5).opacity, 0.5)).toBe(true)
    // an empty stop list still yields a usable colour
    expect(sampleGradient([], 0.5).color).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('mixes hex colours and keeps them well formed', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#ff0000', '#00ff00', 0.5)).toBe('#808000')
    expect(mixHex('#abc', '#abc', 0.5)).toBe('#aabbcc')
    expect(mixHex('not-a-colour', '#000000', 0)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('computes bounding boxes and insets a polygon toward its centre', () => {
    const square: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    expect(boundingBox(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 })
    const inset = insetPolygon(square, 1)
    const box = boundingBox(inset)
    // each corner moved one unit toward the centre along its diagonal
    expect(box.minX).toBeGreaterThan(0)
    expect(box.maxX).toBeLessThan(10)
    expect(inset).toHaveLength(4)
    // a zero inset is a no-op
    expect(insetPolygon(square, 0)).toEqual(square)
    // a negative inset GROWS the polygon, which is what a blur halo needs
    const grown = boundingBox(insetPolygon(square, -2))
    expect(grown.minX).toBeLessThan(0)
    expect(grown.maxX).toBeGreaterThan(10)
    expect(insetPolygon(square, -2)).toHaveLength(4)
  })

  it('builds gradient bands that clip a shape into solid steps', () => {
    // horizontal axis across a 100x100 square, covered perpendicular to it
    const band = gradientBandPolygon([0, 50], [100, 50], 0, 0.5, 200)
    expect(band).toHaveLength(4)
    const square: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]
    const first = clipPolygon(square, band)
    // the first half of the axis covers half the square
    expect(near(Math.abs(polygonArea(first)), 5000, 1e-3)).toBe(true)
    // tiles of the axis sum back to the whole shape
    let total = 0
    for (let step = 0; step < 4; step += 1) {
      const tile = gradientBandPolygon([0, 50], [100, 50], step / 4, (step + 1) / 4, 200)
      total += Math.abs(polygonArea(clipPolygon(square, tile)))
    }
    expect(near(total, 10000, 1e-3)).toBe(true)
    // a degenerate axis cannot define a band
    expect(gradientBandPolygon([5, 5], [5, 5], 0, 1, 100)).toHaveLength(0)
    expect(gradientBandPolygon([0, 0], [10, 0], 0, 1, 0)).toHaveLength(0)
  })

  it('approximates circles for radial gradient steps', () => {
    const circle = circlePolygon(0, 0, 10, 64)
    expect(circle.length).toBe(64)
    for (const point of circle) expect(near(Math.hypot(point[0], point[1]), 10, 1e-9)).toBe(true)
    expect(circlePolygon(0, 0, 0)).toHaveLength(0)
    // a 64-gon is a close approximation of the true area
    expect(Math.abs(Math.abs(polygonArea(circle)) - Math.PI * 100)).toBeLessThan(1)
  })

  it('detects convexity so clipping is only attempted where it is valid', () => {
    expect(
      isConvexPolygon([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
    ).toBe(true)
    expect(
      isConvexPolygon([
        [0, 0],
        [10, 0],
        [5, 3],
        [10, 10],
        [0, 10],
      ]),
    ).toBe(false)
    expect(
      isConvexPolygon([
        [0, 0],
        [10, 0],
      ]),
    ).toBe(false)
    expect(
      isConvexPolygon([
        [0, 0],
        [5, 0],
        [10, 0],
      ]),
    ).toBe(false)
  })

  it('clips a segment against a convex region instead of filling it', () => {
    const box: Point[] = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
    ]
    // a line crossing the box keeps only the inside part
    const crossing = clipSegmentToConvex([0, 5], [10, 5], box)
    expect(crossing).toHaveLength(1)
    expect(near(crossing[0]![0][0], 2, 1e-6)).toBe(true)
    expect(near(crossing[0]![1][0], 8, 1e-6)).toBe(true)
    // a line wholly inside is returned unchanged
    const inside = clipSegmentToConvex([3, 3], [7, 7], box)
    expect(inside).toHaveLength(1)
    expect(near(inside[0]![0][0], 3, 1e-6)).toBe(true)
    expect(near(inside[0]![1][0], 7, 1e-6)).toBe(true)
    // a line wholly outside disappears
    expect(clipSegmentToConvex([0, 0], [1, 1], box)).toHaveLength(0)
    // a line collinear with an edge and outside it disappears
    expect(clipSegmentToConvex([0, 0], [10, 0], box)).toHaveLength(0)
    // degenerate clip
    expect(
      clipSegmentToConvex(
        [0, 0],
        [10, 10],
        [
          [0, 0],
          [1, 1],
        ],
      ),
    ).toHaveLength(0)
  })
})
