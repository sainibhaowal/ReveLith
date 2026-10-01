/**
 * Print a self-contained HTML document to PDF bytes, in the main process.
 *
 * Used by the "create document" flow: the model returns restricted HTML, and
 * the PDF app has no sibling editor to render it, so it prints it headlessly.
 * JavaScript stays off — the content is a model-authored fragment, and running
 * it would be an execution surface with nothing to gain.
 */
import type { BrowserWindow } from 'electron'

/** Minimal page chrome: system UI font, A4-ish page, no chrome of our own. */
const PAGE_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 11pt/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    background: #fff;
  }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.1em 0 0.5em; page-break-after: avoid; }
  h1 { font-size: 1.9em; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.2em; }
  p, li { orphans: 2; widows: 2; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; page-break-inside: avoid; }
  th, td { border: 1px solid #d0d0d0; padding: 5px 7px; text-align: left; }
  th { background: #f2f2f2; }
  pre { background: #f6f6f6; padding: 8px 10px; overflow-x: auto; white-space: pre-wrap; }
  code { font-family: Consolas, Monaco, "Courier New", monospace; font-size: 0.92em; }
  blockquote { margin: 0.8em 0; padding-left: 12px; border-left: 3px solid #d0d0d0; color: #444; }
`

/** Escape the few characters that would otherwise close the document early. */
const escapeTitle = (title: string): string =>
  title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Wrap a body fragment in a printable document. The content is trusted model
 * output for a document the user asked for, so it is embedded as-is.
 */
export function buildPrintableHtml(title: string, content: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeTitle(title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
${content}
</body>
</html>
`
}

export interface PrintHtmlOptions {
  /** page size passed to Chromium; defaults to A4 in portrait */
  pageSize?: { width: number; height: number }
  margins?: { top: number; bottom: number; left: number; right: number }
  /** run the page's own script; off by default (untrusted content) */
  runJavaScript?: boolean
  /** settle time in ms before printing (fonts/images), default 250 */
  settleMs?: number
}

/**
 * Render `html` to PDF bytes in a hidden window. `makeWindow` supplies the
 * window so the caller keeps control over the webPreferences (the PDF app
 * passes a sandboxed, script-free window).
 */
export async function printHtmlToPdf(
  html: string,
  makeWindow: () => BrowserWindow,
  options: PrintHtmlOptions = {},
): Promise<Uint8Array> {
  const win = makeWindow()
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    if (options.settleMs !== 0) {
      // let webfonts and images settle; printing immediately loses both
      await new Promise((r) => setTimeout(r, options.settleMs ?? 250))
    }
    const bytes = await win.webContents.printToPDF({
      printBackground: true,
      ...(options.pageSize ? { pageSize: options.pageSize } : {}),
      margins: options.margins ?? { top: 0, bottom: 0, left: 0, right: 0 },
    })
    return new Uint8Array(bytes)
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
