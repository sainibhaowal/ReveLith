/**
 * Shared image pixel operations. Pure functions over canvas-shaped pixel maps
 * (no DOM), so they are unit-testable in Node and identical across the editors
 * that offer crop / remove-background / transparency.
 */

/** RGBA pixel map isomorphic to canvas ImageData (row-major). */
export interface PixelImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type RGB = readonly [number, number, number]

export interface CutoutResult {
  /** processed pixels (new array; the input is untouched) */
  data: Uint8ClampedArray<ArrayBuffer>
  /** pixels that became transparent (already-transparent ones not counted) */
  removedCount: number
}

/** Kept region of a crop, as 0..1 fractions of the image (l<r, t<b). */
export interface CropFractions {
  l: number
  t: number
  r: number
  b: number
}

/** Remove-background tolerance (0..100) shared by the dialog slider and the AI tool. */
export const DEFAULT_CUTOUT_TOLERANCE = 30

/** Alpha at or below this counts as already transparent. */
const ALPHA_TRANSPARENT = 16
/** Cluster-merge distance for background sampling (0..255 scale). */
const CLUSTER_DIST = 30
/** Clusters below this share of the samples are edge noise, not background. */
const MIN_CLUSTER_RATIO = 0.05

/** Tolerance 0..100 → per-channel RMS color-distance threshold. */
export function toleranceToThreshold(tolerance: number): number {
  const t = Math.max(0, Math.min(100, tolerance))
  return (t * 255) / 100
}

/** Per-channel RMS color distance, 0..255 (black vs white = 255). */
export function colorDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt((dr * dr + dg * dg + db * db) / 3)
}

/**
 * Background representative colors, sampled along the border ring (corners
 * included) and greedily clustered, largest first. Fully transparent pixels do
 * not participate; tiny clusters (edge noise) are dropped.
 */
export function sampleBackgroundColors(img: PixelImage, maxColors = 4): RGB[] {
  const { data, width: w, height: h } = img
  if (w <= 0 || h <= 0) return []
  const perimeter = Math.max(1, 2 * (w + h) - 4)
  const step = Math.max(1, Math.floor(perimeter / 512))
  const sampleIdx: number[] = []
  for (let x = 0; x < w; x += step) {
    sampleIdx.push(x * 4)
    sampleIdx.push(((h - 1) * w + x) * 4)
  }
  for (let y = 0; y < h; y += step) {
    sampleIdx.push(y * w * 4)
    sampleIdx.push((y * w + w - 1) * 4)
  }

  const clusters: Array<{ sr: number; sg: number; sb: number; n: number }> = []
  for (const i of sampleIdx) {
    if ((data[i + 3] ?? 0) < ALPHA_TRANSPARENT) continue
    const c: RGB = [data[i]!, data[i + 1]!, data[i + 2]!]
    let best: (typeof clusters)[number] | null = null
    let bestD = Infinity
    for (const cl of clusters) {
      const d = colorDistance([cl.sr / cl.n, cl.sg / cl.n, cl.sb / cl.n], c)
      if (d < bestD) {
        bestD = d
        best = cl
      }
    }
    if (best && bestD <= CLUSTER_DIST) {
      best.sr += c[0]
      best.sg += c[1]
      best.sb += c[2]
      best.n += 1
    } else {
      clusters.push({ sr: c[0], sg: c[1], sb: c[2], n: 1 })
    }
  }
  const total = clusters.reduce((sum, c) => sum + c.n, 0)
  if (total === 0) return []
  return clusters
    .filter((c) => c.n >= Math.max(1, total * MIN_CLUSTER_RATIO))
    .sort((a, b) => b.n - a.n)
    .slice(0, maxColors)
    .map((c) => [Math.round(c.sr / c.n), Math.round(c.sg / c.n), Math.round(c.sb / c.n)] as const)
}

