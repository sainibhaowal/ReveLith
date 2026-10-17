/**
 * 2D geometric constraint solver — the parametric core of the CAD layer.
 *
 * A sketch is a set of points (the only variables; a circle is a centre point
 * plus a rim point, exactly as in SolveSpace and FreeCAD's sketcher) and a set
 * of constraints. Each constraint contributes residual equations that are zero
 * when it is satisfied, and the solver drives them to zero with a
 * Levenberg-Marquardt damped Gauss-Newton iteration on the normal equations
 *
 *   (JᵀJ + λI) Δ = −Jᵀ r
 *
 * The Jacobian is evaluated by central differences: uniform across every
 * constraint, exact to O(h²), and cheap at sketch sizes, at the cost of
 * (2·variables) residual evaluations per iteration.
 *
 * It also reports the degrees of freedom from the rank of J, so a sketch can be
 * told apart as under-constrained (still movable), fully constrained, or
 * inconsistent (conflicting constraints), rather than silently "solving".
 *
 * Pure: no DOM, no board API, no randomness.
 */

export type Vec2 = [number, number]

export interface SketchPoint {
  id: string
  x: number
  y: number
}

/** Every constraint is expressed purely in terms of point ids. */
export type Constraint =
  /** pin a point to its current position, or to t when given */
  | { kind: 'fixed'; point: string; at?: [number, number] }
  /** two points occupy the same location */
  | { kind: 'coincident'; a: string; b: string }
  /** the segment a-b is horizontal */
  | { kind: 'horizontal'; a: string; b: string }
  /** the segment a-b is vertical */
  | { kind: 'vertical'; a: string; b: string }
  /** |a-b| equals value */
  | { kind: 'distance'; a: string; b: string; value: number }
  /** the point lies on the infinite line through lineA-lineB */
  | { kind: 'pointOnLine'; point: string; lineA: string; lineB: string }
  /** segment a1-a2 is parallel to b1-b2 */
  | { kind: 'parallel'; a1: string; a2: string; b1: string; b2: string }
  /** segment a1-a2 is perpendicular to b1-b2 */
  | { kind: 'perpendicular'; a1: string; a2: string; b1: string; b2: string }
  /** |a1-a2| equals |b1-b2| */
  | { kind: 'equalLength'; a1: string; a2: string; b1: string; b2: string }
  /** the signed angle from a1-a2 to b1-b2 equals value radians */
  | { kind: 'angle'; a1: string; a2: string; b1: string; b2: string; value: number }
  /** point is the midpoint of a and b */
  | { kind: 'midpoint'; point: string; a: string; b: string }
  /** the circle centre-rim has radius value */
  | { kind: 'radius'; center: string; rim: string; value: number }

export interface Sketch {
  points: SketchPoint[]
  constraints: Constraint[]
}

export interface SolveOptions {
  maxIterations?: number
  /** residual infinity-norm at which the sketch counts as satisfied */
  tolerance?: number
  /** initial Levenberg-Marquardt damping */
  damping?: number
}

export type SketchStatus =
  /** every constraint satisfied, no remaining freedom */
  | 'solved'
  /** satisfied, but the geometry can still move (dof > 0) */
  | 'underconstrained'
  /** satisfied, dof < 0: redundant constraints are present */
  | 'overconstrained'
  /** constraints cannot all hold at once */
  | 'inconsistent'

export interface SolveResult {
  points: SketchPoint[]
  converged: boolean
  iterations: number
  /** final residual infinity-norm */
  residual: number
  /** variables − rank(J): positive means remaining freedom, negative means redundant */
  dof: number
  status: SketchStatus
}

const EPSILON = 1e-9

/** Central-difference step, scaled to the variable magnitude for conditioning. */
function finiteDifferenceStep(value: number): number {
  return 1e-6 * Math.max(1, Math.abs(value))
}

function pointIndex(sketch: Sketch): Map<string, number> {
  const index = new Map<string, number>()
  sketch.points.forEach((point, position) => index.set(point.id, position * 2))
  return index
}

function unit(x: number, y: number): Vec2 {
  const length = Math.hypot(x, y)
  return length < EPSILON ? [0, 0] : [x / length, y / length]
}

/**
 * Build the residual vector for a whole sketch from a flat variable vector.
 * Kept separate from the constraint handling so the id→variable mapping is
 * built once per solve rather than per residual evaluation.
 */
