import { Fragment, useState, type ReactNode } from 'react'

/**
 * Dependency-free markdown renderer for chat bubbles:
 * paragraphs, lists (ul/ol), headings, tables, fenced code blocks,
 * bold/italic/inline code, and RTL-aware text orientation.
 * Tolerates streaming/partial input gracefully.
 */

const INLINE_RE = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g
const RTL_REGEX = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/

export function isRtlText(text: string): boolean {
  return RTL_REGEX.test(text)
}

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push(text.slice(last, i))
    const tok = m[0] ?? ''
    if (tok.startsWith('`')) out.push(<code key={key++}>{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('**')) out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>)
    else out.push(<em key={key++}>{tok.slice(1, -1)}</em>)
    last = i + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type MdBlock =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'h'; text: string }
  | { kind: 'code'; lang?: string | undefined; content: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }

function parseBlocks(text: string): MdBlock[] {
  const blocks: MdBlock[] = []
  let cur: MdBlock | null = null
  const flush = (): void => {
    if (cur) {
      blocks.push(cur)
      cur = null
    }
  }

  const lines = text.split('\n')
  let inCode = false
  let codeLang = ''
  let codeLines: string[] = []

  let inTable = false
  let tableHeaders: string[] = []
  let tableRows: string[][] = []

  const isTableRow = (line: string): boolean => {
    const trimmed = line.trim()
    return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')
  }

  const isTableSeparator = (line: string): boolean => {
    const trimmed = line.trim()
    return /^\|(\s*:?-+:?\s*\|)+$/.test(trimmed)
  }

  const parseCells = (line: string): string[] => {
    const trimmed = line.trim()
    const inner = trimmed.slice(1, -1)
    return inner.split('|').map((c) => c.trim())
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx]!
    const line = raw.trimEnd()

    // Handle code fence
    if (line.trim().startsWith('```')) {
      if (inCode) {
        // Close code block
        blocks.push({ kind: 'code', lang: codeLang, content: codeLines.join('\n') })
        inCode = false
        codeLang = ''
        codeLines = []
        continue
      } else {
        flush()
        if (inTable) {
          blocks.push({ kind: 'table', headers: tableHeaders, rows: tableRows })
          inTable = false
          tableHeaders = []
          tableRows = []
        }
        inCode = true
        codeLang = line.trim().slice(3).trim()
        codeLines = []
        continue
      }
    }

    if (inCode) {
      codeLines.push(raw)
      continue
    }

    // Handle tables
    if (isTableRow(line)) {
      if (!inTable) {
        // Peek ahead to check for separator
        const next = lines[idx + 1] ? lines[idx + 1]!.trimEnd() : ''
        if (isTableSeparator(next)) {
          flush()
          inTable = true
          tableHeaders = parseCells(line)
          tableRows = []
          idx++ // skip separator line
          continue
        }
      } else {
        tableRows.push(parseCells(line))
        continue
      }
    } else if (inTable) {
      blocks.push({ kind: 'table', headers: tableHeaders, rows: tableRows })
      inTable = false
      tableHeaders = []
      tableRows = []
    }

    if (!line.trim()) {
      flush()
      continue
    }

    const h = /^#{1,6}\s+(.*)$/.exec(line)
    if (h) {
      flush()
      blocks.push({ kind: 'h', text: h[1] ?? '' })
      continue
    }

    const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
    if (ul) {
      if (cur?.kind !== 'ul') {
        flush()
        cur = { kind: 'ul', items: [] }
      }
      cur.items.push(ul[1] ?? '')
      continue
    }

    const ol = /^\s*\d+[.、)]\s+(.*)$/.exec(line)
    if (ol) {
      if (cur?.kind !== 'ol') {
        flush()
        cur = { kind: 'ol', items: [] }
      }
      cur.items.push(ol[1] ?? '')
      continue
    }

    if (cur?.kind !== 'p') {
      flush()
      cur = { kind: 'p', lines: [] }
    }
    cur.lines.push(line)
  }

  if (inCode) {
    // Streaming unclosed code block
    blocks.push({ kind: 'code', lang: codeLang, content: codeLines.join('\n') })
  } else if (inTable) {
    blocks.push({ kind: 'table', headers: tableHeaders, rows: tableRows })
  }
  flush()
  return blocks
}

function CodeBlock({ lang, content }: { lang?: string | undefined; content: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    void navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="ai-md-code-block" style={{ margin: '8px 0', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: 'var(--panel-bg-subtle, rgba(0,0,0,0.25))', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-dim, #888)' }}>
        <span>{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '10px 12px', overflowX: 'auto', background: 'var(--code-bg, rgba(0,0,0,0.15))', fontSize: 12, lineHeight: 1.45, fontFamily: 'Consolas, Monaco, "Courier New", monospace' }}>
        <code>{content}</code>
      </pre>
    </div>
  )
}

function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }): React.JSX.Element {
  return (
    <div className="ai-md-table-wrap" style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table className="ai-md-table" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, border: '1px solid var(--border-subtle, rgba(255,255,255,0.15))' }}>
        {headers.length > 0 && (
          <thead>
            <tr style={{ background: 'var(--table-header-bg, rgba(255,255,255,0.06))' }}>
              {headers.map((h, i) => (
                <th key={i} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.2))' }}>
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '6px 10px' }}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Markdown({ text }: { text: string }): React.JSX.Element {
  const isRtl = isRtlText(text)
  return (
    <div className={`ai-md ${isRtl ? 'ai-md-rtl' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {parseBlocks(text).map((b, i) => {
        if (b.kind === 'code') {
          return <CodeBlock key={i} lang={b.lang} content={b.content} />
        }
        if (b.kind === 'table') {
          return <TableBlock key={i} headers={b.headers} rows={b.rows} />
        }
        if (b.kind === 'h') {
          return (
            <p key={i} className="ai-md-h" style={{ fontWeight: 600, margin: '8px 0 4px' }}>
              {renderInline(b.text)}
            </p>
          )
        }
        if (b.kind === 'ul' || b.kind === 'ol') {
          const items = b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)
          return b.kind === 'ul' ? <ul key={i} style={{ paddingLeft: 20, margin: '4px 0' }}>{items}</ul> : <ol key={i} style={{ paddingLeft: 20, margin: '4px 0' }}>{items}</ol>
        }
        return (
          <p key={i} style={{ margin: '4px 0' }}>
            {b.lines.map((ln, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(ln)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
