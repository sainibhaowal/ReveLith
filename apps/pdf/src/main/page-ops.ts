import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'

/** In-place page-structure rewrites (pdf-lib). All indices are 0-based original
    page indices; every function validates and throws a plain Error otherwise. */

export interface PageOpResult {
  bytes: Uint8Array
  pageCount: number
}

function loadChecked(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { updateMetadata: false })
}

function checkPages(count: number, pages: readonly number[], what: string): void {
  if (pages.length === 0) throw new Error(`${what}: no pages given`)
  for (const p of pages) {
    if (!Number.isInteger(p) || p < 0 || p >= count) {
      throw new Error(`${what}: page ${p + 1} out of range (document has ${count} pages)`)
    }
  }
}

function checkSize(width: number, height: number, what: string): void {
  for (const [name, v] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isFinite(v) || v < 36 || v > 2880) {
      throw new Error(`${what}: ${name} must be 36..2880 pt`)
    }
  }
}

/** Insert a blank page after afterPageIndex (-1 = front). Size defaults to the
    neighboring page so the sheet matches the document. */
export async function insertBlankPage(
  bytes: Uint8Array,
  afterPageIndex: number,
  width?: number,
  height?: number,
): Promise<PageOpResult> {
  const pdfDoc = await loadChecked(bytes)
  const count = pdfDoc.getPageCount()
  if (!Number.isInteger(afterPageIndex) || afterPageIndex < -1 || afterPageIndex >= count) {
    throw new Error(`insert-blank-page: position ${afterPageIndex + 1} out of range`)
  }
  let w = width
  let h = height
  if (w === undefined || h === undefined) {
    const neighbor = pdfDoc.getPage(Math.min(Math.max(afterPageIndex, 0), count - 1))
    const size = neighbor.getSize()
    w ??= size.width
    h ??= size.height
  }
  checkSize(w!, h!, 'insert-blank-page')
  pdfDoc.insertPage(afterPageIndex + 1, [w!, h!])
  return { bytes: await pdfDoc.save({ useObjectStreams: false }), pageCount: count + 1 }
}

/** Resize pages (pdf-lib setSize keeps content glued to the bottom-left corner) */
export async function setPageSize(
  bytes: Uint8Array,
  pages: number[],
  width: number,
  height: number,
): Promise<PageOpResult> {
  const pdfDoc = await loadChecked(bytes)
  checkPages(pdfDoc.getPageCount(), pages, 'set-page-size')
  checkSize(width, height, 'set-page-size')
  for (const p of pages) pdfDoc.getPage(p).setSize(width, height)
  return { bytes: await pdfDoc.save({ useObjectStreams: false }), pageCount: pdfDoc.getPageCount() }
}

/** Crop pages to a PDF-space rect (y-up). The box must sit inside the page. */
export async function cropPages(
  bytes: Uint8Array,
  pages: number[],
  box: readonly [number, number, number, number],
): Promise<PageOpResult> {
  const pdfDoc = await loadChecked(bytes)
  checkPages(pdfDoc.getPageCount(), pages, 'crop-pages')
  const [x1, y1, x2, y2] = box
  if (![x1, y1, x2, y2].every((v) => Number.isFinite(v)) || !(x1 < x2 && y1 < y2)) {
    throw new Error('crop-pages: box must be [x1, y1, x2, y2] with x1 < x2 and y1 < y2')
  }
  if (x2 - x1 < 10 || y2 - y1 < 10) throw new Error('crop-pages: kept region is too small')
  for (const p of pages) {
    const page = pdfDoc.getPage(p)
    const { width, height } = page.getSize()
    if (x1 < 0 || y1 < 0 || x2 > width || y2 > height) {
      throw new Error(`crop-pages: box exceeds page ${p + 1} (${width} x ${height} pt)`)
    }
    page.node.set(PDFName.of('CropBox'), pdfDoc.context.obj([x1, y1, x2, y2]))
  }
  return { bytes: await pdfDoc.save({ useObjectStreams: false }), pageCount: pdfDoc.getPageCount() }
}

/** Replace a page range with the pages of another document (both 0-based) */
export async function replacePages(
  bytes: Uint8Array,
  pages: number[],
  otherBytes: Uint8Array,
): Promise<PageOpResult> {
  const pdfDoc = await loadChecked(bytes)
  checkPages(pdfDoc.getPageCount(), pages, 'replace-pages')
  const src = await PDFDocument.load(otherBytes, { updateMetadata: false }).catch(() => {
    throw new Error('replace-pages: the picked file is not a readable PDF')
  })
  const sorted = [...pages].sort((a, b) => a - b)
  const copied = await pdfDoc.copyPages(src, src.getPageIndices())
  // Splice from the back so earlier indices stay valid
  let at = sorted[0]!
  for (let i = sorted.length - 1; i >= 0; i--) pdfDoc.removePage(sorted[i]!)
  for (const p of copied) pdfDoc.insertPage(at++, p)
  return { bytes: await pdfDoc.save({ useObjectStreams: false }), pageCount: pdfDoc.getPageCount() }
}

/** A4 page size used for fresh documents */
export const A4: readonly [number, number] = [595.28, 841.89]

/** Build a fresh document: blank A4 pages with an optional title + body text
    (standard Helvetica: latin scripts only; CJK text is kept but cannot render
    in the base-14 fonts, so callers should prefer short latin titles). */
export async function createDocument(
  pageCount: number,
  title?: string,
  text?: string,
): Promise<Uint8Array> {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 100) {
    throw new Error('create-document: pages must be 1..100')
  }
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const body = (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([A4[0], A4[1]])
    const margin = 72
    let y = A4[1] - margin
    if (i === 0 && title?.trim()) {
      page.drawText(title.trim().slice(0, 120), { x: margin, y: y - 20, size: 20, font: bold })
      y -= 56
    }
    if (i === 0) {
      for (const para of body) {
        for (const line of wrapLatin(para, font, 11, A4[0] - margin * 2)) {
          if (y < margin + 12) break
          page.drawText(line, { x: margin, y: y - 11, size: 11, font })
          y -= 15
        }
        y -= 6
        if (y < margin + 12) break
      }
    }
  }
  pdfDoc.setTitle(title?.trim() || 'Untitled')
  pdfDoc.setModificationDate(new Date())
  return pdfDoc.save({ useObjectStreams: false })
}

/** Greedy latin word wrap to a width (character fallback for long tokens) */
function wrapLatin(
  para: string,
  font: { widthOfTextAtSize(text: string, size: number): number },
  size: number,
  width: number,
): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of para.split(/\s+/).filter(Boolean)) {
    const trial = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(trial, size) <= width || !line) {
      if (font.widthOfTextAtSize(word, size) > width && !line) {
        let rest = word
        while (rest && font.widthOfTextAtSize(rest, size) > width) {
          let k = 1
          while (k < rest.length && font.widthOfTextAtSize(rest.slice(0, k + 1), size) <= width) k++
          lines.push(rest.slice(0, k))
          rest = rest.slice(k)
        }
        line = rest
      } else {
        line = trial
      }
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : ['']
}
