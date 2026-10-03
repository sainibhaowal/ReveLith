import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, unlink, stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { atomicWriteFile } from './atomic-write'

const SOURCES_DIR = join(app.getPath('userData'), 'revelith-sources')

export interface SourceItem {
  id: string
  docSessionId: string
  fileName: string
  filePath: string
  mimeType: string
  size: number
  addedAt: number
  contentHash: string
  extractedText: string
  chunks: TextChunk[]
  metadata: Record<string, unknown>
}

export interface TextChunk {
  id: string
  text: string
  pageNumber?: number
  bbox?: { x: number; y: number; width: number; height: number }
}

async function ensureSourcesDir(): Promise<void> {
  try {
    await mkdir(SOURCES_DIR, { recursive: true })
  } catch {}
}

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

export async function addSourceToSession(
  docSessionId: string,
  filePath: string,
  fileName: string,
  mimeType: string,
  extractedText: string,
  chunks: TextChunk[] = [],
  metadata: Record<string, unknown> = {},
): Promise<SourceItem> {
  await ensureSourcesDir()

  const stats = await stat(filePath)
  const contentHash = hashContent(extractedText)

  const item: SourceItem = {
    id: randomUUID(),
    docSessionId,
    fileName,
    filePath,
    mimeType,
    size: stats.size,
    addedAt: Date.now(),
    contentHash,
    extractedText,
    chunks,
    metadata,
  }

  const sessionFile = join(SOURCES_DIR, `${docSessionId}.json`)
  let session: SourceItem[] = []
  try {
    const data = await readFile(sessionFile, 'utf-8')
    session = JSON.parse(data)
  } catch {}

  // Deduplicate by content hash
  session = session.filter((s) => s.contentHash !== contentHash)
  session.push(item)
  await atomicWriteFile(sessionFile, Buffer.from(JSON.stringify(session, null, 2)))

  return item
}

export async function getSessionSources(docSessionId: string): Promise<SourceItem[]> {
  const sessionFile = join(SOURCES_DIR, `${docSessionId}.json`)
  try {
    const data = await readFile(sessionFile, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

export async function removeSourceFromSession(
  docSessionId: string,
  sourceId: string,
): Promise<void> {
  const sessionFile = join(SOURCES_DIR, `${docSessionId}.json`)
  try {
    const data = await readFile(sessionFile, 'utf-8')
    const session: SourceItem[] = JSON.parse(data)
    const filtered = session.filter((s) => s.id !== sourceId)
    await atomicWriteFile(sessionFile, Buffer.from(JSON.stringify(filtered, null, 2)))
  } catch {}
}

export async function clearSession(docSessionId: string): Promise<void> {
  const sessionFile = join(SOURCES_DIR, `${docSessionId}.json`)
  try {
    await unlink(sessionFile)
  } catch {}
}

export async function listAllSessions(): Promise<string[]> {
  await ensureSourcesDir()
  try {
    const files = await readdir(SOURCES_DIR)
    return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''))
  } catch {
    return []
  }
}
