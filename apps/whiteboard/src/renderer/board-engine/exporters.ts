// ReveLith Drawboard — export helpers (PNG/SVG/board file).
import { exportToBlob, exportToSvg } from '@excalidraw/excalidraw'
import type { ExcalidrawElement as BoardElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import { serializeScene } from './persistence'

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

async function saveExportBlob(blob: Blob, filename: string): Promise<void> {
  const api = window.electronAPI
  if (api?.saveExportFile) {
    const result = await api.saveExportFile(filename, await blob.arrayBuffer())
    if (result?.error) throw new Error(result.error)
    return
  }
  downloadBlob(blob, filename)
}

export async function exportScenePng(
  elements: readonly BoardElement[],
  appState: Partial<AppState> | undefined,
  files: BinaryFiles | undefined,
  filename: string,
): Promise<void> {
  const blob = await exportToBlob({
    elements: [...elements],
    appState: { ...(appState ?? {}), exportWithDarkMode: false } as AppState,
    files: files ?? {},
    mimeType: 'image/png',
    quality: 0.92,
  })
  await saveExportBlob(blob, filename.endsWith('.png') ? filename : `${filename}.png`)
}

export async function exportSceneSvg(
  elements: readonly BoardElement[],
  appState: Partial<AppState> | undefined,
  files: BinaryFiles | undefined,
  filename: string,
): Promise<void> {
  const svg = await exportToSvg({
    elements: [...elements],
    appState: { ...(appState ?? {}) } as AppState,
    files: files ?? {},
  })
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' })
  await saveExportBlob(blob, filename.endsWith('.svg') ? filename : `${filename}.svg`)
}

export async function exportBoardFile(
  elements: readonly BoardElement[],
  appState: Partial<AppState> | undefined,
  files: BinaryFiles | undefined,
  filename: string,
): Promise<void> {
  const payload = serializeScene(elements, appState, files)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  await saveExportBlob(
    blob,
    filename.endsWith('.draw') ||
      filename.endsWith('.drawboard') ||
      filename.endsWith('.whiteboard')
      ? filename
      : `${filename}.draw`,
  )
}

export function safeFilename(title: string, ext: string): string {
  const base = (title || 'drawing').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'drawing'
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`
}

/** Copy the board as a PNG image to the system clipboard. Returns false when unavailable. */
export async function copyScenePng(
  elements: readonly BoardElement[],
  appState: Partial<AppState> | undefined,
  files: BinaryFiles | undefined,
): Promise<boolean> {
  try {
    const blob = await exportToBlob({
      elements: [...elements],
      appState: { ...(appState ?? {}), exportWithDarkMode: false } as AppState,
      files: files ?? {},
      mimeType: 'image/png',
      quality: 0.92,
    })
    const item = new ClipboardItem({ [blob.type || 'image/png']: blob })
    await navigator.clipboard.write([item])
    return true
  } catch {
    return false
  }
}
