/**
 * Image edit dialogs shared by the editors: remove background (edge flood fill
 * with a tolerance slider and live preview) and crop (8 handles, or drag inside
 * to move the box). Both hand back baked base64 PNG pixels, so the caller only
 * has to store the bytes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import {
  DEFAULT_CUTOUT_TOLERANCE,
  removeBackground,
  sampleBackgroundColors,
  type CropFractions,
  type PixelImage,
  type RGB,
} from './image-pixels'

/** Localized copy for both dialogs. */
export interface ImageDialogLabels {
  cancel: string
  apply: string
  applying: string
  loading: string
  loadFailed: string
  processFailed: string
  cutoutTitle: string
  tolerance: string
  cutoutHint: (removedPct: number) => string
  cropTitle: string
  cropHint: string
}

/** Longest side of the preview canvas (px). */
const PREVIEW_MAX = 520
/** Minimum crop-box side in preview px, so a drag cannot collapse it. */
const MIN_CROP_PX = 16

/** Checkerboard so transparent regions read as transparent, not white. */
const CHECKERBOARD: CSSProperties = {
  background: 'repeating-conic-gradient(#d5d5d5 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px',
}

const toDataUrl = (b64: string) => `data:image/png;base64,${b64}`
const toBase64 = (dataUrl: string) => dataUrl.split(',')[1] ?? ''

function useLoadedPixels(image: string, maxPreview: number) {
  const [state, setState] = useState<{
    full: PixelImage | null
    preview: PixelImage | null
    bgColors: RGB[]
    loaded: boolean
    error: boolean
  }>({ full: null, preview: null, bgColors: [], loaded: false, error: false })

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (!w || !h) {
        setState({ full: null, preview: null, bgColors: [], loaded: false, error: true })
        return
      }
      const grab = (dw: number, dh: number): PixelImage => {
        const canvas = document.createElement('canvas')
        canvas.width = dw
        canvas.height = dh
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, dw, dh)
        const d = ctx.getImageData(0, 0, dw, dh)
        return { data: d.data, width: dw, height: dh }
      }
      const full = grab(w, h)
      const scale = Math.min(1, maxPreview / Math.max(w, h))
      const preview =
        scale < 1
          ? grab(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)))
          : full
      setState({
        full,
        preview,
        bgColors: sampleBackgroundColors(full),
        loaded: true,
        error: false,
      })
    }
    img.onerror = () => {
      if (!cancelled)
        setState({ full: null, preview: null, bgColors: [], loaded: false, error: true })
    }
    img.src = toDataUrl(image)
    return () => {
      cancelled = true
    }
  }, [image, maxPreview])

  return state
}

/** Focus trap lite: focus the first control on open, restore focus on close. */
function useDialogFocus(onCancel: () => void, dialogRef: React.RefObject<HTMLElement | null>) {
  const previous = useRef<HTMLElement | null>(null)
  useEffect(() => {
    previous.current = document.activeElement as HTMLElement | null
    const root = dialogRef.current
    if (root && !root.contains(document.activeElement)) {
      root.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    }
    return () => {
      previous.current?.focus?.()
    }
  }, [dialogRef])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
}

interface CutoutDialogProps {
  labels: ImageDialogLabels
  /** source pixels (base64 PNG, no data: prefix) */
  image: string
  /** receives the background-removed PNG (base64) */
  onApply: (png: string) => void
  onCancel: () => void
}

