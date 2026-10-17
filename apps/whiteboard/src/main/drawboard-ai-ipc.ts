import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseFileToText } from '@revelith/file-parse'
import {
  activeProvider,
  AiCreditsError,
  AiTimeoutError,
  defaultAiSettings,
  isAiNetworkError,
  isAiOverloadedError,
  maxOutputTokensOf,
  resolveAiSettings,
  streamForProvider,
  testMediaProvider,
  type AiSettings,
  type AiStreamChunk,
  type AiStreamRequest,
} from '@revelith/ai-provider'
import {
  ensureReveLithLogin,
  generateImageTool,
  hasGskAuth,
  gskLoginInfo,
  analyzeMediaTool,
  imageSearchTool,
  webSearchTool,
} from '@revelith/ai-search'
import { fetchRemoteImage, MAX_REMOTE_IMAGE_BYTES, readBodyCapped } from '@revelith/electron-utils'
import { readGeneratedImage } from '@revelith/electron-utils/generated-images'

const activeStreams = new Map<string, AbortController>()
const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
}
const IMAGE_EXTS = new Set(Object.keys(IMAGE_MIME))
const ATTACHMENT_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'htm', 'log',
  'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'h', 'cpp', 'go', 'rs', 'rb', 'sh', 'sql', 'css',
  'doc', 'docx', 'pdf', 'pptx', 'ppt', 'xlsx', 'xlsm', 'xls', ...IMAGE_EXTS,
])
const attachmentTextCache = new Map<string, { stamp: string; text: string }>()

function inspectAttachment(path: string): { path: string; name: string; ext: string; sizeBytes: number } | string {
  const name = basename(path)
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (!ATTACHMENT_EXTS.has(ext)) return `${name}: unsupported attachment type.`
  try {
    const stat = statSync(path)
    if (!stat.isFile()) return `${name}: not a file.`
    if (stat.size > ATTACHMENT_MAX_BYTES) return `${name}: files must be 50 MB or smaller.`
    if (IMAGE_EXTS.has(ext) && stat.size > IMAGE_MAX_BYTES) return `${name}: images must be 5 MB or smaller.`
    return { path, name, ext, sizeBytes: stat.size }
  } catch {
    return `${name}: file is unreadable.`
  }
}

function collectAttachments(paths: string[]) {
  const accepted: Array<{ path: string; name: string; ext: string; sizeBytes: number }> = []
  const rejected: string[] = []
  for (const path of paths) {
    const result = inspectAttachment(path)
    if (typeof result === 'string') rejected.push(result)
    else accepted.push(result)
  }
  return { accepted, rejected }
}

async function readAttachmentText(path: string): Promise<string> {
  const stat = statSync(path)
  const stamp = `${stat.mtimeMs}:${stat.size}`
  const cached = attachmentTextCache.get(path)
  if (cached?.stamp === stamp) return cached.text
  if (stat.size > ATTACHMENT_MAX_BYTES) throw new Error('File exceeds the 50 MB limit.')
  const parsed = await parseFileToText(path)
  if (!parsed.ok || parsed.kind !== 'text' || parsed.text == null) {
    throw new Error(parsed.error ?? 'Could not extract text from this file.')
  }
  attachmentTextCache.set(path, { stamp, text: parsed.text })
  if (attachmentTextCache.size > 8) {
    const oldest = attachmentTextCache.keys().next().value
    if (oldest) attachmentTextCache.delete(oldest)
  }
  return parsed.text
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'ai-settings.json')
}

function currentSettings(): AiSettings {
  let stored: unknown = {}
  try {
    stored = JSON.parse(readFileSync(settingsPath(), 'utf8'))
  } catch {
    // First launch uses provider defaults until the user configures AI.
  }
  const settings = resolveAiSettings(stored, defaultAiSettings())
  settings.provider = activeProvider(settings)
  return settings
}

