import { describe, expect, it } from 'vitest'
import {
  collectSketchModels,
  detectDraggedPoints,
  dimensionGeometry,
  dimensionLabel,
  lineEndpoints,
  readSketchModel,
  rebuildSketch,
  resolveDrag,
  restampSketch,
  solveDraggedSketches,
  rewriteLine,
  SKETCH_CUSTOM_KEY,
  toCanvas,
  toSketch,
  withSketchModel,
  type LiveElement,
  type SketchModel,
} from './sketch-live'

const near = (value: number, target: number, tolerance = 1e-4) =>
  Math.abs(value - target) <= tolerance

/** a line element the way `segment()` in ai-tools builds one */
const line = (id: string, x1: number, y1: number, x2: number, y2: number): LiveElement =>
  rewriteLine({ id, type: 'line', x: 0, y: 0 }, [x1, y1], [x2, y2])

const DIMENSION = {
  offset: 36,
  overshoot: 10,
  barb: 12,
  labelGap: 8,
  labelSize: 18,
}

/**
 * A dimensioned 80-unit bar: a pinned at the origin, b free, |ab| = 80.
 * Canvas origin (100,100), scale 1, so a resolves to (100,100) and b to (180,100).
 */
function barSketch(): { model: SketchModel; elements: LiveElement[] } {
  const model: SketchModel = {
    version: 1,
    id: 'sk1',
    originX: 100,
    originY: 100,
    scale: 1,
    points: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 80, y: 0 },
    ],
    constraints: [
      { kind: 'fixed', point: 'a' },
      { kind: 'distance', a: 'a', b: 'b', value: 80 },
    ],
    segments: [{ elementId: 'seg', a: 'a', b: 'b' }],
    circles: [],
    dimensions: [
      {
        elementIds: ['w1', 'w2', 'dl', 'b1', 'b2', 'b3', 'b4'],
        labelId: 'lbl',
        from: 'a',
        to: 'b',
        unitScale: 1,
        units: 'mm',
        text: '',
        ...DIMENSION,
      },
    ],
  }
  const geometry = dimensionGeometry({ from: [100, 100], to: [180, 100], ...DIMENSION })
  const strokes = geometry.strokes.map((stroke, index) =>
    line(['w1', 'w2', 'dl', 'b1', 'b2', 'b3', 'b4'][index]!, ...stroke[0], ...stroke[1]),
  )
  const label: LiveElement = {
    id: 'lbl',
    type: 'text',
    x: 95,
    y: 144,
    text: '80.00 mm',
    fontSize: 18,
  }
  const elements = [line('seg', 100, 100, 180, 100), ...strokes, label]
  return { model, elements: elements.map((element) => withSketchModel(element, model)) }
}

describe('dimension geometry', () => {
  it('produces the 2 witnesses, the dimension line and 4 barbs in creation order', () => {
    const geometry = dimensionGeometry({ from: [0, 0], to: [80, 0], ...DIMENSION })
    expect(geometry.strokes).toHaveLength(7)
    expect(near(geometry.span, 80)).toBe(true)
    // witness lines run from the measured points
    expect(geometry.strokes[0]![0]).toEqual([0, 0])
    expect(geometry.strokes[1]![0]).toEqual([80, 0])
    // the dimension line is offset perpendicular to the measured segment
    expect(near(geometry.strokes[2]![0][1], 36)).toBe(true)
    expect(near(geometry.strokes[2]![1][1], 36)).toBe(true)
    // degenerate measurements produce nothing rather than NaNs
    expect(dimensionGeometry({ from: [5, 5], to: [5, 5], ...DIMENSION }).strokes).toHaveLength(0)
  })

  it('formats labels the way the drawing code does', () => {
    expect(dimensionLabel(80, 'mm')).toBe('80.00 mm')
    expect(dimensionLabel(120.4, 'mm')).toBe('120 mm')
    expect(dimensionLabel(12.345, '')).toBe('12.35')
  })
})

