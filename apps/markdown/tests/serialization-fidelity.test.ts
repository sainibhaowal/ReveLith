import { afterAll, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/renderer/editor/extensions'

// Undestroyed views leave DOMObserver flush timers that fire after jsdom teardown
// ("document is not defined" unhandled error). Editors here are shared per describe,
// so destroy them once at the end of the file.
const editors: Editor[] = []
afterAll(() => {
  for (const e of editors) e.destroy()
})

function createEditor(): Editor {
  const editor = new Editor({
    extensions: buildExtensions({
      slashController: {
        onOpen: () => {},
        onUpdate: () => {},
        onKeyDown: () => false,
        onClose: () => {},
      },
      slashItems: () => [],
    }),
    content: '',
  })
  editors.push(editor)
  return editor
}

/** parse → serialize → parse must be structurally stable */
function roundTrip(editor: Editor, md: string): { out: string; stable: boolean } {
  const manager = editor.markdown!
  const first = manager.parse(md)
  const out = manager.serialize(first)
  const second = manager.parse(out)
  return { out, stable: JSON.stringify(first) === JSON.stringify(second) }
}

describe('table cell pipe escaping', () => {
  const editor = createEditor()

  it('a literal pipe in a cell is escaped and round-trips without splitting', () => {
    const { out, stable } = roundTrip(editor, '| a \\| b | c |\n| --- | --- |\n| x | y |')
    expect(out).toContain('a \\| b')
    expect(stable).toBe(true)
    // reparsing the output keeps two columns, not three
    const reparsed = editor.markdown!.parse(out)
    const row = (reparsed.content?.[0] as any)?.content?.[1]
    expect(row.content.length).toBe(2)
  })

  it('backslash + pipe re-parses to backslash + pipe', () => {
    // source `\\|` = literal backslash then a delimiter; the cell holds `\` only.
    // typing a literal backslash followed by a pipe must survive the round-trip.
    const manager = editor.markdown!
    const doc: any = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a\\|b' }] }],
                },
              ],
            },
          ],
        },
      ],
    }
    const out = manager.serialize(doc)
    expect(out).toContain('a\\\\\\|b')
    const back = manager.parse(out)
    const cellText = (back.content?.[0] as any)?.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text
    expect(cellText).toBe('a\\|b')
  })

  it('pipes inside code spans in cells survive', () => {
    const { out, stable } = roundTrip(editor, '| `a|b` | c |\n| --- | --- |\n| x | y |')
    expect(stable).toBe(true)
    expect(out).toContain('a')
    expect(out).toContain('c')
  })

  it('tables without pipes serialize exactly as before', () => {
    const { out, stable } = roundTrip(editor, '| Name | Value |\n| --- | --- |\n| a | 1 |\n| b | 2 |')
    expect(out).toContain('| Name | Value |')
    expect(out).toMatch(/\| a\s+\| 1\s+\|/)
    expect(stable).toBe(true)
  })

  it('aligned tables keep their markers', () => {
    const { out, stable } = roundTrip(editor, '| a | b |\n| :-- | --: |\n| x | y |')
    expect(out).toContain(':--')
    expect(out).toContain('--:')
    expect(stable).toBe(true)
  })

  it('center alignment survives', () => {
    const { out, stable } = roundTrip(editor, '| a |\n| :--: |\n| x |')
    expect(out).toContain(':---:')
    expect(stable).toBe(true)
  })
})

describe('code fence lengthening', () => {
  const editor = createEditor()

  it('content containing triple backticks gets a longer fence', () => {
    const { out, stable } = roundTrip(editor, '````\n```\ncode\n```\n````')
    expect(out.startsWith('````')).toBe(true)
    expect(out.trimEnd().endsWith('````')).toBe(true)
    expect(out).toContain('```\ncode\n```')
    expect(stable).toBe(true)
  })

  it('a hand-built codeblock with backticks serializes safely', () => {
    const manager = editor.markdown!
    const doc: any = {
      type: 'doc',
      content: [
        { type: 'codeBlock', attrs: { language: '' }, content: [{ type: 'text', text: '```\ncode\n```' }] },
      ],
    }
    const out = manager.serialize(doc)
    expect(out.startsWith('````')).toBe(true)
    const back = manager.parse(out)
    // the parser normalizes a missing language to null; content must survive
    const backText = (back.content?.[0] as any)?.content?.[0]?.text
    expect(backText).toBe('```\ncode\n```')
  })

  it('plain code blocks still use triple fences', () => {
    const { out, stable } = roundTrip(editor, '```python\nprint(1)\n```')
    expect(out).toContain('```python')
    expect(out).not.toMatch(/````/)
    expect(stable).toBe(true)
  })

  it('tilde fences normalize to backticks and stay stable', () => {
    const { out, stable } = roundTrip(editor, '~~~js\ncode()\n~~~')
    expect(out).toContain('```js')
    expect(stable).toBe(true)
  })

  it('empty code blocks keep the blank-body shape', () => {
    const manager = editor.markdown!
    const doc: any = {
      type: 'doc',
      content: [{ type: 'codeBlock', attrs: { language: 'js' } }],
    }
    expect(manager.serialize(doc)).toBe('```js\n\n```')
  })
})
