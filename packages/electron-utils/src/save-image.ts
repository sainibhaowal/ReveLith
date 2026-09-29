/**
 * "Save image as…" for a picture already on screen.
 *
 * The src a document shows is one of three things: a `data:` URL (an AI
 * insert), an app-owned asset scheme (`md-asset://`, `revelith-media://`) that
 * only the main process can resolve, or a plain `http(s)` URL. All three end
 * in the same place: bytes on disk, chosen by a Save dialog.
 */
import { writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { dialog, net, type BrowserWindow } from 'electron'
import { MAX_REMOTE_IMAGE_BYTES, readBodyCapped } from './capped-body'
import { fetchRemoteImage } from './remote-image'

export interface SaveImageOptions {
  /** window the Save dialog is parented to (keeps it modal where it should be) */
  title: string
  /** folder the dialog opens in */
  fallbackDir: string
  /** full path proposed in the dialog; overrides the derived file name */
  defaultPath?: string
  /** base name used when the src carries no usable file name */
  defaultName?: string
}

export interface SaveImageResult {
  ok: boolean
  /** absolute path written, on success */
  path?: string
  error?: string
}

/** Extension → the label of the filter the Save dialog should offer. */
const TYPE_BY_EXT: Record<string, string> = {
  '.png': 'PNG image',
  '.jpg': 'JPEG image',
  '.jpeg': 'JPEG image',
  '.gif': 'GIF image',
  '.webp': 'WebP image',
  '.bmp': 'BMP image',
  '.avif': 'AVIF image',
  '.svg': 'SVG image',
  '.tif': 'TIFF image',
  '.tiff': 'TIFF image',
}

/** The path part of any src the editor can display. */
function srcPath(src: string): string {
  try {
    return decodeURIComponent(new URL(src).pathname)
  } catch {
    return src
  }
}

/** File name proposed in the dialog: the src's own, when it has a usable one. */
function suggestName(src: string, fallback: string): string {
  if (src.startsWith('data:')) {
    const mime = /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(src)?.[1]?.toLowerCase()
    return `${fallback}.${mime === 'jpeg' ? 'jpg' : (mime ?? 'png')}`
  }
  const fromUrl = basename(srcPath(src))
  if (fromUrl && extname(fromUrl)) return fromUrl
  return `${fallback}.png`
}

async function readSrcBytes(src: string): Promise<{ bytes: Uint8Array; ext: string } | null> {
  if (src.startsWith('data:')) {
    const match = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(src)
    if (!match) return null
    const mime = match[1]!.toLowerCase()
    return {
      bytes: new Uint8Array(Buffer.from(match[2]!, 'base64')),
      ext: mime === 'jpeg' ? 'jpg' : mime,
    }
  }
  // Everything else goes through Electron's net, which serves the app's own
  // privileged schemes (md-asset://, file://) and the network alike. The
  // downloader wrapper only adds browser headers and retries, so a local asset
  // scheme is unaffected by it.
  try {
    const resp = /^(https?|file):/i.test(src) ? await fetchRemoteImage(src) : await net.fetch(src)
    if (!resp?.ok) return null
    const mime = (resp.headers.get('content-type') ?? '').split(';')[0]!.toLowerCase()
    const ext = mime.replace('image/', '') || extname(srcPath(src)).slice(1) || 'png'
    return { bytes: await readBodyCapped(resp, MAX_REMOTE_IMAGE_BYTES), ext }
  } catch {
    return null
  }
}

/**
 * Save a displayed image through a Save dialog. Returns `{ok:false}` with no
 * error when the user cancels, so a caller that shows a notice can tell the
 * two apart.
 */
export async function saveImageFromUrl(
  win: BrowserWindow | null,
  src: string,
  options: SaveImageOptions,
): Promise<SaveImageResult> {
  const loaded = await readSrcBytes(src)
  if (!loaded) return { ok: false, error: 'the image could not be read' }

  const ext = loaded.ext || 'png'
  const filters = [
    { name: TYPE_BY_EXT[`.${ext}`] ?? 'Image', extensions: [ext] },
    { name: 'All files', extensions: ['*'] },
  ]
  const proposed =
    options.defaultPath ??
    join(options.fallbackDir, suggestName(src, options.defaultName ?? 'image'))
  const parent = win && !win.isDestroyed() ? win : null
  const picked = parent
    ? await dialog.showSaveDialog(parent, { title: options.title, defaultPath: proposed, filters })
    : await dialog.showSaveDialog({ title: options.title, defaultPath: proposed, filters })
  if (picked.canceled || !picked.filePath) return { ok: false }

  try {
    await writeFile(picked.filePath, loaded.bytes)
    return { ok: true, path: picked.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
