// ReveLith Drawboard — staged image attachments + board placement.
// Images picked or pasted in the chat are staged, then placed onto the board
// on send (same consume-on-send model as docs/sheets attachments).
import { restore } from '@excalidraw/excalidraw'
import type { ExcalidrawElement as BoardElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI as BoardApi } from '@excalidraw/excalidraw/types'
import { normalizeBoardElementPoints } from './element-geometry'

export interface StagedBoardImage {
  id: string
  name: string
  size: number
  mimeType: string
  dataUrl: string
  width: number
  height: number
}

const MAX_IMAGES = 6
const MAX_BYTES = 10 * 1024 * 1024

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`

export function readBoardImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 })
    img.onerror = () => resolve({ width: 400, height: 300 })
    img.src = dataUrl
  })
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

/** Keep images only; returns staged images plus a notice for skipped files. */
export async function readBoardImages(files: File[] | FileList): Promise<{ images: StagedBoardImage[]; notice: string | null }> {
  const list = [...files]
  const images: StagedBoardImage[] = []
  let skipped = 0
  for (const file of list) {
    if (images.length >= MAX_IMAGES) {
      skipped += 1
      continue
    }
    if (!file.type.startsWith('image/') || file.size > MAX_BYTES || file.size === 0) {
      skipped += 1
      continue
    }
    try {
      const dataUrl = await readDataUrl(file)
      if (!dataUrl) {
        skipped += 1
        continue
      }
      const dims = await readBoardImageDimensions(dataUrl)
      images.push({
        id: uid(),
        name: file.name || 'pasted-image.png',
        size: file.size,
        mimeType: file.type,
        dataUrl,
        width: dims.width,
        height: dims.height,
      })
    } catch {
      skipped += 1
    }
  }
  return {
    images,
    notice: skipped > 0 ? `${skipped} file(s) skipped (images up to 10 MB, max ${MAX_IMAGES} per message).` : null,
  }
}

function scaledSize(width: number, height: number, maxDim = 480): { width: number; height: number } {
  const scale = Math.min(1, maxDim / Math.max(1, Math.max(width, height)))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function describeImages(images: readonly StagedBoardImage[]): string {
  if (images.length === 0) return 'none'
  return images.map((img) => `- ${img.name} (${img.width}x${img.height}, ${img.mimeType})`).join('\n')
}

/** Place staged images onto the board in a cascade (or at explicit spots); returns a summary for the chat context. */
export function placeImagesOnBoard(
  api: BoardApi,
  images: readonly StagedBoardImage[],
  at?: ReadonlyArray<{ x: number; y: number; maxWidth?: number }>,
): { placed: number; summary: string } {
  if (images.length === 0) return { placed: 0, summary: 'No images to place.' }
  try {
    const now = Date.now()
    api.addFiles(
      images.map((img) => ({ mimeType: img.mimeType, id: img.id, dataURL: img.dataUrl, created: now }) as never),
    )
    const current = api.getSceneElements()
    const base = 96 + (current.length % 5) * 48
    const raw = images.map((img, i) => {
      const spot = at?.[i]
      const size = scaledSize(img.width, img.height, spot?.maxWidth ?? 480)
      return {
        id: uid(),
        type: 'image',
        x: spot ? spot.x : base + i * 40,
        y: spot ? spot.y : base + i * 40,
        width: size.width,
        height: size.height,
        fileId: img.id,
        status: 'saved',
        scale: [1, 1],
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
      }
    })
    // Include the just-added image files while restoring. Excalidraw drops
    // image elements whose fileId cannot be resolved during restore.
    const restored = restore(
      {
        elements: [...current, ...(raw as unknown as BoardElement[])],
        appState: api.getAppState(),
        files: api.getFiles(),
      },
      null,
      current,
      { repairBindings: true, refreshDimensions: true },
    )
    api.updateScene({ elements: normalizeBoardElementPoints(restored.elements ?? []) })
    return { placed: images.length, summary: `Placed ${images.length} image(s) on the board (${images.map((img) => img.name).join(', ')}).` }
  } catch (error) {
    return { placed: 0, summary: `Could not place images on the board: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Convert staged images to native vision input for the model (docs pattern). */
export function toAgentImages(images: readonly StagedBoardImage[]): Array<{ base64: string; mime: string }> {
  const out: Array<{ base64: string; mime: string }> = []
  for (const img of images.slice(0, 6)) {
    const comma = img.dataUrl.indexOf(',')
    const base64 = comma >= 0 ? img.dataUrl.slice(comma + 1) : img.dataUrl
    if (base64) out.push({ base64, mime: img.mimeType })
  }
  return out
}

/** Human-readable detail of the selected board elements for the chat scope. */
export function describeSelection(api: BoardApi | null, ids: readonly string[]): string {
  if (!api || ids.length === 0) return 'No board elements selected.'
  try {
    const wanted = new Set(ids)
    const selected = api.getSceneElements().filter((el) => wanted.has(el.id))
    if (selected.length === 0) return 'The previous selection is gone from the board.'
    const visible = selected.slice(0, 20)
    const bounds = selected.reduce<{ left: number; top: number; right: number; bottom: number } | null>((acc, el) => {
      const e = el as unknown as Record<string, unknown>
      const x = typeof e.x === 'number' && Number.isFinite(e.x) ? e.x : null
      const y = typeof e.y === 'number' && Number.isFinite(e.y) ? e.y : null
      const width = typeof e.width === 'number' && Number.isFinite(e.width) ? Math.max(0, e.width) : null
      const height = typeof e.height === 'number' && Number.isFinite(e.height) ? Math.max(0, e.height) : null
      if (x === null || y === null || width === null || height === null) return acc
      const right = x + width
      const bottom = y + height
      return acc
        ? { left: Math.min(acc.left, x), top: Math.min(acc.top, y), right: Math.max(acc.right, right), bottom: Math.max(acc.bottom, bottom) }
        : { left: x, top: y, right, bottom }
    }, null)
    const boundsText = bounds
      ? `Selection bounds (approximate axis-aligned board units): x=${Math.round(bounds.left)}, y=${Math.round(bounds.top)}, width=${Math.round(bounds.right - bounds.left)}, height=${Math.round(bounds.bottom - bounds.top)}.`
      : ''
    const lines = visible.map((el) => {
      const e = el as unknown as Record<string, unknown>
      const text = typeof e.text === 'string' && e.text ? ` text=${JSON.stringify(e.text.slice(0, 120))}` : ''
      const x = typeof e.x === 'number' && Number.isFinite(e.x) ? Math.round(e.x) : null
      const y = typeof e.y === 'number' && Number.isFinite(e.y) ? Math.round(e.y) : null
      const width = typeof e.width === 'number' && Number.isFinite(e.width) ? Math.round(e.width) : null
      const height = typeof e.height === 'number' && Number.isFinite(e.height) ? Math.round(e.height) : null
      const geometry = [x, y, width, height].every((value) => value !== null)
        ? ` bounds=${x},${y},${width},${height}`
        : ''
      return `- ${String(e.type)} id=${String(e.id)}${geometry}${text}`
    })
    const extra = selected.length > 20 ? `\n… and ${selected.length - 20} more` : ''
    return `Selected ${selected.length} element(s):${boundsText ? `\n${boundsText}` : ''}\n${lines.join('\n')}${extra}`
  } catch {
    return 'Could not read the board selection.'
  }
}
