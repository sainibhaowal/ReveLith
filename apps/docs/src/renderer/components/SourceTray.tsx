import { useState, useMemo } from 'react'
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

const MIME_ICONS: Record<string, string> = {
  'application/pdf': 'file-text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file-text',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'table',
  'text/markdown': 'file-text',
  'text/plain': 'file-text',
}

interface SourceTrayProps {
  onClose?: () => void
  /** Tiptap editor instance: citations insert at the cursor when present. */
  editor?: any
}

function copyText(text: string): void {
  try {
    void navigator.clipboard.writeText(text)
  } catch {
    /* clipboard unavailable (headless test env): insertion is the primary path */
  }
}

/** Insert plain text at the cursor; falls back to clipboard when no editor is mounted. */
function insertAtCursor(editor: any | undefined, text: string): boolean {
  try {
    if (editor && !editor.isDestroyed) {
      editor.chain().focus().insertContent(text).run()
      return true
    }
  } catch {
    /* fall through to clipboard */
  }
  copyText(text)
  return false
}

/** 1-based footnote number for a source within the currently visible list. */
function footnoteNumber(visible: SourceItem[], sourceId: string): number {
  const idx = visible.findIndex((s) => s.id === sourceId)
  return idx >= 0 ? idx + 1 : 1
}

