import { useState, useMemo, useRef } from 'react'
import { useSourceStore } from '../sources/source-store'
import type { SourceItem } from '../sources/source-store'
import { Dropdown } from '@revelith/ui'
import {
  formatCitation,
  generateBibliography,
} from '@revelith/agent-core/citations/citation-engine'
import {
  traySourceToCitationSource,
  CITATION_STYLES,
  CITATION_STYLE_LABELS,
} from '@revelith/agent-core/citations/source-adapter'
import type { CitationStyle } from '@revelith/agent-core/citations/types'
import type { TextChunk } from '../sources/source-store'

/* ─── MIME helpers ─────────────────────────────────────────────────────────── */

const MIME_LABEL: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/markdown': 'Markdown',
  'text/plain': 'Text',
}

const MIME_ICON: Record<string, string> = {
  'application/pdf': '📕',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📘',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📗',
  'text/markdown': '📝',
  'text/plain': '📄',
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/markdown',
  'text/plain',
]

/* ─── Auto reference extraction ─────────────────────────────────────────────── */

interface ExtractedMeta {
  title?: string
  authors?: string
  year?: string
  url?: string
  doi?: string
  publisher?: string
}

/**
 * Heuristic extraction of bibliographic metadata from plain text.
 */
function extractMetaFromText(text: string): ExtractedMeta {
  const meta: ExtractedMeta = {}
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)

  // DOI
  const doiMatch = text.match(/\b10\.\d{4,}\/[^\s"'<>]+/i)
  if (doiMatch) meta.doi = doiMatch[0]!.replace(/[.,;]+$/, '')

  // URL (only when no DOI)
  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i)
  if (urlMatch && !meta.doi) meta.url = urlMatch[0]!.replace(/[.,;]+$/, '')

  // Year
  const yearMatch = text.match(/\b(19|20)\d{2}\b/)
  if (yearMatch) meta.year = yearMatch[0]!

  // Title heuristic: first substantial non-short line
  const titleLine = lines.find((l) => l.trim().length > 15 && l.trim().length < 200)
  if (titleLine) meta.title = titleLine.trim()

  // Authors: "Author: …" / "By …" or APA-style "Lastname, F."
  const authorByMatch = text.match(/^(?:authors?|by)[:\s]+(.+)$/im)
  if (authorByMatch) {
    meta.authors = authorByMatch[1]!.trim()
  } else {
    const apaMatch = text.match(
      /([A-Z][a-z]+,\s+[A-Z]\.(?:\s*[A-Z]\.)?)\s*(?:&|and)?\s*(?:et al\.)?/i,
    )
    if (apaMatch) meta.authors = apaMatch[1]!
  }

  // Publisher / Journal
  const pubMatch = text.match(/(?:publisher|journal|published by)[:\s]+([^\n]+)/i)
  if (pubMatch) meta.publisher = pubMatch[1]!.trim()

  return meta
}

/**
 * Extract all citation-like references from document text.
 * Exported for use by AI / editor paste handlers.
 */