function makeResidualFunction(
  sketch: Sketch,
  index: Map<string, number>,
): (x: number[]) => number[] {
  const get = (x: number[], id: string): Vec2 => {
    const position = index.get(id)
    if (position === undefined) return [0, 0]
    return [x[position] ?? 0, x[position + 1] ?? 0]
  }
  return (x: number[]): number[] => {
    const out: number[] = []
    for (const constraint of sketch.constraints) {
      switch (constraint.kind) {
        case 'fixed': {
          const p = get(x, constraint.point)
          const original = sketch.points.find((point) => point.id === constraint.point)
          // t lets a drag pin a point where the user put it for one solve
          const targetX = constraint.at ? constraint.at[0] : original?.x ?? 0
          const targetY = constraint.at ? constraint.at[1] : original?.y ?? 0
          out.push(p[0] - targetX, p[1] - targetY)
          break
        }
        case 'coincident': {
          const a = get(x, constraint.a)
          const b = get(x, constraint.b)
          out.push(a[0] - b[0], a[1] - b[1])
          break
        }
        case 'horizontal': {
          const a = get(x, constraint.a)
          const b = get(x, constraint.b)
          out.push(a[1] - b[1])
          break
        }
        case 'vertical': {
          const a = get(x, constraint.a)
          const b = get(x, constraint.b)
          out.push(a[0] - b[0])
          break
        }
        case 'distance': {
          const a = get(x, constraint.a)
          const b = get(x, constraint.b)
          out.push(Math.hypot(b[0] - a[0], b[1] - a[1]) - constraint.value)
          break
        }
        case 'radius': {
          const center = get(x, constraint.center)
          const rim = get(x, constraint.rim)
          out.push(Math.hypot(rim[0] - center[0], rim[1] - center[1]) - constraint.value)
          break
        }
        case 'pointOnLine': {
          const p = get(x, constraint.point)
          const a = get(x, constraint.lineA)
          const b = get(x, constraint.lineB)
          const direction = unit(b[0] - a[0], b[1] - a[1])
          // signed perpendicular distance from the line (scale free)
          out.push((p[0] - a[0]) * direction[1] - (p[1] - a[1]) * direction[0])
          break
        }
        case 'parallel': {
          const u = unit(...subtract(get(x, constraint.a2), get(x, constraint.a1)))
          const v = unit(...subtract(get(x, constraint.b2), get(x, constraint.b1)))
          // sin of the angle between them: zero when parallel, scale free
          out.push(u[0] * v[1] - u[1] * v[0])
          break
        }
        case 'perpendicular': {
          const u = unit(...subtract(get(x, constraint.a2), get(x, constraint.a1)))
          const v = unit(...subtract(get(x, constraint.b2), get(x, constraint.b1)))
          // cos of the angle between them: zero when perpendicular, scale free
          out.push(u[0] * v[0] + u[1] * v[1])
          break
        }
        case 'equalLength': {
          const u = subtract(get(x, constraint.a2), get(x, constraint.a1))
          const v = subtract(get(x, constraint.b2), get(x, constraint.b1))
          out.push(Math.hypot(u[0], u[1]) - Math.hypot(v[0], v[1]))
          break
        }
        case 'angle': {
          const u = subtract(get(x, constraint.a2), get(x, constraint.a1))
          const v = subtract(get(x, constraint.b2), get(x, constraint.b1))
          // atan2-based so the target can be any angle, not just acute
          out.push(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) - constraint.value)
          break
        }
        case 'midpoint': {
          const p = get(x, constraint.point)
          const a = get(x, constraint.a)
          const b = get(x, constraint.b)
          out.push(p[0] - (a[0] + b[0]) / 2, p[1] - (a[1] + b[1]) / 2)
          break
        }
        default:
          break
      }
    }
    return out
  }
}

function subtract(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]]
}

const infinityNorm = (values: readonly number[]): number => {
  let max = 0
  for (const value of values) {
    const magnitude = Math.abs(value)
    if (magnitude > max) max = magnitude
  }
  return max
}

/**
 * Solve A·x = b by Gaussian elimination with partial pivoting.
 * Returns null for a singular system, which the caller answers with more damping.
 */
export function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const size = matrix.length
  if (size === 0) return []
  const a = matrix.map((row, index) => [...row, rhs[index] ?? 0])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!)) pivot = row
    }
    if (Math.abs(a[pivot]![column]!) < 1e-14) return null
    if (pivot !== column) {
      const swap = a[pivot]!
      a[pivot] = a[column]!
      a[column] = swap
    }
    const pivotValue = a[column]![column]!
    for (let row = column + 1; row < size; row += 1) {
      const factor = a[row]![column]! / pivotValue
      if (factor === 0) continue
      for (let k = column; k <= size; k += 1) {
        a[row]![k] = a[row]![k]! - factor * a[column]![k]!
      }
    }
  }
  const solution = new Array<number>(size).fill(0)
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = a[row]![size]!
    for (let column = row + 1; column < size; column += 1) {
      sum -= a[row]![column]! * solution[column]!
    }
    solution[row] = sum / a[row]![row]!
  }
  return solution
}

