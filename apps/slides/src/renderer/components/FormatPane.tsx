/**
 * Format pane (a trimmed-down PowerPoint Format Pane): position/size/rotation/fill of the
 * selected element. Shares the right dock area with the AI panel, mutually exclusive. Inputs
 * commit on blur/Enter; external changes (dragging etc.) sync default values by remounting
 * inputs via key.
 */
import React, { useEffect, useRef, useState } from 'react'
import type { PictureRenderNode, RenderNode, ShapeRenderNode } from '@revelith/pptx-render'
import type { GradientFillSpec, LinkTargetOp } from '../../shared/ipc'
import { useI18n, getLang } from '../i18n/locale'
import { armColorInput } from '../color-input'
import { IconSidebarCollapse } from './icons'

interface Props {
  node: RenderNode | null
  onTransform: (
    sourceId: string,
    box: { x: number; y: number; w: number; h: number; rotationDeg: number },
  ) => void
  onFill: (sourceId: string, fill: string | GradientFillSpec) => void
  /** Shape picture fill (main process opens the image picker dialog) */
  onImageFill?: (sourceId: string) => void
  /** Text box vertical alignment */
  onTextAnchor?: (sourceId: string, anchor: 'top' | 'middle' | 'bottom') => void
  /** Text direction: horizontal or vertical */
  onVerticalText?: (
    sourceId: string,
    vert: 'horz' | 'vert' | 'eaVert' | 'vert270' | 'wordArtVert',
  ) => void
  /** Element effects (shadow, glow, softEdge, reflection) */
  onEffects?: (
    sourceId: string,
    effects: {
      shadow?: { color?: string; blurRad?: number; dist?: number; dirDeg?: number } | null
      glow?: { color?: string; radius?: number } | null
      softEdge?: number | null
      reflection?: { blurRad?: number; stA?: number; endA?: number; dist?: number; dirDeg?: number } | null
    },
  ) => void
  onStroke: (
    sourceId: string,
    stroke: { color: string; widthPt: number; dash?: string } | null,
  ) => void
  onDelete: (sourceId: string) => void
  onCollapse: () => void
  /** Picture: enter crop mode */
  onPictureCrop?: () => void
  /** Picture: enter cutout (background removal) mode */
  onPictureCutout?: () => void
  /** Whether the selected picture supports background removal (audio/video poster frames etc. don't) */
  pictureCanCutout?: boolean
  /** Element hyperlink (null = none) */
  link?: LinkTargetOp | null
  /** Open the hyperlink dialog for the selected element */
  onOpenLink?: () => void
  /** Chart: current data + colors (per-point color editing) */
  chartData?: {
    kind: string
    categories: string[]
    series: Array<{ name: string; values: number[] }>
    seriesColors: Array<string | undefined>
    pointColors: Array<Array<string | undefined> | undefined>
  } | null
  onChartPointColor?: (seriesIdx: number, pointIdx: number, color: string) => void
}

const TRANSFORMABLE = new Set(['shape', 'text', 'picture', 'group', 'table', 'chart'])

const TRANSPARENCY_PRESETS = [0, 15, 30, 50, 65, 80, 95]

/** Office default series palette (mirrors pptx-render build-chart's PALETTE) */
const CHART_PALETTE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47']

/** OOXML prstDash presets with language-neutral glyph labels. */
const DASH_PRESETS: Array<[string, string]> = [
  ['solid', '───────'],
  ['sysDot', '·······'],
  ['dot', '• • • •'],
  ['dash', '– – – –'],
  ['lgDash', ': : :'],
  ['dashDot', '– · – ·'],
  ['lgDashDot', ': · : ·'],
  ['lgDashDotDot', ': · · : · ·'],
]