export function extractReferencesList(text: string): string[] {
  const refs: string[] = []
  let m: RegExpExecArray | null

  // APA/Harvard: "Lastname, F. (YEAR)."
  const apaRegex = /[A-Z][a-z]+,\s+(?:[A-Z]\.\s*)+\((?:19|20)\d{2}\)\./g
  while ((m = apaRegex.exec(text)) !== null) {
    const snippet = text.slice(m.index, m.index + 300).split('\n')[0]!
    if (snippet && !refs.includes(snippet.trim())) refs.push(snippet.trim())
  }

  // IEEE: "[1] Author, ..."
  const ieeeRegex = /\[\d+\]\s+[A-Z][a-z]+[,\s].{10,100}/g
  while ((m = ieeeRegex.exec(text)) !== null) {
    const snippet = text.slice(m.index, m.index + 250).split('\n')[0]!
    if (snippet && !refs.includes(snippet.trim())) refs.push(snippet.trim())
  }

  // DOI lines
  const doiRegex = /https?:\/\/doi\.org\/10\.\d{4,}\/[^\s"'<>]+/gi
  while ((m = doiRegex.exec(text)) !== null) {
    if (!refs.includes(m[0]!)) refs.push(m[0]!)
  }

  return refs
}

/* ─── Helpers ────────────────────────────────────────────────────────────────*/

function chunkText(text: string, chunkSize = 1500): TextChunk[] {
  const chunks: TextChunk[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push({
      id: crypto.randomUUID(),
      text: text.slice(i, i + chunkSize),
      pageNumber: Math.floor(i / chunkSize) + 1,
    })
  }
  return chunks
}

function copyText(text: string): void {
  try {
    void navigator.clipboard.writeText(text)
  } catch {
    /* headless */
  }
}

function insertAtCursor(editor: any | undefined, text: string): boolean {
  try {
    if (editor && !editor.isDestroyed) {
      editor.chain().focus().insertContent(text).run()
      return true
    }
  } catch {
    /* fall through */
  }
  copyText(text)
  return false
}

function footnoteNumber(visible: SourceItem[], sourceId: string): number {
  const idx = visible.findIndex((s) => s.id === sourceId)
  return idx >= 0 ? idx + 1 : 1
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/* ─── MetaEditor ─────────────────────────────────────────────────────────────*/

interface MetaEditorProps {
  source: SourceItem
  onSave: (updates: Partial<SourceItem['metadata']>) => void
  onCancel: () => void
}

function MetaEditor({ source, onSave, onCancel }: MetaEditorProps) {
  const meta = source.metadata ?? {}
  const [title, setTitle] = useState<string>((meta.title as string) ?? source.fileName)
  const [authors, setAuthors] = useState<string>((meta.authors as string) ?? '')
  const [year, setYear] = useState<string>(String(meta.year ?? ''))
  const [publisher, setPublisher] = useState<string>((meta.publisher as string) ?? '')
  const [url, setUrl] = useState<string>((meta.url as string) ?? '')
  const [doi, setDoi] = useState<string>((meta.doi as string) ?? '')

  return (
    <div className="st-meta-editor" onClick={(e) => e.stopPropagation()}>
      <div className="st-meta-row">
        <label className="st-meta-label">Title</label>
        <input
          className="st-meta-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Document title…"
        />
      </div>
      <div className="st-meta-row">
        <label className="st-meta-label">Authors</label>
        <input
          className="st-meta-input"
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
          placeholder="Last, F.; Last2, F."
        />
      </div>
      <div className="st-meta-row st-meta-row--half">
        <div>
          <label className="st-meta-label">Year</label>
          <input
            className="st-meta-input"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2024"
            style={{ width: 80 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="st-meta-label">Publisher / Journal</label>
          <input
            className="st-meta-input"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            placeholder="Publisher or journal name"
          />
        </div>
      </div>
      <div className="st-meta-row">
        <label className="st-meta-label">DOI</label>
        <input
          className="st-meta-input"
          value={doi}
          onChange={(e) => setDoi(e.target.value)}
          placeholder="10.XXXX/…"
        />
      </div>
      <div className="st-meta-row">
        <label className="st-meta-label">URL</label>
        <input
          className="st-meta-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="st-meta-actions">
        <button className="st-btn st-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="st-btn st-btn--primary"
          onClick={() => onSave({ title, authors, year, publisher, url, doi })}
        >
          Save
        </button>
      </div>
    </div>
  )
}

/* ─── SourceCard ─────────────────────────────────────────────────────────────*/

interface SourceCardProps {
  source: SourceItem
  index: number
  bibStyle: CitationStyle
  editor: any
  onRemove: () => void
  onUpdateMeta: (id: string, meta: Record<string, unknown>) => void
  onFlash: (msg: string, kind?: 'info' | 'success' | 'error') => void
  filteredSources: SourceItem[]
}

function SourceCard({
  source,
  index,
  bibStyle,
  editor,
  onRemove,
  onUpdateMeta,
  onFlash,
  filteredSources,
}: SourceCardProps) {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const citeSource = (style: CitationStyle) => {
    const citation = traySourceToCitationSource(source)
    const formatted = formatCitation(citation, style, footnoteNumber(filteredSources, source.id))
    const inserted = insertAtCursor(editor, formatted.inText)
    copyText(formatted.fullReference)
    onFlash(
      inserted
        ? `Inserted ${formatted.inText} — full reference copied`
        : 'Editor unavailable — full reference copied instead',
    )
  }

  const copyReference = (style: CitationStyle) => {
    const citation = traySourceToCitationSource(source)
    const formatted = formatCitation(citation, style, footnoteNumber(filteredSources, source.id))
    copyText(formatted.fullReference)
    onFlash(`Copied ${CITATION_STYLE_LABELS[style]} reference for ${source.fileName}`)
  }

  const insertFootnote = () => {
    const n = footnoteNumber(filteredSources, source.id)
    const citation = traySourceToCitationSource(source)
    const formatted = formatCitation(citation, 'chicago', n)
    const inserted = insertAtCursor(editor, ` [${n}] ${formatted.fullReference}`)
    onFlash(inserted ? `Inserted footnote [${n}]` : 'Editor unavailable — footnote copied instead')
    if (!inserted) copyText(`[${n}] ${formatted.fullReference}`)
  }

  const icon = MIME_ICON[source.mimeType] ?? '📄'
  const typeLabel = MIME_LABEL[source.mimeType] ?? source.mimeType
  const displayTitle = (source.metadata?.title as string) || source.fileName
  const authorsStr = source.metadata?.authors as string | undefined
  const year = source.metadata?.year as string | undefined

  return (
    <div
      className={`st-card${expanded ? ' st-card--expanded' : ''}`}
      aria-label={`Source: ${displayTitle}`}
    >
      <div
        className="st-card-header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <span className="st-card-icon" aria-hidden="true">
          {icon}
        </span>
        <div className="st-card-info">
          <div className="st-card-title" title={displayTitle}>
            {displayTitle}
          </div>
          <div className="st-card-meta">
            {(authorsStr || year) && (
              <span className="st-meta-pill">
                {authorsStr}
                {year ? (authorsStr ? `, ${year}` : year) : ''}
              </span>
            )}
            <span className="st-meta-pill st-meta-pill--type">{typeLabel}</span>
            <span className="st-meta-pill">{formatSize(source.size)}</span>
            {source.chunks.length > 0 && (
              <span className="st-meta-pill">{source.chunks.length} chunks</span>
            )}
            <span className="st-meta-pill">{formatDate(source.addedAt)}</span>
          </div>
        </div>
        <span className="st-card-badge">{index + 1}</span>
        <svg
          className="st-card-chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 4l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <button
          className="st-icon-btn st-card-remove"
          title="Remove source"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label="Remove source"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M1 1l10 10M11 1L1 11"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="st-card-body">
          {editing ? (
            <MetaEditor
              source={source}
              onSave={(updates) => {
                onUpdateMeta(source.id, { ...source.metadata, ...updates })
                setEditing(false)
                onFlash(`Updated metadata for ${source.fileName}`)
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <div className="st-card-section-label">Insert citation</div>
              <div className="st-cite-row">
                {CITATION_STYLES.map((style) => (
                  <button
                    key={style}
                    className="st-btn st-btn--cite"
                    title={`Insert ${CITATION_STYLE_LABELS[style]} citation at cursor`}
                    onClick={() => citeSource(style)}
                  >
                    {CITATION_STYLE_LABELS[style]}
                  </button>
                ))}
              </div>

              <div className="st-card-actions">
                <button className="st-btn st-btn--ghost" onClick={() => setEditing(true)}>
                  ✏️ Edit Info
                </button>
                <button className="st-btn st-btn--ghost" onClick={() => copyReference(bibStyle)}>
                  📋 Copy Ref
                </button>
                <button className="st-btn st-btn--ghost" onClick={insertFootnote}>
                  [n] Footnote
                </button>
              </div>

              {source.extractedText && (
                <div className="st-card-preview">
                  {source.extractedText.slice(0, 220)}
                  {source.extractedText.length > 220 ? '…' : ''}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── SourceTray ─────────────────────────────────────────────────────────────*/

interface SourceTrayProps {
  onClose?: () => void
  editor?: any
}

const CATEGORIES = ['Contract', 'Invoice', 'Report', 'Research', 'Legal', 'Financial', 'Other']

const TYPE_OPTIONS = [
  { value: 'application/pdf', label: 'PDF' },
  {
    value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'DOCX',
  },
  { value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'XLSX' },
  { value: 'text/markdown', label: 'Markdown' },
  { value: 'text/plain', label: 'Text' },
]

export function SourceTray({ onClose, editor }: SourceTrayProps) {
  const {
    sources,
    groundedWrite,
    filters,
    addSource,
    removeSource,
    clearAll,
    setGroundedWrite,
    citationStyle: bibStyle,
    setCitationStyle: setBibStyle,
    setFilters,
    getFilteredSources,
    getGroundedContext,
  } = useSourceStore()

  const [dragActive, setDragActive] = useState(false)
  const [notice, setNotice] = useState<{ text: string; kind: 'info' | 'success' | 'error' } | null>(
    null,
  )
  const [processing, setProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredSources = useMemo(
    () => getFilteredSources(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources, filters],
  )

  const contextChars = getGroundedContext(200).length

  const flash = (text: string, kind: 'info' | 'success' | 'error' = 'success') => {
    setNotice({ text, kind })
    window.setTimeout(() => setNotice((cur) => (cur?.text === text ? null : cur)), 4000)
  }

  const ingestFiles = async (files: File[]) => {
    if (files.length === 0) return
    setProcessing(true)
    let added = 0
    for (const file of files) {
      const isKnownType = ACCEPTED_TYPES.includes(file.type)
      const isTextExtension = /\.(txt|md|markdown)$/i.test(file.name)
      if (!isKnownType && !isTextExtension && file.type !== '') continue
      try {
        const text = await file.text()
        const chunks = chunkText(text)
        const extracted = extractMetaFromText(text)
        await addSource({
          fileName: file.name,
          filePath: '',
          mimeType: file.type || 'text/plain',
          size: file.size,
          extractedText: text,
          chunks,
          metadata: {
            category: 'Other',
            ...(extracted.title ? { title: extracted.title } : {}),
            ...(extracted.authors ? { authors: extracted.authors } : {}),
            ...(extracted.year ? { year: extracted.year } : {}),
            ...(extracted.doi ? { doi: extracted.doi } : {}),
            ...(extracted.url ? { url: extracted.url } : {}),
            ...(extracted.publisher ? { publisher: extracted.publisher } : {}),
          },
        })
        added++
      } catch (err) {
        console.error('Failed to add source:', err)
      }
    }
    setProcessing(false)
    if (added > 0) flash(`Added ${added} source${added > 1 ? 's' : ''}`, 'success')
    else flash('No supported files found', 'error')
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    await ingestFiles(Array.from(e.dataTransfer.files))
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await ingestFiles(Array.from(e.target.files ?? []))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUpdateMeta = async (sourceId: string, meta: Record<string, unknown>) => {
    const source = sources.find((s) => s.id === sourceId)
    if (!source) return
    await removeSource(sourceId)
    await addSource({
      fileName: source.fileName,
      filePath: source.filePath,
      mimeType: source.mimeType,
      size: source.size,
      extractedText: source.extractedText,
      chunks: source.chunks,
      metadata: meta,
    })
  }

  const handleSortChange = (v: string) => {
    const parts = v.split(':')
    setFilters({
      sortBy: parts[0] as 'date' | 'name' | 'type' | 'size',
      sortOrder: (parts[1] ?? 'desc') as 'asc' | 'desc',
    })
  }

  const currentSort = `${filters.sortBy}:${filters.sortOrder}`

  const insertBibliography = () => {
    if (filteredSources.length === 0) {
      flash('No sources to include in bibliography', 'error')
      return
    }
    const citationSources = filteredSources.map(traySourceToCitationSource)
    const body = generateBibliography(citationSources, bibStyle)
    const text = `References (${CITATION_STYLE_LABELS[bibStyle]})\n\n${body}`
    const inserted = insertAtCursor(editor, text)
    if (!inserted) copyText(text)
    flash(
      inserted
        ? `Inserted ${CITATION_STYLE_LABELS[bibStyle]} bibliography (${filteredSources.length} sources)`
        : 'Editor unavailable — bibliography copied instead',
    )
  }

  return (
    <aside
      className={`st-panel${dragActive ? ' st-panel--drag' : ''}${processing ? ' st-panel--busy' : ''}`}
      aria-label="Source Tray"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="st-drag-overlay" aria-hidden="true">
          <span className="st-drag-icon">📥</span>
          <span className="st-drag-text">Drop files to add sources</span>
        </div>
      )}

      {/* Header */}
      <header className="st-header">
        <div className="st-header-title">
          <svg
            className="st-header-icon"
            width="17"
            height="17"
            viewBox="0 0 17 17"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="1.5"
              y="3"
              width="14"
              height="11.5"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M4.5 6.5h8M4.5 9.5h5.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
            <path
              d="M4.5 1.5v3M12.5 1.5v3"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <h3 className="st-header-h">Source Tray</h3>
          {sources.length > 0 && <span className="st-count-badge">{sources.length}</span>}
        </div>
        <div className="st-header-actions">
          {sources.length > 0 && (
            <button
              className="st-icon-btn"
              title="Clear all sources"
              onClick={() => void clearAll()}
              aria-label="Clear all sources"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path
                  d="M2 4h11M5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4M6 7v4.5M9 7v4.5M3 4l.7 8a1.5 1.5 0 001.5 1.5h4.6a1.5 1.5 0 001.5-1.5L12 4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {onClose && (
            <button
              className="st-icon-btn"
              title="Close Source Tray"
              onClick={onClose}
              aria-label="Close Source Tray"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 1l12 12M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Grounded Write toggle */}
      <div className="st-grounded-row">
        <label className="st-toggle" htmlFor="st-grounded-write">
          <input
            id="st-grounded-write"
            type="checkbox"
            className="st-toggle-input"
            checked={groundedWrite}
            onChange={(e) => setGroundedWrite(e.target.checked)}
          />
          <span className="st-toggle-track" aria-hidden="true">
            <span className="st-toggle-thumb" />
          </span>
          <span className="st-toggle-label">Grounded Write</span>
        </label>
        {groundedWrite && (
          <span className="st-context-chars" title="Characters available for grounded generation">
            {contextChars.toLocaleString()} chars
          </span>
        )}
      </div>

      {/* Flash notice */}
      {notice && (
        <div className={`st-notice st-notice--${notice.kind}`} role="status" aria-live="polite">
          {notice.kind === 'success' && '✓ '}
          {notice.kind === 'error' && '✕ '}
          {notice.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="st-toolbar">
        <div className="st-search-wrap">
          <svg
            className="st-search-icon"
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            className="st-search"
            placeholder="Search sources…"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            aria-label="Search sources"
          />
          {filters.search && (
            <button
              className="st-search-clear"
              onClick={() => setFilters({ search: '' })}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="st-filter-row">
          <Dropdown
            value={filters.categories.length === 0 ? 'all' : filters.categories[0]!}
            options={[
              { value: 'all', label: 'All Categories' },
              ...CATEGORIES.map((c) => ({ value: c, label: c })),
            ]}
            onPick={(v) => {
              if (v === 'all') setFilters({ categories: [] })
              else setFilters({ categories: [v] })
            }}
          />
          <Dropdown
            value={filters.types.length === 0 ? 'all' : filters.types[0]!}
            options={[{ value: 'all', label: 'All Types' }, ...TYPE_OPTIONS]}
            onPick={(v) => {
              if (v === 'all') setFilters({ types: [] })
              else setFilters({ types: [v] })
            }}
          />
          <Dropdown
            value={currentSort}
            options={[
              { value: 'date:desc', label: 'Newest first' },
              { value: 'date:asc', label: 'Oldest first' },
              { value: 'name:asc', label: 'Name A–Z' },
              { value: 'name:desc', label: 'Name Z–A' },
              { value: 'size:desc', label: 'Largest first' },
              { value: 'type:asc', label: 'By Type' },
            ]}
            onPick={handleSortChange}
          />
        </div>
      </div>

      {/* Source list */}
      <div className="st-list" role="list" aria-label="Sources list">
        {filteredSources.length === 0 ? (
          <div className="st-empty">
            <span className="st-empty-icon" aria-hidden="true">
              📚
            </span>
            <p className="st-empty-title">
              {sources.length > 0 ? 'No matching sources' : 'No sources yet'}
            </p>
            <p className="st-empty-hint">
              Drop PDFs, DOCX, Markdown, or text files here, or click below to browse. Sources are
              saved with the document.
            </p>
            <button
              className="st-btn st-btn--primary st-empty-cta"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Files
            </button>
          </div>
        ) : (
          <div className="st-cards">
            {filteredSources.map((source, i) => (
              <SourceCard
                key={source.id}
                source={source}
                index={i}
                bibStyle={bibStyle}
                editor={editor}
                onRemove={() => void removeSource(source.id)}
                onUpdateMeta={(id, meta) => void handleUpdateMeta(id, meta)}
                onFlash={flash}
                filteredSources={filteredSources}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="st-footer">
        <div className="st-footer-row">
          <button
            className="st-btn st-btn--ghost st-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
            title="Browse and add files"
          >
            {processing ? '⏳ Processing…' : '📎 Add Files'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.xlsx,.xls,.md,.markdown,.txt"
            style={{ display: 'none' }}
            onChange={handleFileInput}
            aria-hidden="true"
          />
        </div>

        <div className="st-footer-row st-footer-bib">
          <Dropdown
            value={bibStyle}
            options={CITATION_STYLES.map((style) => ({
              value: style,
              label: CITATION_STYLE_LABELS[style],
            }))}
            onPick={(v) => setBibStyle(v as CitationStyle)}
          />
          <button
            className="st-btn st-btn--primary"
            onClick={insertBibliography}
            disabled={filteredSources.length === 0}
            title={`Insert ${CITATION_STYLE_LABELS[bibStyle]} reference list at cursor`}
          >
            Generate Bibliography
          </button>
        </div>
      </footer>
    </aside>
  )
}
