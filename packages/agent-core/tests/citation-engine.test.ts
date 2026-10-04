import { describe, expect, it } from 'vitest'
import {
  formatCitation,
  formatFullReference,
  formatInTextCitation,
  generateBibliography,
  parseAuthorString,
} from '../src/citations/citation-engine'
import type { SourceItem } from '../src/citations/types'

describe('citation-engine', () => {
  const sampleBook: SourceItem = {
    id: 'src-1',
    docSessionId: 'doc-session-123',
    title: 'The Principles of Quantum Computing',
    authors: [
      { firstName: 'Richard', lastName: 'Feynman', initials: 'R. P.' },
      { firstName: 'David', lastName: 'Deutsch', initials: 'D.' },
    ],
    year: 2024,
    publisher: 'Oxford University Press',
    sourceType: 'book',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const sampleJournal: SourceItem = {
    id: 'src-2',
    docSessionId: 'doc-session-123',
    title: 'Attention Mechanisms in Document Understanding',
    authors: [{ firstName: 'Ashish', lastName: 'Vaswani', initials: 'A.' }],
    year: 2023,
    publicationTitle: 'Neural Information Processing Systems',
    pages: '100-112',
    doi: '10.1016/j.neunet.2023.01.002',
    sourceType: 'journal',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  it('parses author strings correctly', () => {
    const parsed = parseAuthorString('Smith, John; Alice Walker and Bob Vance')
    expect(parsed.length).toBe(3)
    expect(parsed[0]).toEqual({ lastName: 'Smith', firstName: 'John' })
    expect(parsed[1]).toEqual({ lastName: 'Walker', firstName: 'Alice' })
    expect(parsed[2]).toEqual({ lastName: 'Vance', firstName: 'Bob' })
  })

  it('formats APA in-text citations correctly', () => {
    const inText1 = formatInTextCitation(sampleJournal, 'apa')
    expect(inText1).toBe('(Vaswani, 2023)')

    const inText2 = formatInTextCitation(sampleBook, 'apa', '45')
    expect(inText2).toBe('(Feynman & Deutsch, 2024, p. 45)')
  })

  it('formats Harvard in-text citations correctly', () => {
    const inText = formatInTextCitation(sampleBook, 'harvard', '12')
    expect(inText).toBe('(Feynman and Deutsch 2024: 12)')
  })

  it('formats MLA and IEEE in-text citations correctly', () => {
    const mla = formatInTextCitation(sampleJournal, 'mla', '105')
    expect(mla).toBe('(Vaswani 105)')

    const ieee = formatInTextCitation(sampleJournal, 'ieee', 3)
    expect(ieee).toBe('[3]')
  })

  it('formats full APA bibliography references with DOI', () => {
    const ref = formatFullReference(sampleJournal, 'apa')
    expect(ref).toContain('Vaswani, A. (2023). Attention Mechanisms in Document Understanding.')
    expect(ref).toContain('https://doi.org/10.1016/j.neunet.2023.01.002')
  })

  it('generates multi-source sorted bibliography', () => {
    const bib = generateBibliography([sampleJournal, sampleBook], 'apa')
    // Feynman (F) should come before Vaswani (V)
    const feynmanPos = bib.indexOf('Feynman')
    const vaswaniPos = bib.indexOf('Vaswani')
    expect(feynmanPos).toBeGreaterThanOrEqual(0)
    expect(vaswaniPos).toBeGreaterThan(feynmanPos)
  })

  it('produces formatted citation object with footnote', () => {
    const citation = formatCitation(sampleBook, 'chicago', 1)
    expect(citation.style).toBe('chicago')
    expect(citation.footnote).toContain('1. Feynman, Richard and David Deutsch. 2024.')
  })
})
