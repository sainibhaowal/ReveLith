import { useState, useEffect } from 'react'
import { Dropdown } from '@revelith/ui'

interface MatrixColumnConfig {
  id: string
  name: string
  description: string
  dataType: 'text' | 'number' | 'date' | 'boolean'
}

export interface MatrixGenerateResult {
  ok: boolean
  path?: string
  error?: string
}

interface MatrixModalProps {
  onClose: () => void
  onGenerate: (files: File[], columns: MatrixColumnConfig[]) => Promise<MatrixGenerateResult>
}

const DEFAULT_CONTRACT_COLUMNS = [
  {
    id: 'parties',
    name: 'Parties',
    description: 'Names of all parties involved',
    dataType: 'text' as const,
  },
  {
    id: 'effectiveDate',
    name: 'Effective Date',
    description: 'Date the agreement becomes active',
    dataType: 'date' as const,
  },
  {
    id: 'term',
    name: 'Term',
    description: 'Duration or end date of agreement',
    dataType: 'text' as const,
  },
  {
    id: 'value',
    name: 'Contract Value',
    description: 'Monetary compensation or price',
    dataType: 'text' as const,
  },
  {
    id: 'governingLaw',
    name: 'Governing Law',
    description: 'Jurisdiction or state governing the contract',
    dataType: 'text' as const,
  },
  {
    id: 'liabilityCap',
    name: 'Liability Cap',
    description: 'Maximum limitation of liability',
    dataType: 'text' as const,
  },
  {
    id: 'terminationNotice',
    name: 'Termination Notice',
    description: 'Notice required to terminate',
    dataType: 'text' as const,
  },
]

const DEFAULT_INVOICE_COLUMNS = [
  {
    id: 'vendorName',
    name: 'Vendor',
    description: 'Name of issuing company',
    dataType: 'text' as const,
  },
  {
    id: 'invoiceNumber',
    name: 'Invoice #',
    description: 'Unique invoice identifier',
    dataType: 'text' as const,
  },
  {
    id: 'invoiceDate',
    name: 'Invoice Date',
    description: 'Date invoice was issued',
    dataType: 'date' as const,
  },
  { id: 'dueDate', name: 'Due Date', description: 'Payment due date', dataType: 'date' as const },
  {
    id: 'subtotal',
    name: 'Subtotal',
    description: 'Amount before taxes',
    dataType: 'number' as const,
  },
  { id: 'taxAmount', name: 'Tax', description: 'Total tax charged', dataType: 'number' as const },
  {
    id: 'totalAmount',
    name: 'Total Due',
    description: 'Final payable amount',
    dataType: 'number' as const,
  },
]

