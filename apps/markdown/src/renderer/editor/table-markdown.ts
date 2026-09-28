/**
 * Native GFM table renderer for ReveLith Markdown.
 *
 * Behavior matches the upstream tiptap table serializer exactly (column
 * padding, alignment markers, empty-header emission, <br> line breaks) with
 * one deliberate divergence: literal `|` characters inside cell text are
 * backslash-escaped.
 *
 * Why: the text pipeline emits cell content verbatim, so a literal pipe
 * (`a | b`) is written raw. On re-parse the GFM splitter treats it as a
 * column delimiter, silently splitting one cell into two (and shifting every
 * column after it). Escaping every pipe (`a \| b`) round-trips: the splitter
 * skips `\|` and restores the literal pipe.
 *
 * Escaping unconditionally (even inside code spans or after backslashes) is
 * correct: `\\|` re-parses to backslash + pipe, and code-span pipes are
 * restored by the parse-side preprocessor which skips already-escaped pipes.
 */
import type { JSONContent, MarkdownRendererHelpers } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'

const CELL_LINE_SEPARATOR = '\u001F'

type CellAlign = 'left' | 'center' | 'right' | null

function cellAlign(attrs: unknown): CellAlign {
  const align = (attrs as { align?: unknown } | null)?.align
  return align === 'left' || align === 'center' || align === 'right' ? align : null
}

function collapseWhitespace(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim()
}

/** Escape every pipe so the GFM cell splitter cannot mistake content for delimiters. */
function escapeCellPipes(text: string): string {
  return text.replace(/\|/g, '\\|')
}

export function renderTableToMarkdown(node: JSONContent, h: MarkdownRendererHelpers): string {
  if (!node || !node.content || node.content.length === 0) {
    return ''
  }

  // Build rows: each cell is { text, isHeader, align }
  const rows: { text: string; isHeader: boolean; align: CellAlign }[][] = []

  node.content.forEach((rowNode) => {
    const cells: { text: string; isHeader: boolean; align: CellAlign }[] = []

    if (rowNode.content) {
      rowNode.content.forEach((cellNode) => {
        let raw: string

        if (cellNode.content && Array.isArray(cellNode.content) && cellNode.content.length > 1) {
          // Render each direct child separately and join with separator so we can split again later
          const parts = cellNode.content.map((child) =>
            h.renderChildren(child as unknown as JSONContent),
          )
          raw = parts.join(CELL_LINE_SEPARATOR)
        } else {
          raw = cellNode.content
            ? h.renderChildren(cellNode.content as unknown as JSONContent[])
            : ''
        }

        // Cells have to stay on a single line, so line breaks become <br> tags.
        // The parser already turns <br> back into hard breaks, so this round trips.
        const text = escapeCellPipes(
          collapseWhitespace(
            raw
              .split(CELL_LINE_SEPARATOR)
              .join('\n')
              .replace(/[ \t]*\r?\n[ \t]*/g, '<br>'),
          ),
        )
        const isHeader = cellNode.type === 'tableHeader'
        const align = cellAlign(cellNode.attrs)

        cells.push({ text, isHeader, align })
      })
    }

    rows.push(cells)
  })

  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0)

  if (columnCount === 0) {
    return ''
  }

  // Compute max width for each column
  const colWidths = Array.from<number>({ length: columnCount }).fill(0)

  rows.forEach((r) => {
    for (let i = 0; i < columnCount; i += 1) {
      const cell = r[i]?.text || ''
      const len = cell.length
      if (len > colWidths[i]) {
        colWidths[i] = len
      }

      if (colWidths[i] < 3) {
        colWidths[i] = 3
      }
    }
  })

  const pad = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - s.length))

  const headerRow = rows[0]
  const hasHeader = headerRow.some((c) => c.isHeader)
  const colAlignments: Array<CellAlign> = Array.from<CellAlign>({
    length: columnCount,
  }).fill(null)

  rows.forEach((r) => {
    for (let i = 0; i < columnCount; i += 1) {
      if (!colAlignments[i] && r[i]?.align) {
        colAlignments[i] = r[i].align
      }
    }
  })

  let out = '\n'

  // Render header: if the document has a header row (tableHeader cells) use it,
  // otherwise emit an empty header row so most Markdown parsers will recognize
  // the table (this makes roundtripping to Markdown -> JSON more reliable).
  const headerTexts = Array.from<number>({ length: columnCount }).map((_, i) =>
    hasHeader ? (headerRow[i] && headerRow[i].text) || '' : '',
  )

  out += `| ${headerTexts.map((t, i) => pad(t, colWidths[i])).join(' | ')} |\n`

  // Separator (use at least 3 dashes per column and include alignment markers)
  out += `| ${colWidths
    .map((w, index) => {
      const dashCount = Math.max(3, w)
      const alignment = colAlignments[index]

      if (alignment === 'left') {
        return `:${'-'.repeat(dashCount)}`
      }

      if (alignment === 'right') {
        return `${'-'.repeat(dashCount)}:`
      }

      if (alignment === 'center') {
        return `:${'-'.repeat(dashCount)}:`
      }

      return '-'.repeat(dashCount)
    })
    .join(' | ')} |\n`

  // Body rows: if we had a header, skip the first row; otherwise render all rows
  const body = hasHeader ? rows.slice(1) : rows
  body.forEach((r) => {
    out += `| ${Array.from<number>({ length: columnCount })
      .fill(0)
      .map((_, i) => pad((r[i] && r[i].text) || '', colWidths[i]))
      .join(' | ')} |\n`
  })

  return out
}

/**
 * Table node with the native ReveLith markdown renderer (pipe-safe cells).
 * Register this instead of TableKit's built-in table:
 * `TableKit.configure({ table: false })` + `TableWithPipeEscape`.
 */
export const TableWithPipeEscape = Table.extend({
  renderMarkdown: (node, h) => renderTableToMarkdown(node, h),
})
