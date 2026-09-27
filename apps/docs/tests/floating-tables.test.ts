import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { inlineToRuns, pmTableToModel, runsToInline } from '../src/renderer/editor/convert'
import type { TableFloating } from '@revelith/docx-engine'

describe('vanish mark round-trip', () => {
  it('maps run.vanish to the vanish mark and back', () => {
    const inline = runsToInline([
      { text: 'seen ' },
      { text: 'hidden', vanish: true },
    ])
    expect(inline[1]?.marks).toEqual([{ type: 'vanish' }])
    const runs = inlineToRuns(inline)
    expect(runs[1]?.vanish).toBe(true)
    expect(runs[0]?.vanish).toBeUndefined()
  })
})

describe('floating table attrs', () => {
  function createEditor(): Editor {
    return new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'docTable',
            attrs: {
              docxIndex: null,
              tblFloat: {
                horizAnchor: 'margin',
                xSpec: 'right',
                vertAnchor: 'text',
                leftFromTextTwips: 180,
                rightFromTextTwips: 180,
                bottomFromTextTwips: 180,
              } satisfies TableFloating,
            },
            content: [
              {
                type: 'docTableRow',
                content: [
                  {
                    type: 'docTableCell',
                    content: [
                      {
                        type: 'docParagraph',
                        attrs: { docxIndex: null },
                        content: [{ type: 'text', text: 'a' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    })
  }

  it('renders a right float with exclusion margins for xSpec=right', () => {
    const editor = createEditor()
    try {
      const html = editor.view.dom.querySelector('table.doc-table')?.getAttribute('style') ?? ''
      expect(html).toMatch(/float:\s*right/)
      expect(html).toMatch(/margin-left:\s*12(\.0)?px/)
      expect(html).toMatch(/margin-bottom:\s*12(\.0)?px/)
      expect(editor.view.dom.querySelector('table.doc-table')?.getAttribute('data-tbl-float')).toBe(
        'right',
      )
    } finally {
      editor.destroy()
    }
  })

  it('pmTableToModel carries the floating state back to the model', () => {
    const editor = createEditor()
    try {
      let table: Parameters<typeof pmTableToModel>[0] | null = null
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'docTable') {
          table = node.toJSON() as Parameters<typeof pmTableToModel>[0]
          return false
        }
        return true
      })
      expect(table).not.toBeNull()
      const model = pmTableToModel(table!)
      expect(model.floating).toMatchObject({ horizAnchor: 'margin', xSpec: 'right' })
    } finally {
      editor.destroy()
    }
  })
})
