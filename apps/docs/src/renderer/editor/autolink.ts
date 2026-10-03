/**
 * URL/email auto-linkification as you type (Word parity).
 *
 * A ProseMirror plugin watches document-changing transactions and marks
 * bare URLs / email addresses with the `link` mark. Typing a delimiter
 * (space, comma, …) after `https://example.com` turns it into a live link;
 * one Ctrl+Z removes the mark only (the typed text stays), because marking
 * runs in its own transaction. Paste works the same way: pasted URLs are
 * marked in a follow-up step, so undo reverts marks first, then the paste.
 *
 * Skips text already linked and code spans. Bounded: only textblocks touched
 * by a doc-changing transaction are scanned.
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import { AddMarkStep, RemoveMarkStep } from '@tiptap/pm/transform'
import type { MarkType } from '@tiptap/pm/model'

/** A URL/email span inside a plain-text string (offsets are string offsets). */
export interface AutolinkMatch {
  start: number
  end: number
  href: string
}

const URL_RE = /((?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"`]+)/gi
const EMAIL_RE = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gi
/** Trailing punctuation that ends a sentence, not the address. */
const TRAILING_PUNCT = /[.,;:!?)\]'"}>]+$/

/** Normalize a raw match to an href (bare www. / email get a scheme). */
export function normalizeAutolinkUrl(raw: string, isEmail: boolean): string {
  if (isEmail) return `mailto:${raw}`
  if (/^www\./i.test(raw)) return `https://${raw}`
  return raw
}

/** Find linkable spans in plain text. Pure and fully unit-tested. */
export function findAutolinks(text: string): AutolinkMatch[] {
  const out: AutolinkMatch[] = []
  const claim = (start: number, end: number, href: string) => {
    if (end <= start) return
    if (out.some((m) => start < m.end && end > m.start)) return
    out.push({ start, end, href })
  }
  URL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URL_RE.exec(text)) !== null) {
    const raw = m[1].replace(TRAILING_PUNCT, '')
    if (raw.length > 0) claim(m.index, m.index + raw.length, normalizeAutolinkUrl(raw, false))
    if (m[0].length === 0) URL_RE.lastIndex++
  }
  EMAIL_RE.lastIndex = 0
  while ((m = EMAIL_RE.exec(text)) !== null) {
    const raw = m[1].replace(TRAILING_PUNCT, '')
    if (raw.length === 0) continue
    // an email-shaped tail of a URL (user@host in query) belongs to the URL
    claim(m.index, m.index + raw.length, normalizeAutolinkUrl(raw, true))
  }
  return out.sort((a, b) => a.start - b.start)
}

const autolinkKey = new PluginKey('revelith-autolink')

/**
 * Mark bare URLs/emails in textblocks touched by doc-changing transactions.
 * Field-instruction runs (instrField/refField) are verbatim code and never
 * linkified. Exported for tests; the TipTap extension below wires it in.
 */
export function autolinkPlugin(
  getLinkType: (state: { schema: { marks: Record<string, MarkType> } }) => MarkType | undefined,
  excludedMarkNames: readonly string[] = ['instrField', 'refField'],
): Plugin {
  return new Plugin({
    key: autolinkKey,
    appendTransaction(transactions, _oldState, newState) {
      // Bound the scan to text touched by these transactions: walk each
      // step map into new-doc coordinates and merge the ranges.
      let lo = Infinity
      let hi = -Infinity
      let changed = false
      for (const tr of transactions) {
        if (!tr.docChanged) continue
        changed = true
        tr.mapping.maps.forEach((stepMap) => {
          stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
            if (newStart < lo) lo = newStart
            if (newEnd > hi) hi = newEnd
          })
        })
      }
      if (!changed || !isFinite(lo) || hi < 0) return null
      // Deletions shrink the doc: step maps can address past the new end.
      // Clamp into range (nodesBetween throws outside it).
      const end = newState.doc.content.size
      lo = Math.max(0, Math.min(lo, end))
      hi = Math.max(0, Math.min(hi, end))
      const linkType = getLinkType(newState)
      if (!linkType) return null
      // Mark-only transactions (undo/redo of a previous linkification, or any
      // mark toggle) must not re-mark: otherwise one Ctrl+Z could never remove
      // a link, and our own addMark output terminates here instead of looping.
      const markOnly = transactions.every(
        (tr) =>
          !tr.docChanged ||
          (tr.steps.length > 0 &&
            tr.steps.every((s) => s instanceof AddMarkStep || s instanceof RemoveMarkStep)),
      )
      if (markOnly) return null
      // An explicit unlink inside these transactions (undo of a linkification,
      // or the toolbar "remove link") wins: re-marking here would resurrect
      // the link the user just removed. Bare URLs get marked on the next edit.
      const unlinked = transactions.some((tr) =>
        tr.steps.some(
          (s) => s instanceof RemoveMarkStep && (s as RemoveMarkStep).mark.type === linkType,
        ),
      )
      if (unlinked) return null
      let tr: Transaction | null = null
      newState.doc.nodesBetween(lo, hi, (node, pos) => {
        if (!node.isTextblock || node.textContent.length === 0) return true
        for (const match of findAutolinks(node.textContent)) {
          const from = pos + 1 + match.start
          const to = pos + 1 + match.end
          if (to < lo || from > hi) continue
          const $pos = newState.doc.resolve(Math.min(from, newState.doc.content.size))
          const marks = $pos.marks()
          if (marks.some((mk) => mk.type === linkType)) continue
          if (marks.some((mk) => excludedMarkNames.includes(mk.type.name))) continue
          tr ??= newState.tr
          tr.addMark(from, to, linkType.create({ href: match.href, rId: null }))
        }
        return true
      })
      return tr
    },
  })
}

export const AutolinkExtension = Extension.create({
  name: 'autolink',
  addProseMirrorPlugins() {
    return [
      autolinkPlugin(
        (state) =>
          (state.schema.marks as Record<string, MarkType | undefined>)['link'] ?? undefined,
      ),
    ]
  },
})
