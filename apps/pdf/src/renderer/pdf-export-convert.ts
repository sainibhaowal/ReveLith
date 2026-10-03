/** Local PDF -> editable PPTX / compact DOCX helpers (no cloud). */

export interface PdfPageText {
  readonly page: number
  readonly text: string
  readonly imageDataUrl?: string
}

export function buildEditablePptxModel(pages: readonly PdfPageText[]): string {
  // Minimal editable model: one <p:sld> per page with a textbox (real OOXML
  // assembly happens in pptx-engine; this returns the auditable intermediate).
  return JSON.stringify(
    {
      slides: pages.map((p) => ({
        layout: 'blank',
        shapes: [
          { type: 'textbox', text: p.text.slice(0, 4000), editable: true },
          ...(p.imageDataUrl ? [{ type: 'picture', src: 'embedded', editable: true }] : []),
        ],
      })),
    },
    null,
    2,
  )
}

export function dedupeImages(dataUrls: readonly string[]): string[] {
  return [...new Set(dataUrls)]
}

export function compactDocxHtml(paragraphs: readonly string[], images: readonly string[]): string {
  const unique = dedupeImages(images).slice(0, 200)
  const body = paragraphs.map((p) => `<p>${p.replace(/</g, '&lt;')}</p>`).join('\n')
  const imgs = unique.map((src) => `<img src="${src}" style="max-width:100%">`).join('\n')
  return `<!doctype html><html><body>${body}\n${imgs}</body></html>`
}
