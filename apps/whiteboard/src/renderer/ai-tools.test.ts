import { describe, expect, it, vi } from 'vitest'

// jsdom never decodes images, so the SVG rasteriser would wait for an onload
// that never fires. Stub the decoder and the canvas it draws into.
class TestImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 400
  naturalHeight = 300
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}
vi.stubGlobal('Image', TestImage as never)
HTMLCanvasElement.prototype.getContext = (() => ({ drawImage: () => {} })) as never
HTMLCanvasElement.prototype.toDataURL = (() => 'data:image/png;base64,AAAB') as never

vi.mock('@excalidraw/excalidraw', () => ({
  restore: ({ elements }: { elements: unknown[] }, _appState: unknown) => ({
    elements,
    appState: {},
  }),
  exportToBlob: async () => new Blob(['x'], { type: 'image/png' }),
  exportToSvg: async () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    return el as unknown as SVGSVGElement
  },
}))

import { collectSketchModels } from './board-engine/sketch-live'
import {
  BOARD_TOOL_DEFS,
  executeBoardTool,
  sanitizeVectorSvg,
  summarizeScene,
  verifyBoardResponse,
} from './board-engine/ai-tools'
import { parseScene3dSpec, projectScene3d } from './board-engine/scene3d'
import {
  BOARD_TOOL_NAMES,
  resolveBoardToolName,
  selectBoardToolNames,
} from './ai/board-tool-routing'

type El = {
  id: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  text?: string
  containerId?: string
}

function mockApi(elements: El[] = [], selectedIds: string[] = []) {
  let current = [...elements]
  const selected: Record<string, true> = {}
  for (const id of selectedIds) selected[id] = true
  return {
    getSceneElements: vi.fn(() => current),
    updateScene: vi.fn((patch: { elements?: El[]; appState?: Record<string, unknown> }) => {
      if (patch.elements) current = [...patch.elements]
      if (patch.appState && 'selectedElementIds' in patch.appState) {
        for (const key of Object.keys(selected)) delete selected[key]
        Object.assign(selected, patch.appState.selectedElementIds as Record<string, true>)
      }
    }),
    addFiles: vi.fn(),
    getAppState: vi.fn(() => ({ selectedElementIds: { ...selected } })),
    getFiles: vi.fn(() => ({})),
    scrollToContent: vi.fn(),
    _current: () => current,
  }
}

const call = (name: string, input: Record<string, unknown> = {}) => ({ name, input }) as never
const run = (
  api: { getSceneElements: unknown },
  name: string,
  input: Record<string, unknown> = {},
) => executeBoardTool({ current: api as never }, call(name, input))

