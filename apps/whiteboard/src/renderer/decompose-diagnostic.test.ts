import { describe, expect, it, vi } from 'vitest'

// ai-tools pulls in Excalidraw; jsdom decodes nothing.
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
  restore: ({ elements }: { elements: unknown[] }) => ({ elements, appState: {} }),
  exportToBlob: async () => new Blob(['x'], { type: 'image/png' }),
  exportToSvg: async () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
}))

import { executeBoardTool } from './board-engine/ai-tools'

function mockApi() {
  let elements: Array<Record<string, unknown>> = []
  const files: Array<Record<string, unknown>> = []
  return {
    getSceneElements: () => elements,
    getAppState: () => ({ width: 1200, height: 800 }),
    getFiles: () => ({}),
    updateScene: ({ elements: next }: { elements?: Array<Record<string, unknown>> }) => {
      if (Array.isArray(next)) elements = next
    },
    addFiles: (next: Array<Record<string, unknown>>) => {
      files.push(...next)
    },
    _current: () => elements,
    _files: () => files,
  }
}

const run = (api: ReturnType<typeof mockApi>, svg: string) =>
  executeBoardTool(
    { current: api as never },
    { name: 'add_vector_artwork', input: { svg, x: 80, y: 80 } } as never,
  )

/**
 * A model asked for a mountain scene with a gradient sky emits something very
 * close to this. If it decomposes, the user gets editable shapes; if it falls
 * back, they get a picture. The brief report said they got a picture, so this
 * pins down which construct caused it.
 */
const realistic = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#BAE6FD"/>
      <stop offset="60%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#1E3A8A"/>
    </linearGradient>
    <linearGradient id="far" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#94A3B8"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>
    <radialGradient id="sun"><stop offset="0%" stop-color="#FEF08A"/><stop offset="100%" stop-color="#F59E0B"/></radialGradient>
  </defs>
  <rect x="0" y="0" width="1024" height="768" fill="url(#sky)"/>
  <circle cx="820" cy="140" r="54" fill="url(#sun)"/>
  <path d="M0 520 L240 300 L470 520 Z" fill="url(#far)"/>
  <path d="M300 560 L560 320 L820 560 Z" fill="#475569"/>
  <polygon points="0,768 0,600 1024,600 1024,768" fill="#334155"/>
  <polygon points="120,600 150,520 180,600" fill="#166534"/>
  <polygon points="200,610 240,500 280,610" fill="#15803D"/>
</svg>`

const withStyle = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <style>.a{fill:#2563eb}.b{fill:#f59e0b}</style>
  <rect class="a" x="0" y="0" width="100" height="100"/>
  <circle class="b" cx="140" cy="60" r="40"/>
</svg>`

const withPattern = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs><pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#eee"/></pattern></defs>
  <rect x="0" y="0" width="200" height="200" fill="url(#p)"/>
</svg>`

const withTurbulence = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4"/></filter></defs>
  <rect x="0" y="0" width="200" height="200" fill="#2563eb" filter="url(#grain)"/>
</svg>`

describe('add_vector_artwork decomposition of realistic model output', () => {
  it('decomposes a layered gradient landscape into editable shapes', async () => {
    const api = mockApi()
    const result = await run(api, realistic)
    console.log('[decompose] summary:', result.summary)
    console.log('[decompose] output :', result.output?.slice(0, 300))
    console.log('[decompose] kinds  :', api._current().map((element) => element.type).join(','))
    expect(result.isError, result.output).toBeFalsy()
    // a picture here means the user cannot edit anything they asked for
    expect(result.summary, `fell back to an image: ${result.output}`).toContain('editable shapes')
  })

  it('reports what a pattern fill does', async () => {
    const api = mockApi()
    const result = await run(api, withPattern)
    console.log('[pattern] output:', result.output?.slice(0, 260))
    expect(result.isError, result.output).toBeFalsy()
    // a fallback must say WHY it stopped being editable
    expect(result.output).toContain('pattern')
    expect(result.output).toContain('"editable":false')
  })

  it('tells the model what to do instead of a bare <style> rejection', async () => {
    const api = mockApi()
    const result = await run(api, withStyle)
    console.log('[style] output:', result.output?.slice(0, 200))
    expect(result.isError).toBe(true)
    // the retry needs the fix, not just the refusal
    expect(result.output).toContain('<style> blocks are not supported')
    expect(result.output).toContain('style="fill:')
  })

  it('keeps an unapproximable filter as one image rather than guessing', async () => {
    const api = mockApi()
    const result = await run(api, withTurbulence)
    console.log('[turbulence] output:', result.output?.slice(0, 260))
    expect(result.isError, result.output).toBeFalsy()
    expect(result.summary).toContain('vector artwork')
    expect(result.output).toContain('feTurbulence')
  })
})