export function FormatPane({
  node,
  onTransform,
  onFill,
  onImageFill,
  onTextAnchor,
  onVerticalText,
  onEffects,
  onStroke,
  onDelete,
  onCollapse,
  onPictureCrop,
  onPictureCutout,
  pictureCanCutout,
  link,
  onOpenLink,
  chartData,
  onChartPointColor,
}: Props) {
  const { t } = useI18n()
  const effectsTimer = useRef<number | null>(null)
  const [effectsOpen, setEffectsOpen] = useState(true)
  const [shadowExpanded, setShadowExpanded] = useState(false)
  const [reflectionExpanded, setReflectionExpanded] = useState(false)
  const [glowExpanded, setGlowExpanded] = useState(false)
  const [softEdgeExpanded, setSoftEdgeExpanded] = useState(false)

  // The color picker fires change repeatedly while dragging; debounce before IPC
  const fillTimer = useRef<number | null>(null)
  const debouncedFill = (sourceId: string, value: string) => {
    if (fillTimer.current) window.clearTimeout(fillTimer.current)
    fillTimer.current = window.setTimeout(() => onFill(sourceId, value), 200)
  }

  const strokeTimer = useRef<number | null>(null)
  const pointColorTimer = useRef<number | null>(null)
  const debouncedPointColor = (si: number, pi: number, value: string) => {
    if (pointColorTimer.current) window.clearTimeout(pointColorTimer.current)
    pointColorTimer.current = window.setTimeout(() => onChartPointColor?.(si, pi, value), 200)
  }
  // The two gradient edit colors (stashed locally before applying)
  const [gradFrom, setGradFrom] = useState('#4472C4')
  const [gradTo, setGradTo] = useState('#FFFFFF')

  const box = node?.box
  const canTransform = !!node && TRANSFORMABLE.has(node.type)
  const shape =
    node && (node.type === 'shape' || node.type === 'text') ? (node as ShapeRenderNode) : null
  const pic = node && node.type === 'picture' ? (node as PictureRenderNode) : null
  const fillColor = shape?.fill.kind === 'solid' ? toHex6(shape.fill.color) : null
  const fillAlpha = shape?.fill.kind === 'solid' ? alphaOf(shape.fill.color) : 255
  // 0..100 transparency shown in the dropdown (0 = opaque)
  const fillTransparency = Math.round(((255 - fillAlpha) / 255) * 100)
  const stroke = (shape ?? pic)?.stroke
  const strokeWidthPt = stroke ? Math.max(0.5, Math.round(stroke.widthPt * 2) / 2) : 1
  const strokeColor = stroke ? toHex6(stroke.color) : '#000000'
  const strokeDash = stroke?.dashPreset ?? 'solid'

  /** Solid fill color + transparency merged into one #RRGGBB(AA) value. */
  const fillValue = (color: string, transparencyPct: number) => {
    const alpha = Math.round(((100 - transparencyPct) / 100) * 255)
    return alpha >= 255 && fillAlpha >= 255
      ? color
      : `${color}${Math.max(0, alpha).toString(16).padStart(2, '0')}`
  }

  // Latest intended stroke: each input contributes only its own dimension, so a debounced color
  // commit can't overwrite a width committed meanwhile (and vice versa)
  const strokeDraft = useRef<{ id: string; color: string; widthPt: number; dash: string } | null>(
    null,
  )
  useEffect(() => {
    if (!strokeTimer.current) strokeDraft.current = null
  }, [strokeColor, strokeWidthPt, strokeDash, node?.sourceId])
  const commitStroke = (
    sourceId: string,
    patch: Partial<{ color: string; widthPt: number; dash: string }>,
    immediate = false,
  ) => {
    if (strokeTimer.current) window.clearTimeout(strokeTimer.current)
    const prev =
      strokeDraft.current?.id === sourceId
        ? strokeDraft.current
        : { id: sourceId, color: strokeColor, widthPt: strokeWidthPt, dash: strokeDash }
    const draft = { ...prev, ...patch }
    strokeDraft.current = draft
    const fire = () => {
      strokeTimer.current = null
      onStroke(sourceId, { color: draft.color, widthPt: draft.widthPt, dash: draft.dash })
    }
    if (immediate) fire()
    else strokeTimer.current = window.setTimeout(fire, 200)
  }
  const clearStroke = (sourceId: string) => {
    if (strokeTimer.current) window.clearTimeout(strokeTimer.current)
    strokeTimer.current = null
    strokeDraft.current = null
    onStroke(sourceId, null)
  }

  const commit = (
    patch: Partial<{ x: number; y: number; w: number; h: number; rotationDeg: number }>,
  ) => {
    if (!node || !box) return
    onTransform(node.sourceId, {
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      rotationDeg: box.rotationDeg,
      ...patch,
    })
  }

  const numField = (label: string, value: number, apply: (v: number) => void, min?: number) => (
    <label className="fp-field" key={label}>
      <span>{label}</span>
      <input
        key={`${node?.sourceId}:${value}`}
        type="number"
        defaultValue={Math.round(value)}
        min={min}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (!Number.isNaN(v) && Math.round(v) !== Math.round(value)) apply(v)
        }}
      />
    </label>
  )

  return (
    <aside className="format-pane">
      <div className="ai-panel-header">
        <span className="ai-panel-title">{t('paneFormatTitle')}</span>
        <div className="ai-panel-header-actions">
          <button
            className="ai-header-btn"
            onClick={onCollapse}
            data-tip={t('paneFormatClose')}
            aria-label={t('paneFormatClose')}
          >
            <IconSidebarCollapse size={15} />
          </button>
        </div>
      </div>

      {!node ? (
        <div className="fp-empty">{t('paneFormatEmpty')}</div>
      ) : (
        <div className="fp-body">
          <div className="fp-section-title">
            {node.type === 'picture'
              ? t('paneFormatPicture')
              : node.type === 'group'
                ? t('paneFormatGroup')
                : node.type === 'text'
                  ? t('paneFormatTextBox')
                  : node.type === 'table'
                    ? t('ribbonGroupTable')
                    : node.type === 'chart'
                      ? t('ribbonChart')
                      : t('paneFormatShape')}
          </div>

          {canTransform && box && (
            <>
              <div className="fp-section">{t('paneFormatPosSize')}</div>
              <div className="fp-grid">
                {numField('X', box.x, (v) => commit({ x: v }))}
                {numField('Y', box.y, (v) => commit({ y: v }))}
                {numField(t('paneFormatW'), box.w, (v) => commit({ w: v }), 1)}
                {numField(t('paneFormatH'), box.h, (v) => commit({ h: v }), 1)}
              </div>
              <div className="fp-grid">
                {numField(t('paneFormatRotation'), box.rotationDeg, (v) =>
                  commit({ rotationDeg: v }),
                )}
              </div>
            </>
          )}

          {node.type === 'picture' && (
            <>
              <div className="fp-section">{t('paneFormatPicture')}</div>
              <div className="fp-row">
                <button className="fp-btn" onClick={() => onPictureCrop?.()}>
                  {t('paneFormatCrop')}
                </button>
                <button
                  className="fp-btn"
                  disabled={!pictureCanCutout}
                  data-tip={pictureCanCutout ? t('paneFormatCutoutTip') : t('paneFormatCutoutNA')}
                  onClick={() => onPictureCutout?.()}
                >
                  {t('paneCutoutTitle')}
                </button>
              </div>
            </>
          )}

          {shape && (
            <>
              <div className="fp-section">{t('paneFormatFill')}</div>
              <div className="fp-row">
                <input
                  key={`${node.sourceId}:${fillColor ?? 'none'}`}
                  type="color"
                  className="fp-color"
                  defaultValue={fillColor ?? '#ffffff'}
                  onPointerDown={(e) => armColorInput(e.currentTarget)}
                  onChange={(e) =>
                    debouncedFill(node.sourceId, fillValue(e.target.value, fillTransparency))
                  }
                  title={t('paneFormatSolidFill')}
                />
                <button
                  className={`fp-btn ${shape.fill.kind === 'none' ? 'active' : ''}`}
                  onClick={() => onFill(node.sourceId, 'none')}
                >
                  {t('paneFormatNoFill')}
                </button>
                {onImageFill && (
                  <button className="fp-btn" onClick={() => onImageFill(node.sourceId)}>
                    {t('paneFormatImageFill')}
                  </button>
                )}
              </div>
              <div className="fp-row">
                <label className="fp-field" style={{ flex: 1 }}>
                  <span>{t('ribbonTransparency')}</span>
                  <select
                    key={`${node.sourceId}:fa:${fillTransparency}`}
                    defaultValue={fillTransparency}
                    disabled={shape.fill.kind !== 'solid'}
                    onChange={(e) =>
                      onFill(
                        node.sourceId,
                        fillValue(fillColor ?? '#ffffff', Number(e.target.value)),
                      )
                    }
                  >
                    {!TRANSPARENCY_PRESETS.includes(fillTransparency) && (
                      <option value={fillTransparency}>{fillTransparency}%</option>
                    )}
                    {TRANSPARENCY_PRESETS.map((pct) => (
                      <option key={pct} value={pct}>
                        {pct}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {shape.text && onTextAnchor && (
                <>
                  <div className="fp-section">{t('paneFormatTextAnchor')}</div>
                  <div className="fp-row">
                    {(
                      [
                        ['top', t('paneFormatAnchorTop')],
                        ['middle', t('paneFormatAnchorMiddle')],
                        ['bottom', t('paneFormatAnchorBottom')],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        className={`fp-btn ${(shape.text?.anchor ?? 'top') === k ? 'active' : ''}`}
                        onClick={() => onTextAnchor(node.sourceId, k)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {shape.text && onVerticalText && (
                <>
                  <div className="fp-section">{getLang() === 'zh' ? '文字方向' : 'Text Direction'}</div>
                  <div className="fp-row">
                    {(
                      [
                        ['horz', getLang() === 'zh' ? '水平' : 'Horizontal'],
                        ['eaVert', getLang() === 'zh' ? '竖排' : 'Vertical'],
                        ['vert', getLang() === 'zh' ? '旋转90°' : 'Rotate 90°'],
                        ['vert270', getLang() === 'zh' ? '旋转270°' : 'Rotate 270°'],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        className={`fp-btn ${(shape.text?.vert ?? 'horz') === v ? 'active' : ''}`}
                        onClick={() => onVerticalText(node.sourceId, v)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="fp-section">{t('paneFormatGradient')}</div>
              <div className="fp-row">
                <input
                  type="color"
                  className="fp-color"
                  value={gradFrom}
                  onChange={(e) => setGradFrom(e.target.value)}
                  data-tip={t('paneFormatGradientFrom')}
                />
                <input
                  type="color"
                  className="fp-color"
                  value={gradTo}
                  onChange={(e) => setGradTo(e.target.value)}
                  data-tip={t('paneFormatGradientTo')}
                />
                {(
                  [
                    ['→', 0, false],
                    ['↓', 90, false],
                    ['↘', 45, false],
                    ['◎', 0, true],
                  ] as const
                ).map(([label, angleDeg, radial]) => (
                  <button
                    key={label}
                    className="fp-btn"
                    data-tip={radial ? t('paneFormatGradientRadial') : `${angleDeg}°`}
                    aria-label={radial ? t('paneFormatGradientRadial') : `${angleDeg}°`}
                    onClick={() =>
                      onFill(node.sourceId, {
                        gradient: {
                          from: gradFrom,
                          to: gradTo,
                          angleDeg,
                          ...(radial ? { radial: true } : {}),
                        },
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {(shape || pic) && (
            <>
              <div className="fp-section">{t('paneFormatOutline')}</div>
              <div className="fp-row">
                <input
                  key={`${node.sourceId}:s:${strokeColor}`}
                  type="color"
                  className="fp-color"
                  defaultValue={strokeColor}
                  onPointerDown={(e) => armColorInput(e.currentTarget)}
                  onChange={(e) => commitStroke(node.sourceId, { color: e.target.value })}
                  data-tip={t('paneFormatOutlineColor')}
                />
                <label className="fp-field" style={{ flex: 1 }}>
                  <span>{t('paneFormatPt')}</span>
                  <input
                    key={`${node.sourceId}:sw:${strokeWidthPt}`}
                    type="number"
                    step={0.5}
                    min={0.5}
                    defaultValue={strokeWidthPt}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (!Number.isNaN(v) && v > 0)
                        commitStroke(node.sourceId, { widthPt: v }, true)
                    }}
                  />
                </label>
                <button
                  className={`fp-btn ${!stroke ? 'active' : ''}`}
                  onClick={() => clearStroke(node.sourceId)}
                >
                  {t('paneFormatNoOutline')}
                </button>
              </div>
              <div className="fp-row">
                <label className="fp-field" style={{ flex: 1 }}>
                  <span>{t('paneFormatDashStyle')}</span>
                  <select
                    key={`${node.sourceId}:sd:${strokeDash}`}
                    defaultValue={strokeDash}
                    onChange={(e) => commitStroke(node.sourceId, { dash: e.target.value }, true)}
                  >
                    {!DASH_PRESETS.some(([k]) => k === strokeDash) && (
                      <option value={strokeDash}>{strokeDash}</option>
                    )}
                    {DASH_PRESETS.map(([k, glyph]) => (
                      <option key={k} value={k}>
                        {glyph}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}

          {(shape || pic) && onEffects && (
            <>
              <div
                className="fp-section fp-section-toggle"
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => setEffectsOpen((v) => !v)}
              >
                <span>{getLang() === 'zh' ? '效果' : 'Effects'}</span>
                <span>{effectsOpen ? '▾' : '▸'}</span>
              </div>
              {effectsOpen && (
                <div className="fp-effects-subsections" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Shadow */}
                  <div className="fp-group-box" style={{ border: '1px solid var(--border-subtle, #e0e0e0)', borderRadius: 4, padding: '6px 8px' }}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                      onClick={() => setShadowExpanded((v) => !v)}
                    >
                      <span>{getLang() === 'zh' ? '阴影 (Shadow)' : 'Shadow'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={!!(shape ?? pic)?.shadow}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onEffects(node.sourceId, { shadow: { color: 'rgba(0,0,0,0.5)', blurRad: 50800, dist: 38100, dirDeg: 54 } })
                            } else {
                              onEffects(node.sourceId, { shadow: null })
                            }
                          }}
                        />
                        <span>{shadowExpanded ? '▾' : '▸'}</span>
                      </div>
                    </div>
                    {shadowExpanded && (shape ?? pic)?.shadow && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="fp-row">
                          <label className="fp-field" style={{ flex: 1 }}>
                            <span>{getLang() === 'zh' ? '颜色' : 'Color'}</span>
                            <input
                              type="color"
                              className="fp-color"
                              defaultValue={toHex6((shape ?? pic)?.shadow?.color ?? '#000000')}
                              onChange={(e) => {
                                const cur = (shape ?? pic)?.shadow
                                onEffects(node.sourceId, {
                                  shadow: {
                                    color: e.target.value,
                                    blurRad: cur ? Math.round(cur.blurPx * 9525) : 50800,
                                    dist: cur ? Math.round(Math.hypot(cur.offsetX, cur.offsetY) * 9525) : 38100,
                                  },
                                })
                              }}
                            />
                          </label>
                          <label className="fp-field" style={{ flex: 1 }}>
                            <span>{getLang() === 'zh' ? '模糊 (pt)' : 'Blur (pt)'}</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              defaultValue={Math.round(((shape ?? pic)?.shadow?.blurPx ?? 4) * 0.75)}
                              onChange={(e) => {
                                const pt = Number(e.target.value) || 0
                                onEffects(node.sourceId, {
                                  shadow: {
                                    color: (shape ?? pic)?.shadow?.color ?? '#000000',
                                    blurRad: Math.round(pt * 12700),
                                  },
                                })
                              }}
                            />
                          </label>
                        </div>
                        <div className="fp-row">
                          <label className="fp-field" style={{ flex: 1 }}>
                            <span>{getLang() === 'zh' ? '距离 (pt)' : 'Distance (pt)'}</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              defaultValue={Math.round(Math.hypot((shape ?? pic)?.shadow?.offsetX ?? 3, (shape ?? pic)?.shadow?.offsetY ?? 3) * 0.75)}
                              onChange={(e) => {
                                const pt = Number(e.target.value) || 0
                                onEffects(node.sourceId, {
                                  shadow: {
                                    color: (shape ?? pic)?.shadow?.color ?? '#000000',
                                    dist: Math.round(pt * 12700),
                                  },
                                })
                              }}
                            />
                          </label>
                          <label className="fp-field" style={{ flex: 1 }}>
                            <span>{getLang() === 'zh' ? '角度 (°)' : 'Angle (°)'}</span>
                            <input
                              type="number"
                              min={0}
                              max={360}
                              step={5}
                              defaultValue={Math.round(((Math.atan2((shape ?? pic)?.shadow?.offsetY ?? 3, (shape ?? pic)?.shadow?.offsetX ?? 3) * 180) / Math.PI + 360) % 360)}
                              onChange={(e) => {
                                const deg = Number(e.target.value) || 0
                                onEffects(node.sourceId, {
                                  shadow: {
                                    color: (shape ?? pic)?.shadow?.color ?? '#000000',
                                    dirDeg: deg,
                                  },
                                })
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reflection */}
                  <div className="fp-group-box" style={{ border: '1px solid var(--border-subtle, #e0e0e0)', borderRadius: 4, padding: '6px 8px' }}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                      onClick={() => setReflectionExpanded((v) => !v)}
                    >
                      <span>{getLang() === 'zh' ? '倒影 (Reflection)' : 'Reflection'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={!!(shape ?? pic)?.reflection}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onEffects(node.sourceId, { reflection: { blurRad: 6350, dist: 25400, stA: 50000, endA: 300 } })
                            } else {
                              onEffects(node.sourceId, { reflection: null })
                            }
                          }}
                        />
                        <span>{reflectionExpanded ? '▾' : '▸'}</span>
                      </div>
                    </div>
                    {reflectionExpanded && (shape ?? pic)?.reflection && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="fp-row">
                          <label className="fp-field" style={{ flex: 1 }}>
                            <span>{getLang() === 'zh' ? '模糊 (pt)' : 'Blur (pt)'}</span>
                            <input
                              type="number"
                              min={0}
                              max={50}
                              step={0.5}
                              defaultValue={Math.round(((shape ?? pic)?.reflection?.blurPx ?? 1) * 0.75)}
                              onChange={(e) => {
                                const pt = Number(e.target.value) || 0
                                onEffects(node.sourceId, { reflection: { blurRad: Math.round(pt * 12700) } })
                              }}
                            />
                          </label>
                          <label className="fp-field" style={{ flex: 1 }}>
                            <span>{getLang() === 'zh' ? '距离 (pt)' : 'Distance (pt)'}</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              defaultValue={Math.round(((shape ?? pic)?.reflection?.distancePx ?? 2) * 0.75)}
                              onChange={(e) => {
                                const pt = Number(e.target.value) || 0
                                onEffects(node.sourceId, { reflection: { dist: Math.round(pt * 12700) } })
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Glow */}
                  <div className="fp-group-box" style={{ border: '1px solid var(--border-subtle, #e0e0e0)', borderRadius: 4, padding: '6px 8px' }}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                      onClick={() => setGlowExpanded((v) => !v)}
                    >
                      <span>{getLang() === 'zh' ? '发光 (Glow)' : 'Glow'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={!!(shape ?? pic)?.glow}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onEffects(node.sourceId, { glow: { color: '#ffff00', radius: 101600 } })
                            } else {
                              onEffects(node.sourceId, { glow: null })
                            }
                          }}
                        />
                        <span>{glowExpanded ? '▾' : '▸'}</span>
                      </div>
                    </div>
                    {glowExpanded && (shape ?? pic)?.glow && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="fp-row">
                          <label className="fp-field" style={{ flex: 1 }}>
                            <span>{getLang() === 'zh' ? '颜色' : 'Color'}</span>
                            <input
                              type="color"
                              className="fp-color"
                              defaultValue={toHex6((shape ?? pic)?.glow?.color ?? '#ffcc00')}
                              onChange={(e) => {
                                onEffects(node.sourceId, {
                                  glow: {
                                    color: e.target.value,
                                    radius: Math.round(((shape ?? pic)?.glow?.blurPx ?? 8) * 0.75 * 12700),
                                  },
                                })
                              }}
                            />
                          </label>
                          <label className="fp-field" style={{ flex: 1 }}>
                            <span>{getLang() === 'zh' ? '大小 (pt)' : 'Size (pt)'}</span>
                            <input
                              type="number"
                              min={1}
                              max={150}
                              step={1}
                              defaultValue={Math.round(((shape ?? pic)?.glow?.blurPx ?? 8) * 0.75)}
                              onChange={(e) => {
                                const pt = Number(e.target.value) || 8
                                onEffects(node.sourceId, {
                                  glow: {
                                    color: (shape ?? pic)?.glow?.color ?? '#ffcc00',
                                    radius: Math.round(pt * 12700),
                                  },
                                })
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Soft Edges */}
                  <div className="fp-group-box" style={{ border: '1px solid var(--border-subtle, #e0e0e0)', borderRadius: 4, padding: '6px 8px' }}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                      onClick={() => setSoftEdgeExpanded((v) => !v)}
                    >
                      <span>{getLang() === 'zh' ? '柔化边缘 (Soft Edges)' : 'Soft Edges'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={((shape ?? pic)?.softEdgePx ?? 0) > 0}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onEffects(node.sourceId, { softEdge: 63500 }) // 5 pt
                            } else {
                              onEffects(node.sourceId, { softEdge: null })
                            }
                          }}
                        />
                        <span>{softEdgeExpanded ? '▾' : '▸'}</span>
                      </div>
                    </div>
                    {softEdgeExpanded && ((shape ?? pic)?.softEdgePx ?? 0) > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="fp-row">
                          <label className="fp-field" style={{ flex: 1 }}>
                            <span>{getLang() === 'zh' ? '大小 (pt)' : 'Size (pt)'}</span>
                            <select
                              value={Math.round(((shape ?? pic)?.softEdgePx ?? 0) * 0.75)}
                              onChange={(e) => {
                                const pt = Number(e.target.value) || 0
                                onEffects(node.sourceId, { softEdge: pt > 0 ? Math.round(pt * 12700) : null })
                              }}
                            >
                              {[1, 2.5, 5, 10, 25, 50].map((pt) => (
                                <option key={pt} value={pt}>{pt} pt</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {node.type === 'chart' && chartData && onChartPointColor && (
            <>
              <div className="fp-section">{t('paneFormatChartPoints')}</div>
              {chartData.series.map((s, si) => (
                <React.Fragment key={si}>
                  {chartData.series.length > 1 && (
                    <div className="fp-chart-series">
                      {s.name || t('paneFormatChartSeriesN', { n: si + 1 })}
                    </div>
                  )}
                  {s.values.map((_, pi) => (
                    <div className="fp-row fp-chart-point" key={pi}>
                      <input
                        className="fp-color"
                        type="color"
                        value={toHex6(
                          chartData.pointColors[si]?.[pi] ??
                            (chartData.kind === 'pie'
                              ? CHART_PALETTE[pi % CHART_PALETTE.length]!
                              : (chartData.seriesColors[si] ??
                                CHART_PALETTE[si % CHART_PALETTE.length]!)),
                        )}
                        onPointerDown={(e) => armColorInput(e.currentTarget)}
                        onChange={(e) => debouncedPointColor(si, pi, e.target.value)}
                      />
                      <span className="fp-chart-point-label">
                        {chartData.categories[pi] || `#${pi + 1}`}
                      </span>
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </>
          )}

          {onOpenLink && (
            <>
              <div className="fp-section">{t('paneFormatLink')}</div>
              <div className="fp-row">
                <span
                  className="fp-link-target"
                  data-tip={link?.kind === 'url' ? link.url : undefined}
                >
                  {link
                    ? link.kind === 'url'
                      ? link.url
                      : t('ribbonSlideN', { n: link.slideIndex + 1 })
                    : t('paneFormatLinkNone')}
                </span>
              </div>
              <button className="fp-btn" onClick={onOpenLink}>
                {t('paneFormatLinkSet')}
              </button>
            </>
          )}

          <div className="fp-section">{t('paneFormatActions')}</div>
          <button className="fp-btn fp-danger" onClick={() => onDelete(node.sourceId)}>
            {t('paneFormatDelete')}
          </button>
        </div>
      )}
    </aside>
  )
}

function toHex6(c: string): string {
  const m = /^#?([0-9a-fA-F]{6})/.exec(c)
  return m ? `#${m[1]!.toLowerCase()}` : '#ffffff'
}

/** Alpha byte of an #RRGGBBAA color (255 when absent). */
function alphaOf(c: string): number {
  const m = /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})$/.exec(c)
  return m ? parseInt(m[1]!, 16) : 255
}
