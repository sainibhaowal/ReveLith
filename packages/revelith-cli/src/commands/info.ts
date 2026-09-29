/**
 * `revelith info` — what kind of document is this, and what is in it.
 *
 * The cheapest way to find out whether a file is the one an agent was told
 * about, and to size a job before committing to it. Read-only: opens the
 * package, counts what matters, and never writes.
 */
import { statSync } from 'node:fs'
import { parseDocx } from '@revelith/docx-engine'
import { openPptx } from '@revelith/pptx-engine'
import { extension, readInput, requireFile } from '../fs.js'
import { CliError, EXIT } from '../result.js'
import type { CommandDef } from '../registry.js'

/** English Metric Units per inch; slide sizes are stored in EMU. */
const EMU_PER_INCH = 914400

/** Formats this command can describe today, with the ones it cannot. */
const TEXT_FORMATS = new Set(['md', 'markdown', 'html', 'htm', 'txt'])
/** Spreadsheet formats arrive with the xlsx-gateway package. */
const PENDING = new Set(['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'pdf'])

export const infoCommand: CommandDef = {
  name: 'info',
  summary: 'Print metadata and a structure summary of a document.',
  usage: 'info <file>',
  async run(args, ctx) {
    const path = requireFile(args.positionals[0], ctx)
    const ext = extension(path)
    const stat = statSync(path)
    const described = await describe(path, ext)
    return {
      summary: `${ext} — ${described.headline}`,
      detail: {
        path,
        format: ext,
        size_bytes: stat.size,
        modified: stat.mtime.toISOString(),
        ...described.fields,
      },
    }
  },
}

interface Description {
  /** One line a person reads; the fields carry the machine-readable detail. */
  headline: string
  fields: Record<string, unknown>
}

async function describe(path: string, ext: string): Promise<Description> {
  if (ext === 'docx') return describeDocx(path)
  if (ext === 'pptx') return describePptx(path)
  if (ext === 'csv') return describeCsv(path)
  if (TEXT_FORMATS.has(ext)) return describeText(path, ext)
  if (PENDING.has(ext)) {
    // Deliberately not silently approximated. A wrong sheet count is worse
    // than an honest refusal, because an agent will plan around it.
    throw new CliError(
      EXIT.usage,
      `info does not support .${ext} yet`,
      { format: ext },
      {
        reason: 'unsupported',
        suggestion: 'docx, pptx, csv, md, html and txt are supported',
      },
    )
  }
  throw new CliError(
    EXIT.usage,
    `unsupported file type: .${ext || '(none)'}`,
    { format: ext },
    {
      reason: 'unsupported',
      suggestion: 'pass a .docx, .pptx, .csv, .md, .html or .txt file',
    },
  )
}

async function describeDocx(path: string): Promise<Description> {
  const parsed = await parseDocx(readInput(path))
  const counts: Record<string, number> = {}
  for (const b of parsed.blocks) counts[b.type] = (counts[b.type] ?? 0) + 1
  // Headings are capped: a long report would otherwise dump a hundred lines of
  // outline into the agent's context for no decision it can act on.
  const headings = parsed.blocks
    .filter((b) => b.type === 'heading')
    .slice(0, 20)
    .map((b) => ({
      level: b.level ?? 1,
      text: (b.runs ?? []).map((r) => r.text).join(''),
    }))
  return {
    headline: `${parsed.blocks.length} blocks, ${counts.heading ?? 0} headings, ${counts.table ?? 0} tables`,
    fields: {
      blocks: parsed.blocks.length,
      block_types: counts,
      headings,
      comments: parsed.comments.length,
      footnotes: parsed.footnotes.length,
      endnotes: parsed.endnotes.length,
      protected: parsed.protection !== null,
    },
  }
}

async function describePptx(path: string): Promise<Description> {
  const { deck } = await openPptx(readInput(path))
  const elements: Record<string, number> = {}
  for (const slide of deck.slides) {
    for (const el of slide.elements) elements[el.type] = (elements[el.type] ?? 0) + 1
  }
  return {
    headline: `${deck.slides.length} slides`,
    fields: {
      slides: deck.slides.length,
      slide_size_in: {
        width: round(deck.size.cx / EMU_PER_INCH),
        height: round(deck.size.cy / EMU_PER_INCH),
      },
      element_types: elements,
    },
  }
}

/**
 * Delimiter sniffed from the header row rather than assumed, because a CSV
 * exported from a European locale is semicolon- or tab-separated and reading it
 * as commas yields one enormous column.
 */
function describeCsv(path: string): Description {
  const text = Buffer.from(readInput(path)).toString('utf8')
  const lines = splitLines(text)
  const header = lines[0] ?? ''
  const delimiter = sniffDelimiter(header)
  return {
    headline: `${lines.length} rows — ${lines.length ? columnCount(header, delimiter) : 0} columns`,
    fields: {
      rows: lines.length,
      columns: lines.length ? columnCount(header, delimiter) : 0,
      delimiter,
    },
  }
}

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|']

function sniffDelimiter(header: string): string {
  let best = ','
  let bestCount = 0
  for (const d of CANDIDATE_DELIMITERS) {
    const n = countOutsideQuotes(header, d)
    if (n > bestCount) {
      best = d
      bestCount = n
    }
  }
  return best
}

/**
 * Columns are delimiters *plus one*: a two-column header contains a single
 * separator. An empty header has no columns, not one.
 */
function columnCount(header: string, delimiter: string): number {
  if (header.length === 0) return 0
  return countOutsideQuotes(header, delimiter) + 1
}

/** Split on any newline convention, dropping the empty tail a final newline leaves. */
function splitLines(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.split(/\r?\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Delimiters inside a quoted field are data, and "" is an escaped quote. */
function countOutsideQuotes(line: string, ch: string): number {
  let n = 0
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') i++
      else quoted = !quoted
    } else if (c === ch && !quoted) {
      n++
    }
  }
  return n
}

function describeText(path: string, ext: string): Description {
  const text = Buffer.from(readInput(path)).toString('utf8')
  const lines = splitLines(text)
  const fields: Record<string, unknown> = { lines: lines.length, characters: text.length }
  if (ext === 'md' || ext === 'markdown') {
    // ATX headings only; setext (=== / ---) is rare enough not to count
    fields.headings = lines.filter((l) => /^#{1,6}\s/.test(l)).length
  }
  return { headline: `${lines.length} lines`, fields }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
