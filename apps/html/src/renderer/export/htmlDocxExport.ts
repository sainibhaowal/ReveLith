import {
  buildBlankDocx,
  parseDocx,
  saveDocx,
  TABLE_HEADER_FILL,
  generateTableModelXml,
} from '@revelith/docx-engine'
import type {
  SaveBlock,
  SaveOptions,
  Run,
  GeneratedBlock,
  TableModel,
  TableCell,
  TableParagraph,
} from '@revelith/docx-engine'

function collectRuns(node: Node): Run[] {
  const runs: Run[] = []
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || ''
      if (text) runs.push({ text })
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement
      const tag = el.tagName.toLowerCase()
      const bold = tag === 'strong' || tag === 'b'
      const italic = tag === 'em' || tag === 'i'
      const code = tag === 'code'
      const innerRuns = collectRuns(el)
      for (const r of innerRuns) {
        runs.push({
          ...r,
          ...(bold ? { bold: true } : {}),
          ...(italic ? { italic: true } : {}),
          ...(code ? { font: 'Consolas' } : {}),
        })
      }
    }
  }
  return runs
}

export async function exportHtmlToDocxBytes(htmlString: string): Promise<Uint8Array> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlString, 'text/html')
  const blocks: SaveBlock[] = []

  const traverse = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1]!, 10)
      const runs = collectRuns(el)
      if (runs.length > 0) {
        blocks.push({
          kind: 'generated',
          block: {
            type: 'heading',
            level,
            runs,
          } as GeneratedBlock,
        })
      }
      return
    }

    if (tag === 'p') {
      const runs = collectRuns(el)
      if (runs.length > 0) {
        blocks.push({
          kind: 'generated',
          block: {
            type: 'paragraph',
            runs,
          } as GeneratedBlock,
        })
      }
      return
    }

    if (tag === 'blockquote') {
      const runs = collectRuns(el)
      if (runs.length > 0) {
        blocks.push({
          kind: 'generated',
          block: {
            type: 'paragraph',
            runs: runs.map((r) => ({ ...r, italic: true })),
            format: { indents: { leftPt: 18 } },
          } as GeneratedBlock,
        })
      }
      return
    }

    if (tag === 'pre') {
      const text = el.textContent || ''
      if (text) {
        blocks.push({
          kind: 'generated',
          block: {
            type: 'paragraph',
            runs: [{ text, font: 'Consolas' }],
          } as GeneratedBlock,
        })
      }
      return
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.querySelectorAll(':scope > li'))
      items.forEach((li, idx) => {
        const runs = collectRuns(li)
        blocks.push({
          kind: 'generated',
          block: {
            type: 'paragraph',
            runs: [{ text: `${tag === 'ol' ? `${idx + 1}. ` : '• '}` }, ...runs],
            format: { indents: { leftPt: 18 } },
          } as GeneratedBlock,
        })
      })
      return
    }

    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'))
      if (rows.length > 0) {
        const tableRows: TableCell[][] = []
        rows.forEach((tr, rIdx) => {
          const cells = Array.from(tr.querySelectorAll('th, td'))
          const isHeader = rIdx === 0 && tr.querySelector('th') !== null
          const rowCells: TableCell[] = cells.map((cell) => {
            const runs = collectRuns(cell)
            const text = cell.textContent || ''
            return {
              paras: [text],
              richParas: [{ runs }],
              ...(isHeader ? { fill: TABLE_HEADER_FILL } : {}),
            }
          })
          if (rowCells.length > 0) tableRows.push(rowCells)
        })

        if (tableRows.length > 0) {
          const model: TableModel = {
            rows: tableRows,
          }
          blocks.push({
            kind: 'xml',
            xml: generateTableModelXml(model),
          })
        }
      }
      return
    }

    // Otherwise recurse through child elements
    for (const child of Array.from(el.children)) {
      traverse(child)
    }
  }

  traverse(doc.body || doc.documentElement)

  if (blocks.length === 0) {
    blocks.push({
      kind: 'generated',
      block: {
        type: 'paragraph',
        runs: [{ text: doc.body?.textContent || '' }],
      } as GeneratedBlock,
    })
  }

  const parsed = await parseDocx(await buildBlankDocx())
  return saveDocx(parsed, blocks, {})
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}
