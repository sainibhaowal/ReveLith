import type { PDFDocumentProxy } from 'pdfjs-dist'

const PRINT_SCALE = 150 / 72

/**
 * Sequentially render pages as JPEG images into a print-only container (canvas discarded
 * immediately to avoid keeping full-doc hi-res bitmaps in memory), then hand off to the
 * system print dialog; clean up after it closes (including cancel).
 * Caller flushes unsaved changes and re-getDocument first : rotations/deleted pages are
 * already in the file.
 */
export function parsePageRange(range: string, total: number): number[] {
  const pages = new Set<number>()
  for (const part of range.split(',')) {
    const t = part.trim()
    if (!t) continue
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(t)
    if (m) {
      const a = Math.max(1, Number(m[1]))
      const b = Math.min(total, Number(m[2]))
      for (let n = a; n <= b; n++) pages.add(n)
    } else {
      const n = Number(t)
      if (Number.isInteger(n) && n >= 1 && n <= total) pages.add(n)
    }
  }
  return [...pages].sort((a, b) => a - b)
}

export async function printPdf(doc: PDFDocumentProxy, range?: string): Promise<void> {
  const root = document.createElement('div')
  root.className = 'pdf-print-root'
  const canvas = document.createElement('canvas')
  const wanted = range?.trim() ? parsePageRange(range, doc.numPages) : null
  const list =
    wanted && wanted.length > 0 ? wanted : Array.from({ length: doc.numPages }, (_, i) => i + 1)
  for (const n of list) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: PRINT_SCALE })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvas, viewport }).promise
    const img = document.createElement('img')
    img.src = canvas.toDataURL('image/jpeg', 0.92)
    root.appendChild(img)
  }
  canvas.width = 0
  canvas.height = 0
  document.body.appendChild(root)
  try {
    await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode()))
    await new Promise<void>((resolve) => {
      const done = () => {
        window.removeEventListener('afterprint', done)
        resolve()
      }
      window.addEventListener('afterprint', done)
      window.print()
    })
  } finally {
    root.remove()
  }
}
