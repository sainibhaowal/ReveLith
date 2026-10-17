/**
 * Live Draw end-to-end through the authenticated Codex CLI app-server.
 *
 * Run with REVELITH_LIVE_E2E=1 npx vitest run src/renderer/live-codex-draw.e2e.test.ts
 * from apps/drawboard. It asks the configured Codex model to draw, executes
 * its real Draw tool call against an isolated board, renders the resulting SVG
 * in Chromium, and asks Codex Vision to critique the actual rendered image.
 */
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { AgentMessage, AgentToolCall } from '@revelith/agent-core'
import {
  streamForProvider,
  type AiProviderConfig,
  type AiSettings,
  type AiStreamChunk,
  type AiStreamRequest,
} from '@revelith/ai-provider'
import { reviewBoardWithChatModel } from './ai/board-vision'

const preview = vi.hoisted(() => ({ png: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }))

vi.mock('@excalidraw/excalidraw', () => ({
  restore: ({ elements }: { elements: unknown[] }) => ({ elements, appState: {} }),
  exportToBlob: async () => new Blob([preview.png], { type: 'image/png' }),
  exportToSvg: async () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
}))

import { BOARD_TOOL_DEFS, executeBoardTool } from './board-engine/ai-tools'

const LIVE = process.env.REVELITH_LIVE_E2E === '1'
const SETTINGS_PATH = `${process.env.APPDATA ?? ''}\\ReveLith\\ai-settings.json`

function liveApi() {
  let elements: Array<Record<string, unknown>> = []
  const files: Record<string, { dataURL: string; mimeType: string }> = {}
  return {
    getSceneElements: () => elements,
    getFiles: () => files,
    getAppState: () => ({}),
    updateScene: ({ elements: next }: { elements?: Array<Record<string, unknown>> }) => {
      if (Array.isArray(next)) elements = next
    },
    addFiles: (next: Array<{ id: string; dataURL: string; mimeType: string }>) => {
      for (const file of next) files[file.id] = file
    },
    _current: () => elements,
  }
}

