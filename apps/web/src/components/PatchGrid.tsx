import { useEffect, useRef } from 'react'

/**
 * Background canvas: the ReveLith byte grid.
 *
 * This is deliberately not a decorative particle mesh. It visualises the thing
 * the product actually does — a document parsed into a grid of aligned blocks,
 * then written back with a narrow delta patch instead of a full re-serialize:
 *
 *   - The grid is the in-memory block map. Each cell sits at a subtle resting
 *     opacity, with per-cell variation so it reads as real data, not a mesh.
 *   - A narrow "patch band" sweeps down the page. Inside it, blocks light up as
 *     the region being written. Everything outside it stays untouched — which is
 *     the byte-preservation claim, shown rather than stated.
 *   - The sweep position is driven by scroll progress, so the band tracks the
 *     reader down the page and ties the background to navigation.
 *   - The pointer warms a local radius of blocks, so the grid responds to the
 *     cursor without ever becoming the subject.
 *
 * Costs no per-cell state: cells outside the band are a single globalAlpha fill,
 * and block values are derived by hashing (x, y) rather than stored.
 */

/** Grid pitch in CSS pixels. Larger = fewer cells = cheaper. */
const CELL = 22
/** Gap between blocks, as a fraction of the pitch. */
const INSET = 4
/** Patch band thickness in CSS pixels. */
const BAND = 58
/** Seconds for the idle sweep to traverse the viewport. */
const PERIOD = 22
/** Pointer warmth radius in CSS pixels. */
const POINTER_RADIUS = 170

const COLOR_REST = '150, 165, 190'
const COLOR_PATCH = '108, 71, 255'
const COLOR_HEAD = '0, 180, 216'

