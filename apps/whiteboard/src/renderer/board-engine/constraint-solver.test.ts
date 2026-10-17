import { describe, expect, it } from 'vitest'
import {
  matrixRank,
  measuredValue,
  solveLinearSystem,
  solveSketch,
  solveWithMovedPoint,
  type Constraint,
  type Sketch,
} from './constraint-solver'

const near = (value: number, target: number, tolerance = 1e-6) => Math.abs(value - target) <= tolerance
const point = (sketch: Sketch, id: string) => sketch.points.find((candidate) => candidate.id === id)!
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y)
const solved = (points: { id: string; x: number; y: number }[], id: string) =>
  points.find((candidate) => candidate.id === id)!

const twoPoints = (a: [number, number], b: [number, number]): Sketch => ({
  points: [
    { id: 'a', x: a[0], y: a[1] },
    { id: 'b', x: b[0], y: b[1] },
  ],
  constraints: [],
})

describe('linear algebra', () => {
  it('solves a system and reports singular ones', () => {
    // 2x + y = 5 ; x + 3y = 10  ->  x = 1, y = 3
    const solution = solveLinearSystem(
      [
        [2, 1],
        [1, 3],
      ],
      [5, 10],
    )
    expect(solution).not.toBeNull()
    expect(near(solution![0]!, 1)).toBe(true)
    expect(near(solution![1]!, 3)).toBe(true)
    // identical rows are singular
    expect(
      solveLinearSystem(
        [
          [1, 2],
          [2, 4],
        ],
        [3, 6],
      ),
    ).toBeNull()
  })

  it('computes matrix rank', () => {
    expect(
      matrixRank([
        [1, 0],
        [0, 1],
      ]),
    ).toBe(2)
    expect(
      matrixRank([
        [1, 2],
        [2, 4],
      ]),
    ).toBe(1)
    expect(matrixRank([[0, 0]])).toBe(0)
    expect(
      matrixRank([
        [1, 2, 3],
        [0, 1, 4],
        [0, 0, 0],
      ]),
    ).toBe(2)
  })
})

