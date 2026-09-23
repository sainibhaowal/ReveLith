import { describe, expect, it } from 'vitest'
import {
  PNG_CAPTURE_MAX_HEIGHT,
  PNG_CAPTURE_MIN_HEIGHT,
  PNG_CAPTURE_WIDTH,
  computeCaptureSize,
  pngDefaultPath,
  sanitizeExportBaseName,
} from '../src/main/png-export'
import { buildPrintHtml } from '../src/renderer/export/printHtml'

describe('png export file naming', () => {
  it('strips path-unsafe characters like the main-process save flow', () => {
    expect(sanitizeExportBaseName('my/doc: v2?', 'Untitled')).toBe('my_doc_ v2_')
  })

  it('falls back when the name is empty', () => {
    expect(sanitizeExportBaseName('   ', 'Untitled')).toBe('Untitled')
    expect(sanitizeExportBaseName(undefined, 'Untitled')).toBe('Untitled')
  })

  it('bounds the length to 80 chars', () => {
    expect(sanitizeExportBaseName('a'.repeat(200), 'Untitled')).toHaveLength(80)
  })

  it('builds a .png default path', () => {
    expect(pngDefaultPath('notes')).toBe('notes.png')
  })
})

describe('png capture sizing', () => {
  it('pads the measured content height', () => {
    const size = computeCaptureSize(800, 1000)
    expect(size.width).toBeGreaterThanOrEqual(PNG_CAPTURE_WIDTH)
    expect(size.height).toBeGreaterThan(1000)
    expect(size.scale).toBe(2)
  })

  it('floors tiny documents to a sane viewport', () => {
    const size = computeCaptureSize(0, 0)
    expect(size.width).toBe(PNG_CAPTURE_WIDTH)
    expect(size.height).toBe(PNG_CAPTURE_MIN_HEIGHT)
  })

  it('clamps very tall documents (PDF stays the paginated path)', () => {
    const size = computeCaptureSize(800, 100_000)
    expect(size.height).toBe(PNG_CAPTURE_MAX_HEIGHT)
  })

  it('tolerates non-finite measurements', () => {
    const size = computeCaptureSize(NaN, undefined)
    expect(size.width).toBe(PNG_CAPTURE_WIDTH)
    expect(size.height).toBe(PNG_CAPTURE_MIN_HEIGHT)
  })
})

describe('png print html is self-contained and chrome-free', () => {
  it('strips editor chrome and inlines the print css', () => {
    const root = document.createElement('div')
    root.setAttribute('contenteditable', 'true')
    root.innerHTML =
      '<h1>Hello</h1><div class="md-codeblock-bar"><button>copy</button></div>' +
      '<pre><code>code()</code></pre>'
    const html = buildPrintHtml(root, 'notes')
    expect(html).toContain('<style>')
    expect(html).toContain('<h1>Hello</h1>')
    expect(html).not.toContain('md-codeblock-bar')
    expect(html).not.toContain('contenteditable')
    expect(html).toContain('<title>notes</title>')
  })

  it('escapes the title for the png window document', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>x</p>'
    const html = buildPrintHtml(root, 'a<b>&c')
    expect(html).toContain('<title>a&lt;b>&amp;c</title>')
  })
})