describe('element model transport', () => {
  it('round-trips the model through customData and dedupes by sketch id', () => {
    const { model, elements } = barSketch()
    expect(readSketchModel(elements[0]!)).toEqual(model)
    // every member element carries the model, so any survivor can rebuild it
    expect(elements.every((element) => readSketchModel(element) !== null)).toBe(true)
    expect(collectSketchModels(elements)).toHaveLength(1)
    expect(elements[0]!.customData?.[SKETCH_CUSTOM_KEY]).toBeTruthy()
    // a foreign or malformed payload is ignored, not trusted
    expect(readSketchModel({ id: 'x', type: 'line', x: 0, y: 0 })).toBeNull()
    expect(
      readSketchModel({
        id: 'x',
        type: 'line',
        x: 0,
        y: 0,
        customData: { [SKETCH_CUSTOM_KEY]: { version: 9 } },
      }),
    ).toBeNull()
  })

  it('reads tuple points and tolerates object points from old Draw documents', () => {
    const objects: LiveElement = {
      id: 'o',
      type: 'line',
      x: 10,
      y: 20,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 6 },
      ],
    }
    expect(lineEndpoints(objects)).toEqual([
      [10, 20],
      [15, 26],
    ])
    const tuples: LiveElement = {
      id: 't',
      type: 'line',
      x: 10,
      y: 20,
      points: [
        [0, 0],
        [5, 6],
      ],
    }
    expect(lineEndpoints(tuples)).toEqual([
      [10, 20],
      [15, 26],
    ])
    expect(lineEndpoints({ id: 'bad', type: 'line', x: 0, y: 0, points: [[0, 0]] })).toBeNull()
  })

  it('rewrites a line between two canvas points keeping its id', () => {
    const rewritten = rewriteLine(line('s', 0, 0, 10, 0), [30, 40], [10, 10])
    expect(rewritten.id).toBe('s')
    expect(rewritten.x).toBe(10)
    expect(rewritten.y).toBe(10)
    expect(rewritten.width).toBe(20)
    expect(rewritten.height).toBe(30)
    // endpoints survive the round trip through the min-corner origin
    expect(lineEndpoints(rewritten)).toEqual([
      [30, 40],
      [10, 10],
    ])
  })

  it('converts between sketch and canvas coordinates', () => {
    const { model } = barSketch()
    expect(toCanvas(model, { x: 80, y: 0 })).toEqual([180, 100])
    expect(toSketch(model, 180, 100)).toEqual([80, 0])
  })
})

describe('drag detection', () => {
  it('reports the dragged point and ignores untouched geometry', () => {
    const { model, elements } = barSketch()
    expect(detectDraggedPoints(model, elements)).toHaveLength(0)
    // drag b straight past the end
    const dragged = elements.map((element) =>
      element.id === 'seg' ? rewriteLine(element, [100, 100], [300, 100]) : element,
    )
    const found = detectDraggedPoints(model, dragged)
    expect(found).toHaveLength(1)
    expect(found[0]!.id).toBe('b')
    expect(near(found[0]!.to[0], 200)).toBe(true)
  })

  it('ignores sub-tolerance jitter so a click does not trigger a re-solve', () => {
    const { model, elements } = barSketch()
    const nudged = elements.map((element) =>
      element.id === 'seg' ? rewriteLine(element, [100, 100], [180.5, 100]) : element,
    )
    expect(detectDraggedPoints(model, nudged)).toHaveLength(0)
    // ...but a real move is picked up once it clears the tolerance
    const moved = elements.map((element) =>
      element.id === 'seg' ? rewriteLine(element, [100, 100], [186, 100]) : element,
    )
    expect(detectDraggedPoints(model, moved)).toHaveLength(1)
  })
})

describe('live re-solve', () => {
  it('keeps the dimension when the user tries to drag the bar longer', () => {
    const { model, elements } = barSketch()
    const dragged = elements.map((element) =>
      element.id === 'seg' ? rewriteLine(element, [100, 100], [300, 100]) : element,
    )
    const drags = detectDraggedPoints(model, dragged)
    expect(drags).toHaveLength(1)

    const { result } = resolveDrag(model, drags)
    expect(result.converged).toBe(true)
    // the dimension wins: b lands back at exactly 80, not at the dragged 200
    const b = result.points.find((point) => point.id === 'b')!
    expect(near(b.x, 80)).toBe(true)
    expect(near(b.y, 0)).toBe(true)
    // the pinned end did not move
    const a = result.points.find((point) => point.id === 'a')!
    expect(near(a.x, 0)).toBe(true)
    expect(near(a.y, 0)).toBe(true)

    // and the board is rewritten back to the dimensioned geometry
    const rebuilt = rebuildSketch(model, result.points, dragged)
    const segment = rebuilt.find((element) => element.id === 'seg')!
    // solver output is floating point: compare to tolerance, never exactly
    const ends = lineEndpoints(segment)!
    expect(near(ends[0][0], 100)).toBe(true)
    expect(near(ends[0][1], 100)).toBe(true)
    expect(near(ends[1][0], 180)).toBe(true)
    expect(near(ends[1][1], 100)).toBe(true)
  })

  it('lets the geometry follow the drag as far as the constraints allow', () => {
    const { model, elements } = barSketch()
    // drag b perpendicular: it should slide around its dimension, staying 80 long
    const dragged = elements.map((element) =>
      element.id === 'seg' ? rewriteLine(element, [100, 100], [100, 180]) : element,
    )
    const { result } = resolveDrag(model, detectDraggedPoints(model, dragged))
    expect(result.converged).toBe(true)
    const b = result.points.find((point) => point.id === 'b')!
    // the radius is preserved exactly...
    expect(near(Math.hypot(b.x, b.y), 80)).toBe(true)
    // ...and it followed the drag toward the requested direction
    expect(b.y).toBeGreaterThan(0)

    const rebuilt = rebuildSketch(model, result.points, dragged)
    const segment = rebuilt.find((element) => element.id === 'seg')!
    const ends = lineEndpoints(segment)!
    expect(near(Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]), 80)).toBe(true)
  })

  it('moves a free point exactly where it was dragged', () => {
    const model: SketchModel = {
      version: 1,
      id: 'free',
      originX: 0,
      originY: 0,
      scale: 1,
      points: [
        { id: 'p', x: 10, y: 10 },
        { id: 'q', x: 40, y: 40 },
      ],
      constraints: [],
      segments: [{ elementId: 'seg', a: 'p', b: 'q' }],
      circles: [],
      dimensions: [],
    }
    const elements = [line('seg', 10, 10, 40, 40)]
    const dragged = [rewriteLine(elements[0]!, [10, 10], [90, 60])]
    const { result } = resolveDrag(model, detectDraggedPoints(model, dragged))
    const q = result.points.find((point) => point.id === 'q')!
    expect(near(q.x, 90)).toBe(true)
    expect(near(q.y, 60)).toBe(true)
  })
})