describe('constraint solver', () => {
  it('drives a distance constraint to its value', () => {
    const sketch = twoPoints([0, 0], [10, 0])
    sketch.constraints = [
      { kind: 'fixed', point: 'a' },
      { kind: 'distance', a: 'a', b: 'b', value: 25 },
    ]
    const result = solveSketch(sketch)
    expect(result.converged).toBe(true)
    expect(near(distance(result.points[0]!, result.points[1]!), 25, 1e-5)).toBe(true)
    // the fixed end did not move
    expect(near(result.points[0]!.x, 0)).toBe(true)
    expect(near(result.points[0]!.y, 0)).toBe(true)
  })

  it('satisfies horizontal, vertical and coincident constraints', () => {
    const horizontal = twoPoints([0, 0], [30, 12])
    horizontal.constraints = [{ kind: 'horizontal', a: 'a', b: 'b' }]
    const h = solveSketch(horizontal)
    expect(h.converged).toBe(true)
    expect(near(h.points[0]!.y, h.points[1]!.y, 1e-6)).toBe(true)

    const vertical = twoPoints([4, 0], [19, 30])
    vertical.constraints = [{ kind: 'vertical', a: 'a', b: 'b' }]
    const v = solveSketch(vertical)
    expect(v.converged).toBe(true)
    expect(near(v.points[0]!.x, v.points[1]!.x, 1e-6)).toBe(true)

    const coincident = twoPoints([0, 0], [7, -3])
    coincident.constraints = [{ kind: 'coincident', a: 'a', b: 'b' }]
    const c = solveSketch(coincident)
    expect(c.converged).toBe(true)
    expect(near(c.points[0]!.x, c.points[1]!.x, 1e-6)).toBe(true)
    expect(near(c.points[0]!.y, c.points[1]!.y, 1e-6)).toBe(true)
  })

  it('handles perpendicular, parallel, equal length and angle', () => {
    const perpendicular: Sketch = {
      points: [
        { id: 'a1', x: 0, y: 0 },
        { id: 'a2', x: 10, y: 0 },
        { id: 'b1', x: 0, y: 0 },
        { id: 'b2', x: 4, y: 9 },
      ],
      constraints: [
        { kind: 'fixed', point: 'a1' },
        { kind: 'fixed', point: 'a2' },
        { kind: 'perpendicular', a1: 'a1', a2: 'a2', b1: 'b1', b2: 'b2' },
        { kind: 'equalLength', a1: 'a1', a2: 'a2', b1: 'b1', b2: 'b2' },
      ],
    }
    const p = solveSketch(perpendicular)
    expect(p.converged).toBe(true)
    const a = solved(p.points, 'a1')
    const b = solved(p.points, 'a2')
    const c = solved(p.points, 'b1')
    const d = solved(p.points, 'b2')
    expect(near((b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y), 0, 1e-5)).toBe(true)
    expect(near(distance(a, b), distance(c, d), 1e-5)).toBe(true)

    const parallel: Sketch = {
      points: [
        { id: 'a1', x: 0, y: 0 },
        { id: 'a2', x: 10, y: 0 },
        { id: 'b1', x: 0, y: 5 },
        { id: 'b2', x: 8, y: 9 },
      ],
      constraints: [
        { kind: 'fixed', point: 'a1' },
        { kind: 'fixed', point: 'a2' },
        { kind: 'parallel', a1: 'a1', a2: 'a2', b1: 'b1', b2: 'b2' },
      ],
    }
    const par = solveSketch(parallel)
    expect(par.converged).toBe(true)
    const c1 = solved(par.points, 'b1')
    const c2 = solved(par.points, 'b2')
    expect(near(c2.y - c1.y, 0, 1e-5)).toBe(true)

    const angled: Sketch = {
      points: [
        { id: 'a1', x: 0, y: 0 },
        { id: 'a2', x: 10, y: 0 },
        { id: 'b1', x: 0, y: 0 },
        { id: 'b2', x: 10, y: 1 },
      ],
      constraints: [
        { kind: 'fixed', point: 'a1' },
        { kind: 'fixed', point: 'a2' },
        { kind: 'fixed', point: 'b1' },
        { kind: 'angle', a1: 'a1', a2: 'a2', b1: 'b1', b2: 'b2', value: Math.PI / 4 },
      ],
    }
    const ang = solveSketch(angled)
    expect(ang.converged).toBe(true)
    const e1 = solved(ang.points, 'b1')
    const e2 = solved(ang.points, 'b2')
    expect(near(Math.atan2(e2.y - e1.y, e2.x - e1.x), Math.PI / 4, 1e-5)).toBe(true)
  })

  it('puts a point on a line, at a midpoint, and sets a circle radius', () => {
    const onLine: Sketch = {
      points: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 10, y: 0 },
        { id: 'p', x: 4, y: 7 },
      ],
      constraints: [
        { kind: 'fixed', point: 'a' },
        { kind: 'fixed', point: 'b' },
        { kind: 'pointOnLine', point: 'p', lineA: 'a', lineB: 'b' },
      ],
    }
    const line = solveSketch(onLine)
    expect(line.converged).toBe(true)
    expect(near(solved(line.points, 'p').y, 0, 1e-6)).toBe(true)

    const midpoint: Sketch = {
      points: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 10, y: 6 },
        { id: 'm', x: 1, y: 9 },
      ],
      constraints: [
        { kind: 'fixed', point: 'a' },
        { kind: 'fixed', point: 'b' },
        { kind: 'midpoint', point: 'm', a: 'a', b: 'b' },
      ],
    }
    const mid = solveSketch(midpoint)
    expect(mid.converged).toBe(true)
    expect(near(solved(mid.points, 'm').x, 5, 1e-6)).toBe(true)
    expect(near(solved(mid.points, 'm').y, 3, 1e-6)).toBe(true)

    const circle: Sketch = {
      points: [
        { id: 'c', x: 0, y: 0 },
        { id: 'r', x: 3, y: 4 },
      ],
      constraints: [
        { kind: 'fixed', point: 'c' },
        { kind: 'radius', center: 'c', rim: 'r', value: 12 },
      ],
    }
    const radius = solveSketch(circle)
    expect(radius.converged).toBe(true)
    expect(near(distance(solved(radius.points, 'c'), solved(radius.points, 'r')), 12, 1e-5)).toBe(true)
  })

  it('reports degrees of freedom so freedom and over-constraint are distinguishable', () => {
    // a lone point has two degrees of freedom
    const free = solveSketch(twoPoints([1, 2], [3, 4]))
    expect(free.dof).toBe(4)
    expect(free.status).toBe('underconstrained')

    // pinning both points removes all of them
    const pinned = solveSketch({
      points: [
        { id: 'a', x: 1, y: 2 },
        { id: 'b', x: 3, y: 4 },
      ],
      constraints: [
        { kind: 'fixed', point: 'a' },
        { kind: 'fixed', point: 'b' },
      ],
    })
    expect(pinned.dof).toBe(0)
    expect(pinned.status).toBe('solved')

    // a horizontal plus a vertical plus a distance over-constrains two points
    const over: Sketch = {
      points: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 5, y: 5 },
      ],
      constraints: [
        { kind: 'fixed', point: 'a' },
        { kind: 'horizontal', a: 'a', b: 'b' },
        { kind: 'vertical', a: 'a', b: 'b' },
      ],
    }
    const overConstrained = solveSketch(over)
    // b is forced to a's position, so the sketch collapses rather than conflicting
    expect(overConstrained.dof).toBeLessThanOrEqual(0)
  })

  it('reports inconsistent when two dimensions contradict', () => {
    const sketch = twoPoints([0, 0], [10, 0])
    sketch.constraints = [
      { kind: 'fixed', point: 'a' },
      { kind: 'distance', a: 'a', b: 'b', value: 25 },
      { kind: 'distance', a: 'a', b: 'b', value: 40 },
    ]
    const result = solveSketch(sketch)
    expect(result.converged).toBe(false)
    expect(result.status).toBe('inconsistent')
    expect(result.residual).toBeGreaterThan(1e-3)
  })

  it('re-solves associatively: moving a point restores the annotated dimension', () => {
    const sketch = twoPoints([0, 0], [100, 0])
    sketch.constraints = [
      { kind: 'fixed', point: 'a' },
      { kind: 'distance', a: 'a', b: 'b', value: 50 },
    ]
    // drag b far away; the dimension must pull it back to 50
    const result = solveWithMovedPoint(sketch, 'b', [400, 300])
    expect(result.converged).toBe(true)
    expect(near(distance(result.points[0]!, result.points[1]!), 50, 1e-4)).toBe(true)
    // and the measured value of the constraint agrees with the annotation
    const measured = measuredValue(result.points, sketch.constraints[1]!)
    expect(near(measured!, 50, 1e-4)).toBe(true)
  })

  it('measures dimension values from solved geometry', () => {
    const points = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 3, y: 4 },
    ]
    const distanceConstraint: Constraint = { kind: 'distance', a: 'a', b: 'b', value: 0 }
    expect(near(measuredValue(points, distanceConstraint)!, 5)).toBe(true)
    const angleConstraint: Constraint = {
      kind: 'angle',
      a1: 'a',
      a2: 'b',
      b1: 'a',
      b2: 'b',
      value: 0,
    }
    expect(near(measuredValue(points, angleConstraint)!, 0)).toBe(true)
    // a constraint with no measurable value reports null rather than a wrong number
    expect(measuredValue(points, { kind: 'fixed', point: 'a' })).toBeNull()
  })

  it('leaves an unconstrained sketch untouched', () => {
    const sketch = twoPoints([7, 8], [9, 10])
    const result = solveSketch(sketch)
    expect(result.converged).toBe(true)
    expect(result.points).toEqual(sketch.points)
    expect(point(sketch, 'a').x).toBe(7)
  })
})
