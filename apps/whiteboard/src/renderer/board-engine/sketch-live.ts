/**
 * Live parametric sketches — the bridge between the constraint solver and the
 * board, so dragging geometry re-solves the sketch instead of breaking it.
 *
 * The constraint model travels ON the board: every element a sketch produced
 * carries the whole model in its `customData`. That is deliberately redundant —
 * whichever member element survives a reload can rebuild the sketch — and it
 * means no side table can go stale or be lost on save/open.
 *
 * This module is pure: it reads and rewrites plain element-shaped objects, so
 * the whole drag → re-solve → rewrite path is testable without a canvas.
 */

import {
  solveWithMovedPoints,
  type Constraint,
  type Sketch,
  type SketchPoint,
  type SolveResult,
} from './constraint-solver'

/** `customData` key the model is stored under. */
export const SKETCH_CUSTOM_KEY = 'revelithSketch'

/** How far (in canvas px) a point must move before it counts as dragged. */
export const DRAG_TOLERANCE = 1.5

/** The slice of an Excalidraw element this module needs; kept loose on purpose. */
export interface LiveElement {
  id: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  points?: unknown
  text?: string
  fontSize?: number
  customData?: Record<string, unknown>
  [key: string]: unknown
}

export interface SketchSegmentLink {
  elementId: string
  a: string
  b: string
}

export interface SketchCircleLink {
  elementId: string
  center: string
  /** element whose position marks the radius; null when drawn from a fixed radius */
  rim: string | null
}

export interface SketchDimensionLink {
  /** the 7 strokes, in creation order: 2 witnesses, the line, then 4 barbs */
  elementIds: string[]
  labelId: string
  from: string
  to: string
  offset: number
  overshoot: number
  barb: number
  labelGap: number
  labelSize: number
  unitScale: number
  units: string
  /** overrides the measured label when the caller supplied text */
  text?: string
}

export interface SketchModel {
  version: 1
  id: string
  /** canvas anchor and scale the sketch was drawn with */
  originX: number
  originY: number
  scale: number
  points: SketchPoint[]
  constraints: Constraint[]
  segments: SketchSegmentLink[]
  circles: SketchCircleLink[]
  dimensions: SketchDimensionLink[]
}

export interface DimensionRequest {
  from: [number, number]
  to: [number, number]
  offset: number
  overshoot: number
  barb: number
  labelGap: number
  labelSize: number
}

export interface DimensionGeometry {
  /** 2 witness lines, 1 dimension line, 4 barbs — the creation order */
  strokes: Array<[[number, number], [number, number]]>
  label: { x: number; y: number }
  /** extension is positive along the offset normal; picks the label side */
  normalY: number
  midX: number
  midY: number
  span: number
}

/**
 * Geometry of one dimension annotation. Shared with the drawing code so a
 * dimension drawn by the agent and one re-solved after a drag are identical.
 */
export function dimensionGeometry(request: DimensionRequest): DimensionGeometry {
  const [x1, y1] = request.from
  const [x2, y2] = request.to
  const span = Math.hypot(x2 - x1, y2 - y1)
  const empty: DimensionGeometry = {
    strokes: [],
    label: { x: 0, y: 0 },
    normalY: 0,
    midX: 0,
    midY: 0,
    span: 0,
  }
  if (!(span > 0)) return empty
  const normalX = -(y2 - y1) / span
  const normalY = (x2 - x1) / span
  const ax = x1 + normalX * request.offset
  const ay = y1 + normalY * request.offset
  const bx = x2 + normalX * request.offset
  const by = y2 + normalY * request.offset
  const reach = request.offset + Math.sign(request.offset || 1) * request.overshoot
  const angle = Math.atan2(by - ay, bx - ax)
  const spread = Math.PI / 7
  const strokes: Array<[[number, number], [number, number]]> = [
    [
      [x1, y1],
      [x1 + normalX * reach, y1 + normalY * reach],
    ],
    [
      [x2, y2],
      [x2 + normalX * reach, y2 + normalY * reach],
    ],
    [
      [ax, ay],
      [bx, by],
    ],
  ]
  for (const [pointX, pointY, direction] of [
    [ax, ay, angle + Math.PI],
    [bx, by, angle],
  ] as const) {
    strokes.push([
      [pointX, pointY],
      [
        pointX + Math.cos(direction - spread) * request.barb,
        pointY + Math.sin(direction - spread) * request.barb,
      ],
    ])
    strokes.push([
      [pointX, pointY],
      [
        pointX + Math.cos(direction + spread) * request.barb,
        pointY + Math.sin(direction + spread) * request.barb,
      ],
    ])
  }
  const midX = (ax + bx) / 2
  const midY = (ay + by) / 2
  return { strokes, label: { x: midX, y: midY }, normalY, midX, midY, span }
}