describe('malformed models cannot break the board', () => {
  const wrap = (payload: unknown) => ({
    id: 'e',
    type: 'line',
    x: 0,
    y: 0,
    customData: { revelithSketch: payload },
  })

  it('rejects a partial model instead of iterating a missing collection', () => {
    const partials: unknown[] = [
      { version: 1, points: [], constraints: [] },
      { version: 1, points: [], constraints: [], segments: null, circles: [], dimensions: [] },
      { version: 1, points: [], constraints: [], segments: [], circles: 'x', dimensions: [] },
      {
        version: 1,
        points: [],
        constraints: [],
        segments: [],
        circles: [],
        dimensions: [{ labelId: 'l' }],
      },
      {
        version: 1,
        points: [],
        constraints: [],
        segments: [],
        circles: [],
        dimensions: [{ elementIds: null, labelId: 'l' }],
      },
      {
        version: 1,
        points: [],
        constraints: [],
        segments: [{ elementId: 'a' }],
        circles: [],
        dimensions: [],
      },
      {
        version: 1,
        id: 'x',
        originX: 0,
        originY: 0,
        scale: 1,
        points: [null],
        constraints: [],
        segments: [],
        circles: [],
        dimensions: [],
      },
      {
        version: 1,
        id: 'x',
        originX: 0,
        originY: 0,
        scale: 1,
        points: [],
        constraints: [null],
        segments: [],
        circles: [],
        dimensions: [],
      },
      {
        version: 1,
        id: 'x',
        originX: 0,
        originY: 0,
        scale: 1,
        points: [],
        constraints: [],
        segments: [{ elementId: 'a', a: 'p', b: 'q' }, null],
        circles: [],
        dimensions: [],
      },
      {
        version: 1,
        id: 'x',
        originX: 0,
        originY: 0,
        scale: '1',
        points: [],
        constraints: [],
        segments: [],
        circles: [],
        dimensions: [],
      },
      { version: 99, points: [], constraints: [], segments: [], circles: [], dimensions: [] },
      { version: 1, points: 'nope', constraints: [] },
    ]
    for (const payload of partials) {
      expect(readSketchModel(wrap(payload) as never), JSON.stringify(payload)).toBeNull()
    }
  })

  it('survives them in the live pass — this is what crashed the drawboard', () => {
    const broken = [
      wrap({ version: 1, points: [], constraints: [] }),
      wrap({
        version: 1,
        points: [{ id: 'a', x: 0, y: 0 }],
        constraints: [],
        segments: null,
        circles: [],
        dimensions: [],
      }),
      wrap({
        version: 1,
        points: [{ id: 'a', x: 0, y: 0 }],
        constraints: [],
        segments: [],
        circles: [],
        dimensions: [{ elementIds: null, labelId: 'l' }],
      }),
      { id: 'n', type: 'text', x: 0, y: 0, text: 'untouched' },
    ]
    expect(() => solveDraggedSketches(broken as never)).not.toThrow()
    expect(solveDraggedSketches(broken as never)).toBeNull()
    expect(collectSketchModels(broken as never)).toHaveLength(0)
    expect(
      restampSketch(
        {
          version: 1,
          id: 'x',
          originX: 0,
          originY: 0,
          scale: 1,
          points: [],
          constraints: [],
          segments: [],
          circles: [],
          dimensions: [],
        },
        [],
        broken as never,
      ),
    ).toHaveLength(broken.length)
  })
})
describe('the live board pass', () => {
  it('returns null when nothing was dragged, so no write happens', () => {
    const { elements } = barSketch()
    expect(solveDraggedSketches(elements)).toBeNull()
  })

  it('re-solves and settles: a second pass immediately does nothing', () => {
    const { elements } = barSketch()
    const dragged = elements.map((element) =>
      element.id === 'seg' ? rewriteLine(element, [100, 100], [300, 100]) : element,
    )
    const once = solveDraggedSketches(dragged)
    expect(once).not.toBeNull()
    // the dimension held, so the bar is back to 80 long
    const segment = once!.find((element) => element.id === 'seg')!
    const ends = lineEndpoints(segment)!
    expect(near(Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]), 80)).toBe(true)
    // ...and the model now describes the settled geometry, so there is no loop
    expect(solveDraggedSketches(once!)).toBeNull()
    // the carried model now describes the settled bar, not the dragged one
    const carried = readSketchModel(once!.find((element) => element.id === 'seg')!)!
    const carriedB = carried.points.find((point) => point.id === 'b')!
    expect(near(Math.hypot(carriedB.x, carriedB.y), 80)).toBe(true)
    expect(near(carriedB.x, 80)).toBe(true)
  })

  it('re-stamps the model onto every member element', () => {
    const { model, elements } = barSketch()
    const solved = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0, y: 80 },
    ]
    const restamped = restampSketch(model, solved, elements)
    expect(restamped).toHaveLength(elements.length)
    for (const element of restamped) {
      const carried = readSketchModel(element)!
      expect(carried.points).toEqual(solved)
    }
    // elements outside the sketch are left alone
    const stranger: LiveElement = { id: 'other', type: 'rect', x: 0, y: 0 }
    expect(restampSketch(model, solved, [stranger])[0]).toBe(stranger)
  })

  it('leaves an unsatisfiable sketch untouched rather than corrupting it', () => {
    const { model, elements } = barSketch()
    const broken: SketchModel = {
      ...model,
      constraints: [
        { kind: 'fixed', point: 'a' },
        { kind: 'distance', a: 'a', b: 'b', value: 80 },
        { kind: 'distance', a: 'a', b: 'b', value: 200 },
      ],
    }
    const tagged = elements.map((element) => withSketchModel(element, broken))
    const dragged = tagged.map((element) =>
      element.id === 'seg' ? rewriteLine(element, [100, 100], [300, 100]) : element,
    )
    // contradictory dimensions: reported, not silently "solved"
    expect(solveDraggedSketches(dragged)).toBeNull()
  })
})
describe('rebuilding the board', () => {
  it('updates the dimension label position and leaves unrelated elements alone', () => {
    const { model, elements } = barSketch()
    const stranger: LiveElement = { id: 'other', type: 'rectangle', x: 1, y: 2 }
    const all = [...elements, stranger]
    const solved = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 0, y: 80 },
    ]
    const rebuilt = rebuildSketch(model, solved, all)
    // ids and order are preserved so Excalidraw updates in place
    expect(rebuilt.map((element) => element.id)).toEqual(all.map((element) => element.id))
    // the bar is now vertical, still 80 long, and the label still reads 80
    const segment = rebuilt.find((element) => element.id === 'seg')!
    expect(lineEndpoints(segment)).toEqual([
      [100, 100],
      [100, 180],
    ])
    const label = rebuilt.find((element) => element.id === 'lbl')!
    expect(label.text).toBe('80.00 mm')
    // the label followed the annotation rather than staying put
    expect(label.y).not.toBe(144)
    // an element outside the sketch is returned untouched
    expect(rebuilt.find((element) => element.id === 'other')).toBe(stranger)
  })

  it('re-measures the label from the solved geometry', () => {
    const { model, elements } = barSketch()
    // pretend the solve produced a 40-long bar
    const solved = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 40, y: 0 },
    ]
    const rebuilt = rebuildSketch(model, solved, elements)
    expect(rebuilt.find((element) => element.id === 'lbl')!.text).toBe('40.00 mm')
  })

  it('honours an explicit label override instead of re-measuring', () => {
    const { model, elements } = barSketch()
    const overridden: SketchModel = {
      ...model,
      dimensions: [{ ...model.dimensions[0]!, text: 'SPAN' }],
    }
    const rebuilt = rebuildSketch(
      overridden,
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 40, y: 0 },
      ],
      elements,
    )
    expect(rebuilt.find((element) => element.id === 'lbl')!.text).toBe('SPAN')
  })

  it('skips members that are no longer on the board instead of throwing', () => {
    const { model, elements } = barSketch()
    const partial = elements.filter((element) => element.id !== 'seg' && element.id !== 'lbl')
    const rebuilt = rebuildSketch(
      model,
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 40, y: 0 },
      ],
      partial,
    )
    expect(rebuilt).toHaveLength(partial.length)
    expect(rebuildSketch(model, [], [])).toEqual([])
  })
})
