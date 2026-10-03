/**
 * Full-window image viewer: click a picture in the document to inspect it at a
 * readable size. Zoom tracks the pointer (so the point under the cursor stays
 * put), the image can be panned when it is larger than the window, and Fit /
 * 100% / ± are one keypress or one click away. Escape always closes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

/** Localized toolbar/overlay copy, supplied by the app. */
export interface ImageViewerLabels {
  zoomIn: string
  zoomOut: string
  actualSize: string
  fitToWindow: string
  save: string
  close: string
}

interface ImageViewerProps {
  /** image URL or data: URL of the picture to show */
  src: string
  /** UI language, used for the zoom percentage formatting */
  lang?: string
  labels: ImageViewerLabels
  onClose: () => void
  /** save the image; omitted hides the save button */
  onSave?: () => void
}

/** Zoom bounds; below 10% an image is unreadable, above 800% it is a texture. */
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const ZOOM_STEP = 1.25

export function ImageViewer({
  src,
  lang,
  labels,
  onClose,
  onSave,
}: ImageViewerProps): ReactElement {
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState(true)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  // a new picture starts fitted and centered
  useEffect(() => {
    setZoom(1)
    setFit(true)
    setOffset({ x: 0, y: 0 })
    setNatural(null)
  }, [src])

  const fitScale = useCallback(() => {
    const stage = stageRef.current
    const size = natural
    if (!stage || !size || size.w === 0 || size.h === 0) return 1
    // leave room for the toolbar so a fitted image is fully visible
    const available = { w: stage.clientWidth - 32, h: stage.clientHeight - 64 }
    return Math.min(available.w / size.w, available.h / size.h, 1)
  }, [natural])

  // recompute the fit scale on resize so a restored window still fits
  useEffect(() => {
    if (!fit) return
    const onResize = () => setZoom(fitScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fit, fitScale])

  const applyZoom = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    setZoom((prev) => {
      if (!anchor) return clamped
      // keep the anchor point stationary: shift the offset by the scale delta
      const stage = stageRef.current
      if (!stage) return clamped
      const rect = stage.getBoundingClientRect()
      const cx = anchor.x - rect.left - rect.width / 2
      const cy = anchor.y - rect.top - rect.height / 2
      const ratio = clamped / prev
      setOffset((off) => ({ x: off.x + cx * (ratio - 1), y: off.y + cy * (ratio - 1) }))
      return clamped
    })
    setFit(false)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        applyZoom(zoom * ZOOM_STEP)
      } else if (event.key === '-') {
        event.preventDefault()
        applyZoom(zoom / ZOOM_STEP)
      } else if (event.key === '0') {
        event.preventDefault()
        setFit(true)
        setOffset({ x: 0, y: 0 })
        setZoom(fitScale())
      } else if (event.key === '1') {
        event.preventDefault()
        applyZoom(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, zoom, applyZoom, fitScale])

  // wheel zooms, it does not scroll the page behind the overlay
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      applyZoom(zoom * factor, { x: event.clientX, y: event.clientY })
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [zoom, applyZoom])

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    setOffset({ x: drag.ox + (event.clientX - drag.x), y: drag.oy + (event.clientY - drag.y) })
  }
  const onPointerUp = (event: React.PointerEvent) => {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const effective = fit && natural ? fitScale() : zoom
  const percent = new Intl.NumberFormat(lang ?? undefined, { maximumFractionDigits: 0 }).format(
    effective * 100,
  )

  return (
    <div className="image-viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="image-viewer-bar" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="image-viewer-btn"
          title={labels.zoomOut}
          aria-label={labels.zoomOut}
          onClick={() => applyZoom(effective / ZOOM_STEP)}
        >
          −
        </button>
        <span className="image-viewer-zoom" role="status" aria-live="polite">
          {percent}%
        </span>
        <button
          type="button"
          className="image-viewer-btn"
          title={labels.zoomIn}
          aria-label={labels.zoomIn}
          onClick={() => applyZoom(effective * ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className="image-viewer-btn"
          title={labels.actualSize}
          onClick={() => applyZoom(1)}
        >
          1:1
        </button>
        <button
          type="button"
          className="image-viewer-btn"
          data-active={fit ? 'true' : 'false'}
          title={labels.fitToWindow}
          onClick={() => {
            setOffset({ x: 0, y: 0 })
            setFit(true)
            setZoom(fitScale())
          }}
        >
          ⤢
        </button>
        {onSave && (
          <button
            type="button"
            className="image-viewer-btn"
            title={labels.save}
            onClick={() => onSave()}
          >
            {labels.save}
          </button>
        )}
        <button
          type="button"
          className="image-viewer-btn"
          title={labels.close}
          aria-label={labels.close}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div
        ref={stageRef}
        className="image-viewer-stage"
        onClick={onClose}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          className="image-viewer-img"
          src={src}
          alt=""
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onLoad={(e) => {
            const img = e.currentTarget
            setNatural({ w: img.naturalWidth, h: img.naturalHeight })
          }}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${effective})`,
            cursor: dragRef.current ? 'grabbing' : 'grab',
          }}
        />
      </div>
    </div>
  )
}
