import { describe, expect, it, vi } from 'vitest'
import {
  AgentLoop,
  type AgentStreamCallbacks,
  type AgentStreamRequest,
  type AgentTransport,
} from '@revelith/agent-core'
import { withImageSearch, withWebSearch } from '@revelith/app-chat'
import { BOARD_TOOL_DEFS, executeBoardTool, verifyBoardResponse } from './board-engine/ai-tools'
import { selectBoardTools } from './ai/board-tool-routing'

const excalidrawBoundary = vi.hoisted(() => ({
  restore: vi.fn(({ elements }: { elements: unknown[] }) => ({ elements, appState: {} })),
  exportToBlob: vi.fn(async () => new Blob(['test-board-preview'], { type: 'image/png' })),
}))

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
  restore: excalidrawBoundary.restore,
  exportToBlob: excalidrawBoundary.exportToBlob,
  exportToSvg: vi.fn(async () => document.createElementNS('http://www.w3.org/2000/svg', 'svg')),
}))

type BoardElement = Record<string, unknown> & { id: string; type: string; x: number; y: number }

function boardApi() {
  let elements: BoardElement[] = []
  let files: Record<string, unknown> = {}
  return {
    getSceneElements: () => elements,
    getAppState: () => ({ selectedElementIds: {} }),
    getFiles: () => files,
    addFiles: (
      added: Array<{ id: string; dataURL: string; mimeType: string; created: number }>,
    ) => {
      files = { ...files, ...Object.fromEntries(added.map((file) => [file.id, file])) }
    },
    scrollToContent: () => undefined,
    updateScene: (patch: { elements?: readonly BoardElement[] }) => {
      if (patch.elements) elements = [...patch.elements]
    },
  }
}