export function MatrixModal({ onClose, onGenerate }: MatrixModalProps) {
  const [files, setFiles] = useState<File[]>([])
  const [columns, setColumns] = useState<MatrixColumnConfig[]>(DEFAULT_CONTRACT_COLUMNS)
  const [preset, setPreset] = useState<'contracts' | 'invoices' | 'custom'>('contracts')
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentFile: '' })
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [donePath, setDonePath] = useState<string | null>(null)

  // Live progress pushed by the main process while extraction runs.
  useEffect(() => {
    const api = (window as unknown as { aiOffice?: { onMatrixProgress?: unknown } }).aiOffice
    if (typeof api?.onMatrixProgress !== 'function') return
    return (
      api.onMatrixProgress as (
        h: (p: { current: number; total: number; currentFile: string }) => void,
      ) => () => void
    )((p) => setProgress({ current: p.current, total: p.total, currentFile: p.currentFile }))
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const newFiles = Array.from(e.dataTransfer.files)
    setFiles((prev) => [...prev, ...newFiles])
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const addColumn = () => {
    setColumns((prev) => [
      ...prev,
      { id: `col-${Date.now()}`, name: '', description: '', dataType: 'text' },
    ])
  }

  const removeColumn = (index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index))
  }

  const updateColumn = (index: number, field: keyof MatrixColumnConfig, value: string) => {
    setColumns((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  const handleGenerate = async () => {
    if (files.length === 0) {
      setError('Please add at least one PDF file')
      return
    }
    if (columns.some((c) => !c.name)) {
      setError('All columns must have a name')
      return
    }

    setIsGenerating(true)
    setError(null)
    setDonePath(null)
    setProgress({ current: 0, total: files.length, currentFile: '' })

    try {
      const result = await onGenerate(files, columns)
      if (!result.ok) {
        setError(result.error ?? 'Generation failed')
      } else if (result.path) {
        setDonePath(result.path)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePresetChange = (preset: 'contracts' | 'invoices' | 'custom') => {
    setPreset(preset)
    if (preset === 'contracts') setColumns(DEFAULT_CONTRACT_COLUMNS)
    else if (preset === 'invoices') setColumns(DEFAULT_INVOICE_COLUMNS)
    else setColumns([{ id: `col-${Date.now()}`, name: '', description: '', dataType: 'text' }])
  }

  return (
    <div className="matrix-modal">
      <div className="modal-header">
        <h2>{'Generate Comparison Matrix'}</h2>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="modal-body">
        {error && <div className="error-banner">{error}</div>}
        {donePath && !error && (
          <div className="success-banner" role="status">
            {'Matrix saved and opened: '}
            {donePath}
          </div>
        )}

        <div className="section">
          <h3>{'Source Files'}</h3>
          <div
            className={`drop-zone ${dragActive ? 'active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileSelect}
              id="matrix-files"
              style={{ display: 'none' }}
              ref={(el) => el?.click()}
            />
            <label htmlFor="matrix-files" className="drop-label">
              <span style={{ fontSize: 32 }}>📤</span>
              <p>
                {files.length === 0
                  ? 'Drag PDFs here or click to select'
                  : `${files.length} file(s) selected`}
              </p>
              <p className="hint">{'PDF, DOCX, XLSX supported'}</p>
            </label>
          </div>
          {files.length > 0 && (
            <ul className="file-list">
              {files.map((file, i) => (
                <li key={i} className="file-item">
                  <span>{file.name}</span>
                  <button className="ghost sm" onClick={() => removeFile(i)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="section">
            <h3>{'Column Configuration'}</h3>
            <Dropdown
              value={preset}
              options={[
                { value: 'contracts', label: 'Contracts Template (7 columns)' },
                { value: 'invoices', label: 'Invoices Template (7 columns)' },
                { value: 'custom', label: 'Custom Columns' },
              ]}
              onPick={handlePresetChange}
            />

            <div className="column-editor">
              {columns.map((col, i) => (
                <div key={col.id} className="column-row">
                  <input
                    type="text"
                    placeholder="Column Name"
                    value={col.name}
                    onChange={(e) => updateColumn(i, 'name', e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={col.description}
                    onChange={(e) => updateColumn(i, 'description', e.target.value)}
                    style={{ flex: 3 }}
                  />
                  <select
                    value={col.dataType}
                    onChange={(e) =>
                      updateColumn(i, 'dataType', e.target.value as MatrixColumnConfig['dataType'])
                    }
                    style={{ width: 140 }}
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="boolean">Yes/No</option>
                  </select>
                  <button
                    className="ghost xs"
                    onClick={() => removeColumn(i)}
                    title="Remove column"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button className="button secondary" onClick={addColumn}>
                <span>+</span> {'Add Column'}
              </button>
            </div>
          </div>

          <div className="section">
            <h3>{'Source Tray Integration'}</h3>
            <label>
              <input type="checkbox" checked={false} onChange={() => {}} />
              <span>{'Include sources from Source Tray as additional context'}</span>
            </label>
          </div>

          {isGenerating && (
            <div className="progress-section">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="progress-text">
                {'Processing'} {progress.currentFile} ({progress.current}/{progress.total})
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="button ghost" onClick={onClose} disabled={isGenerating}>
            {'Cancel'}
          </button>
          <button
            className="button primary"
            onClick={handleGenerate}
            disabled={isGenerating || files.length === 0}
          >
            {isGenerating ? 'Generating...' : 'Generate Matrix'}
          </button>
        </div>
      </div>
    </div>
  )
}
