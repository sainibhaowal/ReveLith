/**
 * generate_image / analyze_media for the editor main processes:
 * reads ai-settings.json live, routes to the BYOK media provider
 * configured in Settings (OpenAI, Gemini, custom, etc.). BYOK providers answer with bytes;
 * those land in the local generated-image store and come back as a file:// URL that the
 * insert pipelines' fetchRemoteImage accepts.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import {
  activeMediaConfig,
  analyzeMediaWithProvider,
  defaultAiSettings,
  generateImageWithProvider,
  resolveAiSettings,
  type AiSettings,
  type LegacyAiSettings,
  type MediaBlob,
} from '@revelith/ai-provider'
import { readGeneratedImage, storeGeneratedImage } from '@revelith/electron-utils/generated-images'
import {
  ResponseTooLargeError,
  fetchRemoteImage,
  readBodyCapped,
} from '@revelith/electron-utils/remote-image'
import { fetchWithSsrfGuard } from '@revelith/electron-utils/safe-remote-url'

export const NO_MEDIA_PROVIDER_ERROR =
  'No image generation provider configured. Please configure an image provider in Settings (AI Media & Search) to use this tool.'

const MAX_MEDIA_BYTES = 200 * 1024 * 1024
const MAX_MEDIA_TOTAL_BYTES = 200 * 1024 * 1024
const MAX_MEDIA_ITEMS = 12
const MEDIA_LOAD_CONCURRENCY = 3

export class MediaTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaTooLargeError'
  }
}

export class MediaBudgetExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaBudgetExceededError'
  }
}

export interface MediaBudget {
  maxItems?: number
  maxItemBytes?: number
  maxTotalBytes?: number
  concurrency?: number
}

export const MEDIA_BUDGET: MediaBudget = {
  maxItems: MAX_MEDIA_ITEMS,
  maxItemBytes: MAX_MEDIA_BYTES,
  maxTotalBytes: MAX_MEDIA_TOTAL_BYTES,
  concurrency: MEDIA_LOAD_CONCURRENCY,
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
}

const DATA_URL_RE = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i

function assertMediaItemCount(count: number, maxItems: number): void {
  if (count > maxItems) {
    throw new MediaBudgetExceededError(
      `Too many media items in one request (${count}, limit ${maxItems}); analyze them in smaller batches`,
    )
  }
}

function dataUrlDecodedSize(ref: string): number {
  if (!ref.startsWith('data:')) return 0
  const match = DATA_URL_RE.exec(ref)
  if (!match) return 0
  const b64 = match[2] ?? ''
  return Math.floor((b64.length * 3) / 4)
}

export function readAiSettingsFile(path: string): AiSettings {
  let stored: Partial<AiSettings> & LegacyAiSettings = {}
  try {
    if (existsSync(path)) stored = JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    /* corrupted settings file: defaults */
  }
  return resolveAiSettings(stored, defaultAiSettings())
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function loadMediaReference(ref: string): Promise<MediaBlob> {
  if (/^https?:\/\//i.test(ref)) {
    const resp = await (ref.match(/\.(png|jpe?g|gif|webp)(\?|$)/i)
      ? fetchRemoteImage(ref)
      : fetchWithSsrfGuard(ref, { headers: { 'User-Agent': 'Mozilla/5.0' } }))
    if (!resp || !resp.ok) throw new Error(`Could not download ${ref}`)
    let bytes: Uint8Array
    try {
      bytes = await readBodyCapped(resp, MAX_MEDIA_BYTES)
    } catch (err) {
      if (err instanceof ResponseTooLargeError) {
        throw new MediaTooLargeError(`${ref} is too large to analyze`)
      }
      throw err
    }
    const rawCt = resp.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    const ct = rawCt && rawCt !== 'application/octet-stream' ? rawCt : undefined
    const name = basename(new URL(ref).pathname) || undefined
    const mime =
      ct && ct !== 'application/octet-stream' ? ct : MIME_BY_EXT[extname(name ?? '').toLowerCase()]
    if (!mime) throw new Error(`Could not tell the media type of ${ref}`)
    return { bytes, mime, ...(name ? { name } : {}) }
  }
  if (ref.startsWith('data:')) {
    const m = DATA_URL_RE.exec(ref)
    if (!m) throw new Error('Unsupported data URL: only base64-encoded media can be analyzed')
    const [, mime = '', b64 = ''] = m
    const bytes = new Uint8Array(Buffer.from(b64.replace(/\s+/g, ''), 'base64'))
    if (bytes.byteLength > MAX_MEDIA_BYTES) {
      throw new MediaTooLargeError('data URL is too large to analyze')
    }
    return { bytes, mime: mime.toLowerCase() }
  }
  if (ref.startsWith('file:')) {
    const local = readGeneratedImage(ref)
    if (!local) throw new Error(`Not an accessible image: ${ref}`)
    return { bytes: new Uint8Array(local.bytes), mime: local.mime }
  }
  const mime = MIME_BY_EXT[extname(ref).toLowerCase()]
  if (!mime) throw new Error(`Unsupported media file: ${ref} (images, video and audio only)`)
  if (!existsSync(ref)) throw new Error(`File not found: ${ref}`)
  if (statSync(ref).size > MAX_MEDIA_BYTES) {
    throw new MediaTooLargeError(`${ref} is too large to analyze`)
  }
  return { bytes: new Uint8Array(readFileSync(ref)), mime, name: basename(ref) }
}