/** Read the model a sketch element carries, if any. */
export function readSketchModel(element: LiveElement): SketchModel | null {
  const raw = element.customData?.[SKETCH_CUSTOM_KEY]
  if (!raw || typeof raw !== 'object') return null
  const model = raw as SketchModel
  if (model.version !== 1) return null
  if (!Array.isArray(model.points) || !Array.isArray(model.constraints)) return null
  // A board written by an older or interrupted build can carry a partial model.
  // Every collection is validated before use: iterating a missing one threw
  // "object is not iterable" and took the whole board down with it.
  if (
    !Array.isArray(model.segments) ||
    !Array.isArray(model.circles) ||
    !Array.isArray(model.dimensions)
  ) {
    return null
  }
  const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
  const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value)
  if (
    !text(model.id) ||
    !Number.isFinite(model.originX) ||
    !Number.isFinite(model.originY) ||
    !Number.isFinite(model.scale) ||
    model.scale === 0 ||
    !model.points.every(
      (point) =>
        record(point) && text(point.id) && Number.isFinite(point.x) && Number.isFinite(point.y),
    ) ||
    !model.constraints.every((constraint) => record(constraint) && text(constraint.kind))
  )
    return null
  for (const link of model.segments) {
    if (!record(link) || !text(link.elementId) || !text(link.a) || !text(link.b)) return null
  }
  for (const link of model.circles) {
    if (!record(link) || !text(link.elementId) || !text(link.center)) return null
  }
  for (const link of model.dimensions) {
    if (!record(link) || !Array.isArray(link.elementIds) || !text(link.labelId)) return null
    if (!text(link.from) || !text(link.to)) return null
    if (link.elementIds.some((id) => !text(id))) return null
  }
  return model
}

/** Attach a model to an element (returns a new object; never mutates). */
export function withSketchModel<T extends LiveElement>(element: T, model: SketchModel): T {
  return {
    ...element,
    customData: { ...(element.customData ?? {}), [SKETCH_CUSTOM_KEY]: model },
  } as T
}

/**
 * The endpoint pair of a line element, supporting both point shapes Excalidraw
 * writes: `[x, y]` tuples and `{x, y}` objects.
 */
export function lineEndpoints(element: LiveElement): [[number, number], [number, number]] | null {
  const points = element.points
  if (!Array.isArray(points) || points.length < 2) return null
  const read = (entry: unknown): [number, number] | null => {
    if (Array.isArray(entry) && entry.length >= 2) {
      return [element.x + Number(entry[0]), element.y + Number(entry[1])]
    }
    if (entry && typeof entry === 'object') {
      const point = entry as { x?: number; y?: number }
      if (typeof point.x === 'number' && typeof point.y === 'number') {
        return [element.x + point.x, element.y + point.y]
      }
    }
    return null
  }
  const start = read(points[0])
  const end = read(points[1])
  return start && end ? [start, end] : null
}

/** Rewrite a line element to run between two canvas points, keeping its id. */
export function rewriteLine(
  element: LiveElement,
  start: [number, number],
  end: [number, number],
): LiveElement {
  const originX = Math.min(start[0], end[0])
  const originY = Math.min(start[1], end[1])
  return {
    ...element,
    x: originX,
    y: originY,
    width: Math.abs(end[0] - start[0]),
    height: Math.abs(end[1] - start[1]),
    points: [
      [start[0] - originX, start[1] - originY],
      [end[0] - originX, end[1] - originY],
    ],
  }
}

/** Sketch coordinates → canvas coordinates. */
export function toCanvas(model: SketchModel, point: { x: number; y: number }): [number, number] {
  return [model.originX + point.x * model.scale, model.originY + point.y * model.scale]
}

