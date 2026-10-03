import { describe, expect, it } from 'vitest'
import { parseBibtex, parseRis } from '../src/renderer/components/zotero-import'

describe('zotero import', () => {
  it('parses RIS', () => {
    const ris = 'TY  - BOOK\nAU  - Doe, J\nTI  - Title\nY1  - 2020\nER  - \n'
    expect(parseRis(ris)).toHaveLength(1)
  })
  it('parses BibTeX', () => {
    const bib = '@book{key,\n author = {Doe},\n title = {T},\n year = {2021}\n}\n'
    expect(parseBibtex(bib)).toHaveLength(1)
  })
})