export function SourceTray({ onClose, editor }: SourceTrayProps) {
  const {
    sources,
    groundedWrite,
    filters,
    addSource,
    removeSource,
    clearAll,
    setGroundedWrite,
    setFilters,
    getFilteredSources,
    getGroundedContext,
  } = useSourceStore()

  const [dragActive, setDragActive] = useState(false)
  const [sortBy, setSortBy] = useState<string>('date')
  const [bibStyle, setBibStyle] = useState<CitationStyle>('apa')
  const [notice, setNotice] = useState<string | null>(null)

  const categories = ['Contract', 'Invoice', 'Report', 'Research', 'Legal', 'Financial', 'Other']
  const typeOptions = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain',
  ]

  const filteredSources = useMemo(() => getFilteredSources(), [getFilteredSources])

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 4000)
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

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    for (const file of files) {
      try {
        const text = await file.text()
        const chunks = chunkText(text)
        await addSource({
          fileName: file.name,
          filePath: '',
          mimeType: file.type || 'text/plain',
          size: file.size,
          extractedText: text,
          chunks,
          metadata: { category: 'Other' },
        })
      } catch (err) {
        console.error('Failed to add source:', err)
      }
    }
  }

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString()
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  /** Insert an in-text citation for one source and copy its full reference. */
  const citeSource = (source: SourceItem, style: CitationStyle) => {
    const citation = traySourceToCitationSource(source)
    const formatted = formatCitation(citation, style, footnoteNumber(filteredSources, source.id))
    const inserted = insertAtCursor(editor, formatted.inText)
    copyText(formatted.fullReference)
    flash(
      inserted
        ? `Inserted ${formatted.inText} — full reference copied`
        : 'Editor unavailable — full reference copied instead',
    )
  }

  const copyReference = (source: SourceItem, style: CitationStyle) => {
    const citation = traySourceToCitationSource(source)
    const formatted = formatCitation(citation, style, footnoteNumber(filteredSources, source.id))
    copyText(formatted.fullReference)
    flash(`Copied ${CITATION_STYLE_LABELS[style]} reference for ${source.fileName}`)
  }

  /** Insert a numbered footnote marker plus its reference text at the cursor. */
  const insertFootnote = (source: SourceItem) => {
    const n = footnoteNumber(filteredSources, source.id)
    const citation = traySourceToCitationSource(source)
    const formatted = formatCitation(citation, 'chicago', n)
    const inserted = insertAtCursor(editor, ` [${n}] ${formatted.fullReference}`)
    flash(inserted ? `Inserted footnote [${n}]` : 'Editor unavailable — footnote copied instead')
    if (!inserted) copyText(`[${n}] ${formatted.fullReference}`)
  }

  /** Insert the full bibliography for the visible sources at the cursor. */
  const insertBibliography = (style: CitationStyle) => {
    if (filteredSources.length === 0) {
      flash('No sources to include in the bibliography')
      return
    }
    const citationSources = filteredSources.map(traySourceToCitationSource)
    const body = generateBibliography(citationSources, style)
    const text = `References (${CITATION_STYLE_LABELS[style]})\n\n${body}`
    const inserted = insertAtCursor(editor, text)
    if (!inserted) copyText(text)
    flash(
      inserted
        ? `Inserted ${CITATION_STYLE_LABELS[style]} bibliography (${filteredSources.length} sources)`
        : 'Editor unavailable — bibliography copied instead',
    )
  }

  return (
    <div
      className="revelith-source-tray"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ opacity: dragActive ? 0.95 : 1 }}
    >
      <div className="source-tray-header">
        <h3>{'Source Tray'}</h3>
        <div className="header-actions">
          <label>
            <input
              type="checkbox"
              checked={groundedWrite}
              onChange={(e) => setGroundedWrite(e.target.checked)}
              id="grounded-write"
            />
            <span>{'Grounded Write'}</span>
          </label>
          {sources.length > 0 && (
            <button className="button ghost sm" onClick={clearAll}>
              {'Clear All'}
            </button>
          )}
          {onClose && (
            <button className="button ghost sm" onClick={onClose} aria-label="Close Source Tray">
              ✕
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="source-tray-notice" role="status">
          {notice}
        </div>
      )}

      <div className="source-tray-toolbar">
        <input
          className="text-field"
          placeholder={'Search sources...'}
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          style={{ flex: 1, maxWidth: 300 }}
        />

        <Dropdown
          value={filters.categories.length === 0 ? 'all' : filters.categories.join(',')}
          options={[
            { value: 'all', label: 'All Categories' },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          onPick={(v) => {
            if (v === 'all') setFilters({ categories: [] })
            else
              setFilters({
                categories: filters.categories.includes(v)
                  ? filters.categories.filter((x) => x !== v)
                  : [...filters.categories, v],
              })
          }}
        />

        <Dropdown
          value={filters.types.length === 0 ? 'all' : filters.types.join(',')}
          options={[
            { value: 'all', label: 'All Types' },
            ...typeOptions.map((t) => ({ value: t, label: t })),
          ]}
          onPick={(v) => {
            if (v === 'all') setFilters({ types: [] })
            else
              setFilters({
                types: filters.types.includes(v)
                  ? filters.types.filter((x) => x !== v)
                  : [...filters.types, v],
              })
          }}
        />

        <Dropdown
          value={sortBy}
          options={[
            { value: 'date', label: 'Date Added' },
            { value: 'name', label: 'Name' },
            { value: 'type', label: 'Type' },
            { value: 'size', label: 'Size' },
          ]}
          onPick={setSortBy}
        />
      </div>

      <div className="source-tray-list">
        {filteredSources.length === 0 ? (
          <div className="source-tray-empty">
            <span style={{ opacity: 0.3, fontSize: 48 }}>📤</span>
            <p>{'Drag PDFs, DOCX, MD, or text files here'}</p>
            <p className="hint">
              {'Sources are saved per document and deleted when the document is deleted'}
            </p>
          </div>
        ) : (
          filteredSources.map((source) => (
            <div key={source.id} className="source-card">
              <div className="source-icon">
                <span style={{ fontSize: 24 }}>
                  {MIME_ICONS[source.mimeType] === 'table' ? '📊' : '📄'}
                </span>
              </div>
              <div className="source-info">
                <div className="source-name" title={source.fileName}>
                  {source.fileName}
                </div>
                <div className="source-meta">
                  <span>{formatDate(source.addedAt)}</span>
                  <span>•</span>
                  <span>{formatSize(source.size)}</span>
                  {source.chunks.length > 0 && <span>• {source.chunks.length} chunks</span>}
                </div>
                <div className="source-cite-row">
                  {CITATION_STYLES.map((style) => (
                    <button
                      key={style}
                      className="button ghost xs"
                      title={`Insert ${CITATION_STYLE_LABELS[style]} citation at cursor (full reference copied)`}
                      onClick={() => citeSource(source, style)}
                    >
                      {CITATION_STYLE_LABELS[style]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="source-actions">
                <button
                  className="button ghost sm"
                  title="Copy full reference (APA)"
                  onClick={() => copyReference(source, 'apa')}
                >
                  Copy ref
                </button>
                <button
                  className="button ghost sm"
                  title="Insert numbered footnote at cursor"
                  onClick={() => insertFootnote(source)}
                >
                  Footnote
                </button>
                <button
                  className="button ghost sm"
                  title="Remove source"
                  onClick={() => void removeSource(source.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="source-tray-footer">
        <div className="grounded-context-preview">
          <label>
            <input
              type="checkbox"
              checked={groundedWrite}
              onChange={(e) => setGroundedWrite(e.target.checked)}
            />
            <span>{'Grounded Write'}</span>
          </label>
          <span className="context-chars">
            {getGroundedContext(200).length} chars available for grounded generation
          </span>
        </div>
        <div className="bibliography-row">
          <Dropdown
            value={bibStyle}
            options={CITATION_STYLES.map((style) => ({
              value: style,
              label: CITATION_STYLE_LABELS[style],
            }))}
            onPick={(v) => setBibStyle(v as CitationStyle)}
          />
          <button
            className="button secondary sm"
            onClick={() => insertBibliography(bibStyle)}
            disabled={filteredSources.length === 0}
            title="Insert the full reference list for the visible sources at the cursor"
          >
            Generate Bibliography
          </button>
        </div>
      </div>
    </div>
  )
}

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