describe('board tool surface', () => {
  it('turns malformed tool payloads and board iterables into tool errors instead of renderer crashes', async () => {
    const badInput = await executeBoardTool({ current: mockApi() as never }, {
      name: 'build_drawboard_scene',
      input: null,
    } as never)
    expect(badInput.isError).toBe(true)
    expect(badInput.output).toContain('elements must contain')

    const malformedApi = mockApi() as ReturnType<typeof mockApi> & {
      getSceneElements: ReturnType<typeof vi.fn>
    }
    malformedApi.getSceneElements = vi.fn(() => ({ elements: [] }) as never)
    const result = await executeBoardTool(
      { current: malformedApi as never },
      call('group_elements', { ids: ['a', 'b'] }),
    )
    expect(result.isError).toBe(true)
    expect(result.output).toContain('Drawing tool failed safely')
    expect(result.output).toContain('iterable')
  })

  it('exposes board tools with required schemas', () => {
    // The published defs and the routing registry must stay in exact lockstep:
    // every tool the model can call must resolve through resolveBoardToolName,
    // and every routable name must have a definition.
    expect(BOARD_TOOL_DEFS.map((tool) => tool.name)).toEqual([...BOARD_TOOL_NAMES])
    expect(resolveBoardToolName('generate_image')).toBe('generate_image')
    for (const tool of BOARD_TOOL_DEFS) {
      expect(tool.name).toMatch(/^[a-z_]+$/)
      expect(tool.description.length).toBeGreaterThan(20)
      expect(tool.inputSchema.type).toBe('object')
    }
    const shape = BOARD_TOOL_DEFS.find((t) => t.name === 'add_board_shape')!
    expect(
      (shape.inputSchema as { properties: { shape: { enum: string[] } } }).properties.shape.enum,
    ).toEqual(['line', 'rect', 'ellipse', 'diamond', 'arrow'])
  })

  it('reads the board and single elements', async () => {
    const api = mockApi([{ id: 'a', type: 'text', x: 1, y: 2, text: 'hi' }])
    expect(summarizeScene(api as never)).toContain('1 element')
    const res = await run(api, 'read_drawboard')
    expect(res.summary).toBe('Read drawing')
    const humanized = await run(api, 'Read drawboard')
    expect(humanized.summary).toBe('Read drawing')
    expect(humanized.output).toContain('w=undefined')
    const one = await run(api, 'get_board_element', { id: 'a' })
    expect(one.output).toContain('"hi"')
    const missing = await run(api, 'get_board_element', { id: 'zzz' })
    expect(missing.isError).toBe(true)
  })

  it('adds text, sticky, shapes, and freedraw strokes', async () => {
    const api = mockApi()
    await run(api, 'add_board_text', { text: 'Hi', x: 10, y: 20 })
    await run(api, 'add_sticky_note', { text: 'Note' })
    await run(api, 'add_board_shape', { shape: 'arrow', x1: 50, y1: 20, x2: 10, y2: 40 })
    await run(api, 'add_board_shape', { shape: 'diamond', x1: 0, y1: 0, x2: 40, y2: 40 })
    await run(api, 'add_freedraw', {
      points: [
        [0, 0],
        [5, 5],
        [10, 0],
      ],
    })
    const types = api._current().map((e) => e.type)
    expect(types).toEqual(['text', 'rectangle', 'text', 'arrow', 'diamond', 'freedraw'])
    expect(api._current()[3]).toMatchObject({
      x: 10,
      y: 20,
      points: [
        [40, 0],
        [0, 20],
      ],
    })
    for (const element of api
      ._current()
      .filter((item) => ['line', 'arrow', 'freedraw'].includes(item.type))) {
      expect(
        (element as unknown as { points: unknown[] }).points.every(
          (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
        ),
      ).toBe(true)
    }
    const bad = await run(api, 'add_freedraw', { points: [[0, 0]] })
    expect(bad.isError).toBe(true)
  })

  it('builds a multi-element scene in one update and rejects invalid scenes transactionally', async () => {
    const api = mockApi()
    const result = await run(api, 'build_drawboard_scene', {
      elements: [
        { kind: 'text', text: 'Mountain cabin', x: 100, y: 40, size: 32, color: '#1e1b4b' },
        {
          kind: 'ellipse',
          x: 500,
          y: 60,
          width: 90,
          height: 90,
          fillColor: '#facc15',
          color: '#ca8a04',
        },
        {
          kind: 'rect',
          x: 320,
          y: 330,
          width: 160,
          height: 120,
          fillColor: '#a16207',
          color: '#422006',
        },
        { kind: 'arrow', x: 480, y: 390, width: 80, height: 0, color: '#334155' },
        {
          kind: 'freedraw',
          points: [
            [40, 350],
            [170, 150],
            [300, 350],
            [40, 350],
          ],
          fillColor: '#93c5fd',
          color: '#2563eb',
        },
        {
          kind: 'polygon',
          points: [
            [600, 300],
            [720, 120],
            [850, 300],
          ],
          fillColor: '#93c5fd',
          color: '#2563eb',
        },
      ],
    })
    expect(result.mutated).toBe(true)
    expect(result.summary).toContain('6 elements')
    expect(api.updateScene).toHaveBeenCalledTimes(1)
    expect(api.addFiles).toHaveBeenCalledTimes(1)
    expect(api._current().map((element) => element.type)).toEqual([
      'text',
      'ellipse',
      'rectangle',
      'arrow',
      'freedraw',
      'image',
    ])
    for (const element of api
      ._current()
      .filter((item) => ['line', 'arrow', 'freedraw'].includes(item.type))) {
      expect(
        (element as unknown as { points: unknown[] }).points.every(
          (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite),
        ),
      ).toBe(true)
    }
    expect((api._current()[2] as unknown as Record<string, unknown>)?.backgroundColor).toBe(
      '#a16207',
    )

    const before = api._current()
    const invalid = await run(api, 'build_drawboard_scene', {
      elements: [{ kind: 'rect' }, { kind: 'triangle', x: 0, y: 0 }],
    })
    expect(invalid.isError).toBe(true)
    expect(invalid.output).toContain('Scene was not changed')
    expect(api._current()).toEqual(before)
    expect(api.updateScene).toHaveBeenCalledTimes(1)
  })

  it('recovers flattened polygon points and omitted text kinds from local-model scene output', async () => {
    const api = mockApi()
    const result = await run(api, 'build_drawboard_scene', {
      elements: [
        {
          kind: 'polygon',
          points: [0, 800, 1400, 800, 1400, 600, 1000, 600],
          fillColor: '#a0522d',
          strokeStyle: '#333333',
          strokeWidth: 5,
        },
        { kind: 'rect', x: 300, y: 400, width: 400, height: 200, fillColor: '#ff7f50' },
        { text: 'Cliffside Residence Concept', size: 36, x: 350, y: 50, color: '#1e1b4b' },
      ],
    })

    expect(result.isError).toBeUndefined()
    expect(result.mutated).toBe(true)
    expect(result.output).toContain('"created":3')
    expect(api._current().map((element) => element.type)).toEqual(['image', 'rectangle', 'text'])
    expect(api._current()[2]!.text).toBe('Cliffside Residence Concept')
    expect(api.addFiles).toHaveBeenCalledTimes(1)
  })

  it('draws engineering dimensions with witness lines, arrowheads and a scaled value label', async () => {
    const api = mockApi()
    const result = await run(api, 'build_drawboard_scene', {
      elements: [
        {
          kind: 'dimension',
          x1: 100,
          y1: 400,
          x2: 700,
          y2: 400,
          offset: 40,
          scale: 0.01,
          units: 'm',
          color: '#1e1b4b',
        },
        { kind: 'leader', x: 400, y: 300, labelX: 520, labelY: 220, text: 'Cantilever', size: 18 },
        {
          kind: 'rect',
          x: 100,
          y: 500,
          width: 200,
          height: 80,
          hatch: 'cross-hatch',
          fillColor: '#93c5fd',
          color: '#1e1b4b',
        },
      ],
    })
    expect(result.isError).toBeUndefined()
    expect(result.mutated).toBe(true)
    expect(result.summary).toContain('Built scene')
    const elements = api._current()
    const texts = elements
      .filter((element) => element.type === 'text')
      .map((element) => element.text)
    // 600 canvas px at 0.01 m/px is 6.00 m
    expect(texts).toContain('6.00 m')
    expect(texts).toContain('Cantilever')
    // dimension: 2 witness + 1 dimension line + 4 arrow barbs; leader: 1 pointer
    expect(elements.filter((element) => element.type === 'line').length).toBe(8)
    expect(elements.filter((element) => element.type === 'ellipse').length).toBe(1)
    const hatched = elements.find((element) => element.type === 'rectangle') as unknown as
      Record<string, unknown> | undefined
    expect(hatched?.fillStyle).toBe('cross-hatch')
  })

  it('rejects degenerate dimensions and leaders without text', async () => {
    const api = mockApi()
    const collapsed = await run(api, 'build_drawboard_scene', {
      elements: [{ kind: 'dimension', x1: 100, y1: 100, x2: 100, y2: 100 }],
    })
    expect(collapsed.isError).toBe(true)
    expect(collapsed.output).toContain('Scene was not changed')
    const noText = await run(api, 'build_drawboard_scene', {
      elements: [{ kind: 'leader', x: 10, y: 10, labelX: 90, labelY: 90 }],
    })
    expect(noText.isError).toBe(true)
    expect(api._current()).toHaveLength(0)
  })

  it('projects a box isometrically to exactly three visible faces and keeps edge adjacency', () => {
    const spec = parseScene3dSpec(
      {
        projection: 'isometric',
        objects: [{ shape: 'box', at: [0, 0, 0], size: [100, 100, 100], color: '#94a3b8' }],
      },
      { originX: 0, originY: 0 },
    )
    const out = projectScene3d(spec)
    // An isometric view of a cube shows three faces: top and two sides.
    expect(out.faces).toHaveLength(3)
    // 12 edges exist; the 3 meeting at the hidden far vertex are dropped by default.
    expect(out.edges).toHaveLength(9)
    expect(out.edges.every((edge) => !edge.hidden)).toBe(true)
    // Shading differs per face, so the three fills must not all be identical.
    expect(new Set(out.faces.map((face) => face.fill)).size).toBe(3)
    expect(out.bounds.maxX).toBeGreaterThan(out.bounds.minX)

    const dashed = projectScene3d(
      parseScene3dSpec(
        {
          projection: 'isometric',
          hidden: 'dash',
          objects: [{ shape: 'box', at: [0, 0, 0], size: [100, 100, 100], color: '#94a3b8' }],
        },
        { originX: 0, originY: 0 },
      ),
    )
    expect(dashed.edges).toHaveLength(12)
    expect(dashed.edges.filter((edge) => edge.hidden)).toHaveLength(3)
  })

  it('culls back faces on a cylinder so only the front half is drawn', () => {
    const spec = parseScene3dSpec(
      {
        objects: [
          {
            shape: 'prism',
            sides: 12,
            radius: 50,
            radiusTop: 50,
            height: 100,
            at: [0, 0, 0],
            color: '#60a5fa',
          },
        ],
      },
      { originX: 0, originY: 0 },
    )
    const out = projectScene3d(spec)
    // 12 sides + 2 caps exist; roughly half the sides and one cap face the camera.
    expect(out.faces.length).toBeGreaterThan(3)
    expect(out.faces.length).toBeLessThan(14)
  })

  it('perspective projection culls geometry behind the camera and rejects bad specs', () => {
    const behind = parseScene3dSpec(
      {
        projection: 'perspective',
        distance: 200,
        target: [0, 0, 0],
        objects: [{ shape: 'box', at: [0, 0, 9000], size: [10, 10, 10], color: '#ffffff' }],
      },
      { originX: 0, originY: 0 },
    )
    // The box sits behind the camera, so it projects to nothing rather than exploding.
    expect(projectScene3d(behind).faces).toHaveLength(0)
    expect(() => parseScene3dSpec({ objects: [] }, { originX: 0, originY: 0 })).toThrow()
    expect(() =>
      parseScene3dSpec({ objects: [{ shape: 'cone', at: [0, 0, 0] }] }, { originX: 0, originY: 0 }),
    ).toThrow()
    expect(() =>
      parseScene3dSpec({ objects: [{ shape: 'box', color: 'red' }] }, { originX: 0, originY: 0 }),
    ).toThrow()
    expect(() =>
      parseScene3dSpec(
        { projection: 'cavalier', objects: [{ shape: 'box' }] },
        { originX: 0, originY: 0 },
      ),
    ).toThrow()
  })

  it('builds a 3D scene on the board as one shaded object plus editable edge lines', async () => {
    const api = mockApi()
    const result = await run(api, 'build_drawboard_scene', {
      elements: [
        {
          kind: 'scene3d',
          x: 100,
          y: 400,
          projection: 'isometric',
          hidden: 'dash',
          edgeColor: '#1e1b4b',
          objects: [
            { shape: 'box', at: [0, 150, 0], size: [300, 300, 300], color: '#94a3b8' },
            {
              shape: 'prism',
              at: [400, 200, 0],
              radius: 90,
              radiusTop: 0,
              height: 400,
              sides: 12,
              color: '#4ade80',
            },
          ],
        },
      ],
    })
    expect(result.isError).toBeUndefined()
    expect(result.mutated).toBe(true)
    const elements = api._current()
    expect(elements.filter((element) => element.type === 'image').length).toBe(1)
    expect(elements.filter((element) => element.type === 'line').length).toBeGreaterThan(8)
    expect(api.addFiles).toHaveBeenCalledTimes(1)

    const bad = await run(api, 'build_drawboard_scene', {
      elements: [{ kind: 'scene3d', objects: [] }],
    })
    expect(bad.isError).toBe(true)
    expect(bad.output).toContain('Scene was not changed')
  })

  it('accepts circle/path scene aliases and the documented stroke-style aliases', async () => {
    const api = mockApi()
    const result = await run(api, 'build_drawboard_scene', {
      elements: [
        {
          kind: 'circle',
          x: 600,
          y: 100,
          radius: 50,
          fillColor: 'yellow',
          strokeStyle: '#8b7355',
          strokeWidth: 2,
        },
        {
          kind: 'path',
          points: [
            [10, 30],
            [40, 0],
            [70, 30],
            [10, 30],
          ],
          fillColor: '#a04000',
          strokeStyle: '#8b7355',
          strokeWidth: 3,
        },
        {
          kind: 'path',
          points: [
            [10, 50],
            [30, 40],
            [50, 50],
          ],
          strokeStyle: '#2563eb',
          strokeWidth: 4,
        },
      ],
    })
    expect(result.mutated).toBe(true)
    expect(api._current().map((element) => element.type)).toEqual(['ellipse', 'image', 'freedraw'])
    expect(api._current()[0]).toMatchObject({
      x: 550,
      y: 50,
      width: 100,
      height: 100,
      strokeColor: '#8b7355',
      strokeWidth: 2,
    })
    expect(api._current()[2]).toMatchObject({ strokeColor: '#2563eb', strokeWidth: 4 })
    expect(api.addFiles).toHaveBeenCalledTimes(1)
  })

  it('reports the exact unsupported tool name with valid alternatives', async () => {
    const result = await run(mockApi(), 'paint_a_house')
    expect(result.isError).toBe(true)
    expect(result.summary).toContain('paint_a_house')
    expect(result.output).toContain('build_drawboard_scene')
  })

  it('adds safe scalable vector artwork and rejects active or external SVG content', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 640 420"><!-- authoring note --><defs><linearGradient id="sky"><stop offset="0" stop-color="#dbeafe"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><path d="M0 300 L180 80 L360 300 Z" fill="url(#sky)"/><text x="210" y="380" font-size="28" fill="#1e1b4b">Blue mountain</text></svg>'
    const sanitized = sanitizeVectorSvg(svg)
    expect(sanitized.width).toBe(640)
    expect(sanitized.height).toBe(420)
    expect(sanitized.svg).toContain('linearGradient')
    expect(sanitized.svg).not.toContain('authoring note')
    expect(sanitized.svg).not.toContain('https:')

    const api = mockApi()
    const added = await run(api, 'add_vector_artwork', { svg, x: 120, y: 90 })
    expect(added.mutated).toBe(true)
    // the gradient now decomposes into stepped native polygons, so nothing is
    // rasterised and every shape stays editable
    expect(api.addFiles).not.toHaveBeenCalled()
    const placedTypes = api._current().map((element) => element.type)
    expect(placedTypes).not.toContain('image')
    expect(placedTypes).toContain('text')
    const placedCount = api._current().length

    const unsafe = await run(api, 'add_vector_artwork', {
      svg: svg.replace('</svg>', '<script>alert(1)</script></svg>'),
    })
    expect(unsafe.isError).toBe(true)
    expect(unsafe.output).toContain('not allowed')
    expect(api._current()).toHaveLength(placedCount)
    expect(api.updateScene).toHaveBeenCalledTimes(1)
  })

  it('supports filters, patterns, masks, markers, symbol reuse, embedded raster and rgb/hsl colours', () => {
    const rich = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">',
      '<defs>',
      '<filter id="glow"><feGaussianBlur stdDeviation="6"/><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgb(255,120,0)" flood-opacity="0.6"/></filter>',
      '<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4"/></filter>',
      '<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 0 L8 8" stroke="hsl(210, 60%, 40%)" stroke-width="1"/></pattern>',
      '<mask id="fade"><rect width="400" height="300" fill="white"/></mask>',
      '<marker id="tip" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="#1e1b4b"/></marker>',
      '<symbol id="tree" viewBox="0 0 10 10"><polygon points="5,0 10,10 0,10" fill="#14532d"/></symbol>',
      '</defs>',
      '<rect width="400" height="300" fill="url(#hatch)" mask="url(#fade)"/>',
      '<path d="M20 200 L200 40 L380 200" fill="none" stroke="rgba(30, 27, 75, 0.9)" stroke-width="3" marker-end="url(#tip)" filter="url(#glow)"/>',
      '<use href="#tree" x="120" y="150" style="opacity:0.9;fill:#166534"/>',
      '<image href="data:image/png;base64,iVBORw0KGgo=" x="10" y="10" width="40" height="40"/>',
      '</svg>',
    ].join('')

    const result = sanitizeVectorSvg(rich)
    for (const token of [
      'feGaussianBlur',
      'feDropShadow',
      'feTurbulence',
      'pattern',
      'mask',
      'marker',
      'symbol',
      '<use',
      'rgb(255,120,0)',
      'hsl(210, 60%, 40%)',
      'rgba(30, 27, 75, 0.9)',
      'data:image/png;base64',
    ]) {
      expect(result.svg).toContain(token)
    }

    // Still refuses external fetches, script-bearing CSS and abusive filters.
    expect(() =>
      sanitizeVectorSvg(
        rich.replace('data:image/png;base64,iVBORw0KGgo=', 'https://evil.example/x.png'),
      ),
    ).toThrow()
    expect(() =>
      sanitizeVectorSvg(
        rich.replace(
          'style="opacity:0.9;fill:#166534"',
          'style="background:url(https://evil.example/x)"',
        ),
      ),
    ).toThrow()
    expect(() => sanitizeVectorSvg(rich.replace('numOctaves="4"', 'numOctaves="99"'))).toThrow()
    expect(() =>
      sanitizeVectorSvg(rich.replace('</svg>', '<script>alert(1)</script></svg>')),
    ).toThrow()
  })

  it('rejects circular symbol references so the renderer cannot expand forever', () => {
    const cyclic =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><symbol id="a"><use href="#b"/></symbol><symbol id="b"><use href="#a"/></symbol></defs><use href="#a"/></svg>'
    expect(() => sanitizeVectorSvg(cyclic)).toThrow()
  })

  it('decomposes clean SVG artwork into editable native shapes instead of one image', async () => {
    const api = mockApi()
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">',
      '<rect x="20" y="20" width="160" height="90" fill="#93c5fd" stroke="#1e1b4b" stroke-width="2"/>',
      '<circle cx="300" cy="80" r="40" fill="#facc15" stroke="#1e1b4b"/>',
      '<line x1="20" y1="200" x2="380" y2="200" stroke="#334155" stroke-width="3"/>',
      '<polygon points="120,260 180,180 240,260" fill="#a7f3d0" stroke="#065f46"/>',
      '<text x="30" y="150" font-size="20" fill="#1e1b4b">Editable</text>',
      '</svg>',
    ].join('')
    const result = await executeBoardTool(
      { current: api as never },
      call('add_vector_artwork', { svg, x: 50, y: 60 }),
      (() => []) as never,
    )
    expect(result.isError).toBeUndefined()
    expect(result.mutated).toBe(true)
    expect(result.summary).toContain('editable')
    const elements = api._current()
    expect(elements.map((element) => element.type).sort()).toEqual([
      'ellipse',
      'line',
      'line',
      'rectangle',
      'text',
    ])
    // nothing had to be rasterised, so every shape stays selectable and editable
    expect(elements.some((element) => element.type === 'image')).toBe(false)
    expect(api.addFiles).not.toHaveBeenCalled()
    const rect = elements.find((element) => element.type === 'rectangle')!
    expect(rect.x).toBe(70) // 20 + offset 50
    expect(rect.y).toBe(80) // 20 + offset 60
    const polyline = elements.filter((element) => element.type === 'line')
    expect(polyline.length).toBe(2)
  })

  it('approximates blur and drop shadow natively and falls back for unsupported filters', async () => {
    const blur =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><filter id="soft"><feGaussianBlur stdDeviation="6"/></filter></defs><rect x="40" y="40" width="100" height="100" fill="#2563eb" filter="url(#soft)"/></svg>'
    const api = mockApi()
    const blurred = await executeBoardTool(
      { current: api as never },
      call('add_vector_artwork', { svg: blur }),
      (() => []) as never,
    )
    expect(blurred.isError).toBeUndefined()
    expect(blurred.summary).toContain('editable')
    expect(api.addFiles).not.toHaveBeenCalled()
    // a blur becomes a stack of grown translucent copies, with no crisp source
    const layers = api._current()
    expect(layers.length).toBeGreaterThan(3)
    expect(layers.every((element) => element.type === 'line')).toBe(true)
    expect(Math.max(...layers.map((element) => element.width ?? 0))).toBeGreaterThan(100)

    const shadow =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><filter id="cast"><feDropShadow dx="6" dy="6" stdDeviation="4" flood-color="#000000" flood-opacity="0.5"/></filter></defs><rect x="40" y="40" width="100" height="100" fill="#f59e0b" filter="url(#cast)"/></svg>'
    const shadowApi = mockApi()
    const cast = await executeBoardTool(
      { current: shadowApi as never },
      call('add_vector_artwork', { svg: shadow }),
      (() => []) as never,
    )
    expect(cast.isError).toBeUndefined()
    const shadowElements = shadowApi._current()
    // halo layers behind, plus the crisp source rectangle on top
    expect(shadowElements.some((element) => element.type === 'rectangle')).toBe(true)
    expect(shadowElements.filter((element) => element.type === 'line').length).toBeGreaterThan(3)

    // turbulence has no native equivalent, so the faithful image is kept
    const turbulence =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4"/></filter></defs><rect x="10" y="10" width="100" height="100" fill="#2563eb" filter="url(#grain)"/></svg>'
    const fallbackApi = mockApi()
    const grain = await executeBoardTool(
      { current: fallbackApi as never },
      call('add_vector_artwork', { svg: turbulence }),
      (() => []) as never,
    )
    expect(grain.mutated).toBe(true)
    expect(fallbackApi._current().map((element) => element.type)).toEqual(['image'])
    expect(fallbackApi.addFiles).toHaveBeenCalledTimes(1)
  })

  it('decomposes gradients and use/symbol references into native editable shapes', async () => {
    const api = mockApi()
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">',
      '<defs>',
      '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0" stop-color="#dbeafe"/><stop offset="1" stop-color="#1d4ed8"/>',
      '</linearGradient>',
      '<radialGradient id="sun"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></radialGradient>',
      '<symbol id="tree" viewBox="0 0 10 10"><polygon points="5,0 10,10 0,10" fill="#14532d"/></symbol>',
      '</defs>',
      '<rect x="0" y="0" width="200" height="120" fill="url(#sky)"/>',
      '<circle cx="60" cy="150" r="30" fill="url(#sun)"/>',
      '<use href="#tree" x="120" y="120"/>',
      '</svg>',
    ].join('')
    const result = await executeBoardTool(
      { current: api as never },
      call('add_vector_artwork', { svg }),
      (() => []) as never,
    )
    expect(result.isError).toBeUndefined()
    expect(result.summary).toContain('editable')
    // nothing rasterised: gradients stepped into polygons, the symbol inlined
    expect(api.addFiles).not.toHaveBeenCalled()
    const elements = api._current()
    expect(elements.some((element) => element.type === 'image')).toBe(false)
    expect(elements.length).toBeGreaterThan(14)
    // a stepped gradient must actually vary, not repeat one flat colour
    const fills = new Set(
      elements.map((element) => (element as unknown as Record<string, unknown>).backgroundColor),
    )
    expect(fills.size).toBeGreaterThan(4)
  })

  it('decomposes arc paths and rotated or scaled geometry into native shapes', async () => {
    const api = mockApi()
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
      // arc: previously forced the whole artwork back to a bitmap
      '<path d="M10 100 A90 90 0 0 1 190 100" fill="none" stroke="#1e1b4b" stroke-width="4"/>',
      // rotated rect: under rotation a rectangle is exactly a quadrilateral
      '<rect x="200" y="20" width="60" height="40" fill="#93c5fd" transform="rotate(30 230 40)"/>',
      // scaled rect: a pure scale keeps the native primitive, with scaled geometry
      '<rect x="20" y="300" width="40" height="20" fill="#fde68a" transform="scale(2)"/>',
      // translated circle: still a native ellipse
      '<circle cx="330" cy="150" r="25" fill="#fca5a5" transform="translate(10 0)"/>',
      '</svg>',
    ].join('')
    const result = await executeBoardTool(
      { current: api as never },
      call('add_vector_artwork', { svg }),
      (() => []) as never,
    )
    expect(result.isError).toBeUndefined()
    expect(result.summary).toContain('editable')
    // nothing had to be rasterised any more
    expect(api.addFiles).not.toHaveBeenCalled()
    const elements = api._current()
    const types = elements.map((element) => element.type)
    expect(types).not.toContain('image')
    expect(types.filter((type) => type === 'line')).toHaveLength(2) // arc + rotated quad
    expect(types.filter((type) => type === 'rectangle')).toHaveLength(1)
    expect(types.filter((type) => type === 'ellipse')).toHaveLength(1)
    // the scaled rect doubled and moved with its matrix, then took the default
    // 80,80 placement offset applied to every decomposed primitive
    const rect = elements.find((element) => element.type === 'rectangle')!
    expect(rect.x).toBe(40 + 80)
    expect(rect.y).toBe(600 + 80)
    expect(rect.width).toBe(80)
    expect(rect.height).toBe(40)
  })

  it('solves a constrained sketch and draws its geometry and associative dimensions', async () => {
    const api = mockApi()
    const result = await run(api, 'build_drawboard_scene', {
      elements: [
        {
          kind: 'sketch',
          x: 100,
          y: 100,
          scale: 1,
          units: 'mm',
          sketchPoints: [
            { id: 'p1', x: 0, y: 0, fixed: true },
            { id: 'p2', x: 10, y: 4 },
            { id: 'p3', x: 30, y: 20 },
          ],
          constraints: [
            { kind: 'distance', a: 'p1', b: 'p2', value: 80 },
            { kind: 'horizontal', a: 'p2', b: 'p3' },
          ],
          segments: [
            { a: 'p1', b: 'p2' },
            { a: 'p2', b: 'p3' },
          ],
          dimensions: [{ a: 'p1', b: 'p2', scale: 1, units: 'mm' }],
        },
      ],
    })
    expect(result.isError).toBeUndefined()
    expect(result.summary).toContain('Built scene')
    const elements = api._current()
    // two solved segments plus the dimension's witness, line and four barbs
    expect(elements.filter((element) => element.type === 'line').length).toBeGreaterThanOrEqual(9)
    // the label is measured off the SOLVED geometry, so it reads the constraint
    const labels = elements
      .filter((element) => element.type === 'text')
      .map((element) => element.text)
    expect(labels.some((label) => label?.includes('80.00 mm'))).toBe(true)
    // and the solve report travels back so under-constraint is visible
    expect(result.output).toContain('underconstrained')

    // a contradictory sketch reports inconsistent rather than pretending
    const bad = mockApi()
    const conflicting = await run(bad, 'build_drawboard_scene', {
      elements: [
        {
          kind: 'sketch',
          sketchPoints: [
            { id: 'a', x: 0, y: 0, fixed: true },
            { id: 'b', x: 10, y: 0 },
          ],
          constraints: [
            { kind: 'distance', a: 'a', b: 'b', value: 30 },
            { kind: 'distance', a: 'a', b: 'b', value: 90 },
          ],
          segments: [{ a: 'a', b: 'b' }],
        },
      ],
    })
    expect(conflicting.output).toContain('inconsistent')

    // a bad constraint is rejected with a precise message
    const rejected = await run(mockApi(), 'build_drawboard_scene', {
      elements: [
        {
          kind: 'sketch',
          sketchPoints: [{ id: 'a', x: 0, y: 0 }],
          constraints: [{ kind: 'tangent', a: 'a' }],
        },
      ],
    })
    expect(rejected.isError).toBe(true)
    expect(rejected.output).toContain('unsupported sketch constraint')
  })
  it('accepts the natural names and shorthand models actually emit', async () => {
    const api = mockApi()
    const result = await run(api, 'build_drawboard_scene', {
      elements: [
        { kind: 'rectangle', x: 100, y: 350, w: 800, h: 400, fill: '#1e1b4b', stroke: 'none' },
        { kind: 'oval', x: 200, y: 200, w: 120, h: 80 },
        { kind: 'label', x: 300, y: 100, text: 'Card title' },
      ],
    })
    expect(result.isError, result.output).toBeUndefined()
    const elements = api._current() as unknown as Array<Record<string, unknown>>
    const kinds = elements.map((element) => element.type)
    expect(kinds).toContain('rectangle')
    expect(kinds).toContain('ellipse')
    expect(kinds).toContain('text')
    // w/h must reach the geometry: the old silent default was 160x90
    const rect = elements.find((element) => element.type === 'rectangle')!
    expect(rect.width).toBe(800)
    expect(rect.height).toBe(400)
    const oval = elements.find((element) => element.type === 'ellipse')!
    expect(oval.width).toBe(120)
    expect(oval.height).toBe(80)
  })

  it('rejects a genuinely unknown kind but names the valid ones', async () => {
    const api = mockApi()
    const result = await run(api, 'build_drawboard_scene', {
      elements: [{ kind: 'hexahedron', x: 0, y: 0, width: 10, height: 10 }],
    })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('unsupported kind')
    // the retry needs to know what IS allowed
    expect(result.output).toContain('rect')
    expect(result.output).toContain('sketch')
  })
  it('stamps the constraint model onto every element so a drag can re-solve it', async () => {
    const api = mockApi()
    await run(api, 'build_drawboard_scene', {
      elements: [
        {
          kind: 'sketch',
          x: 100,
          y: 100,
          scale: 1,
          units: 'mm',
          sketchPoints: [
            { id: 'p1', x: 0, y: 0, fixed: true },
            { id: 'p2', x: 10, y: 4 },
          ],
          constraints: [{ kind: 'distance', a: 'p1', b: 'p2', value: 80 }],
          segments: [{ a: 'p1', b: 'p2' }],
          circles: [{ center: 'p1', rim: 'p2' }],
          dimensions: [{ a: 'p1', b: 'p2' }],
        },
      ],
    })
    const elements = api._current() as unknown as never[]
    const models = collectSketchModels(elements as never)
    expect(models).toHaveLength(1)
    const model = models[0]!
    expect(model.scale).toBe(1)
    expect(model.points).toHaveLength(2)
    const has = (id: string) => elements.some((element) => (element as { id: string }).id === id)

    // every link points at a real element, which is what makes the drag re-solve possible
    expect(model.segments).toHaveLength(1)
    expect(has(model.segments[0]!.elementId)).toBe(true)
    expect(model.circles).toHaveLength(1)
    expect(has(model.circles[0]!.elementId)).toBe(true)
    expect(model.dimensions).toHaveLength(1)
    expect(model.dimensions[0]!.elementIds).toHaveLength(7)
    for (const elementId of model.dimensions[0]!.elementIds) expect(has(elementId)).toBe(true)
    expect(has(model.dimensions[0]!.labelId)).toBe(true)
  })
  it('applies convex clip paths natively and shortens clipped strokes', async () => {
    const api = mockApi()
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">',
      '<defs><clipPath id="cut"><rect x="0" y="0" width="60" height="200"/></clipPath></defs>',
      '<rect x="0" y="0" width="200" height="100" fill="#93c5fd" clip-path="url(#cut)"/>',
      '<line x1="0" y1="150" x2="200" y2="150" stroke="#1e1b4b" stroke-width="2" clip-path="url(#cut)"/>',
      '</svg>',
    ].join('')
    const result = await executeBoardTool(
      { current: api as never },
      call('add_vector_artwork', { svg }),
      (() => []) as never,
    )
    expect(result.isError).toBeUndefined()
    expect(result.summary).toContain('editable')
    expect(api.addFiles).not.toHaveBeenCalled()
    const elements = api._current()
    expect(elements.some((element) => element.type === 'image')).toBe(false)
    // both shapes are cut down to the 60px-wide clip region and offset by 80,80
    expect(elements).toHaveLength(2)
    for (const element of elements) {
      // clipped geometry is floating point; compare to tolerance, never exactly
      expect(element.width).toBeCloseTo(60, 6)
      expect(element.x).toBeCloseTo(80, 6)
    }
    // a clipped stroke stays an open unfilled line rather than a filled region
    const strokeOnly = elements[1] as unknown as Record<string, unknown>
    expect(strokeOnly.backgroundColor).toBe('transparent')
  })
  it('advertises and accepts every scene kind end to end', async () => {
    const specs: Array<Record<string, unknown>> = [
      { kind: 'text', text: 'Title', x: 10, y: 10 },
      { kind: 'rect', x: 10, y: 10, width: 40, height: 20 },
      { kind: 'ellipse', x: 10, y: 10, width: 40, height: 20 },
      { kind: 'circle', x: 30, y: 30, radius: 15 },
      { kind: 'diamond', x: 10, y: 10, width: 40, height: 20 },
      { kind: 'line', x: 10, y: 10, width: 40, height: 20 },
      { kind: 'arrow', x: 10, y: 10, width: 40, height: 20 },
      {
        kind: 'polygon',
        points: [
          [0, 0],
          [40, 0],
          [20, 30],
        ],
      },
      {
        kind: 'path',
        points: [
          [0, 0],
          [20, 10],
          [40, 0],
        ],
      },
      { kind: 'sticky', text: 'Note', x: 10, y: 10, width: 120, height: 80 },
      {
        kind: 'freedraw',
        points: [
          [0, 0],
          [10, 10],
        ],
      },
      { kind: 'dimension', x1: 0, y1: 0, x2: 100, y2: 0, scale: 1, units: 'cm' },
      { kind: 'leader', x: 10, y: 10, labelX: 90, labelY: 60, text: 'Callout' },
      {
        kind: 'scene3d',
        x: 0,
        y: 0,
        objects: [{ shape: 'box', at: [0, 0, 0], size: [100, 100, 100], color: '#94a3b8' }],
      },
      {
        kind: 'sketch',
        x: 0,
        y: 0,
        sketchPoints: [
          { id: 's1', x: 0, y: 0, fixed: true },
          { id: 's2', x: 40, y: 0 },
        ],
        constraints: [{ kind: 'distance', a: 's1', b: 's2', value: 60 }],
        segments: [{ a: 's1', b: 's2' }],
      },
    ]

    // The published schema must describe exactly the kinds the executor handles.
    const sceneDef = BOARD_TOOL_DEFS.find(
      (definition) => definition.name === 'build_drawboard_scene',
    )!
    const kindEnum = (
      sceneDef.inputSchema as unknown as {
        properties: { elements: { items: { properties: { kind: { enum: string[] } } } } }
      }
    ).properties.elements.items.properties.kind.enum
    expect([...kindEnum].sort()).toEqual(specs.map((spec) => spec.kind as string).sort())

    const api = mockApi()
    const result = await run(api, 'build_drawboard_scene', { elements: specs })
    expect(result.isError).toBeUndefined()
    expect(result.summary).toContain('Built scene')
    expect(api._current().length).toBeGreaterThan(specs.length)

    // Every new annotation and 3D capability survives one transaction together.
    const types = api._current().map((element) => element.type)
    for (const expected of [
      'rectangle',
      'ellipse',
      'diamond',
      'line',
      'arrow',
      'text',
      'freedraw',
      'image',
    ]) {
      expect(types).toContain(expected)
    }
  })

  it('generates an image through the configured provider and places it on the board', async () => {
    // readBoardImageDimensions measures through a real <img>; stub it like the
    // add_board_image_from_url test does, or placement never resolves.
    class FakeImage {
      naturalWidth = 512
      naturalHeight = 512
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        this.onload?.()
      }
    }
    vi.stubGlobal('Image', FakeImage)
    try {
      const api = mockApi()
      const generateImage = vi.fn(async () => ({ base64: 'aGVsbG8=', mime: 'image/png' }))
      const result = await executeBoardTool(
        { current: api as never },
        call('generate_image', { prompt: 'a sunset over a cliffside house', aspectRatio: '16:9' }),
        (() => []) as never,
        undefined,
        undefined,
        generateImage as never,
      )
      expect(result.isError).toBeUndefined()
      expect(result.mutated).toBe(true)
      expect(generateImage).toHaveBeenCalledWith({
        prompt: 'a sunset over a cliffside house',
        aspectRatio: '16:9',
      })
      // the generated bytes reach the board as a placed image element
      expect(api._current().map((element) => element.type)).toEqual(['image'])

      // an empty prompt is rejected before any provider call
      const blank = await executeBoardTool(
        { current: api as never },
        call('generate_image', { prompt: '   ' }),
        (() => []) as never,
        undefined,
        undefined,
        generateImage as never,
      )
      expect(blank.isError).toBe(true)
      expect(generateImage).toHaveBeenCalledTimes(1)

      // provider failures surface as a tool error, not a silent no-op
      const failing = vi.fn(async () => ({ error: 'No image generation provider configured.' }))
      const failed = await executeBoardTool(
        { current: api as never },
        call('generate_image', { prompt: 'a robot' }),
        (() => []) as never,
        undefined,
        undefined,
        failing as never,
      )
      expect(failed.isError).toBe(true)
      expect(failed.output).toContain('No image generation provider configured')

      // without a bridge the tool refuses rather than pretending to work
      const unavailable = await executeBoardTool(
        { current: api as never },
        call('generate_image', { prompt: 'a robot' }),
        (() => []) as never,
      )
      expect(unavailable.isError).toBe(true)
      expect(unavailable.summary).toContain('unavailable')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('routes explicit generate requests to generate_image but leaves photo lookups to image_search', () => {
    const names = (instruction: string) => selectBoardToolNames(instruction)
    expect(names('generate an image of a sunset over a cliffside house')).toContain(
      'generate_image',
    )
    expect(names('draw me a cyberpunk city at night')).toContain('generate_image')
    expect(names('create a logo for my bakery')).toContain('generate_image')
    expect(names('imagine a poster for the launch')).toContain('generate_image')
    // real photos stay on the search path, not the generated one
    expect(names('add a photo of the Eiffel Tower to the board')).not.toContain('generate_image')
    // a plain board build is not an image-generation request
    expect(names('create a polished architectural concept board')).not.toContain('generate_image')
  })

  it('places attached images by filename', async () => {
    const api = mockApi()
    const staged = () => [
      {
        id: 'f1',
        name: 'logo.png',
        size: 10,
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,AAA',
        width: 100,
        height: 50,
      },
    ]
    const res = await executeBoardTool(
      { current: api as never },
      call('add_board_image', { name: 'logo', x: 30, y: 40 }),
      staged as never,
    )
    expect(res.mutated).toBe(true)
    expect(api._current().map((e) => e.type)).toEqual(['image'])
    const none = await executeBoardTool(
      { current: api as never },
      call('add_board_image', { name: 'x' }),
      (() => []) as never,
    )
    expect(none.isError).toBe(true)
    const unknown = await executeBoardTool(
      { current: api as never },
      call('add_board_image', { name: 'nope.png' }),
      staged as never,
    )
    expect(unknown.isError).toBe(true)
  })

  it('downloads and places a searched image URL through the native safe-fetch bridge', async () => {
    class FakeImage {
      naturalWidth = 640
      naturalHeight = 360
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        this.onload?.()
      }
    }
    vi.stubGlobal('Image', FakeImage)
    try {
      const api = mockApi()
      const fetchImage = vi.fn(async () => ({ base64: 'aGVsbG8=', mime: 'image/png' }))
      const result = await executeBoardTool(
        { current: api as never },
        call('add_board_image_from_url', {
          imageUrl: 'https://images.example.test/cabin.png',
          title: 'Mountain cabin',
          x: 24,
          y: 48,
        }),
        () => [],
        undefined,
        fetchImage,
      )
      expect(fetchImage).toHaveBeenCalledWith('https://images.example.test/cabin.png')
      expect(result).toMatchObject({ mutated: true, summary: 'Placed Mountain cabin' })
      expect(api._current()).toMatchObject([
        { type: 'image', x: 24, y: 48, width: 480, height: 270 },
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('updates text, moves (with bound labels), and deletes (with bound labels)', async () => {
    const api = mockApi([
      { id: 'r', type: 'rectangle', x: 10, y: 10 },
      { id: 't', type: 'text', x: 12, y: 12, text: 'old', containerId: 'r' },
      { id: 'solo', type: 'ellipse', x: 0, y: 0 },
    ])
    const upd = await run(api, 'update_board_text', { id: 't', text: 'new' })
    expect(upd.mutated).toBe(true)
    expect(api._current().find((e) => e.id === 't')?.text).toBe('new')
    const notText = await run(api, 'update_board_text', { id: 'r', text: 'x' })
    expect(notText.isError).toBe(true)
    await run(api, 'move_board_elements', { ids: ['r'], dx: 5, dy: 7 })
    expect(api._current().find((e) => e.id === 'r')).toMatchObject({ x: 15, y: 17 })
    expect(api._current().find((e) => e.id === 't')).toMatchObject({ x: 17, y: 19 })
    // Legacy/tool-created elements may have no Excalidraw grouping metadata;
    // every mutation must repair it before the renderer receives the scene.
    expect(
      api
        ._current()
        .every((element) => Array.isArray((element as unknown as { groupIds?: unknown }).groupIds)),
    ).toBe(true)
    await run(api, 'delete_board_elements', { ids: ['r'] })
    expect(api._current().map((e) => e.id)).toEqual(['solo'])
    const empty = await run(api, 'delete_board_elements', { ids: ['zzz'] })
    expect(empty.isError).toBe(true)
  })

  it('exposes a safe whole-element eraser that requires explicit ids', async () => {
    const api = mockApi([
      { id: 'line', type: 'freedraw', x: 10, y: 10 },
      { id: 'label', type: 'text', x: 12, y: 12, text: 'clutter', containerId: 'line' },
      { id: 'keep', type: 'rectangle', x: 80, y: 80 },
    ])
    const tool = BOARD_TOOL_DEFS.find((definition) => definition.name === 'erase_board_elements')
    expect(tool?.description).toContain('whole board elements')
    expect(tool?.inputSchema).toMatchObject({ required: ['ids'] })

    const missingIds = await run(api, 'erase_board_elements')
    expect(missingIds.isError).toBe(true)
    expect(api._current().map((element) => element.id)).toEqual(['line', 'label', 'keep'])

    const erased = await run(api, 'erase_board_elements', { ids: ['line'] })
    expect(erased).toMatchObject({ mutated: true, summary: 'Erased 2 element(s)' })
    expect(api._current().map((element) => element.id)).toEqual(['keep'])
  })

  it('arranges, aligns, groups, locks, flips, and duplicates', async () => {
    const api = mockApi([
      { id: 'a', type: 'rectangle', x: 0, y: 0 },
      { id: 'b', type: 'rectangle', x: 50, y: 50 },
      { id: 'c', type: 'ellipse', x: 100, y: 100 },
    ])
    const ids = { ids: ['a', 'b'] }
    expect((await run(api, 'arrange_elements', { ...ids, operation: 'front' })).mutated).toBe(true)
    expect(api._current().map((e) => e.id)).toEqual(['c', 'a', 'b'])
    expect((await run(api, 'align_elements', { ...ids, alignment: 'left' })).mutated).toBe(true)
    // b.x was 50, aligned left with a.x=0 -> 0... a stays, b moves (order in array irrelevant)
    const grouped = await run(api, 'group_elements', { ids: ['a', 'b', 'c'] })
    expect(grouped.mutated).toBe(true)
    const ungrouped = await run(api, 'ungroup_elements', { ids: ['a', 'b', 'c'] })
    expect(ungrouped.mutated).toBe(true)
    const locked = await run(api, 'set_element_lock', { ids: ['a'], locked: true })
    expect(locked.mutated).toBe(true)
    expect((await run(api, 'flip_elements', { ids: ['a'], direction: 'horizontal' })).mutated).toBe(
      true,
    )
    const dup = await run(api, 'duplicate_elements', { ids: ['a'] })
    expect(dup.mutated).toBe(true)
    expect(api._current()).toHaveLength(4)
    const spreadApi = mockApi([
      { id: 'd1', type: 'rectangle', x: 0, y: 0, width: 40, height: 20 },
      { id: 'd2', type: 'rectangle', x: 200, y: 0, width: 40, height: 20 },
      { id: 'd3', type: 'rectangle', x: 500, y: 0, width: 40, height: 20 },
    ])
    expect(
      (await run(spreadApi, 'distribute_elements', { ids: ['d1', 'd2', 'd3'], axis: 'horizontal' }))
        .mutated,
    ).toBe(true)
    expect(spreadApi._current().map((element) => element.x)).toEqual([0, 250, 500])
    const badOp = await run(api, 'arrange_elements', { ids: ['a'], operation: 'sideways' })
    expect(badOp.isError).toBe(true)
  })

  it('styles strokes, opacity, and text, and zooms to fit', async () => {
    const api = mockApi([
      { id: 'r', type: 'rectangle', x: 0, y: 0 },
      { id: 't', type: 'text', x: 5, y: 5, text: 'hi' },
    ])
    expect((await run(api, 'set_stroke_width', { ids: ['r'], width: 4 })).mutated).toBe(true)
    expect((await run(api, 'set_opacity', { ids: ['r'], opacity: 50 })).mutated).toBe(true)
    expect((await run(api, 'set_text_size', { ids: ['t'], size: 32 })).mutated).toBe(true)
    const notText = await run(api, 'set_text_size', { ids: ['r'], size: 32 })
    expect(notText.isError).toBe(true)
    const badWidth = await run(api, 'set_stroke_width', { ids: ['r'], width: 9 })
    expect(badWidth.isError).toBe(true)
    const zoom = await run(api, 'zoom_to_fit')
    expect(zoom.isError).not.toBe(true)
    expect(api.scrollToContent).toHaveBeenCalled()
  })

  it('falls back to the live selection and selects all', async () => {
    const api = mockApi(
      [
        { id: 'a', type: 'rectangle', x: 0, y: 0 },
        { id: 'b', type: 'rectangle', x: 10, y: 10 },
      ],
      ['a', 'b'],
    )
    // no ids -> uses selection
    expect((await run(api, 'align_elements', { alignment: 'top' })).mutated).toBe(true)
    const lonely = mockApi([{ id: 'a', type: 'rectangle', x: 0, y: 0 }])
    const noTarget = await run(lonely, 'align_elements', { alignment: 'top' })
    expect(noTarget.isError).toBe(true)
    expect((await run(lonely, 'select_all')).summary).toContain('1')
    expect((await run(lonely, 'clear_selection')).summary).toContain('cleared')
  })

  it('undoes and redoes through history when available', async () => {
    const api = mockApi([{ id: 'a', type: 'rectangle', x: 0, y: 0 }])
    const history = {
      undo: vi.fn(() => [] as unknown[]),
      redo: vi.fn(() => [{ id: 'a' }] as unknown[]),
    }
    const undone = await executeBoardTool(
      { current: api as never },
      call('undo_drawboard'),
      () => [],
      history,
    )
    expect(undone.mutated).toBe(true)
    expect(history.undo).toHaveBeenCalled()
    const redone = await executeBoardTool(
      { current: api as never },
      call('redo_drawboard'),
      () => [],
      history,
    )
    expect(redone.mutated).toBe(true)
    const emptyHistory = { undo: () => null, redo: () => null }
    expect(
      (
        await executeBoardTool(
          { current: api as never },
          call('undo_drawboard'),
          () => [],
          emptyHistory,
        )
      ).output,
    ).toContain('Nothing to undo')
    expect(
      (
        await executeBoardTool(
          { current: api as never },
          call('redo_drawboard'),
          () => [],
          emptyHistory,
        )
      ).output,
    ).toContain('Nothing to redo')
    expect(
      (await executeBoardTool({ current: api as never }, call('redo_drawboard'), () => [])).isError,
    ).toBe(true)
  })

  it('refuses unclear without confirmation and undoes last element', async () => {
    const api = mockApi([{ id: 'a', type: 'text', x: 0, y: 0 }])
    const refused = await run(api, 'clear_drawboard', { confirm: false })
    expect(refused.isError).toBe(true)
    expect(api._current()).toHaveLength(1)
    await run(api, 'clear_drawboard', { confirm: true })
    expect(api._current()).toHaveLength(0)
    const undoEmpty = await run(api, 'undo_drawboard')
    expect(undoEmpty.output).toContain('already empty')
  })

  it('exports through the download pipeline', async () => {
    const stub = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      value: stub.mockReturnValue('blob:x'),
      configurable: true,
    })
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      const api = mockApi([{ id: 'a', type: 'text', x: 0, y: 0, text: 't' }])
      for (const format of ['png', 'svg', 'board-file']) {
        const res = await run(api, 'export_drawboard', { format })
        expect(res.isError).not.toBe(true)
        expect(res.summary).toContain(format)
      }
      const bad = await run(api, 'export_drawboard', { format: 'pdf' })
      expect(bad.isError).toBe(true)
    } finally {
      anchorClick.mockRestore()
    }
  })

  it('guards claimed board changes without executed tools', () => {
    expect(verifyBoardResponse('I added a sticky note to the board.', [])).toContain(
      'no board tool',
    )
    expect(
      verifyBoardResponse('I added a sticky note.', [{ name: 'add_sticky_note', ok: true }]),
    ).toBe(null)
    expect(
      verifyBoardResponse('I created an illustration on the board.', [
        { name: 'build_drawboard_scene', ok: true },
      ]),
    ).toBe(null)
    expect(
      verifyBoardResponse('I created an illustration on the board.', [
        { name: 'add_vector_artwork', ok: true },
      ]),
    ).toBe(null)
    expect(verifyBoardResponse('Exported the board as png for you.', [])).toContain(
      'export_drawboard',
    )
    expect(
      verifyBoardResponse('Here is a summary of the board.', [
        { name: 'read_drawboard', ok: true },
      ]),
    ).toBe(null)
    expect(verifyBoardResponse('The board has 3 elements.', [])).toBe(null)
  })

  it('requires a native diagram read-back and visual review when available', () => {
    expect(
      verifyBoardResponse('The flow is ready.', [{ name: 'build_flow_diagram', ok: true }], {
        requireDiagramReview: true,
        requireVisualReview: true,
      }),
    ).toContain('read_drawboard and inspect_board_visual')
    expect(
      verifyBoardResponse(
        'The flow is ready.',
        [
          { name: 'build_flow_diagram', ok: true },
          { name: 'read_drawboard', ok: true },
        ],
        { requireDiagramReview: true, requireVisualReview: true },
      ),
    ).toContain('inspect_board_visual')
    expect(
      verifyBoardResponse(
        'The flow is ready.',
        [
          { name: 'build_flow_diagram', ok: true },
          { name: 'read_drawboard', ok: true },
          { name: 'inspect_board_visual', ok: true },
        ],
        { requireDiagramReview: true, requireVisualReview: true },
      ),
    ).toBe(null)
    expect(
      verifyBoardResponse(
        'The flow is ready.',
        [
          { name: 'build_flow_diagram', ok: true },
          { name: 'read_drawboard', ok: true },
        ],
        { requireDiagramReview: true },
      ),
    ).toBe(null)
  })
})