describe('Draw agentic drawing end to end', () => {
  it('routes a negative-Mermaid request to native tools and forces a separate verify turn', async () => {
    const prompt =
      'Create a native editable flowchart for a three-step review process. Do not use Mermaid, imported SVG, or external JSON.'
    const api = boardApi()
    const requests: AgentStreamRequest[] = []
    const calls: string[] = []
    const routedTools = selectBoardTools(prompt, BOARD_TOOL_DEFS)
    const transport: AgentTransport = {
      stream(request, callbacks) {
        requests.push(request)
        const turn = requests.length - 1
        queueMicrotask(() => {
          if (turn === 0) {
            callbacks.onToolCall({
              id: 'native-flow',
              name: 'build_flow_diagram',
              input: {
                title: 'Review process',
                direction: 'LR',
                nodes: [
                  { id: 'submit', label: 'Submit', shape: 'start' },
                  { id: 'review', label: 'Review', shape: 'process' },
                  { id: 'done', label: 'Complete', shape: 'end' },
                ],
                edges: [
                  { from: 'submit', to: 'review' },
                  { from: 'review', to: 'done' },
                ],
              },
            })
          } else if (turn === 1) {
            // The app-level verifier must reject a premature final response.
            callbacks.onDelta('The diagram has been created.')
          } else if (turn === 2) {
            callbacks.onToolCall({ id: 'read-back', name: 'read_drawboard', input: {} })
            callbacks.onToolCall({
              id: 'visual-review',
              name: 'inspect_board_visual',
              input: { requirements: 'Check labels, spacing, overlap, and readability.' },
            })
          } else {
            callbacks.onDelta('Created the editable flowchart and verified its layout.')
          }
          callbacks.onDone()
        })
        return { cancel: () => undefined }
      },
    }
    let resolveRun!: (value: { text: string; cancelled: boolean; turnLimit: boolean }) => void
    const completed = new Promise<{ text: string; cancelled: boolean; turnLimit: boolean }>(
      (resolve) => {
        resolveRun = resolve
      },
    )
    const loop = new AgentLoop({
      transport,
      skill: {
        id: 'drawboard-native-verified-diagram-e2e',
        systemPrompt: 'Use native diagram tools, then read and visually inspect the result.',
        tools: routedTools,
        executeTool: async (call) => {
          calls.push(call.name)
          return executeBoardTool(
            { current: api as never },
            call,
            () => [],
            undefined,
            undefined,
            undefined,
            async () => ({
              ok: true,
              text: 'Visual review passed: labels are readable and no overlaps were found.',
            }),
          )
        },
        verifyResponse: (finalText, executed) =>
          verifyBoardResponse(finalText, executed, {
            requireDiagramReview: true,
            requireVisualReview: true,
          }),
      },
      events: { onDone: resolveRun },
      compaction: false,
      maxTurns: 6,
    })
    loop.run(prompt)
    const outcome = await Promise.race([
      completed,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('native diagram verification did not finish')), 5000),
      ),
    ])

    expect(outcome).toMatchObject({ cancelled: false, turnLimit: false })
    expect(requests).toHaveLength(4)
    expect(requests[0]!.tools.map((tool) => tool.name)).toEqual([
      'build_flow_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(calls).toEqual(['build_flow_diagram', 'read_drawboard', 'inspect_board_visual'])
    const nativeElements = api.getSceneElements()
    expect(nativeElements.length).toBeGreaterThan(5)
    expect(nativeElements.some((element) => element.type === 'image')).toBe(false)
    expect(nativeElements.some((element) => element.type === 'arrow')).toBe(true)
    expect(nativeElements.some((element) => element.type === 'rectangle')).toBe(true)
    expect(nativeElements.some((element) => element.type === 'text')).toBe(true)
    excalidrawBoundary.restore.mockClear()
  })

  it('routes a natural language illustration, calls tools over multiple turns, and inspects the rendered scene', async () => {
    const prompt =
      'Draw an editable vector isometric mountain cabin scene with layered mountains, a lake, pine trees, and a warm glowing window.'
    const api = boardApi()
    const requests: AgentStreamRequest[] = []
    const activity: Array<{ name: string; output: string; isError?: boolean }> = []
    const toolStarts: string[] = []
    const routedTools = selectBoardTools(prompt, BOARD_TOOL_DEFS)
    const toolsForActiveRun = routedTools

    const transport: AgentTransport = {
      stream(request, callbacks: AgentStreamCallbacks) {
        requests.push(request)
        const turn = requests.length - 1
        queueMicrotask(() => {
          if (turn === 0) {
            callbacks.onToolCall({ id: 'inspect-1', name: 'Read drawboard', input: {} })
          } else if (turn === 1) {
            callbacks.onToolCall({
              id: 'scene-1',
              name: 'build_drawboard_scene',
              input: {
                elements: [
                  {
                    kind: 'text',
                    text: 'MOUNTAIN CABIN',
                    x: 80,
                    y: 36,
                    size: 30,
                    color: '#172554',
                  },
                  {
                    kind: 'polygon',
                    points: [
                      [80, 380],
                      [250, 120],
                      [430, 380],
                    ],
                    fillColor: '#94a3b8',
                    color: '#475569',
                  },
                  {
                    kind: 'polygon',
                    points: [
                      [250, 380],
                      [520, 90],
                      [790, 380],
                    ],
                    fillColor: '#64748b',
                    color: '#334155',
                  },
                  {
                    kind: 'polygon',
                    points: [
                      [180, 570],
                      [360, 430],
                      [590, 450],
                      [790, 570],
                    ],
                    fillColor: '#38bdf8',
                    color: '#0369a1',
                  },
                  {
                    kind: 'rect',
                    x: 420,
                    y: 340,
                    width: 170,
                    height: 130,
                    fillColor: '#854d0e',
                    color: '#451a03',
                  },
                  {
                    kind: 'polygon',
                    points: [
                      [390, 350],
                      [505, 260],
                      [620, 350],
                    ],
                    fillColor: '#7f1d1d',
                    color: '#450a0a',
                  },
                  {
                    kind: 'rect',
                    x: 485,
                    y: 380,
                    width: 34,
                    height: 42,
                    fillColor: '#fde047',
                    color: '#f59e0b',
                    opacity: 90,
                  },
                  {
                    kind: 'freedraw',
                    points: [
                      [100, 500],
                      [150, 450],
                      [200, 500],
                      [250, 430],
                      [305, 500],
                    ],
                    color: '#14532d',
                    lineWidth: 6,
                  },
                  { kind: 'arrow', x: 420, y: 520, width: 130, height: 0, color: '#0c4a6e' },
                ],
              },
            })
            callbacks.onToolCall({
              id: 'art-1',
              name: 'add_vector_artwork',
              input: {
                svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><defs><linearGradient id="glow"><stop offset="0" stop-color="#fef08a"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs><circle cx="320" cy="52" r="28" fill="url(#glow)"/><path d="M10 220 Q90 170 170 220 T330 220" fill="none" stroke="#166534" stroke-width="8" stroke-linecap="round"/></svg>',
                x: 260,
                y: 360,
              },
            })
          } else if (turn === 2) {
            const previousResults = request.messages
              .filter((message) => message.role === 'tool')
              .flatMap((message) => message.results)
            if (previousResults.some((result) => result.isError)) {
              callbacks.onToolCall({ id: 'retry-1', name: 'read_drawboard', input: {} })
            } else {
              callbacks.onToolCall({ id: 'inspect-2', name: 'read_drawboard', input: {} })
            }
          } else {
            callbacks.onDelta('I created the cabin illustration and inspected its board elements.')
          }
          callbacks.onDone()
        })
        return { cancel: () => undefined }
      },
    }

    let resolveRun!: (result: { text: string; cancelled: boolean; turnLimit: boolean }) => void
    const completed = new Promise<{ text: string; cancelled: boolean; turnLimit: boolean }>(
      (resolve) => {
        resolveRun = resolve
      },
    )
    const loop = new AgentLoop({
      transport,
      skill: {
        id: 'drawboard-e2e',
        systemPrompt: 'Create and inspect drawings using the supplied drawboard tools.',
        get tools() {
          return toolsForActiveRun
        },
        executeTool: async (call) => {
          const result = await executeBoardTool({ current: api as never }, call)
          activity.push({ name: call.name, output: result.output, isError: result.isError })
          return result
        },
        verifyResponse: verifyBoardResponse,
      },
      events: {
        onDone: resolveRun,
        onToolStart: (call) => toolStarts.push(call.name),
        onToolExecuted: ({ call, execution }) => {
          if (
            !activity.some((item) => item.name === call.name && item.output === execution.output)
          ) {
            activity.push({ name: call.name, output: execution.output, isError: execution.isError })
          }
        },
      },
      compaction: false,
      maxTurns: 8,
    })
    loop.run(prompt)
    const result = await Promise.race([
      completed,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('agent run did not finish')), 5000),
      ),
    ])

    expect(result).toMatchObject({
      text: 'I created the cabin illustration and inspected its board elements.',
      cancelled: false,
      turnLimit: false,
    })
    expect(requests).toHaveLength(4)
    expect(requests[0]!.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['read_drawboard', 'build_drawboard_scene', 'add_vector_artwork']),
    )
    expect(requests[0]!.tools.length).toBeLessThan(BOARD_TOOL_DEFS.length)
    expect(
      requests
        .slice(1)
        .every(
          (request) =>
            request.tools.map((tool) => tool.name).join('|') ===
            requests[0]!.tools.map((tool) => tool.name).join('|'),
        ),
    ).toBe(true)
    expect(activity.map((item) => item.name)).toEqual([
      'Read drawboard',
      'build_drawboard_scene',
      'add_vector_artwork',
      'read_drawboard',
    ])
    expect(toolStarts).toEqual([
      'Read drawboard',
      'build_drawboard_scene',
      'add_vector_artwork',
      'read_drawboard',
    ])
    expect(activity.every((item) => !item.isError)).toBe(true)
    expect(activity[0]!.output).toContain('0 element(s)')
    // The artwork is placed as editable native shapes, so the exact element
    // count depends on how the SVG decomposed (gradients step into bands).
    // Assert it landed and is populated rather than pinning a magic number.
    expect(activity[3]!.output).toMatch(/Drawing has \d+ element\(s\)/)
    expect(activity[3]!.output).not.toContain('Drawing has 0 element(s)')
    // The vector artwork now decomposes into native shapes, so the only images
    // left are the ones the scene itself rasterised (shaded polygon fills).
    const sceneImages = api.getSceneElements().filter((element) => element.type === 'image')
    expect(sceneImages.length).toBeGreaterThan(0)
    expect(sceneImages.length).toBeLessThan(5)
    // every rasterised element still has exactly one backing file
    expect(Object.keys(api.getFiles())).toHaveLength(sceneImages.length)
    expect(api.getSceneElements().some((element) => element.type === 'freedraw')).toBe(true)
    expect(api.getSceneElements().some((element) => element.type === 'arrow')).toBe(true)
    // Each mutating tool restores once while constructing its scene and once
    // at the shared updateScene boundary, keeping plain AI objects safe.
    expect(excalidrawBoundary.restore).toHaveBeenCalledTimes(4)
  })

  it('routes a natural-language finished-art request through image generation and places the generated image', async () => {
    const prompt = 'Can you draw a house with a 3D look and mountains behind it?'
    const api = boardApi()
    const routedTools = selectBoardTools(prompt, BOARD_TOOL_DEFS)
    const requests: AgentStreamRequest[] = []
    const generated = vi.fn(async () => ({ base64: 'aGVsbG8=', mime: 'image/png' }))
    const analyzeMedia = vi.fn(
      async ({ mediaUrls, requirements }: { mediaUrls: string[]; requirements: string }) => ({
        ok: true,
        text: `Visual review: balanced mountain depth, clear focal house, no overlap. Requested checks: ${requirements}. Image payload: ${mediaUrls[0]?.slice(0, 22)}`,
      }),
    )
    const results: Array<{ name: string; isError?: boolean; output: string }> = []
    const activeTools = routedTools
    const transport: AgentTransport = {
      stream(request, callbacks) {
        requests.push(request)
        const turn = requests.length - 1
        queueMicrotask(() => {
          if (turn === 0)
            callbacks.onToolCall({ id: 'art-read-before', name: 'read_drawboard', input: {} })
          else if (turn === 1)
            callbacks.onToolCall({
              id: 'art-generate',
              name: 'generate_image',
              input: {
                prompt:
                  'A refined architectural illustration of a timber mountain house, viewed in three-quarter perspective, with layered alpine peaks, detailed glazing and roof construction, warm late-afternoon light, atmospheric depth, and natural material textures. No clip-art styling.',
                aspectRatio: '4:3',
                title: 'Mountain house',
                x: 120,
                y: 120,
                maxWidth: 900,
              },
            })
          else if (turn === 2)
            callbacks.onToolCall({
              id: 'art-visual-review',
              name: 'inspect_board_visual',
              input: {
                requirements:
                  'Check architectural detail, perspective, contrast, and whether the house is prominent.',
              },
            })
          else callbacks.onDelta('Generated and placed the mountain house illustration.')
          callbacks.onDone()
        })
        return { cancel: () => undefined }
      },
    }
    let resolveRun!: (result: { text: string; cancelled: boolean; turnLimit: boolean }) => void
    const completed = new Promise<{ text: string; cancelled: boolean; turnLimit: boolean }>(
      (resolve) => {
        resolveRun = resolve
      },
    )
    const loop = new AgentLoop({
      transport,
      skill: {
        id: 'drawboard-rendered-art-e2e',
        systemPrompt: 'Use generate_image for a finished scene when it is available.',
        get tools() {
          return activeTools
        },
        executeTool: async (call) => {
          const result = await executeBoardTool(
            { current: api as never },
            call,
            undefined,
            undefined,
            undefined,
            generated,
            analyzeMedia,
          )
          results.push({ name: call.name, isError: result.isError, output: result.output })
          return result
        },
      },
      events: { onDone: resolveRun },
      compaction: false,
      maxTurns: 6,
    })
    loop.run(prompt)
    const outcome = await Promise.race([
      completed,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('rendered art run did not finish')), 5000),
      ),
    ])

    expect(outcome).toMatchObject({ cancelled: false, turnLimit: false })
    expect(requests[0]!.tools.map((tool) => tool.name)).toContain('generate_image')
    expect(requests[0]!.tools.map((tool) => tool.name)).toContain('inspect_board_visual')
    expect(requests[0]!.tools.map((tool) => tool.name)).not.toContain('build_drawboard_scene')
    expect(generated).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: '4:3',
        prompt: expect.stringContaining('detailed glazing and roof construction'),
      }),
    )
    expect(results.every((result) => !result.isError)).toBe(true)
    expect(results.map((result) => result.name)).toEqual([
      'read_drawboard',
      'generate_image',
      'inspect_board_visual',
    ])
    expect(analyzeMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        requirements:
          'Check architectural detail, perspective, contrast, and whether the house is prominent.',
        mediaUrls: [expect.stringMatching(/^data:image\/png;base64,/)],
      }),
    )
    expect(results[2]!.output).toContain('balanced mountain depth')
    expect(api.getSceneElements()).toMatchObject([
      { type: 'image', x: 120, y: 120, width: 400, height: 300 },
    ])
    expect(Object.keys(api.getFiles())).toHaveLength(1)
  })

  it('executes a detailed architecture concept brief as a multi-step, layered drawing', async () => {
    const prompt =
      'Create a polished, editable architectural concept board for a contemporary two-storey cliffside house at sunset. Show the cantilevered glass living room, roof terrace, support columns, stairs down to the water, layered cliffs, pine trees, warm interior lights, a title and three callouts. Give it an isometric 3D feeling, inspect the finished board, then fit the whole design on screen.'
    const api = boardApi()
    const requests: AgentStreamRequest[] = []
    const restoresBeforeRun = excalidrawBoundary.restore.mock.calls.length
    const routedTools = selectBoardTools(prompt, BOARD_TOOL_DEFS)
    const toolsForActiveRun = routedTools
    const toolResults: Array<{ name: string; isError?: boolean; output: string }> = []
    const scene = [
      {
        kind: 'text',
        text: 'CLIFF HOUSE | CONCEPT 01',
        x: 70,
        y: 36,
        width: 520,
        size: 30,
        color: '#172554',
      },
      {
        kind: 'text',
        text: 'SOUTH ELEVATION · SUNSET',
        x: 72,
        y: 75,
        width: 380,
        size: 14,
        color: '#475569',
      },
      { kind: 'circle', x: 1010, y: 130, radius: 48, fillColor: '#fb923c', color: '#f97316' },
      {
        kind: 'polygon',
        points: [
          [40, 590],
          [175, 400],
          [335, 590],
        ],
        fillColor: '#64748b',
        color: '#475569',
      },
      {
        kind: 'polygon',
        points: [
          [220, 590],
          [420, 345],
          [610, 590],
        ],
        fillColor: '#475569',
        color: '#334155',
      },
      {
        kind: 'polygon',
        points: [
          [530, 590],
          [745, 365],
          [960, 590],
        ],
        fillColor: '#334155',
        color: '#1e293b',
      },
      {
        kind: 'polygon',
        points: [
          [800, 590],
          [1010, 420],
          [1190, 590],
        ],
        fillColor: '#64748b',
        color: '#475569',
      },
      {
        kind: 'polygon',
        points: [
          [0, 690],
          [250, 630],
          [520, 700],
          [810, 640],
          [1200, 710],
          [1200, 900],
          [0, 900],
        ],
        fillColor: '#0e7490',
        color: '#155e75',
      },
      {
        kind: 'polygon',
        points: [
          [265, 515],
          [580, 470],
          [735, 535],
          [405, 585],
        ],
        fillColor: '#cbd5e1',
        color: '#64748b',
      },
      {
        kind: 'polygon',
        points: [
          [405, 585],
          [735, 535],
          [735, 690],
          [405, 735],
        ],
        fillColor: '#64748b',
        color: '#334155',
      },
      {
        kind: 'polygon',
        points: [
          [580, 470],
          [735, 535],
          [735, 690],
          [580, 625],
        ],
        fillColor: '#94a3b8',
        color: '#475569',
      },
      {
        kind: 'polygon',
        points: [
          [285, 480],
          [490, 410],
          [630, 460],
          [420, 520],
        ],
        fillColor: '#334155',
        color: '#0f172a',
      },
      {
        kind: 'polygon',
        points: [
          [420, 520],
          [630, 460],
          [630, 485],
          [420, 545],
        ],
        fillColor: '#1e293b',
        color: '#0f172a',
      },
      {
        kind: 'rect',
        x: 455,
        y: 533,
        width: 95,
        height: 76,
        fillColor: '#fbbf24',
        color: '#f59e0b',
        opacity: 90,
      },
      {
        kind: 'rect',
        x: 615,
        y: 548,
        width: 72,
        height: 66,
        fillColor: '#fcd34d',
        color: '#f59e0b',
        opacity: 88,
      },
      {
        kind: 'rect',
        x: 462,
        y: 625,
        width: 22,
        height: 94,
        fillColor: '#334155',
        color: '#1e293b',
      },
      {
        kind: 'rect',
        x: 548,
        y: 613,
        width: 22,
        height: 108,
        fillColor: '#334155',
        color: '#1e293b',
      },
      {
        kind: 'polygon',
        points: [
          [270, 588],
          [390, 605],
          [390, 620],
          [270, 603],
        ],
        fillColor: '#f8fafc',
        color: '#cbd5e1',
      },
      { kind: 'line', x: 280, y: 607, width: 130, height: 34, color: '#f8fafc', lineWidth: 3 },
      { kind: 'line', x: 300, y: 612, width: 130, height: 34, color: '#f8fafc', lineWidth: 3 },
      { kind: 'line', x: 320, y: 617, width: 130, height: 34, color: '#f8fafc', lineWidth: 3 },
      {
        kind: 'text',
        text: '01  CANTILEVERED GLASS LIVING',
        x: 72,
        y: 195,
        width: 290,
        size: 16,
        color: '#172554',
      },
      { kind: 'arrow', x: 280, y: 218, width: 185, height: 255, color: '#f97316', lineWidth: 2 },
      {
        kind: 'text',
        text: '02  ROOF TERRACE + DEEP OVERHANG',
        x: 770,
        y: 255,
        width: 350,
        size: 16,
        color: '#172554',
      },
      { kind: 'arrow', x: 620, y: 282, width: 180, height: 160, color: '#f97316', lineWidth: 2 },
      {
        kind: 'text',
        text: '03  STEPPED PATH TO THE LAKE',
        x: 770,
        y: 760,
        width: 330,
        size: 16,
        color: '#f8fafc',
      },
      {
        kind: 'freedraw',
        points: [
          [770, 700],
          [815, 720],
          [845, 710],
          [875, 735],
          [905, 725],
        ],
        color: '#f8fafc',
        lineWidth: 4,
      },
      {
        kind: 'polygon',
        points: [
          [150, 392],
          [170, 348],
          [190, 392],
        ],
        fillColor: '#166534',
        color: '#14532d',
      },
      {
        kind: 'polygon',
        points: [
          [945, 410],
          [970, 352],
          [995, 410],
        ],
        fillColor: '#166534',
        color: '#14532d',
      },
      {
        kind: 'polygon',
        points: [
          [1060, 438],
          [1080, 392],
          [1100, 438],
        ],
        fillColor: '#15803d',
        color: '#166534',
      },
      { kind: 'line', x: 70, y: 140, width: 1070, height: 0, color: '#cbd5e1', lineWidth: 1 },
    ]
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 260"><defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bae6fd" stop-opacity="0.9"/><stop offset="1" stop-color="#0ea5e9" stop-opacity="0.45"/></linearGradient><linearGradient id="shadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f172a" stop-opacity="0.05"/><stop offset="1" stop-color="#0f172a" stop-opacity="0.42"/></linearGradient></defs><path d="M18 174 160 78 326 111 208 194Z" fill="url(#shadow)"/><path d="M42 117 210 42 410 92 234 166Z" fill="#475569" stroke="#1e293b" stroke-width="4"/><path d="M70 119 216 58 216 136 70 190Z" fill="url(#glass)" stroke="#e0f2fe" stroke-width="4"/><path d="M216 58 380 99 380 160 216 136Z" fill="#fbbf24" fill-opacity="0.72" stroke="#fef3c7" stroke-width="4"/><path d="M65 197 216 143 386 172" fill="none" stroke="#334155" stroke-width="12" stroke-linecap="round"/><path d="M92 197v28m54-47v41m61-63v61m62-43v42m58-25v38" stroke="#334155" stroke-width="6"/><path d="M356 85 410 99v15l-54-14Z" fill="#f97316"/><path d="M36 232Q118 208 193 232T350 232" fill="none" stroke="#38bdf8" stroke-width="5" stroke-linecap="round"/><circle cx="412" cy="42" r="18" fill="#fb923c"/></svg>'
    const steps = [
      (callbacks: AgentStreamCallbacks) =>
        callbacks.onToolCall({ id: 'arch-read-before', name: 'read_drawboard', input: {} }),
      (callbacks: AgentStreamCallbacks) =>
        callbacks.onToolCall({
          id: 'arch-scene',
          name: 'build_drawboard_scene',
          input: { elements: scene },
        }),
      (callbacks: AgentStreamCallbacks) =>
        callbacks.onToolCall({
          id: 'arch-vector',
          name: 'add_vector_artwork',
          input: { svg, x: 360, y: 335 },
        }),
      (callbacks: AgentStreamCallbacks) =>
        callbacks.onToolCall({ id: 'arch-read-after', name: 'read_drawboard', input: {} }),
      (callbacks: AgentStreamCallbacks) =>
        callbacks.onToolCall({ id: 'arch-fit', name: 'zoom_to_fit', input: {} }),
    ]
    const transport: AgentTransport = {
      stream(request, callbacks) {
        requests.push(request)
        const turn = requests.length - 1
        queueMicrotask(() => {
          if (steps[turn]) steps[turn]!(callbacks)
          else
            callbacks.onDelta(
              'Created the layered cliffside house concept board, added the detailed vector elevation, inspected it, and fit the composition to the view.',
            )
          callbacks.onDone()
        })
        return { cancel: () => undefined }
      },
    }
    let resolveRun!: (result: { text: string; cancelled: boolean; turnLimit: boolean }) => void
    const completed = new Promise<{ text: string; cancelled: boolean; turnLimit: boolean }>(
      (resolve) => {
        resolveRun = resolve
      },
    )
    const loop = new AgentLoop({
      transport,
      skill: {
        id: 'drawboard-architecture-e2e',
        systemPrompt:
          'Execute architectural drawing briefs with the supplied vector and scene tools.',
        get tools() {
          return toolsForActiveRun
        },
        executeTool: (call) => executeBoardTool({ current: api as never }, call),
      },
      events: {
        onDone: resolveRun,
        onToolExecuted: ({ call, execution }) => {
          toolResults.push({
            name: call.name,
            isError: execution.isError,
            output: execution.output,
          })
        },
      },
      compaction: false,
      maxTurns: 8,
    })
    loop.run(prompt)
    const result = await Promise.race([
      completed,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('architecture agent run did not finish')), 5000),
      ),
    ])

    expect(result).toMatchObject({ cancelled: false, turnLimit: false })
    expect(requests).toHaveLength(6)
    expect(requests[0]!.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'read_drawboard',
        'build_drawboard_scene',
        'add_vector_artwork',
        'zoom_to_fit',
      ]),
    )
    expect(
      requests
        .slice(1)
        .every(
          (request) =>
            request.tools.map((tool) => tool.name).join('|') ===
            requests[0]!.tools.map((tool) => tool.name).join('|'),
        ),
    ).toBe(true)
    expect(toolResults.map((item) => item.name)).toEqual([
      'read_drawboard',
      'build_drawboard_scene',
      'add_vector_artwork',
      'read_drawboard',
      'zoom_to_fit',
    ])
    expect(toolResults.every((item) => !item.isError)).toBe(true)
    expect(toolResults[1]!.output).toContain('"created":31')
    expect(toolResults[3]!.output).toContain('Drawing has 32 element(s)')
    expect(api.getSceneElements()).toHaveLength(32)
    expect(api.getSceneElements().filter((element) => element.type === 'image')).toHaveLength(15)
    expect(Object.keys(api.getFiles())).toHaveLength(15)
    expect(excalidrawBoundary.restore).toHaveBeenCalledTimes(restoresBeforeRun + 4)
  })

  it('runs native web search and image search, then safely places a selected image on the board', async () => {
    class FakeImage {
      naturalWidth = 800
      naturalHeight = 450
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        this.onload?.()
      }
    }
    vi.stubGlobal('Image', FakeImage)
    const webSearch = vi.fn(async () => ({
      results: [
        {
          title: 'Cabin overview',
          url: 'https://example.test/cabin',
          snippet: 'A lakeside cabin.',
        },
      ],
      method: 'duckduckgo',
    }))
    const imageSearch = vi.fn(async () => ({
      images: [
        {
          title: 'Cabin photo',
          imageUrl: 'https://images.example.test/cabin.jpg',
          sourceUrl: 'https://example.test/photo',
          source: 'example.test',
          width: 800,
          height: 450,
        },
      ],
      method: 'duckduckgo',
    }))
    const fetchImage = vi.fn(async () => ({ base64: 'aGVsbG8=', mime: 'image/jpeg' }))
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { webSearch, imageSearch, fetchImage },
    })

    try {
      const prompt = 'Search the web for a real cabin photo and place it on the drawboard.'
      const api = boardApi()
      const requests: AgentStreamRequest[] = []
      const activity: string[] = []
      const baseSkill = {
        id: 'drawboard-search-e2e',
        systemPrompt: 'Search, select, and place real image assets with the available tools.',
        tools: BOARD_TOOL_DEFS,
        toolsForRequest: (instruction: string) => selectBoardTools(instruction, BOARD_TOOL_DEFS),
        buildContext: () => 'Drawboard test context.',
        executeTool: (call: Parameters<typeof executeBoardTool>[1]) =>
          executeBoardTool({ current: api as never }, call, () => [], undefined, fetchImage),
      }
      const skill = withImageSearch(withWebSearch(baseSkill))
      const transport: AgentTransport = {
        stream(request: AgentStreamRequest, callbacks: AgentStreamCallbacks) {
          requests.push(request)
          const turn = requests.length - 1
          queueMicrotask(() => {
            if (turn === 0)
              callbacks.onToolCall({
                id: 'web-1',
                name: 'web_search',
                input: { query: 'cabin photo' },
              })
            else if (turn === 1)
              callbacks.onToolCall({
                id: 'image-1',
                name: 'image_search',
                input: { query: 'lakeside cabin photo' },
              })
            else if (turn === 2)
              callbacks.onToolCall({
                id: 'place-1',
                name: 'add_board_image_from_url',
                input: {
                  imageUrl: 'https://images.example.test/cabin.jpg',
                  title: 'Cabin photo',
                  x: 80,
                  y: 90,
                },
              })
            else if (turn === 3)
              callbacks.onToolCall({ id: 'read-1', name: 'read_drawboard', input: {} })
            else
              callbacks.onDelta(
                'I searched for a cabin photo, placed it on the drawboard, and checked the result.',
              )
            callbacks.onDone()
          })
          return { cancel: () => undefined }
        },
      }
      let resolveRun!: (value: { text: string; cancelled: boolean; turnLimit: boolean }) => void
      const completed = new Promise<{ text: string; cancelled: boolean; turnLimit: boolean }>(
        (resolve) => {
          resolveRun = resolve
        },
      )
      const loop = new AgentLoop({
        transport,
        skill,
        events: {
          onDone: resolveRun,
          onToolExecuted: ({ call, execution }) =>
            activity.push(`${call.name}:${execution.isError ? 'error' : 'ok'}`),
        },
        compaction: false,
        maxTurns: 8,
      })
      loop.run(prompt)
      const result = await Promise.race([
        completed,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('search agent run did not finish')), 5000),
        ),
      ])

      expect(result).toMatchObject({ cancelled: false, turnLimit: false })
      expect(requests[0]!.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['web_search', 'image_search', 'add_board_image_from_url']),
      )
      expect(webSearch).toHaveBeenCalledWith('cabin photo', 5)
      expect(imageSearch).toHaveBeenCalledWith('lakeside cabin photo', 8)
      expect(fetchImage).toHaveBeenCalledWith('https://images.example.test/cabin.jpg')
      expect(activity).toEqual([
        'web_search:ok',
        'image_search:ok',
        'add_board_image_from_url:ok',
        'read_drawboard:ok',
      ])
      expect(api.getSceneElements()).toMatchObject([
        { type: 'image', x: 80, y: 90, width: 480, height: 270 },
      ])
      expect(Object.keys(api.getFiles())).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
      delete (window as Window & { electronAPI?: unknown }).electronAPI
    }
  })

  it('builds requested UML views with specialist schemas, validates them, and keeps follow-up context focused', async () => {
    const prompt =
      'Draw an editable UML sequence diagram, a UML use-case diagram, and a requirements traceability diagram for requirements engineering.'
    const api = boardApi()
    const requests: AgentStreamRequest[] = []
    const results: Array<{ name: string; output: string; isError?: boolean }> = []
    const routedTools = selectBoardTools(prompt, BOARD_TOOL_DEFS)
    const transport: AgentTransport = {
      stream(request, callbacks) {
        requests.push(request)
        const turn = requests.length - 1
        queueMicrotask(() => {
          if (turn === 0)
            callbacks.onToolCall({
              id: 'requirements-sequence',
              name: 'build_sequence_diagram',
              input: {
                title: 'Requirements review sequence',
                participants: [
                  { id: 'stakeholder', label: 'Stakeholder' },
                  { id: 'analyst', label: 'Analyst' },
                  { id: 'assistant', label: 'AI assistant' },
                  { id: 'team', label: 'Delivery team' },
                ],
                messages: [
                  { from: 'stakeholder', to: 'analyst', label: 'Goals, rules, constraints' },
                  { from: 'analyst', to: 'assistant', label: 'Context and notes' },
                  {
                    from: 'assistant',
                    to: 'analyst',
                    label: 'Draft requirements and gaps',
                    kind: 'return',
                  },
                  { from: 'analyst', to: 'team', label: 'Approved baseline and trace links' },
                ],
              },
            })
          else if (turn === 1)
            callbacks.onToolCall({
              id: 'requirements-usecase',
              name: 'build_use_case_diagram',
              input: {
                title: 'Requirements engineering use cases',
                system: 'Requirements management process',
                actors: [
                  { id: 'stakeholder', label: 'Stakeholder' },
                  { id: 'analyst', label: 'Analyst', side: 'right' },
                ],
                useCases: [
                  { id: 'goals', label: 'Set goals and constraints' },
                  { id: 'elicit', label: 'Elicit requirements' },
                  { id: 'review', label: 'Review and validate' },
                  { id: 'approve', label: 'Prioritize and approve' },
                  { id: 'trace', label: 'Manage changes and trace' },
                ],
                associations: [
                  { actor: 'stakeholder', useCase: 'goals' },
                  { actor: 'stakeholder', useCase: 'review' },
                  { actor: 'analyst', useCase: 'elicit' },
                  { actor: 'analyst', useCase: 'approve' },
                  { actor: 'analyst', useCase: 'trace' },
                ],
              },
            })
          else if (turn === 2)
            callbacks.onToolCall({
              id: 'requirements-traceability',
              name: 'build_requirement_diagram',
              input: {
                title: 'Requirements traceability',
                system: 'Requirements lifecycle',
                requirements: [
                  {
                    id: 'FR-01',
                    label: 'Capture stakeholder goals',
                    kind: 'functional',
                    priority: 'high',
                  },
                  {
                    id: 'NFR-01',
                    label: 'Keep an auditable history',
                    kind: 'quality',
                    priority: 'medium',
                  },
                ],
                stakeholders: [{ id: 'owner', label: 'Product owner', side: 'left' }],
                relations: [
                  { from: 'owner', to: 'FR-01', kind: 'satisfies' },
                  { from: 'FR-01', to: 'NFR-01', kind: 'traces' },
                ],
              },
            })
          else
            callbacks.onDelta(
              'Created the sequence, use-case, and requirements traceability diagrams with validated links.',
            )
          callbacks.onDone()
        })
        return { cancel: () => undefined }
      },
    }
    let resolveRun!: (value: { text: string; cancelled: boolean; turnLimit: boolean }) => void
    const completed = new Promise<{ text: string; cancelled: boolean; turnLimit: boolean }>(
      (resolve) => {
        resolveRun = resolve
      },
    )
    const loop = new AgentLoop({
      transport,
      skill: {
        id: 'drawboard-native-diagram-e2e',
        systemPrompt:
          'Use each matching dedicated diagram tool and preserve the supplied semantics.',
        get tools() {
          return routedTools
        },
        executeTool: async (call) => {
          const result = await executeBoardTool({ current: api as never }, call)
          results.push({ name: call.name, output: result.output, isError: result.isError })
          return result
        },
      },
      events: { onDone: resolveRun },
      compaction: false,
      maxTurns: 6,
    })
    loop.run(prompt)
    const outcome = await Promise.race([
      completed,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('native diagram run did not finish')), 5000),
      ),
    ])

    expect(outcome).toMatchObject({ cancelled: false, turnLimit: false })
    expect(requests).toHaveLength(4)
    expect(requests[0]!.tools.map((tool) => tool.name)).toEqual([
      'build_sequence_diagram',
      'build_use_case_diagram',
      'build_requirement_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(
      requests
        .slice(1)
        .every(
          (request) =>
            request.tools.map((tool) => tool.name).join('|') ===
            requests[0]!.tools.map((tool) => tool.name).join('|'),
        ),
    ).toBe(true)
    expect(results.map((result) => result.name)).toEqual([
      'build_sequence_diagram',
      'build_use_case_diagram',
      'build_requirement_diagram',
    ])
    expect(
      results.every(
        (result) => !result.isError && JSON.parse(result.output).selfCheck.referencesValid,
      ),
    ).toBe(true)
    const elements = api.getSceneElements()
    expect(elements.some((element) => element.type === 'arrow')).toBe(true)
    expect(elements.some((element) => element.type === 'ellipse')).toBe(true)
    expect(
      elements.some(
        (element) => element.type === 'text' && typeof element.containerId === 'string',
      ),
    ).toBe(true)
    expect(elements.length).toBeGreaterThan(35)
    expect(
      elements.every((element) => Array.isArray((element as Record<string, unknown>).groupIds)),
    ).toBe(true)
  })

  it('renders real Mermaid source in strict mode and adds a visible board object', async () => {
    const api = boardApi()
    const svgPrototype = window.SVGElement.prototype as unknown as Record<string, unknown>
    const textLengthDescriptor = Object.getOwnPropertyDescriptor(
      svgPrototype,
      'getComputedTextLength',
    )
    const boundingBoxDescriptor = Object.getOwnPropertyDescriptor(svgPrototype, 'getBBox')
    Object.defineProperty(svgPrototype, 'getComputedTextLength', {
      configurable: true,
      value(this: SVGElement) {
        return Math.min(600, (this.textContent?.length ?? 0) * 8)
      },
    })
    Object.defineProperty(svgPrototype, 'getBBox', {
      configurable: true,
      value(this: SVGElement) {
        return { x: 0, y: 0, width: Math.min(600, (this.textContent?.length ?? 0) * 8), height: 16 }
      },
    })
    let result: Awaited<ReturnType<typeof executeBoardTool>>
    try {
      result = await executeBoardTool(
        { current: api as never },
        {
          id: 'mermaid-render-1',
          name: 'render_mermaid_diagram',
          input: {
            source:
              'flowchart LR\n  Start([Start]) --> Review{Approved?}\n  Review -->|Yes| Done([Done])\n  Review -->|No| Start',
          },
        },
      )
    } finally {
      if (textLengthDescriptor)
        Object.defineProperty(svgPrototype, 'getComputedTextLength', textLengthDescriptor)
      else Reflect.deleteProperty(svgPrototype, 'getComputedTextLength')
      if (boundingBoxDescriptor)
        Object.defineProperty(svgPrototype, 'getBBox', boundingBoxDescriptor)
      else Reflect.deleteProperty(svgPrototype, 'getBBox')
    }
    expect(result.isError, result.output).not.toBe(true)
    expect(result.mutated).toBe(true)
    expect(JSON.parse(result.output)).toMatchObject({
      diagramType: 'mermaid',
      sourceValidated: true,
    })
    expect(api.getSceneElements().length).toBeGreaterThan(0)
    const images = api.getSceneElements().filter((element) => element.type === 'image')
    expect(Object.keys(api.getFiles()).length).toBe(images.length)
    expect(
      api
        .getSceneElements()
        .some(
          (element) =>
            element.type === 'text' || element.type === 'line' || element.type === 'rectangle',
        ),
    ).toBe(true)
  }, 15000)

  it('executes chart, Gantt, heatmap, and fixed-width ASCII tools through one focused agent run', async () => {
    // Earlier tests clear their own globals; restore the decoder stub this
    // polygon-chart path needs so the raster fallback is deterministic.
    vi.stubGlobal('Image', TestImage as never)
    const prompt = 'Build a donut chart, a Gantt chart, a heatmap chart, and an ASCII diagram.'
    const api = boardApi()
    const requests: AgentStreamRequest[] = []
    const executions: Array<{ name: string; output: string; isError?: boolean }> = []
    const tools = selectBoardTools(prompt, BOARD_TOOL_DEFS)
    const expectedNames = [
      'build_chart_diagram',
      'build_gantt_diagram',
      'build_heatmap_chart',
      'build_text_diagram',
    ]
    const transport: AgentTransport = {
      stream(request, callbacks) {
        requests.push(request)
        const index = requests.length - 1
        const calls: Array<{ name: string; input: Record<string, unknown> }> = [
          {
            name: 'build_chart_diagram',
            input: {
              chartType: 'donut',
              categories: ['Open', 'Review', 'Approved'],
              series: [{ name: 'Requirements', values: [4, 3, 5] }],
            },
          },
          {
            name: 'build_gantt_diagram',
            input: {
              unit: 'weeks',
              tasks: [
                { id: 'elicit', label: 'Elicit needs', start: 0, duration: 3 },
                { id: 'validate', label: 'Validate baseline', start: 3, duration: 2 },
              ],
              dependencies: [{ from: 'elicit', to: 'validate', label: 'FS' }],
            },
          },
          {
            name: 'build_heatmap_chart',
            input: {
              columns: ['Clarity', 'Coverage', 'Risk'],
              rows: [
                { label: 'Stakeholder', values: [3, 5, 2] },
                { label: 'Analyst', values: [5, 4, 1] },
              ],
            },
          },
          {
            name: 'build_text_diagram',
            input: {
              title: 'ASCII review flow',
              source: 'Stakeholder     Analyst\n     |---needs--->|\n     |<--review---|',
            },
          },
        ]
        queueMicrotask(() => {
          if (calls[index]) callbacks.onToolCall({ id: `typed-${index}`, ...calls[index]! })
          else
            callbacks.onDelta(
              'Built the requested donut chart, Gantt plan, heatmap, and aligned ASCII diagram.',
            )
          callbacks.onDone()
        })
        return { cancel: () => undefined }
      },
    }
    let resolveRun!: (value: { text: string; cancelled: boolean; turnLimit: boolean }) => void
    const completed = new Promise<{ text: string; cancelled: boolean; turnLimit: boolean }>(
      (resolve) => {
        resolveRun = resolve
      },
    )
    const loop = new AgentLoop({
      transport,
      skill: {
        id: 'drawboard-chart-e2e',
        systemPrompt: 'Use every matching dedicated diagram tool and preserve chart data exactly.',
        get tools() {
          return tools
        },
        executeTool: async (call) => {
          const result = await executeBoardTool({ current: api as never }, call)
          executions.push({ name: call.name, output: result.output, isError: result.isError })
          return result
        },
      },
      events: { onDone: resolveRun },
      compaction: false,
      maxTurns: 7,
    })
    loop.run(prompt)
    const outcome = await Promise.race([
      completed,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `chart agent run did not finish after ${requests.length} turns: ${JSON.stringify(executions)}`,
              ),
            ),
          15000,
        ),
      ),
    ])

    expect(outcome).toMatchObject({ cancelled: false, turnLimit: false })
    expect(requests).toHaveLength(expectedNames.length + 1)
    const routedNames = [...expectedNames, 'read_drawboard', 'inspect_board_visual']
    expect(requests[0]!.tools.map((tool) => tool.name)).toEqual(routedNames)
    expect(
      requests.every(
        (request) => request.tools.map((tool) => tool.name).join('|') === routedNames.join('|'),
      ),
    ).toBe(true)
    expect(executions.map((item) => item.name)).toEqual(expectedNames)
    expect(
      executions.every(
        (item) => !item.isError && JSON.parse(item.output).selfCheck.itemLimitSatisfied,
      ),
      JSON.stringify(executions),
    ).toBe(true)
    expect(api.getSceneElements().some((element) => element.type === 'image')).toBe(true)
    expect(
      api
        .getSceneElements()
        .some(
          (element) =>
            element.type === 'text' &&
            element.fontFamily === 3 &&
            String(element.text).includes('Stakeholder'),
        ),
    ).toBe(true)
    expect(Object.keys(api.getFiles()).length).toBe(
      api.getSceneElements().filter((element) => element.type === 'image').length,
    )
  }, 15000)
})