function liveCodexVisionBridge() {
  const listeners = new Set<(chunk: AiStreamChunk) => void>()
  const controllers = new Map<string, AbortController>()
  return {
    onAiStream(handler: (chunk: AiStreamChunk) => void) {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
    async aiStream(request: AiStreamRequest) {
      const controller = new AbortController()
      controllers.set(request.requestId, controller)
      const emit = (chunk: AiStreamChunk) => {
        for (const listener of listeners) listener(chunk)
      }
      const config = request.settings.providers[request.settings.provider]
      try {
        await streamForProvider(
          request.settings.provider,
          config,
          request.system,
          request.messages,
          request.tools ?? [],
          request.maxTokens ?? 1800,
          {
            signal: controller.signal,
            onDelta: (text) => emit({ requestId: request.requestId, type: 'delta', text }),
            onToolCall: () => {
              throw new Error('Visual review unexpectedly requested a tool.')
            },
          },
        )
        emit({ requestId: request.requestId, type: 'done' })
      } catch (error) {
        emit({
          requestId: request.requestId,
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        controllers.delete(request.requestId)
      }
    },
    async aiStreamCancel(requestId: string) {
      controllers.get(requestId)?.abort()
    },
  }
}

async function callCodexTool(prompt: string, signal: AbortSignal): Promise<AgentToolCall> {
  const settings = JSON.parse(await readFile(SETTINGS_PATH, 'utf8')) as {
    provider?: string
    providers?: Record<string, { apiKey?: string; model?: string; cliPath?: string }>
  }
  if (settings.provider !== 'codex')
    throw new Error(`Configured chat provider is ${settings.provider ?? 'missing'}, not Codex.`)
  const stored = settings.providers?.codex
  if (!stored) throw new Error('The saved Codex provider configuration is missing.')
  const config: AiProviderConfig = {
    apiKey: stored.apiKey ?? '',
    model: stored.model ?? '',
    cliPath: stored.cliPath,
  }
  const tool = BOARD_TOOL_DEFS.find((candidate) => candidate.name === 'add_vector_artwork')!
  const calls: AgentToolCall[] = []
  let responseText = ''
  await streamForProvider(
    'codex',
    config,
    'You are ReveLith Draw. Create the requested illustration by calling add_vector_artwork with valid, complete SVG. The SVG must be self-contained and use no external resources.',
    [{ role: 'user', text: prompt }],
    [tool],
    6000,
    {
      signal,
      onDelta: (text) => {
        responseText += text
      },
      onToolCall: (call) => calls.push(call),
    },
  )
  const call = calls.find((candidate) => candidate.name === 'add_vector_artwork')
  if (!call)
    throw new Error(
      `Codex did not call add_vector_artwork. Response: ${responseText.slice(0, 500)}`,
    )
  return call
}

async function renderSvg(svg: string): Promise<Uint8Array> {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<main style="width:1200px;height:800px;background:#fff;display:grid;place-items:center">${svg}</main>`,
    )
    const image = page.locator('svg').first()
    await image.waitFor({ state: 'visible' })
    return await page.screenshot({ type: 'png' })
  } finally {
    await browser.close()
  }
}

describe.skipIf(!LIVE)('LIVE Draw with authenticated Codex CLI', () => {
  it('draws through the real board tool and visually reviews its rendered result', async () => {
    const api = liveApi()
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new Error('Live Codex Draw check timed out after 240 seconds.')),
      240_000,
    )
    try {
      const prompt =
        'Draw a polished, professional 3D-style mountain cabin scene: layered distant mountains, pine forest, a clear lake, a timber cabin in foreground with a pitched roof, visible door and multiple carefully detailed warm glowing windows, coherent perspective, balanced composition, refined linework and limited natural colors. Keep it legible and visually rich.'
      const call = await callCodexTool(prompt, controller.signal)
      console.log(
        `[live-codex] model: configured Codex; tool: ${call.name}; SVG bytes: ${String(call.input.svg ?? '').length}`,
      )
      expect(typeof call.input.svg).toBe('string')
      expect((call.input.svg as string).length).toBeGreaterThan(300)

      // jsdom has no rasterizer. Keep the real board executor in the path and
      // supply only the browser canvas boundary it needs to store its PNG.
      vi.stubGlobal(
        'Image',
        class {
          onload: (() => void) | null = null
          set src(_value: string) {
            queueMicrotask(() => this.onload?.())
          }
        },
      )
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: () => undefined,
      } as never)
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p2sAAAAASUVORK5CYII=',
      )
      const result = await executeBoardTool({ current: api as never }, call)
      console.log('[live-codex] board tool:', result.summary, result.output.slice(0, 500))
      expect(result.isError, result.output).toBeFalsy()
      expect(result.mutated).toBe(true)
      expect(api._current().length).toBeGreaterThan(0)

      const png = await renderSvg(call.input.svg as string)
      expect(png[0]).toBe(0x89)
      const reviewRequirements =
        'Inspect this rendered drawing against the requested professional mountain cabin scene. Report concrete visible strengths and any important flaws in composition, perspective, cabin details, contrast, or legibility. Be specific; do not claim to modify it.'
      let critique = ''
      const storedReviewSettings = JSON.parse(await readFile(SETTINGS_PATH, 'utf8')) as {
        providers: { codex: { apiKey?: string; model?: string; cliPath?: string } }
      }
      const reviewConfig: AiProviderConfig = {
        apiKey: storedReviewSettings.providers.codex.apiKey ?? '',
        model: storedReviewSettings.providers.codex.model ?? '',
        cliPath: storedReviewSettings.providers.codex.cliPath,
      }
      const reviewSettings: AiSettings = {
        provider: 'codex',
        providers: { codex: reviewConfig } as AiSettings['providers'],
      }
      const visionBridge = liveCodexVisionBridge()
      preview.png = new Uint8Array(png)
      const inspect = await executeBoardTool(
        { current: api as never },
        {
          id: 'inspect-live-board',
          name: 'inspect_board_visual',
          input: { requirements: reviewRequirements },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        (op) =>
          reviewBoardWithChatModel(visionBridge, reviewSettings, op.mediaUrls[0]!, op.requirements),
      )
      critique = inspect.output
      console.log('[live-codex] inspect_board_visual:', inspect.summary, critique.slice(0, 1200))
      expect(inspect.isError, inspect.output).toBeFalsy()
      expect(critique.trim().length).toBeGreaterThan(40)

      // Feed the real visual findings back to the model and rebuild on the
      // isolated board. This verifies the inspect -> revise -> draw loop.
      const revision = await callCodexTool(
        `Revise the existing illustration to address this visual review. Correct the roof planes and eave lines so they align with the cabin walls and gable; make the front and side perspective consistent; reposition the door/steps and make the windows feel deliberate and proportionate. Preserve the strong landscape, subject, palette, and overall composition. Return the complete revised SVG using add_vector_artwork.\n\nVisual review:\n${critique}\n\nOriginal SVG:\n${call.input.svg}`,
        controller.signal,
      )
      api.updateScene({ elements: [] })
      const revised = await executeBoardTool({ current: api as never }, revision)
      console.log('[live-codex] repair pass:', revised.summary, revised.output.slice(0, 400))
      expect(revised.isError, revised.output).toBeFalsy()
      expect(revised.mutated).toBe(true)
      expect(api._current().length).toBeGreaterThan(0)

      const revisedPng = await renderSvg(revision.input.svg as string)
      preview.png = new Uint8Array(revisedPng)
      const revisedMessages: AgentMessage[] = [
        {
          role: 'user',
          text: 'Compare image 1 (original) with image 2 (revised) specifically for roof-to-wall perspective, gable and eave alignment, door and step placement, and window proportions. State which named defects visibly improved and identify any remaining issues.',
          images: [png, revisedPng].map((image) => ({
            base64: Buffer.from(image).toString('base64'),
            mime: 'image/png',
          })),
        },
      ]
      let revisedCritique = ''
      await streamForProvider(
        'codex',
        reviewConfig,
        'You are a careful visual reviewer. Compare the supplied images against the listed corrections and describe only visible evidence.',
        revisedMessages,
        [],
        1400,
        {
          signal: controller.signal,
          onDelta: (text) => {
            revisedCritique += text
          },
          onToolCall: () => {
            throw new Error('Visual comparison unexpectedly requested a tool.')
          },
        },
      )
      console.log('[live-codex] revised-image critique:', revisedCritique.slice(0, 1000))
      expect(revisedCritique.trim().length).toBeGreaterThan(40)
    } finally {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
      clearTimeout(timeout)
    }
  }, 300_000)
})
