export interface AttachmentReference {
  attachmentId: string
  name: string
  mimeType: string
  size: number
  lastModified: number
}

interface StoredAttachment extends AttachmentReference {
  blob: Blob
}

const DATABASE_NAME = 'revelith-forms-builder-files'
const DATABASE_VERSION = 1
const STORE_NAME = 'attachments'

let databasePromise: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new Error('This browser does not support local file storage.'))
  if (databasePromise) return databasePromise
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME, { keyPath: 'attachmentId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local file storage.'))
    request.onblocked = () =>
      reject(
        new Error(
          'Local file storage is busy. Close other ReveLith Forms Builder windows and try again.',
        ),
      )
  }).catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })
  return databasePromise!
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Local file storage failed.'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Local file storage was interrupted.'))
  })
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `file-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function storeLocalAttachment(file: File): Promise<AttachmentReference> {
  const database = await openDatabase()
  const reference: AttachmentReference = {
    attachmentId: createId(),
    name: file.name.slice(0, 255),
    mimeType: file.type.slice(0, 255) || 'application/octet-stream',
    size: file.size,
    lastModified: file.lastModified,
  }
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  transaction.objectStore(STORE_NAME).put({ ...reference, blob: file } satisfies StoredAttachment)
  await transactionDone(transaction)
  return reference
}

export async function readLocalAttachment(
  attachmentId: string,
): Promise<StoredAttachment | undefined> {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(attachmentId)) return undefined
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readonly')
  const request = transaction.objectStore(STORE_NAME).get(attachmentId)
  const result = await new Promise<StoredAttachment | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as StoredAttachment | undefined)
    request.onerror = () => reject(request.error ?? new Error('Could not read the selected file.'))
  })
  await transactionDone(transaction)
  return result
}

export async function downloadLocalAttachment(reference: AttachmentReference): Promise<void> {
  const stored = await readLocalAttachment(reference.attachmentId)
  if (!stored || !(stored.blob instanceof Blob))
    throw new Error('This response file is missing from local storage.')
  const url = URL.createObjectURL(stored.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = stored.name || 'attachment'
  anchor.rel = 'noopener'
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
    anchor.remove()
  }, 30_000)
}

export function collectAttachmentIds(
  value: unknown,
  into = new Set<string>(),
  depth = 0,
): Set<string> {
  if (depth > 20 || value == null || typeof value !== 'object') return into
  if (Array.isArray(value)) {
    for (const item of value) collectAttachmentIds(item, into, depth + 1)
  } else if (isAttachmentReference(value)) {
    into.add(value.attachmentId)
  } else {
    for (const item of Object.values(value as Record<string, unknown>))
      collectAttachmentIds(item, into, depth + 1)
  }
  return into
}

export async function purgeUnreferencedLocalAttachments(
  retainedIds: ReadonlySet<string>,
): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  const store = transaction.objectStore(STORE_NAME)
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = store.getAllKeys()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not inspect local response files.'))
  })
  for (const key of keys) if (typeof key === 'string' && !retainedIds.has(key)) store.delete(key)
  await transactionDone(transaction)
}

export async function purgeUnreferencedAttachmentsFromLocalStores(): Promise<void> {
  const retained = new Set<string>()
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (
        key !== 'revelith-forms-builder/responses' &&
        !key?.startsWith('revelith-forms-builder/preview-draft/')
      )
        continue
      const raw = localStorage.getItem(key)
      if (raw) {
        try {
          collectAttachmentIds(JSON.parse(raw), retained)
        } catch {
          /* preserve files referenced by any other valid local record */
        }
      }
    }
  } catch {
    return
  }
  await purgeUnreferencedLocalAttachments(retained)
}

export function isAttachmentReference(value: unknown): value is AttachmentReference {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as AttachmentReference).attachmentId === 'string' &&
    typeof (value as AttachmentReference).name === 'string' &&
    typeof (value as AttachmentReference).size === 'number',
  )
}

export function matchesAcceptedFiles(file: File, accept?: string): boolean {
  if (!accept?.trim()) return true
  const patterns = accept
    .split(',')
    .map((pattern) => pattern.trim().toLocaleLowerCase())
    .filter(Boolean)
  const name = file.name.toLocaleLowerCase()
  const mime = file.type.toLocaleLowerCase()
  return patterns.some((pattern) =>
    pattern.startsWith('.')
      ? name.endsWith(pattern)
      : pattern.endsWith('/*')
        ? mime.startsWith(pattern.slice(0, -1))
        : mime === pattern,
  )
}