/** Deterministic per-cell pseudo-random in [0,1). */
function hash(x: number, y: number): number {
  let n = (x * 73856093) ^ (y * 19349663)
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

export function PatchGrid() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let dpr = 1
    let raf = 0
    let running = true
    let start = 0
    const pointer = { x: -9999, y: -9999, active: false }

    /**
     * The resting byte grid never changes, so it is rasterised once into an
     * offscreen canvas and blitted each frame. Previously every frame re-filled
     * ~2,400 rectangles, which is what made scrolling on this page expensive.
     * Only the patch band and the pointer glow animate now, and both are a
     * handful of fills.
     */
    let gridLayer: HTMLCanvasElement | null = null

    const buildGridLayer = () => {
      const cols = Math.ceil(width / CELL) + 1
      const rows = Math.ceil(height / CELL) + 1
      const inner = CELL - INSET
      const layer = document.createElement('canvas')
      layer.width = Math.floor(width * dpr)
      layer.height = Math.floor(height * dpr)
      const lctx = layer.getContext('2d')
      if (!lctx) return
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      lctx.fillStyle = `rgb(${COLOR_REST})`
      for (let gy = 0; gy < rows; gy++) {
        const cy = gy * CELL
        for (let gx = 0; gx < cols; gx++) {
          const h = hash(gx, gy)
          // Very low: this is a bed the content sits on, not a texture to read.
          lctx.globalAlpha = 0.009 + h * 0.022
          lctx.fillRect(gx * CELL, cy, inner, inner)
        }
      }
      lctx.globalAlpha = 1
      gridLayer = layer
    }

    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildGridLayer()
    }

    /** Scroll progress in [0,1], used to place the patch band. */
    const progress = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      return Math.min(1, Math.max(0, window.scrollY / max))
    }

    const draw = (elapsed: number) => {
      const cols = Math.ceil(width / CELL) + 1
      const rows = Math.ceil(height / CELL) + 1
      const inner = CELL - INSET
      const p = progress()

      // The band tracks scroll, with a slow idle drift so the page is alive at
      // rest and still moves for a reader who has not scrolled.
      const idle = ((elapsed / PERIOD) % 1) * height
      const yBand = p * height + idle * 0.18
      const headY = yBand - BAND * 0.5

      ctx.clearRect(0, 0, width, height)

      // --- untouched blocks: one blit of the cached layer -------------------
      if (gridLayer) {
        ctx.globalAlpha = 1
        ctx.drawImage(gridLayer, 0, 0, width, height)
      }

      // --- patched band ----------------------------------------------------
      const from = Math.max(0, Math.floor((headY - 6) / CELL))
      const to = Math.min(rows - 1, Math.ceil((headY + BAND + 6) / CELL))
      for (let gy = from; gy <= to; gy++) {
        const cy = gy * CELL
        const d = Math.abs(cy - headY)
        // Tight leading edge, exponential falloff behind it.
        const falloff = Math.exp(-d / (BAND * 0.42))
        for (let gx = 0; gx < cols; gx++) {
          const h = hash(gx, gy)
          if (h < 0.05) continue // a few bytes stay untouched even inside the band
          ctx.globalAlpha = 0.035 + falloff * (0.14 + h * 0.3)
          ctx.fillStyle = `rgb(${COLOR_PATCH})`
          ctx.fillRect(gx * CELL, cy, inner, inner)
        }
      }

      // --- leading edge: a hairline where the write is happening -----------
      if (headY > -8 && headY < height + 8) {
        const grad = ctx.createLinearGradient(0, headY - 26, 0, headY + 26)
        grad.addColorStop(0, 'rgba(0, 180, 216, 0)')
        grad.addColorStop(0.5, `rgba(${COLOR_HEAD}, ${(0.16 + p * 0.16).toFixed(3)})`)
        grad.addColorStop(1, 'rgba(0, 180, 216, 0)')
        ctx.globalAlpha = 1
        ctx.fillStyle = grad
        ctx.fillRect(0, headY - 26, width, 52)
      }

      // --- pointer warmth (one radial fill, not per-cell logic) -------------
      if (pointer.active) {
        ctx.globalAlpha = 1
        const glow = ctx.createRadialGradient(
          pointer.x, pointer.y, 0,
          pointer.x, pointer.y, POINTER_RADIUS
        )
        glow.addColorStop(0, 'rgba(108, 71, 255, 0.10)')
        glow.addColorStop(0.55, 'rgba(108, 71, 255, 0.04)')
        glow.addColorStop(1, 'rgba(108, 71, 255, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(
          pointer.x - POINTER_RADIUS, pointer.y - POINTER_RADIUS,
          POINTER_RADIUS * 2, POINTER_RADIUS * 2
        )
      }

      ctx.globalAlpha = 1
    }

    let last = 0
    const loop = (now: number) => {
      if (!running) return
      if (!start) start = now
      // 30fps is ample for a slow band and halves the fill cost.
      if (now - last < 33) {
        raf = window.requestAnimationFrame(loop)
        return
      }
      last = now
      draw((now - start) / 1000)
      raf = window.requestAnimationFrame(loop)
    }

    const onPointerMove = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.active = true
    }
    const onPointerLeave = () => { pointer.active = false }

    // On small screens the grid sits behind dense content and costs battery for
    // no benefit, so stop rendering once the hero has been scrolled past.
    const NARROW = 820
    const isNarrow = () => window.innerWidth < NARROW
    const heroEl = document.querySelector('.hero-section')
    let heroInView = true

    const shouldRender = () => !document.hidden && !(isNarrow() && !heroInView)

    const onVisibility = () => {
      const next = shouldRender()
      if (next === running) return
      running = next
      if (running && !reduced) raf = window.requestAnimationFrame(loop)
      else {
        window.cancelAnimationFrame(raf)
        if (isNarrow() && !heroInView) ctx.clearRect(0, 0, width, height)
      }
    }

    let heroObserver: IntersectionObserver | null = null
    if (heroEl) {
      heroObserver = new IntersectionObserver(
        (entries) => {
          heroInView = entries[0]?.isIntersecting ?? true
          onVisibility()
        },
        { threshold: 0 }
      )
      heroObserver.observe(heroEl)
    }

    let resizeTimer = 0
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        size()
        if (reduced) draw(0)
        onVisibility()
      }, 180)
    }

    size()

    if (reduced) {
      // Single composed frame: read as a static technical watermark.
      draw(0)
    } else {
      raf = window.requestAnimationFrame(loop)
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('pointerleave', onPointerLeave)
      document.addEventListener('visibilitychange', onVisibility)
    }
    window.addEventListener('resize', onResize)

    return () => {
      running = false
      window.cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      heroObserver?.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={canvasRef} className="patch-grid" aria-hidden="true" />
}

export default PatchGrid
