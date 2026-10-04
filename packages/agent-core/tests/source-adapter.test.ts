import { describe, expect, it } from 'vitest'
import { traySourceToCitationSource } from '../src/citations/source-adapter'
import { formatCitation, generateBibliography } from '../src/citations/citation-engine'
import type { SourceItem } from '../src/citations/types'

function trayItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'tray-1',
    docSessionId: 'doc-1',
    fileName: 'gartner-2024.pdf',
    filePath: '/tmp/gartner-2024.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    addedAt: new Date('2024-06-01T00:00:00Z').getTime(),
    contentHash: 'abc123',
    extractedText: 'The enterprise SaaS market grows at 18% CAGR.',
    chunks: [{ id: 'c1', text: 'The enterprise SaaS market grows at 18% CAGR.', pageNumber: 12 }],
    metadata: {},
    ...overrides,
  }
}

describe('source-adapter', () => {
  it('maps a bare file to an Anonymous-titled citation source', () => {
    const adapted = traySourceToCitationSource(trayItem())
    expect(adapted.title).toBe('gartner-2024.pdf')
    expect(adapted.authors).toEqual([{ lastName: 'gartner-2024' }])
    expect(adapted.year).toBe(2024)
    expect(adapted.sourceType).toBe('report')
  })

  it('parses bibliographic metadata when present', () => {
    const adapted = traySourceToCitationSource(
      trayItem({
        metadata: {
          title: 'Magic Quadrant for Enterprise SaaS',
          authors: 'Smith, John; Alice Walker',
          year: 2024,
          publisher: 'Gartner',
          category: 'Research',
        },
      }),
    )
    expect(adapted.title).toBe('Magic Quadrant for Enterprise SaaS')
    expect(adapted.authors).toEqual([
      { lastName: 'Smith', firstName: 'John' },
      { lastName: 'Walker', firstName: 'Alice' },
    ])
    expect(adapted.publisher).toBe('Gartner')
  })

  it('produces working in-text + bibliography output for every style', () => {
    const adapted: SourceItem = traySourceToCitationSource(
      trayItem({
        metadata: { title: 'Market Analysis', authors: 'Smith, John', year: 2024 },
      }),
    )
    for (const style of ['apa', 'harvard', 'chicago', 'mla', 'ieee'] as const) {
      const formatted = formatCitation(adapted, style, 1)
      expect(formatted.inText.length).toBeGreaterThan(0)
      expect(formatted.fullReference).toContain('Market Analysis')
    }
    const bib = generateBibliography([adapted], 'apa')
    expect(bib).toContain('Market Analysis')
  })
})