/** Canvas coordinates → sketch coordinates. */
export function toSketch(model: SketchModel, x: number, y: number): [number, number] {
  return [(x - model.originX) / model.scale, (y - model.originY) / model.scale]
}

export interface DragCandidate {
  id: string
  to: [number, number]
  distance: number
}

/**
 * Which sketch points the user has moved, by comparing what the board currently
 * shows against the model's last solved positions. Distances are in canvas px
 * and converted back to sketch units.
 */
export function detectDraggedPoints(
  model: SketchModel,
  elements: readonly LiveElement[],
  tolerance = DRAG_TOLERANCE,
): DragCandidate[] {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const solved = new Map(model.points.map((point) => [point.id, point]))
  const best = new Map<string, DragCandidate>()

  const record = (pointId: string, canvasX: number, canvasY: number) => {
    const known = solved.get(pointId)
    if (!known) return
    const expected = toCanvas(model, known)
    const distance = Math.hypot(canvasX - expected[0], canvasY - expected[1])
    if (distance <= tolerance) return
    const [sketchX, sketchY] = toSketch(model, canvasX, canvasY)
    const previous = best.get(pointId)
    if (!previous || distance > previous.distance) {
      best.set(pointId, { id: pointId, to: [sketchX, sketchY], distance })
    }
  }

  for (const link of model.segments) {
    const element = byId.get(link.elementId)
    if (!element) continue
    const ends = lineEndpoints(element)
    if (!ends) continue
    record(link.a, ends[0][0], ends[0][1])
    record(link.b, ends[1][0], ends[1][1])
  }
  for (const link of model.circles) {
    const element = byId.get(link.elementId)
    if (!element) continue
    const centerX = element.x + (element.width ?? 0) / 2
    const centerY = element.y + (element.height ?? 0) / 2
    record(link.center, centerX, centerY)
  }

  return [...best.values()]
}

export interface LiveSolveOutcome {
  result: SolveResult
  /** the points that were pinned for the solve that produced `result` */
  applied: DragCandidate[]
  /** true when the full drag could not be satisfied and only one point was pinned */
  degraded: boolean
}

/**
 * Re-solve a dragged sketch.
 *
 * Every moved point is pinned where the user released it. If that is
 * unsatisfiable — dragging a whole sub-shape can conflict with a dimension —
 * the solve is retried pinning only the most-moved point, which is the drag the
 * user was most likely performing.
 */
export function resolveDrag(
  model: SketchModel,
  drags: readonly DragCandidate[],
  tolerance = 1e-6,
): LiveSolveOutcome {
  const sketch: Sketch = { points: model.points, constraints: model.constraints }
  if (!drags.length) {
    return {
      result: solveWithMovedPoints(sketch, [], {}),
      applied: [],
      degraded: false,
    }
  }
  const all = solveWithMovedPoints(sketch, drags)
  if (all.converged || all.residual <= tolerance || drags.length === 1) {
    return { result: all, applied: [...drags], degraded: false }
  }
  const dominant = [...drags].sort((left, right) => right.distance - left.distance)[0]!
  const single = solveWithMovedPoints(sketch, [dominant])
  return { result: single, applied: [dominant], degraded: true }
}

