/**
 * Live end-to-end checks against the authenticated Codex CLI model.
 *
 *   $env:REVELITH_LIVE_E2E=1
 *   npx vitest run src/renderer/live-codex-sketch.e2e.test.ts
 */
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { streamForProvider, type AiProviderConfig } from '@revelith/ai-provider'
import type { AgentToolCall } from '@revelith/agent-core'

// ai-tools pulls in Excalidraw, whose dependency chain needs a JSON import
// attribute Node's ESM loader rejects. The board executor remains real.
vi.mock('@excalidraw/excalidraw', () => ({
  restore: ({ elements }: { elements: unknown[] }) => ({ elements, appState: {} }),
  exportToBlob: async () => new Blob(['x'], { type: 'image/png' }),
  exportToSvg: async () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
}))

import { BOARD_TOOL_DEFS, executeBoardTool } from './board-engine/ai-tools'
import {
  collectSketchModels,
  solveDraggedSketches,
  rewriteLine,
  readSketchModel,
} from './board-engine/sketch-live'

const LIVE = process.env.REVELITH_LIVE_E2E === '1'
const SETTINGS_PATH = `${process.env.APPDATA ?? ''}\\ReveLith\\ai-settings.json`

function liveApi() {
  let elements: Array<Record<string, unknown>> = []
  return {
    getSceneElements: () => elements,
    getFiles: () => ({}),
    updateScene: ({ elements: next }: { elements?: Array<Record<string, unknown>> }) => {
      if (Array.isArray(next)) elements = next
    },
    addFiles: () => {},
    _current: () => elements,
  }
}

async function codexConfig(): Promise<AiProviderConfig> {
  const settings = JSON.parse(await readFile(SETTINGS_PATH, 'utf8')) as {
    provider?: string
    providers?: Record<string, { apiKey?: string; model?: string; cliPath?: string }>
  }
  if (settings.provider !== 'codex')
    throw new Error(`Configured chat provider is ${settings.provider ?? 'missing'}, not Codex.`)
  const config = settings.providers?.codex
  if (!config) throw new Error('The saved Codex provider configuration is missing.')
  return { apiKey: config.apiKey ?? '', model: config.model ?? '', cliPath: config.cliPath }
}

async function askCodexTool(userText: string, toolName: string): Promise<AgentToolCall | null> {
  const config = await codexConfig()
  const tool = BOARD_TOOL_DEFS.find((definition) => definition.name === toolName)
  if (!tool) throw new Error(`Missing Draw tool definition ${toolName}.`)
  const calls: AgentToolCall[] = []
  let responseText = ''
  await streamForProvider(
    'codex',
    config,
    'You draw on a ReveLith Draw board. Use the listed tool and follow supplied geometry and constraints exactly.',
    [{ role: 'user', text: userText }],
    [tool],
    6000,
    {
      signal: new AbortController().signal,
      onDelta: (text) => {
        responseText += text
      },
      onToolCall: (call) => calls.push(call),
    },
  )
  if (!calls[0])
    console.log('[live-codex] model response without a tool call:', responseText.slice(0, 500))
  return calls[0] ?? null
}

describe.skipIf(!LIVE)('LIVE Draw tools with authenticated Codex CLI', () => {
  it('serves the configured Codex model', async () => {
    const config = await codexConfig()
    let response = ''
    await streamForProvider(
      'codex',
      config,
      'Answer briefly and exactly as requested.',
      [{ role: 'user', text: 'Reply with exactly: Draw is ready.' }],
      [],
      256,
      {
        signal: new AbortController().signal,
        onDelta: (text) => {
          response += text
        },
        onToolCall: () => {
          throw new Error('The readiness check unexpectedly requested a tool.')
        },
      },
    )
    console.log(
      `[live-codex] configured model ${config.model || '(CLI default)'} responded:`,
      response.trim(),
    )
    expect(response.trim()).toContain('Draw is ready')
  }, 180_000)

  it('draws and re-solves a constrained dimensioned sketch through real Draw tools', async () => {
    const api = liveApi()
    const call = await askCodexTool(
      'Draw a horizontal bar exactly 80 mm long, pinned at its left end, with a dimension showing its length. ' +
        'Call build_drawboard_scene with ONE sketch item using this exact structure: ' +
        '{"kind":"sketch","x":100,"y":100,"scale":1,"units":"mm",' +
        '"sketchPoints":[{"id":"p1","x":0,"y":0,"fixed":true},{"id":"p2","x":10,"y":4}],' +
        '"constraints":[{"kind":"fixed","point":"p1"},{"kind":"distance","a":"p1","b":"p2","value":80}],' +
        '"segments":[{"a":"p1","b":"p2"}],"dimensions":[{"a":"p1","b":"p2"}]}. ' +
        'Use exactly these keys and values.',
      'build_drawboard_scene',
    )
    expect(call, 'Codex must emit a build_drawboard_scene tool call').toBeTruthy()
    if (!call) throw new Error('Codex did not emit the required Draw tool call.')
    console.log(
      '[live-codex] sketch tool call:',
      call.name,
      JSON.stringify(call.input).slice(0, 700),
    )

    const started = Date.now()
    const result = await executeBoardTool({ current: api as never }, call)
    console.log(
      `[live-codex] tool executed in ${Date.now() - started}ms ->`,
      result.output?.slice(0, 600),
    )
    expect(result.isError, `tool errored: ${result.output}`).toBeFalsy()
    expect(result.mutated).toBe(true)

    const elements = api._current()
    expect(elements.length).toBeGreaterThan(0)
    const models = collectSketchModels(elements as never)
    console.log('[live-codex] sketches on the board:', models.length)
    expect(models.length).toBeGreaterThan(0)
    for (const model of models) {
      expect(model.constraints.length).toBeGreaterThan(0)
      expect(model.segments.length).toBeGreaterThan(0)
    }

    const model = models[0]!
    const link = model.segments[0]!
    const dragged = (elements as never as Array<Record<string, unknown>>).map((element) =>
      String(element.id) === link.elementId
        ? (rewriteLine(
            element as never,
            [model.originX, model.originY],
            [model.originX + 400, model.originY + 250],
          ) as unknown as Record<string, unknown>)
        : element,
    )
    const settled = solveDraggedSketches(dragged as never)
    expect(settled).not.toBeNull()
    if (!settled) throw new Error('The constrained sketch did not re-solve after dragging.')
    const segment = settled.find((element) => element.id === link.elementId)!
    const carried = readSketchModel(segment as never)
    expect(carried).toBeTruthy()
    expect(solveDraggedSketches(settled)).toBeNull()
    console.log('[live-codex] drag/re-solve stable; points:', JSON.stringify(carried?.points))
  }, 180_000)
})
