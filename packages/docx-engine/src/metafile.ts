import { convertEmfToDataUrl, convertWmfToDataUrl } from './vendor/emf-converter/index.mjs'
import { extractEmfBitmapDataUrl } from './metafile-bitmap'

const EMF_MIMES = new Set(['image/emf', 'image/x-emf'])
const WMF_MIMES = new Set(['image/wmf', 'image/x-wmf'])

export function isMetafileMime(mime: string | undefined): mime is string {
  return mime !== undefined && (EMF_MIMES.has(mime) || WMF_MIMES.has(mime))
}

/**
 * Render EMF/WMF bytes to a PNG data URL via the vendored emf-converter.
 * When that fails on an EMF file, fall back to the native embedded-bitmap
 * extractor (many Office EMFs wrap a DIB): a BMP data URL still displays.
 * Returns null only when nothing drawable was found, so callers keep their
 * existing empty-frame degrade.
 */
export async function metafileToDataUrl(
  bytes: ArrayBuffer | Uint8Array,
  mime: string,
): Promise<string | null> {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  try {
    if (EMF_MIMES.has(mime)) {
      const rendered = await convertEmfToDataUrl(raw.slice().buffer, { dpiScale: 2 })
      if (rendered) return rendered
      return extractEmfBitmapDataUrl(raw)
    }
    if (WMF_MIMES.has(mime)) return await convertWmfToDataUrl(raw.slice().buffer, { dpiScale: 2 })
    return null
  } catch {
    if (EMF_MIMES.has(mime)) {
      try {
        return extractEmfBitmapDataUrl(raw)
      } catch {
        return null
      }
    }
    return null
  }
}