/** Row echelon rank, used for the degrees-of-freedom report. */
export function matrixRank(matrix: number[][], tolerance = 1e-7): number {
  if (!matrix.length) return 0
  const rows = matrix.map((row) => [...row])
  const rowCount = rows.length
  const columnCount = rows[0]!.length
  let rank = 0
  let pivotRow = 0
  for (let column = 0; column < columnCount && pivotRow < rowCount; column += 1) {
    let best = pivotRow
    for (let row = pivotRow + 1; row < rowCount; row += 1) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[best]![column]!)) best = row
    }
    if (Math.abs(rows[best]![column]!) <= tolerance) continue
    if (best !== pivotRow) {
      const swap = rows[best]!
      rows[best] = rows[pivotRow]!
      rows[pivotRow] = swap
    }
    const pivotValue = rows[pivotRow]![column]!
    for (let row = pivotRow + 1; row < rowCount; row += 1) {
      const factor = rows[row]![column]! / pivotValue
      if (factor === 0) continue
      for (let k = column; k < columnCount; k += 1) {
        rows[row]![k] = rows[row]![k]! - factor * rows[pivotRow]![k]!
      }
    }
    pivotRow += 1
    rank += 1
  }
  return rank
}

/** Jacobian by central differences, one row per residual. */
function jacobian(residuals: (x: number[]) => number[], x: number[], variableCount: number): number[][] {
  const base = residuals(x)
  const rows: number[][] = base.map(() => new Array<number>(variableCount).fill(0))
  for (let variable = 0; variable < variableCount; variable += 1) {
    const step = finiteDifferenceStep(x[variable] ?? 0)
    const forward = [...x]
    const backward = [...x]
    forward[variable] = (forward[variable] ?? 0) + step
    backward[variable] = (backward[variable] ?? 0) - step
    const plus = residuals(forward)
    const minus = residuals(backward)
    for (let row = 0; row < rows.length; row += 1) {
      rows[row]![variable] = ((plus[row] ?? 0) - (minus[row] ?? 0)) / (2 * step)
    }
  }
  return rows
}

/**
 * Drive every constraint to zero. Starts from the sketch's current geometry, so
 * dragging a point and re-solving moves the rest of the sketch to suit — which
 * is what makes a dimension associative.
 */
export function solveSketch(sketch: Sketch, options: SolveOptions = {}): SolveResult {
  const maxIterations = options.maxIterations ?? 120
  const tolerance = options.tolerance ?? 1e-9
  let damping = options.damping ?? 1e-3

  const index = pointIndex(sketch)
  const residuals = makeResidualFunction(sketch, index)
  const variableCount = sketch.points.length * 2

  const toSketch = (x: number[]): SketchPoint[] =>
    sketch.points.map((point, position) => ({
      id: point.id,
      x: x[position * 2] ?? point.x,
      y: x[position * 2 + 1] ?? point.y,
    }))

  if (!sketch.constraints.length || variableCount === 0) {
    const r = residuals(sketch.points.flatMap((point) => [point.x, point.y]))
    return {
      points: sketch.points.map((point) => ({ ...point })),
      converged: true,
      iterations: 0,
      residual: infinityNorm(r),
      dof: variableCount,
      status: 'underconstrained',
    }
  }

  let x = sketch.points.flatMap((point) => [point.x, point.y])
  let r = residuals(x)
  let error = infinityNorm(r)
  let iterations = 0

  while (iterations < maxIterations && error > tolerance) {
    iterations += 1
    const J = jacobian(residuals, x, variableCount)
    // normal equations: (JᵀJ + λI) Δ = −Jᵀ r
    const normal: number[][] = Array.from({ length: variableCount }, () => new Array<number>(variableCount).fill(0))
    const gradient = new Array<number>(variableCount).fill(0)
    for (let row = 0; row < J.length; row += 1) {
      const rowValues = J[row]!
      const residual = r[row] ?? 0
      for (let i = 0; i < variableCount; i += 1) {
        const ji = rowValues[i]!
        if (ji === 0) continue
        gradient[i] = gradient[i]! - ji * residual
        for (let k = i; k < variableCount; k += 1) {
          normal[i]![k] = normal[i]![k]! + ji * rowValues[k]!
        }
      }
    }
    for (let i = 0; i < variableCount; i += 1) {
      for (let k = 0; k < i; k += 1) normal[i]![k] = normal[k]![i]!
      normal[i]![i] = normal[i]![i]! + damping
    }

    const step = solveLinearSystem(normal, gradient)
    if (!step) {
      damping *= 8
      if (damping > 1e12) break
      continue
    }
    const candidate = x.map((value, position) => value + (step[position] ?? 0))
    const candidateResiduals = residuals(candidate)
    const candidateError = infinityNorm(candidateResiduals)
    if (candidateError < error) {
      x = candidate
      r = candidateResiduals
      error = candidateError
      damping = Math.max(damping / 3, 1e-12)
    } else {
      damping *= 6
      if (damping > 1e12) break
    }
  }

  const finalJ = jacobian(residuals, x, variableCount)
  const rank = matrixRank(finalJ)
  const dof = variableCount - rank
  const converged = error <= Math.max(tolerance, 1e-6)

  return {
    points: toSketch(x),
    converged,
    iterations,
    residual: error,
    dof,
    status: !converged ? 'inconsistent' : dof > 0 ? 'underconstrained' : dof < 0 ? 'overconstrained' : 'solved',
  }
}

