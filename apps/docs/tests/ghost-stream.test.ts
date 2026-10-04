import { describe, expect, it } from 'vitest'
import {
  buildGhostSystemPrompt,
  buildGhostUserMessage,
  citedNumbers,
  extractDocOutline,
  hasGhostStructure,
  parseGhostBlocks,
  takeFirstWord,
} from '../src/renderer/editor/ghost-completion'

describe('ghost streaming helpers', () => {
  it('splits the first word for Ctrl+Right acceptance', () => {
    expect(takeFirstWord('hello world')).toEqual({ word: 'hello ', remaining: 'world' })
    expect(takeFirstWord('hello  world')).toEqual({ word: 'hello  ', remaining: 'world' })
    expect(takeFirstWord('last')).toEqual({ word: 'last', remaining: '' })
    expect(takeFirstWord('')).toBeNull()
    expect(takeFirstWord('   ')).toBeNull()
  })

  it('builds short vs auto system prompts', () => {
    const short = buildGhostSystemPrompt('short', false)
    expect(short).toContain('1-3 sentences')
    expect(short).not.toContain('paragraphs')

    const auto = buildGhostSystemPrompt('auto', false)
    expect(auto).toContain('paragraphs')
    expect(auto).not.toContain('1-3 sentences')

    expect(buildGhostSystemPrompt('short', true)).toContain('ONLY facts')
    expect(buildGhostSystemPrompt('auto', true)).toContain('ONLY facts')
  })

  it('builds user messages with outline, grounded, and web context', () => {
    const msg = buildGhostUserMessage(
      {
        before: 'Quarterly revenue grew.',
        after: '',
        outline: ['# Results', '## Q3'],
        grounded: 'Source file says 18% CAGR.',
        web: '- Gartner: market up',
      },
      'auto',
    )
    expect(msg).toContain('# Results')
    expect(msg).toContain('18% CAGR')
    expect(msg).toContain('Gartner')
    expect(msg).toContain('Quarterly revenue grew.')

    const bare = buildGhostUserMessage(
      { before: 'Hi there.', after: '', outline: [], grounded: '', web: '' },
      'short',
    )
    expect(bare).toContain('Hi there.')
    expect(bare).not.toContain('outline')
  })

  it('includes the numbered source index and style for auto citations', () => {
    const msg = buildGhostUserMessage(
      {
        before: 'Market analysis.',
        after: '',
        outline: [],
        grounded: '',
        web: '',
        sourceIndex: '[1] gartner-2024.pdf\n[2] forrester-wave.pdf',
        citationStyleLabel: 'APA 7th',
      },
      'auto',
    )
    expect(msg).toContain('[1] gartner-2024.pdf')
    expect(msg).toContain('APA 7th')
  })

  it('parses headings, bullets, and paragraphs from ghost text', () => {
    expect(
      parseGhostBlocks(
        '# Results\n\nRevenue grew 18% this quarter.\n\n- Enterprise sales\n  - Renewals\n- SMB growth',
      ),
    ).toEqual([
      { kind: 'heading', level: 1, text: 'Results' },
      { kind: 'paragraph', text: 'Revenue grew 18% this quarter.' },
      { kind: 'bullet', ilvl: 0, text: 'Enterprise sales' },
      { kind: 'bullet', ilvl: 1, text: 'Renewals' },
      { kind: 'bullet', ilvl: 0, text: 'SMB growth' },
    ])
    expect(parseGhostBlocks('## Deep dive\n### Details')).toEqual([
      { kind: 'heading', level: 2, text: 'Deep dive' },
      { kind: 'heading', level: 3, text: 'Details' },
    ])
    expect(parseGhostBlocks('just prose\nsecond line')).toEqual([
      { kind: 'paragraph', text: 'just prose second line' },
    ])
    expect(parseGhostBlocks('\n\n')).toEqual([])
  })

  it('detects structured ghost text', () => {
    expect(hasGhostStructure('# Title\nbody')).toBe(true)
    expect(hasGhostStructure('- item one')).toBe(true)
    expect(hasGhostStructure('plain prose only')).toBe(false)
  })

  it('extracts cited source numbers in order of appearance', () => {
    expect(citedNumbers('Growth was 18% [1] while churn fell [2], confirming [1].')).toEqual([1, 2])
    expect(citedNumbers('No citations here.')).toEqual([])
    expect(citedNumbers('[10] out of range style [0] ignored')).toEqual([10])
  })

  it('extracts a bounded heading outline', () => {
    expect(
      extractDocOutline([
        { level: 1, text: 'Results' },
        { level: 5, text: 'Deep dive' },
        { level: 0, text: '  ' },
        { level: 2, text: '' },
      ]),
    ).toEqual(['# Results', '### Deep dive'])
    expect(extractDocOutline([])).toEqual([])
  })
})
