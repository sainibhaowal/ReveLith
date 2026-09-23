/**
 * Pure PNG-export helpers for the Markdown app (no Electron imports, so
 * vitest can exercise them directly). The Electron wiring lives in
 * markdown-main.ts and mirrors the PDF flow: render the print HTML in a
 * hidden window, then capturePage → .png instead of printToPDF.
 */

/** Width of the hidden capture window (CSS px). Matches the editor column. */
export const PNG_CAPTURE_WIDTH = 960
/** Vertical padding around the document inside the capture window. */
export const PNG_CAPTURE_PADDING = 32
/** Minimum capture height so tiny notes still produce a sane image. */
export const PNG_CAPTURE_MIN_HEIGHT = 400
/**
 * Maximum capture height (CSS px). A single NativeImage this tall at 2x is
 * ~130MB RGBA — large but writable. Taller documents are captured top-most;
 * PDF export remains the paginated path for very long notes.
 */
export const PNG_CAPTURE_MAX_HEIGHT = 16000
/** Device scale for crisp output on HiDPI screens. */
export const PNG_CAPTURE_SCALE = 2

export interface CaptureSize {
  width: number
  height: number
  scale: number
}

/** Strip dialog-unsafe characters and bound the length, mirroring main. */
export function sanitizeExportBaseName(name: unknown, fallback: string): string {
  const safe = String(name ?? '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .slice(0, 80)
    .trim()
  return safe || fallback
}

/** Default save-dialog path for a PNG export. */
export function pngDefaultPath(safeName: string): string {
  return `${safeName}.png`
}

/**
 * Map measured content size → hidden-window size. Non-finite or empty
 * measurements fall back to a minimal viewport; oversized documents clamp.
 */
export function computeCaptureSize(scrollWidth: unknown, scrollHeight: unknown): CaptureSize {
  const w = Number(scrollWidth)
  const h = Number(scrollHeight)
  const width = Number.isFinite(w) && w > 0 ? Math.min(Math.ceil(w) + PNG_CAPTURE_PADDING * 2, 1600) : PNG_CAPTURE_WIDTH
  const rawHeight = Number.isFinite(h) && h > 0 ? Math.ceil(h) + PNG_CAPTURE_PADDING * 2 : PNG_CAPTURE_MIN_HEIGHT
  const height = Math.min(Math.max(rawHeight, PNG_CAPTURE_MIN_HEIGHT), PNG_CAPTURE_MAX_HEIGHT)
  return { width: Math.max(width, PNG_CAPTURE_WIDTH), height, scale: PNG_CAPTURE_SCALE }
}