/**
 * Remove background: 4-connected flood fill from the edges. Pixels within
 * tolerance of a background representative AND connected to the border become
 * transparent, so enclosed regions of the same color (highlights inside a
 * shape) are preserved.
 */
export function removeBackground(
  img: PixelImage,
  tolerance: number,
  bgColors: RGB[] = sampleBackgroundColors(img),
): CutoutResult {
  const { data: src, width: w, height: h } = img
  const out = new Uint8ClampedArray(src)
  if (w <= 0 || h <= 0 || bgColors.length === 0) return { data: out, removedCount: 0 }

  // compare squared distances (restores the /3 of per-channel RMS) to skip sqrt
  const thr2 = toleranceToThreshold(tolerance) ** 2 * 3

  const isBgLike = (i: number): boolean => {
    const p = i * 4
    if ((src[p + 3] ?? 0) < ALPHA_TRANSPARENT) return true
    const r = src[p]!
    const g = src[p + 1]!
    const b = src[p + 2]!
    for (const c of bgColors) {
      const dr = r - c[0]
      const dg = g - c[1]
      const db = b - c[2]
      if (dr * dr + dg * dg + db * db <= thr2) return true
    }
    return false
  }

  const visited = new Uint8Array(w * h)
  const stack: number[] = []
  const trySeed = (i: number) => {
    if (!visited[i] && isBgLike(i)) {
      visited[i] = 1
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x += 1) {
    trySeed(x)
    trySeed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y += 1) {
    trySeed(y * w)
    trySeed(y * w + w - 1)
  }

  let removedCount = 0
  while (stack.length > 0) {
    const i = stack.pop()!
    const p = i * 4
    if (out[p + 3]! > 0) {
      out[p + 3] = 0
      removedCount += 1
    }
    const x = i % w
    if (x > 0) trySeed(i - 1)
    if (x < w - 1) trySeed(i + 1)
    if (i >= w) trySeed(i - w)
    if (i < w * (h - 1)) trySeed(i + w)
  }
  return { data: out, removedCount }
}

/** Mirror pixels horizontally ('h') or vertically ('v'); returns a new array. */
export function flipPixels(img: PixelImage, axis: 'h' | 'v'): Uint8ClampedArray<ArrayBuffer> {
  const { data, width: w, height: h } = img
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const src = (y * w + x) * 4
      const dst = axis === 'h' ? (y * w + (w - 1 - x)) * 4 : ((h - 1 - y) * w + x) * 4
      out[dst] = data[src]!
      out[dst + 1] = data[src + 1]!
      out[dst + 2] = data[src + 2]!
      out[dst + 3] = data[src + 3]!
    }
  }
  return out
}

/** Scale every alpha by `factor` (0..1); returns a new array. */
export function multiplyAlpha(img: PixelImage, factor: number): Uint8ClampedArray<ArrayBuffer> {
  const f = Math.min(1, Math.max(0, factor))
  const out = new Uint8ClampedArray(img.data)
  for (let i = 3; i < out.length; i += 4) out[i] = Math.round(out[i]! * f)
  return out
}

/** Crop a pixel map to a region, clamped to the image. */
export function cropPixels(img: PixelImage, crop: CropFractions): PixelImage {
  const sx = Math.max(0, Math.min(img.width - 1, Math.round(crop.l * img.width)))
  const sy = Math.max(0, Math.min(img.height - 1, Math.round(crop.t * img.height)))
  const sw = Math.max(1, Math.min(img.width - sx, Math.round((crop.r - crop.l) * img.width)))
  const sh = Math.max(1, Math.min(img.height - sy, Math.round((crop.b - crop.t) * img.height)))
  const out = new Uint8ClampedArray(sw * sh * 4)
  for (let y = 0; y < sh; y += 1) {
    const from = ((sy + y) * img.width + sx) * 4
    out.set(img.data.subarray(from, from + sw * 4), y * sw * 4)
  }
  return { data: out, width: sw, height: sh }
}
