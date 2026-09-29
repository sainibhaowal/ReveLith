import { describe, expect, it } from 'vitest'
import { parsePageRanges } from '../src/renderer/view-config'
import {
  buildEditablePptxModel,
  compactDocxHtml,
  dedupeImages,
} from '../src/renderer/pdf-export-convert'

describe('pdf print range + convert', () => {
  it('parses ranges', () => {
    expect(parsePageRanges('1-3, 5', 6)).toEqual([1, 2, 3, 5])
    // out of range or reversed is a user error the dialog reports, not a
    // silently empty selection
    expect(parsePageRanges('99', 6)).toBeNull()
    expect(parsePageRanges('3-1', 6)).toBeNull()
    expect(parsePageRanges('abc', 6)).toBeNull()
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
