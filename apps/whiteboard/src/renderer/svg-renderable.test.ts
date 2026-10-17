import { describe, expect, it, vi } from 'vitest'

vi.mock('@excalidraw/excalidraw', () => ({
  restore: ({ elements }: { elements: unknown[] }) => ({ elements, appState: {} }),
  exportToBlob: async () => new Blob(['x'], { type: 'image/png' }),
  exportToSvg: async () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
}))

import { sanitizeVectorSvg } from './board-engine/ai-tools'

/**
 * Diagnostic for the empty-image report: a data URL only paints if the sanitised
 * SVG is well-formed XML *and* carries the SVG namespace, so both are asserted
 * for the shapes real models emit.
 */
describe('sanitised SVG is renderable as an image', () => {
  const samples: Record<string, string> = {
    gradient:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g"><stop offset="0" stop-color="#dbeafe"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs><rect width="200" height="120" fill="url(#g)"/></svg>',
    mountain:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><path d="M0 300 L180 80 L360 300 Z" fill="#1d4ed8"/></svg>',
    plain:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50"><circle cx="25" cy="25" r="20" fill="#f59e0b"/></svg>',
  }

  for (const [name, svg] of Object.entries(samples)) {
    it(`keeps ${name} well-formed with the SVG namespace`, () => {
      const out = sanitizeVectorSvg(svg)
      console.log(`[svg:${name}] out =`, out.svg.slice(0, 240))
      expect(out.svg).toContain('xmlns="http://www.w3.org/2000/svg"')
      // must reparse as XML, or <img src="data:image/svg+xml,..."> shows nothing
      const doc = new DOMParser().parseFromString(out.svg, 'image/svg+xml')
      const failed = doc.querySelector('parsererror')
      expect(failed, `parsererror for ${name}: ${failed?.textContent ?? ''}`).toBeNull()
      expect(doc.documentElement.localName).toBe('svg')
    })
  }

  it('produces a base64 data URL the browser can decode', () => {
    const out = sanitizeVectorSvg(samples.plain!)
    const bytes = new TextEncoder().encode(out.svg)
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
    const url = `data:image/svg+xml;base64,${btoa(binary)}`
    expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true)
    // round-trips back to the same XML
    const decoded = atob(url.slice('data:image/svg+xml;base64,'.length))
    expect(decoded).toBe(out.svg)
  })
})
