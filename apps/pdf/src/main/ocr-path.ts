import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * Runtime assets for the local OCR engine.
 *
 * The packaged app ships no node_modules (everything is bundled), but Tesseract
 * is loaded as a real package at runtime — it spawns a worker script and
 * instantiates a WASM core from disk, so neither can be inlined into the
 * bundle. electron-builder copies both packages into Resources/ocr instead
 * (see apps/shell/electron-builder.cjs extraResources), and the resolvers below
 * find node_modules during dev and Resources/ocr once installed.
 */

const req = () => createRequire(import.meta.url)
const packaged = (fileName: string) => join(process.resourcesPath, 'ocr', fileName)

/** Root of the tesseract.js package (dev: node_modules, packaged: Resources/ocr). */
function tesseractRoot(): string {
  try {
    const entry = req().resolve('tesseract.js')
    // <root>/src/index.js → <root>
    return join(entry, '..', '..')
  } catch {
    return packaged('tesseract.js')
  }
}

/** The node worker script Tesseract spawns. */
export function ocrWorkerPath(): string {
  return join(tesseractRoot(), 'src', 'worker-script', 'node', 'index.js')
}

/** The emscripten glue that loads the WASM core. */
export function ocrCorePath(): string {
  const root = tesseractRoot()
  const candidates = [
    join(root, 'node_modules', 'tesseract.js-core', 'tesseract-core-simd-lstm.js'),
    join(packaged('tesseract.js-core'), 'tesseract-core-simd-lstm.js'),
  ]
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  // last resort: the unoptimized build always exists in the package
  return join(root, 'node_modules', 'tesseract.js-core', 'tesseract-core-lstm.js')
}

/**
 * Tesseract is unavailable when its runtime files are missing (a partial
 * install, or a platform where the engine could not be staged). Callers report
 * "this build cannot OCR" rather than failing the page.
 */
export function ocrEngineAvailable(): boolean {
  return existsSync(ocrWorkerPath()) && existsSync(ocrCorePath())
}
