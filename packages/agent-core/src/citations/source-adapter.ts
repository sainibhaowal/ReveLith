import { parseAuthorString } from './citation-engine'
import type { Author, CitationStyle, SourceType } from './types'
import type { SourceItem as CitationSource } from './types'

/** Minimal structural shape of a docs Source Tray item (avoids importing Electron main code). */
export interface TraySourceLike {
  id: string
  docSessionId: string
  fileName: string
  filePath: string
  mimeType: string
  size: number
  addedAt: number
  contentHash: string
  extractedText: string
  chunks: Array<{ id: string; text: string; pageNumber?: number }>
  metadata: Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function asYear(value: unknown, fallbackTs: number): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  const year = new Date(fallbackTs).getFullYear()
  return Number.isFinite(year) ? year : 'n.d.'
}

function sourceTypeOf(mimeType: string, category: string | undefined): SourceType {
  const mime = mimeType.toLowerCase()
  if (mime.includes('pdf')) return 'report'
  if (mime.includes('word') || mime.includes('officedocument')) return 'report'
  if (mime.includes('sheet') || mime.includes('excel')) return 'dataset'
  if (mime.includes('markdown') || mime.includes('text') || mime.includes('html')) return 'website'
  const cat = (category ?? '').toLowerCase()
  if (cat.includes('contract') || cat.includes('legal')) return 'contract'
  if (cat.includes('invoice') || cat.includes('financ')) return 'report'
  if (cat.includes('research') || cat.includes('report')) return 'report'
  return 'other'
}

/**
 * Adapt a docs Source Tray item into a citation-engine SourceItem.
 * File-backed sources rarely carry bibliographic metadata, so authors fall
 * back to metadata.authors (parsed) or Anonymous, and the year falls back
 * to metadata.year or the year the source was added.
 */
export function traySourceToCitationSource(item: TraySourceLike): CitationSource {
  const meta = item.metadata ?? {}
  const rawAuthors = asString(meta.authors) ?? asString(meta.author)
  let authors: Author[] = rawAuthors ? parseAuthorString(rawAuthors) : []
  if (authors.length === 0) {
    const fallbackName = asString(meta.creator) ?? item.fileName.replace(/\.[^.]+$/, '')
    authors = fallbackName ? [{ lastName: fallbackName }] : [{ lastName: 'Anonymous' }]
  }
  const category = asString(meta.category)
  const publicationTitle = asString(meta.publicationTitle)
  const publisher = asString(meta.publisher)
  const volume = asString(meta.volume)
  const issue = asString(meta.issue)
  const pages = asString(meta.pages)
  const url = asString(meta.url)
  const doi = asString(meta.doi)
  return {
    id: item.id,
    docSessionId: item.docSessionId,
    title: asString(meta.title) ?? item.fileName,
    authors,
    year: asYear(meta.year ?? meta.publicationDate, item.addedAt),
    ...(publicationTitle !== undefined ? { publicationTitle } : {}),
    ...(publisher !== undefined ? { publisher } : {}),
    ...(volume !== undefined ? { volume } : {}),
    ...(issue !== undefined ? { issue } : {}),
    ...(pages !== undefined ? { pages } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(doi !== undefined ? { doi } : {}),
    sourceType: sourceTypeOf(item.mimeType, category),
    summary: item.extractedText.slice(0, 500),
    fullText: item.extractedText,
    createdAt: item.addedAt,
    updatedAt: item.addedAt,
    tags: category ? [category] : [],
  }
}

/** Styles supported by the Source Tray citation menu, in display order. */
export const CITATION_STYLES: CitationStyle[] = ['apa', 'harvard', 'chicago', 'mla', 'ieee']

export const CITATION_STYLE_LABELS: Record<CitationStyle, string> = {
  apa: 'APA 7th',
  harvard: 'Harvard',
  chicago: 'Chicago',
  mla: 'MLA 9th',
  ieee: 'IEEE',
}
