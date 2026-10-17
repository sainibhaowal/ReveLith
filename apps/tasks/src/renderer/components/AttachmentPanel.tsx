import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Attachment } from '../../domain/types'
import {
  AttachmentTooLargeError,
  downloadBlob,
  formatBytes,
  getBlob,
  isImage,
  MAX_ATTACHMENT_BYTES,
} from '../../store/attachments'
import { btnGhost, chip } from '../styles'

/**
 * File attachments for one task.
 *
 * Metadata is dispatched into board state so it exports with the board; the
 * bytes go to IndexedDB. Images render inline from object URLs, everything else
 * falls back to download.
 */
export function AttachmentPanel({
  attachments,
  onAdd,
  onRemove,
  onError,
}: {
  attachments: Attachment[]
  onAdd: (id: string, file: File) => Promise<void>
  onRemove: (id: string) => void
  onError: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Record<string, string>>({})
  const totalBytes = attachments.reduce((sum, entry) => sum + entry.size, 0)

  // Object URLs created for previews must be revoked or they leak for the
  // lifetime of the window.
  const created = useRef<string[]>([])
  useEffect(
    () => () => {
      for (const url of created.current) URL.revokeObjectURL(url)
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []

    const load = async () => {
      const next: Record<string, string> = {}
      for (const attachment of attachments) {
        if (!isImage(attachment.mime)) continue
        const blob = await getBlob(attachment.id)
        if (!blob || cancelled) continue
        const url = URL.createObjectURL(blob)
        urls.push(url)
        next[attachment.id] = url
      }
      if (!cancelled) setPreview(next)
    }

    void load()
    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [attachments])

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          onError(new AttachmentTooLargeError(file.name, file.size).message)
          continue
        }
        await onAdd(file.name, file)
      }
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => void handleFiles(event.target.files)}
        aria-label="Choose files to attach"
      />

      <div style={toolbar}>
        <button style={btnGhost} onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Adding…' : '+ Attach'}
        </button>
        <span style={meta}>
          {attachments.length
            ? `${attachments.length} file(s), ${formatBytes(totalBytes)}`
            : 'No files'}
        </span>
      </div>

      <div style={grid}>
        {attachments.map((attachment) => (
          <figure key={attachment.id} style={card}>
            {preview[attachment.id] ? (
              <img src={preview[attachment.id]} alt={attachment.name} style={thumb} />
            ) : (
              <div style={placeholder} aria-hidden="true">
                {attachment.mime.startsWith('image/') ? '🖼' : '📄'}
              </div>
            )}
            <figcaption style={caption}>
              <span style={name} title={attachment.name}>
                {attachment.name}
              </span>
              <span style={meta}>{formatBytes(attachment.size)}</span>
              <div style={cardActions}>
                <button
                  style={btnGhost}
                  onClick={async () => {
                    const blob = await getBlob(attachment.id)
                    if (blob) downloadBlob(blob, attachment.name)
                    else onError(`“${attachment.name}” is missing from local storage.`)
                  }}
                >
                  Save
                </button>
                <button
                  style={btnGhost}
                  onClick={() => {
                    if (window.confirm(`Remove “${attachment.name}”?`)) onRemove(attachment.id)
                  }}
                >
                  ✕
                </button>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

const toolbar: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }

const meta: CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)' }

const grid: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }

const card: CSSProperties = {
  margin: 0,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-8)',
  overflow: 'hidden',
  background: 'var(--surface-subtle)',
}

const thumb: CSSProperties = { width: '100%', height: 70, objectFit: 'cover', display: 'block' }

const placeholder: CSSProperties = {
  height: 70,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 22,
  background: 'var(--bg-hover-subtle)',
}

const caption: CSSProperties = {
  padding: '5px 7px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const name: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const cardActions: CSSProperties = { display: 'flex', gap: 4, marginTop: 3 }

export { chip }
