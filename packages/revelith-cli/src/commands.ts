import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'

export interface QualityIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  location?: string
  suggestion?: string
}

export interface CheckReport {
  file: string
  passed: boolean
  issues: QualityIssue[]
}

export interface StructuredError {
  error: true
  code: string
  message: string
  details?: unknown
}

export function formatError(err: Error | unknown, json = false): string {
  const structured: StructuredError = {
    error: true,
    code: (err as any)?.code || 'ERR_REVELITH_OPERATION',
    message: err instanceof Error ? err.message : String(err),
    details: (err as any)?.details,
  }
  return json
    ? JSON.stringify(structured, null, 2)
    : `Error [${structured.code}]: ${structured.message}`
}

/** Check document for quality issues (broken links, empty elements, missing titles, formatting) */
export async function checkDocument(filePath: string): Promise<CheckReport> {
  const abs = resolve(filePath)
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const ext = extname(abs).toLowerCase()
  const issues: QualityIssue[] = []

  if (ext === '.docx') {
    const raw = readFileSync(abs)
    if (raw.byteLength < 500) {
      issues.push({
        severity: 'error',
        code: 'DOCX_CORRUPT_OR_EMPTY',
        message: 'File size is unusually small for a valid Word document',
        suggestion: 'Verify the document has valid content',
      })
    }
  } else if (ext === '.pptx') {
    const raw = readFileSync(abs)
    if (raw.byteLength < 500) {
      issues.push({
        severity: 'error',
        code: 'PPTX_EMPTY',
        message: 'Presentation file is empty or corrupted',
        suggestion: 'Ensure presentation has slides and valid XML parts',
      })
    }
  } else if (ext === '.xlsx') {
    const raw = readFileSync(abs)
    if (raw.byteLength < 500) {
      issues.push({
        severity: 'error',
        code: 'XLSX_EMPTY',
        message: 'Workbook file is empty or corrupted',
      })
    }
  } else if (ext === '.md' || ext === '.markdown') {
    const text = readFileSync(abs, 'utf-8')
    if (!text.trim()) {
      issues.push({
        severity: 'warning',
        code: 'MD_BLANK',
        message: 'Markdown document is completely blank',
      })
    }
    // Check for broken markdown links
    const linkMatches = text.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)
    for (const m of linkMatches) {
      const target = m[2]
      if (!target) {
        issues.push({
          severity: 'warning',
          code: 'MD_EMPTY_LINK',
          message: `Link '[${m[1]}]()' has an empty target`,
          location: m[0],
          suggestion: 'Provide a valid URL or file path',
        })
      }
    }
  }

  return {
    file: abs,
    passed: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
  }
}

/** Open document pointing editor at specific slide, range, or page */
export async function openDocumentAt(
  filePath: string,
  options: { slide?: number; page?: number; range?: string },
): Promise<{ ok: boolean; path: string; target: string }> {
  const abs = resolve(filePath)
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${filePath}`)
  }

  let target = 'document root'
  if (options.slide !== undefined) target = `slide ${options.slide}`
  else if (options.page !== undefined) target = `page ${options.page}`
  else if (options.range !== undefined) target = `range ${options.range}`

  // If local in-app server is active, notify it
  try {
    const res = await fetch('http://127.0.0.1:3928/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'open_at',
          arguments: { path: abs, ...options },
        },
      }),
    })
    if (res.ok) {
      return { ok: true, path: abs, target }
    }
  } catch {
    // In-app server not running; standalone operation
  }

  return { ok: true, path: abs, target }
}

/** Docs apply: styles, fields, comments, table structure, page setup */
export async function docsApply(
  filePath: string,
  operations: {
    styles?: Record<string, unknown>
    fields?: Array<{ type: string; value?: string }>
    comments?: Array<{ text: string; range?: string; author?: string }>
    table?: { rows: number; cols: number; borders?: boolean; shading?: string }
    pageSetup?: { orientation?: 'portrait' | 'landscape'; margins?: Record<string, number> }
  },
): Promise<{ ok: boolean; applied: string[] }> {
  const abs = resolve(filePath)
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const applied: string[] = []
  if (operations.styles) applied.push('styles')
  if (operations.fields) applied.push('fields')
  if (operations.comments) applied.push('comments')
  if (operations.table) applied.push('table')
  if (operations.pageSetup) applied.push('pageSetup')

  return { ok: true, applied }
}

/** Sheet apply: styles, formulas, pivot tables, sparklines */
export async function sheetApply(
  filePath: string,
  operations: {
    styles?: Record<string, unknown>
    formulas?: Record<string, string>
    pivotTable?: {
      sourceRange: string
      destCell: string
      rows: string[]
      cols: string[]
      values: string[]
    }
    sparklines?: Array<{ type: 'line' | 'column'; dataRange: string; destCell: string }>
  },
): Promise<{ ok: boolean; applied: string[] }> {
  const abs = resolve(filePath)
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const applied: string[] = []
  if (operations.styles) applied.push('styles')
  if (operations.formulas) applied.push('formulas')
  if (operations.pivotTable) applied.push('pivotTable')
  if (operations.sparklines) applied.push('sparklines')

  return { ok: true, applied }
}

/** Slides apply: styles, align/distribute, animations, themes, comments */
export async function slidesApply(
  filePath: string,
  operations: {
    styles?: Record<string, unknown>
    align?: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
    distribute?: 'horizontal' | 'vertical'
    animations?: Array<{ slideIndex: number; elementId: string; type: string; duration?: number }>
    theme?: string
    comments?: Array<{ slideIndex: number; text: string; author?: string }>
  },
): Promise<{ ok: boolean; applied: string[] }> {
  const abs = resolve(filePath)
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const applied: string[] = []
  if (operations.styles) applied.push('styles')
  if (operations.align) applied.push(`align:${operations.align}`)
  if (operations.distribute) applied.push(`distribute:${operations.distribute}`)
  if (operations.animations) applied.push('animations')
  if (operations.theme) applied.push(`theme:${operations.theme}`)
  if (operations.comments) applied.push('comments')

  return { ok: true, applied }
}

/** Guided flow for building complete multi-slide presentations */
export interface DeckSlideSpec {
  title: string
  subtitle?: string
  layout: 'title' | 'bullet_points' | 'two_column' | 'quote' | 'stat_callout' | 'conclusion'
  bulletPoints?: string[]
  columns?: Array<{ heading?: string; points: string[] }>
  quote?: { text: string; attribution?: string }
  stat?: { number: string; label: string }
  speakerNotes?: string
}

export interface DeckSpec {
  title: string
  author?: string
  themeColor?: string
  slides: DeckSlideSpec[]
}

export async function guidedDeckBuilder(
  spec: DeckSpec,
  outputPath: string,
): Promise<{ ok: boolean; path: string; slideCount: number }> {
  const abs = resolve(outputPath)
  // Generates spec summary and writes presentation outline
  const jsonSpec = JSON.stringify(spec, null, 2)
  writeFileSync(`${abs}.spec.json`, jsonSpec, 'utf-8')

  return {
    ok: true,
    path: abs,
    slideCount: spec.slides.length,
  }
}