function writeSettings(settings: unknown): void {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Invalid AI settings payload.')
  }
  const path = settingsPath()
  const temporary = `${path}.tmp-${process.pid}`
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(temporary, JSON.stringify(settings, null, 2), 'utf8')
  renameSync(temporary, path)
}

/** AI IPC for the standalone Draw executable; settings are shared with ReveLith Shell. */
export function registerStandaloneAiIpc(): void {
  ipcMain.handle('ai:get-settings', (): AiSettings => currentSettings())
  ipcMain.handle('ai:set-settings', (_event, settings: unknown) => {
    const previous = currentSettings()
    writeSettings(settings)
    const next = currentSettings()
    if (
      previous.provider !== next.provider ||
      JSON.stringify(previous.providers?.[previous.provider]) !==
        JSON.stringify(next.providers?.[next.provider])
    ) {
      for (const controller of activeStreams.values()) controller.abort()
    }
  })

  ipcMain.handle('ai:gsk-status', async (_event, withEmail?: boolean) => {
    if (!hasGskAuth()) return { loggedIn: false }
    if (!withEmail) return { loggedIn: true }
    const info = await gskLoginInfo()
    return info?.email ? { loggedIn: true, email: info.email } : { loggedIn: true }
  })
  ipcMain.handle('ai:gsk-login', () => ensureReveLithLogin((url) => void shell.openExternal(url)))

  ipcMain.handle('ai:stream', async (event, request: AiStreamRequest) => {
    const settings = currentSettings()
    const provider = settings.provider
    const config = settings.providers?.[provider]
    const requestId = String(request?.requestId ?? '')
    const send = (chunk: AiStreamChunk) => {
      if (!event.sender.isDestroyed()) event.sender.send('ai:stream-chunk', chunk)
    }
    const needsKey = !['codex', 'custom', 'lmstudio', 'ollama'].includes(provider)
    if (!config || (needsKey && !config.apiKey)) {
      send({ requestId, type: 'error', error: `No API key is configured for ${provider}.` })
      return
    }
    if (provider !== 'codex' && !config.model && !['custom', 'lmstudio'].includes(provider)) {
      send({ requestId, type: 'error', error: 'No AI model is configured.' })
      return
    }

    const controller = new AbortController()
    activeStreams.set(requestId, controller)
    try {
      let stopReason: string | undefined
      await streamForProvider(
        provider,
        config,
        request.system,
        request.messages,
        request.tools ?? [],
        request.maxTokens ?? maxOutputTokensOf(settings),
        {
          ...(request.sessionId ? { sessionId: request.sessionId } : {}),
          signal: controller.signal,
          onDelta: (text) => send({ requestId, type: 'delta', text }),
          onReasoningDelta: (text) => send({ requestId, type: 'reasoning', text }),
          onToolCall: (toolCall) => send({ requestId, type: 'tool-call', toolCall }),
          onStopReason: (reason) => { stopReason = reason },
        },
      )
      send({ requestId, type: 'done', stopReason })
    } catch (error) {
      if (controller.signal.aborted) send({ requestId, type: 'done' })
      else send({
        requestId,
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof AiTimeoutError
          ? { errorCode: 'timeout' as const }
          : error instanceof AiCreditsError
            ? { errorCode: 'credits' as const }
            : isAiNetworkError(error)
              ? { errorCode: 'network' as const }
              : isAiOverloadedError(error)
                ? { errorCode: 'overloaded' as const }
                : {}),
      })
    } finally {
      activeStreams.delete(requestId)
    }
  })
  ipcMain.handle('ai:stream-cancel', (_event, requestId: string) => activeStreams.get(requestId)?.abort())

  ipcMain.handle('ai:web-search', async (_event, query: string, maxResults?: number) => {
    try { return await webSearchTool(settingsPath(), String(query), typeof maxResults === 'number' ? maxResults : 6) }
    catch (error) { return { results: [], method: 'error', error: String(error) } }
  })
  ipcMain.handle('ai:image-search', async (_event, query: string, maxResults?: number) => {
    try { return await imageSearchTool(settingsPath(), String(query), typeof maxResults === 'number' ? maxResults : 8) }
    catch (error) { return { images: [], method: 'error', error: String(error) } }
  })
  ipcMain.handle('ai:fetch-image', async (_event, url: string) => {
    try {
      const response = await fetchRemoteImage(String(url))
      if (!response?.ok) return null
      const bytes = Buffer.from(await readBodyCapped(response, MAX_REMOTE_IMAGE_BYTES))
      const contentType = response.headers.get('content-type') ?? ''
      const mime = contentType.includes('png') ? 'image/png' : contentType.includes('gif') ? 'image/gif' : 'image/jpeg'
      return { base64: bytes.toString('base64'), mime }
    } catch {
      return null
    }
  })
  ipcMain.handle('docs:analyze-media', (_event, op: { mediaUrls?: string[]; requirements?: string }) =>
    analyzeMediaTool(settingsPath(), {
      mediaUrls: (op?.mediaUrls ?? []).map(String).filter(Boolean),
      requirements: String(op?.requirements ?? ''),
    }),
  )
  ipcMain.handle('drawboard:ai-generate-image', async (_event, op: { prompt?: unknown; aspectRatio?: unknown }) => {
    const generated = await generateImageTool(settingsPath(), {
      prompt: String(op?.prompt ?? ''),
      aspectRatio: op?.aspectRatio ? String(op.aspectRatio) : undefined,
    })
    if (!generated.url) return { error: generated.error ?? 'Image generation failed.' }
    const image = readGeneratedImage(generated.url)
    return image
      ? { base64: image.bytes.toString('base64'), mime: image.mime }
      : { error: 'The generated image could not be read back.' }
  })
  ipcMain.handle('ai:media-test', (_event, input: { provider?: string; config?: unknown }) => {
    if (!input?.provider || !input.config) return { ok: false, error: 'No media provider configuration.' }
    return testMediaProvider(input.provider as never, input.config as never)
  })

  ipcMain.handle('files:pick', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: 'Add attachment',
      filters: [
        { name: 'Supported files', extensions: [...ATTACHMENT_EXTS] },
        { name: 'All files', extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    return result.canceled || result.filePaths.length === 0 ? null : collectAttachments(result.filePaths)
  })
  ipcMain.handle('files:add', (_event, paths: unknown) =>
    collectAttachments(Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : []),
  )
  ipcMain.handle('files:read', async (_event, path: string, offset: number, maxChars: number) => {
    const name = basename(String(path))
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    if (!ATTACHMENT_EXTS.has(ext)) return { ok: false, error: `${name}: unsupported attachment type.` }
    if (IMAGE_EXTS.has(ext)) return { ok: false, error: `${name}: images do not contain extractable text.` }
    try {
      const text = await readAttachmentText(String(path))
      const start = Math.max(0, Math.floor(Number(offset)) || 0)
      const size = Math.min(Math.max(1, Math.floor(Number(maxChars)) || 1), 48_000)
      return { ok: true, name, totalChars: text.length, offset: start, text: text.slice(start, start + size) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('files:read-image', (_event, path: string) => {
    const name = basename(String(path))
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const mime = IMAGE_MIME[ext]
    if (!mime) return { ok: false, error: `${name}: not a supported image.` }
    try {
      const stat = statSync(String(path))
      if (!stat.isFile() || stat.size > IMAGE_MAX_BYTES) return { ok: false, error: `${name}: image exceeds the 5 MB limit.` }
      return { ok: true, base64: readFileSync(String(path)).toString('base64'), mime }
    } catch {
      return { ok: false, error: `${name}: file is unreadable.` }
    }
  })

  app.once('before-quit', () => {
    for (const controller of activeStreams.values()) controller.abort()
    activeStreams.clear()
  })
}