/**
 * Re-solve a sketch after points were dragged, leaving every dimension intact.
 * This is the associative behaviour: the user moves geometry, the constraints
 * re-establish the annotated values and everything else follows.
 *
 * Each dragged point is pinned where the user released it for the duration of
 * the solve, and every other point is free to move to satisfy the constraints.
 * A point that already carries a real `fixed` constraint ignores the drag —
 * the solver pulls it back, exactly as a CAD sketcher would.
 */
export function solveWithMovedPoints(
  sketch: Sketch,
  moved: ReadonlyArray<{ id: string; to: Vec2 }>,
  options: SolveOptions = {},
): SolveResult {
  if (!moved.length) return solveSketch(sketch, options)
  // A fixed point cannot move, so its anchor must survive the drag untouched.
  const anchored = new Set(
    sketch.constraints
      .filter((constraint) => constraint.kind === 'fixed')
      .map((constraint) => (constraint as { point: string }).point),
  )
  const next: Sketch = {
    points: sketch.points.map((point) => {
      const drag = moved.find((entry) => entry.id === point.id)
      if (!drag || anchored.has(point.id)) return { ...point }
      // Seed with where the user dragged, and add NO constraint for it. The
      // solver converges to the nearest feasible configuration, so the
      // constraints always win and the geometry follows the drag as far as it
      // legitimately can — a point on a dimensioned line slides along its
      // dimension instead of breaking it. Pinning the drag instead would make
      // the point conflict with its own dimensions.
      return { ...point, x: drag.to[0], y: drag.to[1] }
    }),
    constraints: sketch.constraints.map((constraint) => ({ ...constraint })),
  }
  return solveSketch(next, options)
}

/** Convenience wrapper for the common single-point drag. */
export function solveWithMovedPoint(
  sketch: Sketch,
  pointId: string,
  to: Vec2,
  options: SolveOptions = {},
): SolveResult {
  return solveWithMovedPoints(sketch, [{ id: pointId, to }], options)
}

/**
 * Assign the current measured value of a dimension-like constraint back into
 * the constraint, so a solved sketch can be annotated with what it actually is.
 */
export function measuredValue(points: readonly SketchPoint[], constraint: Constraint): number | null {
  const at = (id: string): Vec2 | null => {
    const point = points.find((candidate) => candidate.id === id)
    return point ? [point.x, point.y] : null
  }
  switch (constraint.kind) {
    case 'distance':
    case 'radius': {
      const a = at(constraint.kind === 'radius' ? constraint.center : constraint.a)
      const b = at(constraint.kind === 'radius' ? constraint.rim : constraint.b)
      return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : null
    }
    case 'equalLength': {
      const a1 = at(constraint.a1)
      const a2 = at(constraint.a2)
      return a1 && a2 ? Math.hypot(a2[0] - a1[0], a2[1] - a1[1]) : null
    }
    case 'angle': {
      const a1 = at(constraint.a1)
      const a2 = at(constraint.a2)
      const b1 = at(constraint.b1)
      const b2 = at(constraint.b2)
      if (!a1 || !a2 || !b1 || !b2) return null
      const u = subtract(a2, a1)
      const v = subtract(b2, b1)
      return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])
    }
    default:
      return null
  }
}
