import type { SourceInfo } from '@revelith/docx-engine'

/** Minimal local Zotero/RIS/BibTeX import — no network, no account needed. */

export function parseRis(text: string): SourceInfo[] {
  const out: SourceInfo[] = []
  let cur: Record<string, string> = {}
  const flush = (): void => {
    if (!cur.title && !cur.author) {
      cur = {}
      return
    }
    out.push({
      tag: `ris${out.length + 1}`,
      type: 'Book',
      author: cur.author ?? '',
      title: cur.title ?? '',
      year: cur.year ?? '',
      publisher: cur.publisher ?? '',
      url: cur.url ?? '',
    })
    cur = {}
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9])\s*-\s*(.*)$/.exec(line.trim())
    if (!m) continue
    const [, code, value] = m as unknown as [string, string, string]
    if (code === 'TY') {
      cur = {}
      continue
    }
    if (code === 'ER') {
      flush()
      continue
    }
    if (code === 'AU' || code === 'A1') cur.author = cur.author ? `${cur.author}; ${value}` : value
    else if (code === 'TI' || code === 'T1') cur.title = value
    else if (code === 'Y1' || code === 'PY') cur.year = value.slice(0, 4)
    else if (code === 'PB') cur.publisher = value
    else if (code === 'UR') cur.url = value
  }
  return out
}

export function parseBibtex(text: string): SourceInfo[] {
  const out: SourceInfo[] = []
  const re = /@\w+\s*\{\s*([^,]+),([\s\S]*?)\n\}/g
  let m: RegExpExecArray | null
  const field = (body: string, name: string): string => {
    const f = new RegExp(`${name}\\s*=\\s*[{"]\\s*([^}"]+)`, 'i').exec(body)
    return (f?.[1] ?? '').trim()
  }
  while ((m = re.exec(text)) !== null) {
    const key = (m[1] ?? '').trim()
    const body = m[2] ?? ''
    const author = field(body, 'author')
    const title = field(body, 'title')
    if (!author && !title) continue
    out.push({
      tag: key || `bib${out.length + 1}`,
      type: 'Book',
      author,
      title,
      year: field(body, 'year'),
      publisher: field(body, 'publisher') || field(body, 'journal'),
      url: field(body, 'url'),
    })
  }
  return out
}
