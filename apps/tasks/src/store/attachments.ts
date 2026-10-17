/**
 * Attachment bytes in IndexedDB.
 *
 * Only the metadata lives in board state (so it exports with the board and is
 * testable without a browser); the bytes stay here, keyed by attachment id.
 * Keeping them out of the JSON document is what stops a saved board from
 * ballooning the moment someone attaches a screenshot.
 */

const DB_NAME = 'revelith-tasks-attachments'
const DB_VERSION = 1
const STORE = 'blobs'

/** Refuse anything larger than 25 MB — well past useful for a task attachment. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

export class AttachmentTooLargeError extends Error {
  constructor(name: string, size: number) {
    super(`“${name}” is ${formatBytes(size)}, which exceeds the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit.`)
    this.name = 'AttachmentTooLargeError'
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Mime types that render inline rather than downloading. */
const INLINE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])

export function isImage(mime: string): boolean {
  return INLINE_MIME.has(mime)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the attachment database.'))
  })
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = work(tx.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Attachment storage request failed.'))
        tx.oncomplete = () => db.close()
      }),
  )
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  // Store the bytes plus the mime type rather than the Blob itself. IndexedDB
  // structured-clones a Blob in a browser, but some engines — and the test shim
  // — hand back a plain object with no Blob methods. An ArrayBuffer always
  // survives, and the Blob is rebuilt on read.
  const buffer = await blob.arrayBuffer()
  await run('readwrite', (store) => store.put({ mime: blob.type, buffer }, id) as IDBRequest<IDBValidKey>)
}

interface StoredBlob {
  mime: string
  buffer: ArrayBuffer
}

export async function getBlob(id: string): Promise<Blob | null> {
  const value = await run<StoredBlob | undefined>(
    'readonly',
    (store) => store.get(id) as IDBRequest<StoredBlob | undefined>,
  )
  if (!value) return null
  return new Blob([value.buffer], { type: value.mime })
}

export async function deleteBlob(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id) as IDBRequest<undefined>)
}

export async function listBlobIds(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys())
  return keys.map(String)
}

/** Remove blobs whose attachment metadata no longer exists. */
export async function pruneOrphans(knownIds: string[]): Promise<number> {
  const keep = new Set(knownIds)
  const existing = await listBlobIds()
  const orphans = existing.filter((id) => !keep.has(id))
  for (const id of orphans) await deleteBlob(id)
  return orphans.length
}

export async function clearAll(): Promise<void> {
  await run('readwrite', (store) => store.clear() as IDBRequest<undefined>)
}

/**
 * Trigger a browser download for an attachment.
 * Returns false when there is no DOM to download into.
 */
export function downloadBlob(blob: Blob, name: string): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}

/** Open an attachment in a new tab (images, PDFs). */
export async function openBlob(id: string, name: string, mime: string): Promise<boolean> {
  const blob = await getBlob(id)
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank')
  if (opened) {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } else {
    downloadBlob(blob, name)
  }
  void mime
  return true
}

/** Total bytes held across every stored blob. */
export async function storageUsage(): Promise<{ bytes: number; count: number }> {
  const ids = await listBlobIds()
  let bytes = 0
  for (const id of ids) {
    const blob = await getBlob(id)
    if (blob) bytes += blob.size
  }
  return { bytes, count: ids.length }
}