/** Format a dimension label from a measured length. */
export function dimensionLabel(value: number, units: string): string {
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(2)}${units ? ` ${units}` : ''}`
}

/**
 * Rewrite every element of a solved sketch from the new point positions,
 * preserving element ids and order so Excalidraw updates in place rather than
 * flashing. Elements not belonging to the sketch are returned untouched.
 */
export function rebuildSketch(
  model: SketchModel,
  solved: readonly SketchPoint[],
  elements: readonly LiveElement[],
): LiveElement[] {
  const position = new Map(solved.map((point) => [point.id, toCanvas(model, point)]))
  const byId = new Map(elements.map((element) => [element.id, element]))
  const patches = new Map<string, LiveElement>()

  for (const link of model.segments) {
    const element = byId.get(link.elementId)
    const from = position.get(link.a)
    const to = position.get(link.b)
    if (!element || !from || !to) continue
    patches.set(link.elementId, rewriteLine(element, from, to))
  }

  for (const link of model.circles) {
    const element = byId.get(link.elementId)
    const center = position.get(link.center)
    const rim = link.rim ? position.get(link.rim) : undefined
    if (!element || !center) continue
    const radius = rim
      ? Math.hypot(rim[0] - center[0], rim[1] - center[1])
      : (element.width ?? 0) / 2
    if (!(radius > 0)) continue
    patches.set(link.elementId, {
      ...element,
      x: center[0] - radius,
      y: center[1] - radius,
      width: radius * 2,
      height: radius * 2,
    })
  }

  for (const link of model.dimensions) {
    const from = position.get(link.from)
    const to = position.get(link.to)
    if (!from || !to) continue
    const geometry = dimensionGeometry({
      from,
      to,
      offset: link.offset,
      overshoot: link.overshoot,
      barb: link.barb,
      labelGap: link.labelGap,
      labelSize: link.labelSize,
    })
    if (!geometry.strokes.length) continue
    geometry.strokes.forEach((stroke, index) => {
      const elementId = link.elementIds[index]
      if (!elementId) return
      const element = byId.get(elementId)
      if (!element) return
      patches.set(elementId, rewriteLine(element, stroke[0], stroke[1]))
    })
    const label = byId.get(link.labelId)
    if (label) {
      const measured = (geometry.span / model.scale) * link.unitScale
      const text = link.text?.trim() ? link.text.trim() : dimensionLabel(measured, link.units)
      patches.set(link.labelId, {
        ...label,
        x: geometry.midX - Math.max(60, Math.round(text.length * link.labelSize * 0.62)) / 2,
        y:
          geometry.midY + (geometry.normalY >= 0 ? link.labelGap : -link.labelSize - link.labelGap),
        text,
      })
    }
  }

  return elements.map((element) => patches.get(element.id) ?? element)
}

/**
 * Re-stamp the solved positions back into the model. Without this the model
 * would keep describing the pre-drag geometry, the next scene change would see
 * the same "drag" again, and the board would never settle.
 */
export function restampSketch(
  model: SketchModel,
  solved: readonly SketchPoint[],
  elements: readonly LiveElement[],
): LiveElement[] {
  const updated: SketchModel = { ...model, points: solved.map((point) => ({ ...point })) }
  const members = new Set<string>([
    ...model.segments.map((link) => link.elementId),
    ...model.circles.map((link) => link.elementId),
    ...model.dimensions.flatMap((link) => [...link.elementIds, link.labelId]),
  ])
  return elements.map((element) =>
    members.has(element.id) ? withSketchModel(element, updated) : element,
  )
}

/**
 * One full pass over the board: find every sketch whose geometry the user
 * dragged, re-solve it against its constraints and rewrite both the geometry
 * and the dimension labels in place.
 *
 * Returns null when nothing was dragged, so the caller can skip the write. The
 * pass is idempotent by construction — the rewritten geometry agrees with the
 * re-stamped model, so running it again immediately does nothing.
 */
export function solveDraggedSketches(
  elements: readonly LiveElement[],
  tolerance = DRAG_TOLERANCE,
): LiveElement[] | null {
  let next = [...elements]
  let changed = false
  for (const model of collectSketchModels(next)) {
    // A sketch must never be able to break the board: any failure here just
    // leaves the geometry where the user put it.
    try {
      const drags = detectDraggedPoints(model, next, tolerance)
      if (!drags.length) continue
      const { result } = resolveDrag(model, drags)
      // an unsatisfiable drag leaves the board alone rather than corrupting it
      if (!result.converged) continue
      const rebuilt = rebuildSketch(model, result.points, next)
      const candidate = restampSketch(model, result.points, rebuilt)
      // Settle check. If this pass did not actually clear the drag — a member
      // element vanished mid-drag, say — give up instead of looping forever on
      // the same difference and tripping React's update-depth limit.
      const settled = collectSketchModels(candidate).find((entry) => entry.id === model.id)
      if (!settled || detectDraggedPoints(settled, candidate, tolerance).length) continue
      next = candidate
      changed = true
    } catch {
      continue
    }
  }
  return changed ? next : null
}
/** Every distinct sketch on the board, keyed by sketch id. */
export function collectSketchModels(elements: readonly LiveElement[]): SketchModel[] {
  const models = new Map<string, SketchModel>()
  for (const element of elements) {
    const model = readSketchModel(element)
    if (model && !models.has(model.id)) models.set(model.id, model)
  }
  return [...models.values()]
}
