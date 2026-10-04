import { describe, expect, it } from 'vitest'
import {
  buildGhostSystemPrompt,
  buildGhostUserMessage,
  extractDocOutline,
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
