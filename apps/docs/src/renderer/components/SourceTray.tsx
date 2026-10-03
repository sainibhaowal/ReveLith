import { useState, useMemo } from 'react'
import { useSourceStore } from '../sources/source-store'
import { Dropdown } from '@revelith/ui'
import { useI18n } from '../i18n/locale'
import type { TextChunk } from '../../main/source-session'

const MIME_ICONS: Record<string, string> = {
  'application/pdf': 'file-text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file-text',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'table',
  'text/markdown': 'file-text',
  'text/plain': 'file-text',
}

export function SourceTray() {
  const t = useI18n()
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

  const filteredSources = useMemo(() => getFilteredSources(), [getFilteredSources])

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

  const handleCategoryChange = (cat: string) => {
    if (cat === 'all') setFilters({ categories: [] })
    else
      setFilters({
        categories: filters.categories.includes(cat)
          ? filters.categories.filter((x) => x !== cat)
          : [...filters.categories, cat],
      })
  }

  const handleTypeChange = (t: string) => {
    if (t === 'all') setFilters({ types: [] })
    else
      setFilters({
        types: filters.types.includes(t)
          ? filters.types.filter((x) => x !== t)
          : [...filters.types, t],
      })
  }

  const handleSortChange = (sort: string) => setSortBy(sort)

  const categories = ['Contract', 'Invoice', 'Report', 'Research', 'Legal', 'Financial', 'Other']
  const typeOptions = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain',
  ]

  return (
    <div
      className="revelith-source-tray"
      onDragOver={(e) => {
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragActive(false)
      }}
      onDrop={async (e: React.DragEvent) => {
        e.preventDefault()
        setDragActive(false)
        const files = Array.from(e.dataTransfer.files)
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
              chunks: chunkText(text),
              metadata: { category: 'Other' },
            })
          } catch (err) {
            console.error('Failed to add source:', err)
          }
        }
      }}
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
        </div>
      </div>

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
                  <span>{new Date(source.addedAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>{formatSize(source.size)}</span>
                  {source.chunks.length > 0 && <span>• {source.chunks.length} chunks</span>}
                </div>
              </div>
              <div className="source-actions">
                <button className="button ghost sm" title="More actions">
                  ⋮
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
              id="grounded-write"
            />
            <span>{'Grounded Write'}</span>
          </label>
          <span className="context-chars">
            {getGroundedContext(200).length} chars available for grounded generation
          </span>
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