export function CutoutDialog({
  labels,
  image,
  onApply,
  onCancel,
}: CutoutDialogProps): ReactElement {
  const [tolerance, setTolerance] = useState(DEFAULT_CUTOUT_TOLERANCE)
  const [removedPct, setRemovedPct] = useState(0)
  const [applying, setApplying] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const { full, preview, bgColors, loaded, error } = useLoadedPixels(image, PREVIEW_MAX)

  useDialogFocus(onCancel, dialogRef)

  const renderPreview = useCallback(
    (tol: number) => {
      const pv = preview
      const canvas = canvasRef.current
      if (!pv || !canvas) return
      const result = removeBackground(pv, tol, bgColors)
      canvas.getContext('2d')!.putImageData(new ImageData(result.data, pv.width, pv.height), 0, 0)
      setRemovedPct(Math.round((result.removedCount / (pv.width * pv.height)) * 100))
    },
    [preview, bgColors],
  )

  useEffect(() => {
    if (!loaded) return
    if (canvasRef.current && preview) {
      canvasRef.current.width = preview.width
      canvasRef.current.height = preview.height
    }
    renderPreview(DEFAULT_CUTOUT_TOLERANCE)
  }, [loaded, preview, renderPreview])

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const onTolerance = (value: number) => {
    setTolerance(value)
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    // the recompute is per-pixel: coalesce slider events into one frame
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      renderPreview(value)
    })
  }

  const apply = () => {
    if (!full || applying) return
    setApplying(true)
    // yield one tick so the "processing…" state paints before the recompute
    window.setTimeout(() => {
      try {
        const result = removeBackground(full, tolerance, bgColors)
        const canvas = document.createElement('canvas')
        canvas.width = full.width
        canvas.height = full.height
        canvas
          .getContext('2d')!
          .putImageData(new ImageData(result.data, full.width, full.height), 0, 0)
        onApply(toBase64(canvas.toDataURL('image/png')))
      } catch {
        setApplying(false)
      }
    }, 30)
  }

  return (
    <div className="ui-modal-mask" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-label={labels.cutoutTitle}
        style={{ maxWidth: PREVIEW_MAX + 48 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-title">{labels.cutoutTitle}</div>
        <div
          style={{
            ...CHECKERBOARD,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 160,
            maxHeight: PREVIEW_MAX,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {error ? (
            <span role="alert" className="ui-modal-error">
              {labels.loadFailed}
            </span>
          ) : (
            <canvas
              ref={canvasRef}
              style={{
                maxWidth: '100%',
                maxHeight: PREVIEW_MAX,
                display: loaded ? 'block' : 'none',
              }}
            />
          )}
          {!loaded && !error && <span className="ui-modal-hint">{labels.loading}</span>}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ whiteSpace: 'nowrap' }}>{labels.tolerance}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={tolerance}
            disabled={!loaded || applying}
            onChange={(e) => onTolerance(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: 32, textAlign: 'right' }}>{tolerance}</span>
        </label>
        <div className="ui-modal-hint">{labels.cutoutHint(removedPct)}</div>
        <div className="ui-modal-actions">
          <button className="ui-modal-btn" onClick={onCancel} disabled={applying}>
            {labels.cancel}
          </button>
          <button
            className="ui-modal-btn primary"
            onClick={apply}
            disabled={!loaded || error || applying}
          >
            {applying ? labels.applying : labels.apply}
          </button>
        </div>
      </div>
    </div>
  )
}

type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'

interface CropDialogProps {
  labels: ImageDialogLabels
  /** UI language, used for the number formatting in the hint */
  lang?: string
  image: string
  /** receives the cropped PNG (base64) */
  onApply: (png: string) => void
  onCancel: () => void
  /** extra controls between the hint and the actions */
  extraFooter?: ReactNode
}

export function CropDialog({
  labels,
  lang,
  image,
  onApply,
  onCancel,
  extraFooter,
}: CropDialogProps): ReactElement {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [crop, setCrop] = useState<CropFractions>({ l: 0, t: 0, r: 1, b: 1 })
  const [view, setView] = useState<{ w: number; h: number } | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    handle: CropHandle
    startX: number
    startY: number
    origin: CropFractions
  } | null>(null)

  useDialogFocus(onCancel, dialogRef)

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (!w || !h) {
        setFailed(true)
        return
      }
      const scale = Math.min(1, PREVIEW_MAX / Math.max(w, h))
      setView({ w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) })
      setLoaded(true)
    }
    img.onerror = () => {
      if (!cancelled) setFailed(true)
    }
    img.src = toDataUrl(image)
    imgRef.current = img
    return () => {
      cancelled = true
    }
  }, [image])

  const beginDrag = (handle: CropHandle) => (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { handle, startX: event.clientX, startY: event.clientY, origin: crop }
  }

  useEffect(() => {
    if (!view) return
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = (event.clientX - drag.startX) / view.w
      const dy = (event.clientY - drag.startY) / view.h
      const min = MIN_CROP_PX / Math.max(view.w, view.h)
      const { l, t, r, b } = drag.origin
      const clamp = (v: number) => Math.min(1, Math.max(0, v))
      const shift = (a: number, b2: number, delta: number, lo: number, hi: number) => {
        // move keeps the width, resize keeps the opposite edge
        const width = b2 - a
        let next = clamp(a + delta)
        if (next + width > hi) next = hi - width
        if (next < lo) next = lo
        return [next, next + width] as const
      }
      switch (drag.handle) {
        case 'move': {
          const w = r - l
          const h2 = b - t
          let nl = clamp(l + dx)
          let nt = clamp(t + dy)
          if (nl + w > 1) nl = 1 - w
          if (nt + h2 > 1) nt = 1 - h2
          setCrop({ l: nl, t: nt, r: nl + w, b: nt + h2 })
          break
        }
        case 'w': {
          const [nl] = shift(l, r, dx, 0, r - min)
          setCrop({ ...drag.origin, l: nl })
          break
        }
        case 'e': {
          const [, nr] = shift(l, r, dx, l + min, 1)
          setCrop({ ...drag.origin, r: nr })
          break
        }
        case 'n': {
          const [nt] = shift(t, b, dy, 0, b - min)
          setCrop({ ...drag.origin, t: nt })
          break
        }
        case 's': {
          const [, nb] = shift(t, b, dy, t + min, 1)
          setCrop({ ...drag.origin, b: nb })
          break
        }
        case 'nw': {
          const [nl] = shift(l, r, dx, 0, r - min)
          const [nt] = shift(t, b, dy, 0, b - min)
          setCrop({ ...drag.origin, l: nl, t: nt })
          break
        }
        case 'ne': {
          const [, nr] = shift(l, r, dx, l + min, 1)
          const [nt] = shift(t, b, dy, 0, b - min)
          setCrop({ ...drag.origin, r: nr, t: nt })
          break
        }
        case 'sw': {
          const [nl] = shift(l, r, dx, 0, r - min)
          const [, nb] = shift(t, b, dy, t + min, 1)
          setCrop({ ...drag.origin, l: nl, b: nb })
          break
        }
        case 'se': {
          const [, nr] = shift(l, r, dx, l + min, 1)
          const [, nb] = shift(t, b, dy, t + min, 1)
          setCrop({ ...drag.origin, r: nr, b: nb })
          break
        }
      }
    }
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [view])

  const apply = () => {
    const img = imgRef.current
    if (!img || !loaded) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    const sx = Math.round(crop.l * w)
    const sy = Math.round(crop.t * h)
    const sw = Math.max(1, Math.round((crop.r - crop.l) * w))
    const sh = Math.max(1, Math.round((crop.b - crop.t) * h))
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    onApply(toBase64(canvas.toDataURL('image/png')))
  }

  const HANDLES: Array<{ id: CropHandle; style: CSSProperties }> = [
    { id: 'nw', style: { left: 0, top: 0, cursor: 'nwse-resize' } },
    { id: 'n', style: { left: '50%', top: 0, cursor: 'ns-resize', transform: 'translateX(-50%)' } },
    { id: 'ne', style: { right: 0, top: 0, cursor: 'nesw-resize' } },
    {
      id: 'e',
      style: { right: 0, top: '50%', cursor: 'ew-resize', transform: 'translateY(-50%)' },
    },
    { id: 'se', style: { right: 0, bottom: 0, cursor: 'nwse-resize' } },
    {
      id: 's',
      style: { left: '50%', bottom: 0, cursor: 'ns-resize', transform: 'translateX(-50%)' },
    },
    { id: 'sw', style: { left: 0, bottom: 0, cursor: 'nesw-resize' } },
    { id: 'w', style: { left: 0, top: '50%', cursor: 'ew-resize', transform: 'translateY(-50%)' } },
  ]

  return (
    <div className="ui-modal-mask" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-label={labels.cropTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-title">{labels.cropTitle}</div>
        <div
          ref={boxRef}
          style={{
            ...CHECKERBOARD,
            position: 'relative',
            display: 'inline-block',
            maxWidth: '100%',
            lineHeight: 0,
          }}
          onMouseDown={beginDrag('move')}
        >
          {failed ? (
            <span role="alert" className="ui-modal-error" style={{ padding: 24 }}>
              {labels.loadFailed}
            </span>
          ) : view ? (
            <>
              <img
                src={toDataUrl(image)}
                alt=""
                width={view.w}
                height={view.h}
                style={{ maxWidth: '100%', userSelect: 'none', pointerEvents: 'none' }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: `${crop.l * 100}%`,
                  top: `${crop.t * 100}%`,
                  width: `${(crop.r - crop.l) * 100}%`,
                  height: `${(crop.b - crop.t) * 100}%`,
                  outline: '1px solid #0969da',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                  cursor: 'move',
                }}
              >
                {HANDLES.map((handle) => (
                  <span
                    key={handle.id}
                    role="presentation"
                    onMouseDown={beginDrag(handle.id)}
                    style={{
                      position: 'absolute',
                      width: 10,
                      height: 10,
                      background: '#fff',
                      border: '1px solid #0969da',
                      ...handle.style,
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <span className="ui-modal-hint" style={{ padding: 24 }}>
              {labels.loading}
            </span>
          )}
        </div>
        <div className="ui-modal-hint">
          {labels.cropHint}
          {lang ? ` (${lang})` : ''}
        </div>
        {extraFooter}
        <div className="ui-modal-actions">
          <button className="ui-modal-btn" onClick={onCancel}>
            {labels.cancel}
          </button>
          <button className="ui-modal-btn primary" onClick={apply} disabled={!loaded || failed}>
            {labels.apply}
          </button>
        </div>
      </div>
    </div>
  )
}