export interface MediaToolOptions {
  notLoggedInError?: string
}

export async function loadMediaReferences(
  refs: readonly string[],
  budget: MediaBudget = MEDIA_BUDGET,
): Promise<MediaBlob[]> {
  const maxItems = budget.maxItems ?? MAX_MEDIA_ITEMS
  const maxItemBytes = budget.maxItemBytes ?? MAX_MEDIA_BYTES
  const maxTotalBytes = budget.maxTotalBytes ?? MAX_MEDIA_TOTAL_BYTES
  const concurrency = Math.max(1, budget.concurrency ?? MEDIA_LOAD_CONCURRENCY)
  assertMediaItemCount(refs.length, maxItems)
  const declared = refs.map(dataUrlDecodedSize)
  for (const bytes of declared) {
    if (bytes > maxItemBytes) {
      throw new MediaTooLargeError(`data URL is too large to analyze (limit ${maxItemBytes} bytes)`)
    }
  }
  const declaredTotal = declared.reduce((n, bytes) => n + bytes, 0)
  if (declaredTotal > maxTotalBytes) {
    throw new MediaBudgetExceededError(
      `Media in one request is too large to analyze (${declaredTotal} bytes, limit ${maxTotalBytes}); analyze it in smaller batches`,
    )
  }
  const blobs: MediaBlob[] = new Array(refs.length)
  let next = 0
  let landed = 0
  const worker = async (): Promise<void> => {
    while (next < refs.length) {
      const index = next++
      const blob = await loadMediaReference(refs[index]!)
      landed += blob.bytes.byteLength
      if (landed > maxTotalBytes) {
        throw new MediaBudgetExceededError(
          `Media in one request is too large to analyze (over ${maxTotalBytes} bytes); analyze it in smaller batches`,
        )
      }
      blobs[index] = blob
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, refs.length) }, () => worker()))
  return blobs
}

export type GenerateImageToolOp = {
  prompt: string
  aspectRatio?: string
  imageSize?: string
  model?: string
  referenceImageUrls?: string[]
  transparentBackground?: boolean
}

export async function generateImageTool(
  settingsPath: string,
  op: GenerateImageToolOp,
  _options: MediaToolOptions = {},
): Promise<{ url?: string; error?: string }> {
  const prompt = String(op.prompt ?? '').trim()
  if (!prompt) return { error: 'prompt must not be empty' }
  const settings = readAiSettingsFile(settingsPath)
  const byok = activeMediaConfig(settings, 'image')
  if (!byok) {
    return { error: NO_MEDIA_PROVIDER_ERROR }
  }
  try {
    const references = await loadMediaReferences(op.referenceImageUrls ?? [])
    const image = await generateImageWithProvider(byok.provider, byok.config, {
      prompt,
      aspectRatio: op.aspectRatio,
      references,
      transparent: op.transparentBackground === true,
    })
    return { url: storeGeneratedImage(image.bytes, image.mime) }
  } catch (err) {
    return { error: errorText(err) }
  }
}

export async function analyzeMediaTool(
  settingsPath: string,
  op: { mediaUrls: string[]; requirements: string },
  _options: MediaToolOptions = {},
): Promise<{ text?: string; error?: string }> {
  const mediaUrls = (op.mediaUrls ?? []).map(String).filter(Boolean)
  const requirements = String(op.requirements ?? '').trim()
  if (!mediaUrls.length) return { error: 'mediaUrls must not be empty' }
  if (!requirements) return { error: 'requirements must not be empty' }
  const settings = readAiSettingsFile(settingsPath)
  const imageByok = activeMediaConfig(settings, 'analysis')
  const videoByok = activeMediaConfig(settings, 'video')
  const byok = imageByok ?? videoByok
  if (!byok) {
    return { error: NO_MEDIA_PROVIDER_ERROR }
  }
  try {
    const media = await loadMediaReferences(mediaUrls)
    const text = await analyzeMediaWithProvider(byok.provider, byok.config, {
      media,
      requirements,
    })
    return { text }
  } catch (err) {
    return { error: errorText(err) }
  }
}
