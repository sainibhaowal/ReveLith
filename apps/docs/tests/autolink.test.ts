import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { findAutolinks, normalizeAutolinkUrl } from '../src/renderer/editor/autolink'
import { editorExtensions } from '../src/renderer/editor/extensions'

describe('findAutolinks', () => {
  it('finds http/https/ftp and bare www URLs', () => {
    expect(findAutolinks('go to https://example.com/a?b=1 now')).toEqual([
      { start: 6, end: 6 + 'https://example.com/a?b=1'.length, href: 'https://example.com/a?b=1' },
    ])
    expect(findAutolinks('see www.example.com ok')).toEqual([
      { start: 4, end: 4 + 'www.example.com'.length, href: 'https://www.example.com' },
    ])
    expect(findAutolinks('ftp://files.example.com/x')).toEqual([
      { start: 0, end: 'ftp://files.example.com/x'.length, href: 'ftp://files.example.com/x' },
    ])
  })

  it('strips trailing sentence punctuation', () => {
    expect(findAutolinks('visit https://example.com. Next')).toEqual([
      { start: 6, end: 6 + 'https://example.com'.length, href: 'https://example.com' },
    ])
    expect(findAutolinks('(see https://example.com/a), ok')[0]).toMatchObject({
      href: 'https://example.com/a',
    })
  })

  it('finds email addresses with mailto href', () => {
    expect(findAutolinks('mail me at jane.doe+tag@example.co.uk!')).toEqual([
      {
        start: 11,
        end: 11 + 'jane.doe+tag@example.co.uk'.length,
        href: 'mailto:jane.doe+tag@example.co.uk',
      },
    ])
  })

  it('ignores non-links and bare words', () => {
    expect(findAutolinks('hello world')).toEqual([])
    expect(findAutolinks('a.b')).toEqual([])
    expect(findAutolinks('user@')).toEqual([])
    expect(findAutolinks('')).toEqual([])
  })

  it('finds several links in one line', () => {
    const out = findAutolinks('a https://one.example b http://two.example/c')
    expect(out.map((m) => m.href)).toEqual(['https://one.example', 'http://two.example/c'])
  })
})

describe('normalizeAutolinkUrl', () => {
  it('adds schemes only when missing', () => {
    expect(normalizeAutolinkUrl('www.example.com', false)).toBe('https://www.example.com')
    expect(normalizeAutolinkUrl('https://example.com', false)).toBe('https://example.com')
    expect(normalizeAutolinkUrl('a@b.com', true)).toBe('mailto:a@b.com')
  })
})

describe('autolink in the editor', () => {
  function createEditor(text: string): Editor {
    return new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'docParagraph',
            attrs: { docxIndex: null },
            content: text ? [{ type: 'text', text }] : [],
          },
        ],
      },
    })
  }

  function linkRanges(editor: Editor): Array<{ from: number; to: number; href: string }> {
    const out: Array<{ from: number; to: number; href: string }> = []
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return true
      for (const mark of node.marks) {
        if (mark.type.name === 'link') {
          out.push({ from: pos, to: pos + (node.text?.length ?? 0), href: String(mark.attrs.href) })
        }
      }
      return true
    })
    return out
  }

  it('marks a typed URL when a delimiter extends the range', () => {
    const editor = createEditor('see https://example.com')
    try {
      // simulate typing a trailing space at the end
      const end = editor.state.doc.content.size - 1
      editor.chain().focus(end).insertContent(' ').run()
      const links = linkRanges(editor)
      expect(links).toHaveLength(1)
      expect(links[0]!.href).toBe('https://example.com')
      expect(editor.state.doc.textContent).toContain('see https://example.com ')
    } finally {
      editor.destroy()
    }
  })

  it('one undo removes the mark but keeps the typed text', () => {
    const editor = createEditor('see https://example.com')
    try {
      const end = editor.state.doc.content.size - 1
      editor.chain().focus(end).insertContent(' ').run()
      expect(linkRanges(editor)).toHaveLength(1)
      editor.commands.undo()
      expect(linkRanges(editor)).toHaveLength(0)
      expect(editor.state.doc.textContent).toContain('https://example.com')
    } finally {
      editor.destroy()
    }
  })

  it('does not touch already-linked text or other content', () => {
    const editor = createEditor('plain words here')
    try {
      const end = editor.state.doc.content.size - 1
      editor.chain().focus(end).insertContent(' ').run()
      expect(linkRanges(editor)).toHaveLength(0)
    } finally {
      editor.destroy()
    }
  })

  it('survives block deletions that shrink the doc past mapped ranges', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'docParagraph',
            attrs: { docxIndex: null },
            content: [{ type: 'text', text: 'first block' }],
          },
          {
            type: 'docParagraph',
            attrs: { docxIndex: null },
            content: [{ type: 'text', text: 'see https://example.com' }],
          },
        ],
      },
    })
    try {
      // delete the whole first block: step maps address past the new doc end
      const firstEnd = editor.state.doc.child(0).nodeSize
      expect(() =>
        editor.view.dispatch(editor.state.tr.delete(0, firstEnd)),
      ).not.toThrow()
      expect(editor.state.doc.childCount).toBe(1)
    } finally {
      editor.destroy()
    }
  })
})
