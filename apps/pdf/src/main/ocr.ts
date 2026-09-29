/**
 * OCR text layer support for scanned pages: recognize one rendered page image
 * so the viewer can draw a selectable transparent text overlay over it.
 *
 * The engine is Tesseract compiled to WebAssembly, run in the main process.
 * That is a deliberate choice over a platform helper binary: it needs no
 * per-platform build step, it recognizes the same languages everywhere, and it
 * runs entirely on-device — a scanned page never leaves the machine. The cost
 * is speed, which is why the viewer recognizes pages in the background, one at
 * a time, starting from the page the user is looking at.
 *
 * Recognition data (the trained model, a few MB per language) is fetched once
 * and cached under userData, so every later run — and every later launch — is
 * fully offline. Nothing about the page itself is ever sent anywhere.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { createWorker, type Worker } from 'tesseract.js'
import { ocrCorePath, ocrEngineAvailable, ocrWorkerPath } from './ocr-path'
import type { PdfOcrLine } from '../shared/ipc'

/** Tesseract language codes, keyed by the two-letter code the UI offers. */
const UI_LANG_TO_TESSERACT: Record<string, string> = {
  en: 'eng',
  es: 'spa',
  fr: 'fra',
  de: 'deu',
  it: 'ita',
  pt: 'por',
  zh: 'chi_sim',
  ja: 'jpn',
  ko: 'kor',
  ru: 'rus',
  ar: 'ara',
  hi: 'hin',
  nl: 'nld',
  pl: 'pol',
  th: 'tha',
  vi: 'vie',
}

const DEFAULT_LANG = 'eng'

/** Every line Tesseract found, flattened out of its block/paragraph tree. */
function collectLines(data: {
  blocks?: Array<{ paragraphs?: Array<{ lines?: unknown[] }> }> | null
}): Array<{
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
  words: Array<{
    text: string
    bbox: { x0: number; y0: number; x1: number; y1: number }
    symbols: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>
  }>
}> {
  const lines: ReturnType<typeof collectLines> = []
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        lines.push(line as ReturnType<typeof collectLines>[number])
      }
    }
  }
  return lines
}

/** PNG dimensions from the IHDR chunk; null when the header is unreadable. */
function pngSize(bytes: Buffer): { width: number; height: number } | null {
  // 8-byte signature + 4 length + 4 "IHDR", then width/height as big-endian u32
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

let workerPromise: Promise<Worker> | null = null
/** Language the pooled worker was started with; switching restarts it. */
let workerLang: string | null = null

/**
 * The pooled worker, started on first use. Tesseract loads its model (tens of
 * MB) once and reuses it, which is what makes per-page recognition viable.
 */
function worker(lang: string): Promise<Worker> {
  if (workerPromise && workerLang === lang) return workerPromise
  const previous = workerPromise
  workerLang = lang
  // the default cache directory is the process working directory, which is
  // neither stable nor writable inside an installed app
  const cachePath = join(app.getPath('userData'), 'ocr-cache')
  try {
    mkdirSync(cachePath, { recursive: true })
  } catch {
    /* a read-only profile just means the model is fetched every session */
  }
  workerPromise = createWorker(lang, 1, {
    logger: () => {},
    cachePath,
    // the packaged app has no node_modules, so the worker and the WASM core
    // are addressed through Resources/ocr instead (apps/pdf/src/main/ocr-path.ts)
    workerPath: ocrWorkerPath(),
    corePath: ocrCorePath(),
  }).catch((err: unknown) => {
    // a failed start must not poison the pool for the next attempt
    workerPromise = null
    workerLang = null
    throw err
  })
  // a language switch tears the old worker down once it is free
  void previous?.then((old) => old.terminate()).catch(() => {})
  return workerPromise
}

/** Stop the pooled worker (app quit). */
export async function disposeOcr(): Promise<void> {
  const current = workerPromise
  workerPromise = null
  workerLang = null
  await current?.then((w) => w.terminate()).catch(() => {})
}

/**
 * Recognized text of one rendered page.
 *
 * `null` means "this build cannot OCR" (the caller stops trying), while `[]`
 * means the page was read and held no recognizable text (the caller moves on).
 * Boxes are normalized [x0, y0, x1, y1] with the origin at the top-left, which
 * is how the renderer hands them to the overlay.
 */
export async function ocrPagePng(pngBase64: string, lang?: string): Promise<PdfOcrLine[] | null> {
  if (!ocrEngineAvailable()) return null
  const code = UI_LANG_TO_TESSERACT[lang ?? 'en'] ?? DEFAULT_LANG
  const bytes = Buffer.from(pngBase64, 'base64')
  if (bytes.length === 0) return []
  const size = pngSize(bytes)
  if (!size || size.width === 0 || size.height === 0) return []

  try {
    // `blocks` is the only output that carries the word/symbol tree the text
    // layer needs; plain text would leave every box unknown
    const { data } = await (await worker(code)).recognize(bytes, {}, { blocks: true })
    const norm = (bbox: { x0: number; y0: number; x1: number; y1: number }) =>
      [
        bbox.x0 / size.width,
        bbox.y0 / size.height,
        bbox.x1 / size.width,
        bbox.y1 / size.height,
      ] as [number, number, number, number]

    const lines: PdfOcrLine[] = []
    for (const line of collectLines(data)) {
      const text = line.text.replace(/\s+$/, '')
      if (!text.trim()) continue
      lines.push({
        text,
        // Tesseract reports 0..100; the renderer compares against 0..1
        confidence: line.confidence / 100,
        box: norm(line.bbox),
        chars: line.words.flatMap((word) =>
          word.symbols.map((symbol) => ({ text: symbol.text, box: norm(symbol.bbox) })),
        ),
      })
    }
    return lines
  } catch {
    // a model that cannot be loaded, or a page it chokes on: report "nothing
    // recognized" rather than aborting the whole document's OCR pass
    return []
  }
}
