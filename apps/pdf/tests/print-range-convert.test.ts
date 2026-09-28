import { describe, expect, it } from 'vitest'
import { parsePageRange } from '../src/renderer/print'
import {
  buildEditablePptxModel,
  compactDocxHtml,
  dedupeImages,
} from '../src/renderer/pdf-export-convert'

describe('pdf print range + convert', () => {
  it('parses ranges', () => {
    expect(parsePageRange('1-3, 5', 6)).toEqual([1, 2, 3, 5])
    expect(parsePageRange('99', 6)).toEqual([])
  })
  it('builds editable pptx model', () => {
    const model = buildEditablePptxModel([{ page: 1, text: 'hi' }])
    expect(model).toContain('textbox')
  })
  it('dedupes + compacts docx', () => {
    expect(dedupeImages(['a', 'a', 'b'])).toEqual(['a', 'b'])
    expect(compactDocxHtml(['hi'], [])).toContain('<p>hi</p>')
  })
})
