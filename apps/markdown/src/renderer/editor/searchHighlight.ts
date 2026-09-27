import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SearchHighlightMeta {
  ranges: Array<{ from: number; to: number }>
  activeIndex: number
}

export const searchPluginKey = new PluginKey<DecorationSet>('markdownSearch')

export const SearchHighlightExtension = Extension.create({
  name: 'markdownSearch',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(searchPluginKey) as SearchHighlightMeta | undefined
            if (meta) {
              return DecorationSet.create(
                tr.doc,
                meta.ranges.map((r, i) =>
                  Decoration.inline(r.from, r.to, {
                    class: i === meta.activeIndex ? 'search-hit search-hit-active' : 'search-hit',
                  }),
                ),
              )
            }
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})
