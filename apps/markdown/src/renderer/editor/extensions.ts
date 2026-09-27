import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { CodeBlock } from '@tiptap/extension-code-block'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import { CodeBlockView } from './CodeBlockView'
import { LocalImage } from './localImage'
import { BlockDragHandle } from './blockDragHandle'
import { BlockKeymap } from './blockKeymap'
import { AiHighlight } from './aiHighlight'
import { SearchHighlightExtension } from './searchHighlight'
import { SlashCommand } from './slashCommand'
import type { SlashController, SlashItem } from './slashCommand'
import { TableWithPipeEscape } from './table-markdown'
import { t } from '../i18n/locale'

export interface BuildExtensionsOptions {
  slashController: SlashController
  slashItems: () => SlashItem[]
}

export function buildExtensions(options: BuildExtensionsOptions): AnyExtension[] {
  return [
    StarterKit.configure({
      // LocalImage replaces the plain image; links open externally via main-process guard
      link: { openOnClick: false },
      // replaced by the NodeView-enhanced variant below (language picker + copy)
      codeBlock: false,
      // underline would serialize as `++text++` : not part of GFM
      underline: false,
    }),
    CodeBlock.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView)
      },
      renderMarkdown: (node, h) => {
        const language = node.attrs?.language || ''
        const content = node.content ? h.renderChildren(node.content) : ''
        // the fence must be longer than any backtick run inside the content,
        // otherwise an inner ``` would terminate the block early and corrupt it
        let fenceLen = 3
        const runs = content.match(/`+/g)
        if (runs) {
          for (const run of runs) fenceLen = Math.max(fenceLen, run.length + 1)
        }
        const fence = '`'.repeat(fenceLen)
        if (!node.content) {
          return `${fence}${language}\n\n${fence}`
        }
        return [`${fence}${language}`, content, fence].join('\n')
      },
    }),
    // 4-space nesting: the default 2 spaces is below the content column of
    // ordered items ("1. " = 3), so strict CommonMark parsers (GitHub) would
    // flatten sub-lists in the saved file. 4 is safe for every marker width.
    Markdown.configure({ indentation: { style: 'space', size: 4 } }),
    // column widths are not expressible in GFM tables : no resizable columns;
    // the wrapper div gives wide tables a horizontal scrollbar.
    // table rendering is overridden by TableWithPipeEscape (pipe-safe cells);
    // the kit's built-in table is disabled to avoid a duplicate 'table' node.
    TableKit.configure({ table: false }),
    TableWithPipeEscape.configure({ resizable: false, renderWrapper: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    LocalImage,
    BlockDragHandle,
    BlockKeymap,
    AiHighlight,
    SearchHighlightExtension,
    Placeholder.configure({ placeholder: () => t('placeholder') }),
    SlashCommand.configure({
      controller: options.slashController,
      items: options.slashItems,
    }),
  ]
}
