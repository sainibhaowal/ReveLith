import { useEffect, useRef, useState } from 'react'

import { draftFromSelection, formatCellsCommands, type FormatCellsDraft } from './format-cells'
import { useI18n, type StringKey } from './i18n/locale'
import {
  clampDecimals,
  CURRENCY_SYMBOLS,
  DATE_PATTERNS,
  FRACTION_PATTERNS,
  NEGATIVE_STYLES,
  NUMFMT_CATEGORIES,
  numfmtOptionsOf,
  numfmtPattern,
  numfmtPreview,
  sampleValue,
  TIME_PATTERNS,
  todaySerial,
  type NumfmtCategory,
  type NumfmtOptions,
} from './numfmt-dialog'

import type { SelectionFormat } from './selection-format'
import { fontFamilyGroups, useSystemFontFamilies } from './system-fonts'

/// Excel's Format Cells dialog (⌘1), scoped to what the save pipeline can
/// persist today: number format, alignment, font, border, fill, and
/// protection flags. It opens prefilled with the selection's current format
/// and emits the same command strings the ribbon uses : but only for
/// settings the user actually changed.

const TABS = ['Number', 'Alignment', 'Font', 'Border', 'Fill', 'Protection'] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, StringKey> = {
  Number: 'dlgFcTabNumber',
  Alignment: 'dlgFcTabAlignment',
  Font: 'dlgFcTabFont',
  Border: 'dlgFcTabBorder',
  Fill: 'dlgFcTabFill',
  Protection: 'dlgFcTabProtection',
}

const H_ALIGNMENTS = ['left', 'center', 'right', 'justify', 'distributed'] as const
const V_ALIGNMENTS = ['top', 'middle', 'bottom'] as const
const H_ALIGN_LABELS: Record<(typeof H_ALIGNMENTS)[number], StringKey> = {
  left: 'dlgFcAlignLeft',
  center: 'dlgFcAlignCenter',
  right: 'dlgFcAlignRight',
  justify: 'dlgFcAlignJustify',
  distributed: 'dlgFcAlignDistributed',
}
const V_ALIGN_LABELS: Record<(typeof V_ALIGNMENTS)[number], StringKey> = {
  top: 'dlgFcAlignTop',
  middle: 'dlgFcAlignMiddle',
  bottom: 'dlgFcAlignBottom',
}
const ROTATIONS: { readonly labelKey: StringKey; readonly value: string }[] = [
  { labelKey: 'dlgFcRotNone', value: '0' },
  { labelKey: 'dlgFcRotCcw', value: '45' },
  { labelKey: 'dlgFcRotCw', value: '-45' },
  { labelKey: 'dlgFcRotUp', value: '90' },
  { labelKey: 'dlgFcRotDown', value: '-90' },
  { labelKey: 'dlgFcRotVertical', value: 'vertical' },
]

const NUMFMT_CATEGORY_LABELS: Record<NumfmtCategory, StringKey> = {
  general: 'dlgFcNumGeneral',
  number: 'dlgFcNumNumber',
  currency: 'dlgFcNumCurrency',
  accounting: 'appNumFmtAccounting',
  date: 'dlgFcNumDate',
  time: 'dlgFcNumTime',
  percentage: 'dlgFcNumPercent',
  fraction: 'appNumFmtFraction',
  scientific: 'dlgFcNumScientific',
  text: 'dlgFcNumText',
  custom: 'dlgFcNumCustomName',
}

const FRACTION_LABELS: readonly StringKey[] = [
  'dlgFcFracD1',
  'dlgFcFracD2',
  'dlgFcFracD3',
  'dlgFcFracHalf',
  'dlgFcFracQuarter',
  'dlgFcFracEighth',
  'dlgFcFracSixteenth',
  'dlgFcFracTenth',
]

const DECIMAL_CATEGORIES: readonly NumfmtCategory[] = [
  'number',
  'currency',
  'accounting',
  'percentage',
  'scientific',
]

const FONT_SIZES = ['9', '10', '11', '12', '14', '16', '18', '22', '26']
/// OOXML ST_BorderStyle names offered by the line-style picker; the
/// journal maps them 1:1 to Univer BorderStyleTypes and back to the file.
const BORDER_LINE_STYLES: { readonly labelKey: StringKey; readonly value: string }[] = [
  { labelKey: 'dlgFcStyleThin', value: 'thin' },
  { labelKey: 'dlgFcStyleMedium', value: 'medium' },
  { labelKey: 'dlgFcStyleThick', value: 'thick' },
  { labelKey: 'dlgFcStyleDouble', value: 'double' },
  { labelKey: 'dlgFcStyleHair', value: 'hair' },
  { labelKey: 'dlgFcStyleDashed', value: 'dashed' },
  { labelKey: 'dlgFcStyleDotted', value: 'dotted' },
]

const BORDER_PRESETS: { readonly labelKey: StringKey; readonly value: string }[] = [
  { labelKey: 'dlgFcBorderNone', value: 'none' },
  { labelKey: 'dlgFcBorderAll', value: 'all' },
  { labelKey: 'dlgFcBorderOutline', value: 'outer' },
  { labelKey: 'dlgFcBorderThickOutline', value: 'thick-outer' },
  { labelKey: 'dlgFcBorderTop', value: 'top' },
  { labelKey: 'dlgFcBorderBottom', value: 'bottom' },
  { labelKey: 'dlgFcBorderLeft', value: 'left' },
  { labelKey: 'dlgFcBorderRight', value: 'right' },
]

const THEME_BASE_COLORS = [
  '#ffffff',
  '#000000',
  '#eeece1',
  '#1f497d',
  '#4f81bd',
  '#c0504d',
  '#9bbb59',
  '#8064a2',
  '#4bacc6',
  '#f79646',
]
const THEME_TINTS = [
  [
    '#f2f2f2',
    '#7f7f7f',
    '#ddd9c3',
    '#c6d9f0',
    '#dce6f1',
    '#f2dcdb',
    '#ebf1dd',
    '#e5e0ec',
    '#dbeef3',
    '#fdeada',
  ],
  [
    '#d8d8d8',
    '#595959',
    '#c4bd97',
    '#8db3e2',
    '#b8cce4',
    '#e5b9b7',
    '#d7e3bc',
    '#ccc1d9',
    '#b7dde8',
    '#fbd5b5',
  ],
  [
    '#bfbfbf',
    '#3f3f3f',
    '#948a54',
    '#548dd4',
    '#95b3d7',
    '#d99694',
    '#c3d69b',
    '#b2a2c7',
    '#92cddc',
    '#fac08f',
  ],
  [
    '#a5a5a5',
    '#262626',
    '#494529',
    '#17365d',
    '#366092',
    '#953734',
    '#76933c',
    '#5f497a',
    '#31859b',
    '#e36c09',
  ],
  [
    '#7f7f7f',
    '#0c0c0c',
    '#1d1b10',
    '#0f243e',
    '#244062',
    '#632423',
    '#4f6128',
    '#3f3151',
    '#205867',
    '#974806',
  ],
]
const STANDARD_COLORS = [
  '#c00000',
  '#ff0000',
  '#ffc000',
  '#ffff00',
  '#92d050',
  '#00b050',
  '#00b0f0',
  '#0070c0',
  '#002060',
  '#7030a0',
]

export function FormatCellsDialog({
  selectionFormat,
  anchorValue,
  onCommand,
  onClose,
}: {
  readonly selectionFormat: SelectionFormat | null
  /// Value of the selection's top-left cell, for the number-format preview.
  readonly anchorValue: number | string | null
  readonly onCommand: (command: string) => void
  readonly onClose: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('Number')

  const [fillMode, setFillMode] = useState<'solid' | 'gradient' | 'pattern'>('solid')
  const [gradType, setGradType] = useState<'horizontal' | 'vertical' | 'diagonal'>('horizontal')
  const [gradColor1, setGradColor1] = useState('#ffffff')
  const [gradColor2, setGradColor2] = useState('#2563eb')
  const [patternStyle, setPatternStyle] = useState('gray50')
  const [patternFg, setPatternFg] = useState('#475569')
  const [patternBg, setPatternBg] = useState('#ffffff')
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // The selection format at open time is the change baseline; the live echo
  // must not move it while the dialog is up.
  const initialRef = useRef(draftFromSelection(selectionFormat))
  const initial = initialRef.current
  const [draft, setDraft] = useState(initial)
  const set = <K extends keyof FormatCellsDraft>(key: K, value: FormatCellsDraft[K]): void =>
    setDraft((previous) => ({ ...previous, [key]: value }))

  const [numOptions, setNumOptions] = useState<NumfmtOptions>(() =>
    numfmtOptionsOf(initial.pattern),
  )
  const updateNumfmt = (patch: Partial<NumfmtOptions>): void => {
    const next = { ...numOptions, ...patch }
    setNumOptions(next)
    set('pattern', numfmtPattern(next))
  }
  // Freeze the preview inputs at open time so the sample doesn't tick.
  const previewBase = useRef({ anchor: anchorValue, serial: todaySerial() })
  const sample = sampleValue(
    numOptions.category,
    previewBase.current.anchor,
    previewBase.current.serial,
  )
  const negativeSample = -Math.abs(typeof sample === 'number' ? sample : 1234.56)

  const { families: systemFontFamilies, load: loadSystemFonts } = useSystemFontFamilies()
  // the dialog opens from a click, so activation is still live here
  useEffect(() => loadSystemFonts(), [loadSystemFonts])
  const fontGroups = fontFamilyGroups(systemFontFamilies, draft.family)
  const sizeOptions =
    !draft.size || FONT_SIZES.includes(draft.size)
      ? FONT_SIZES
      : [...FONT_SIZES, draft.size].sort((a, b) => Number(a) - Number(b))

  function handleApply(): void {
    for (const command of formatCellsCommands(initial, draft)) onCommand(command)
    onClose()
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="format-cells-dialog"
        role="dialog"
        aria-label={t('dlgFcTitle')}
        onClick={(event) => event.stopPropagation()}
      >
        <header>{t('dlgFcTitle')}</header>
        <nav className="dialog-tabs">
          {TABS.map((candidate) => (
            <button
              key={candidate}
              className={candidate === tab ? 'active' : ''}
              onClick={() => setTab(candidate)}
            >
              {t(TAB_LABELS[candidate])}
            </button>
          ))}
        </nav>
        <section className="dialog-body">
          {tab === 'Number' && (
            <div className="numfmt-tab">
              <div className="numfmt-cats" role="listbox" aria-label={t('dlgFcCategory')}>
                {NUMFMT_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    role="option"
                    aria-selected={category === numOptions.category}
                    className={category === numOptions.category ? 'active' : ''}
                    onClick={() =>
                      updateNumfmt(
                        category === 'custom' ? { category, custom: draft.pattern } : { category },
                      )
                    }
                  >
                    {t(NUMFMT_CATEGORY_LABELS[category])}
                  </button>
                ))}
              </div>
              <div className="numfmt-body">
                <div className="numfmt-field numfmt-sample">
                  {t('dlgFcSample')}
                  <output>{numfmtPreview(draft.pattern, sample)}</output>
                </div>
                {DECIMAL_CATEGORIES.includes(numOptions.category) && (
                  <div className="numfmt-row">
                    <label className="numfmt-field">
                      {t('dlgFcDecimals')}
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={numOptions.decimals}
                        onChange={(e) =>
                          updateNumfmt({ decimals: clampDecimals(Number(e.target.value)) })
                        }
                      />
                    </label>
                    {(numOptions.category === 'currency' ||
                      numOptions.category === 'accounting') && (
                      <label className="numfmt-field">
                        {t('dlgFcCurrencySymbol')}
                        <select
                          value={numOptions.symbol}
                          onChange={(e) => updateNumfmt({ symbol: e.target.value })}
                        >
                          <option value="">{t('dlgFcSymbolNone')}</option>
                          {CURRENCY_SYMBOLS.map((symbol) => (
                            <option key={symbol} value={symbol}>
                              {symbol}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}
                {numOptions.category === 'number' && (
                  <label className="dialog-check">
                    <input
                      type="checkbox"
                      checked={numOptions.thousands}
                      onChange={(e) => updateNumfmt({ thousands: e.target.checked })}
                    />
                    {t('dlgFcThousandsSep')}
                  </label>
                )}
                {(numOptions.category === 'number' || numOptions.category === 'currency') && (
                  <div className="numfmt-field">
                    {t('dlgFcNegNumbers')}
                    <div className="numfmt-list" role="listbox" aria-label={t('dlgFcNegNumbers')}>
                      {NEGATIVE_STYLES.map((style) => (
                        <button
                          key={style}
                          role="option"
                          aria-selected={style === numOptions.negative}
                          className={`${style === numOptions.negative ? 'active' : ''} ${
                            style.includes('red') ? 'red' : ''
                          }`.trim()}
                          onClick={() => updateNumfmt({ negative: style })}
                        >
                          {numfmtPreview(
                            numfmtPattern({ ...numOptions, negative: style }),
                            negativeSample,
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {(numOptions.category === 'date' || numOptions.category === 'time') && (
                  <div className="numfmt-field">
                    {t('dlgFcTypeLabel')}
                    <div className="numfmt-list" role="listbox" aria-label={t('dlgFcTypeLabel')}>
                      {(numOptions.category === 'date' ? DATE_PATTERNS : TIME_PATTERNS).map(
                        (candidate) => {
                          const key = numOptions.category === 'date' ? 'datePattern' : 'timePattern'
                          return (
                            <button
                              key={candidate}
                              role="option"
                              aria-selected={candidate === numOptions[key]}
                              className={candidate === numOptions[key] ? 'active' : ''}
                              onClick={() => updateNumfmt({ [key]: candidate })}
                            >
                              {numfmtPreview(candidate, sample)}
                            </button>
                          )
                        },
                      )}
                    </div>
                  </div>
                )}
                {numOptions.category === 'fraction' && (
                  <div className="numfmt-field">
                    {t('dlgFcTypeLabel')}
                    <div className="numfmt-list" role="listbox" aria-label={t('dlgFcTypeLabel')}>
                      {FRACTION_PATTERNS.map((candidate, index) => (
                        <button
                          key={candidate}
                          role="option"
                          aria-selected={candidate === numOptions.fractionPattern}
                          className={candidate === numOptions.fractionPattern ? 'active' : ''}
                          onClick={() => updateNumfmt({ fractionPattern: candidate })}
                        >
                          {t(FRACTION_LABELS[index] ?? 'dlgFcFracD1')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {numOptions.category === 'general' && (
                  <p className="numfmt-note">{t('dlgFcGeneralNote')}</p>
                )}
                {numOptions.category === 'text' && (
                  <p className="numfmt-note">{t('dlgFcTextNote')}</p>
                )}
                {numOptions.category === 'custom' && (
                  <label className="numfmt-field">
                    {t('dlgFcCustomCode')}
                    <input
                      value={draft.pattern}
                      placeholder="#,##0.00"
                      onChange={(e) => {
                        setNumOptions({ ...numOptions, custom: e.target.value })
                        set('pattern', e.target.value)
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          )}
          {tab === 'Alignment' && (
            <div className="dialog-grid">
              <label>
                {t('dlgFcHorizontal')}
                <select value={draft.hAlign} onChange={(e) => set('hAlign', e.target.value)}>
                  <option value="">{t('dlgFcUnchanged')}</option>
                  {H_ALIGNMENTS.map((h) => (
                    <option key={h} value={h}>
                      {t(H_ALIGN_LABELS[h])}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('dlgFcVertical')}
                <select value={draft.vAlign} onChange={(e) => set('vAlign', e.target.value)}>
                  <option value="">{t('dlgFcUnchanged')}</option>
                  {V_ALIGNMENTS.map((v) => (
                    <option key={v} value={v}>
                      {t(V_ALIGN_LABELS[v])}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('dlgFcWrapText')}
                <select
                  value={draft.wrapText}
                  onChange={(e) => set('wrapText', e.target.value as FormatCellsDraft['wrapText'])}
                >
                  <option value="">{t('dlgFcUnchanged')}</option>
                  <option value="on">{t('dlgFcOn')}</option>
                  <option value="off">{t('dlgFcOff')}</option>
                </select>
              </label>
              <label>
                {t('dlgFcOrientation')}
                <select value={draft.rotation} onChange={(e) => set('rotation', e.target.value)}>
                  <option value="">{t('dlgFcUnchanged')}</option>
                  {ROTATIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {t(r.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('dlgFcIndent')}
                <input
                  type="number"
                  min="0"
                  max="250"
                  value={draft.indent}
                  placeholder={t('dlgFcUnchanged')}
                  onChange={(e) => set('indent', e.target.value)}
                />
              </label>
            </div>
          )}
          {tab === 'Font' && (
            <div className="dialog-grid">
              <label>
                {t('dlgFcFont')}
                <select value={draft.family} onChange={(e) => set('family', e.target.value)}>
                  <option value="">{t('dlgFcUnchanged')}</option>
                  <optgroup label={t('dlgFcFontsCommon')}>
                    {fontGroups.common.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </optgroup>
                  {fontGroups.system.length > 0 && (
                    <optgroup label={t('dlgFcFontsSystem')}>
                      {fontGroups.system.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <label>
                {t('dlgFcSize')}
                <select value={draft.size} onChange={(e) => set('size', e.target.value)}>
                  <option value="">{t('dlgFcUnchanged')}</option>
                  {sizeOptions.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              {(
                [
                  ['dlgFcBold', 'bold'],
                  ['dlgFcItalic', 'italic'],
                  ['dlgFcUnderline', 'underline'],
                  ['dlgFcStrikethrough', 'strike'],
                ] as const
              ).map(([labelKey, key]) => (
                <label key={key}>
                  {t(labelKey)}
                  <select
                    value={draft[key]}
                    onChange={(e) => set(key, e.target.value as FormatCellsDraft[typeof key])}
                  >
                    <option value="">{t('dlgFcUnchanged')}</option>
                    <option value="on">{t('dlgFcOn')}</option>
                    <option value="off">{t('dlgFcOff')}</option>
                  </select>
                </label>
              ))}
              <label>
                {t('dlgFcColor')}
                <input
                  type="color"
                  value={draft.fontColor || '#000000'}
                  onChange={(e) => set('fontColor', e.target.value)}
                />
              </label>
            </div>
          )}
          {tab === 'Border' && (
            <div className="dialog-grid">
              <label>
                {t('dlgFcBorderPresets')}
                <select value={draft.border} onChange={(e) => set('border', e.target.value)}>
                  <option value="">{t('dlgFcUnchanged')}</option>
                  {BORDER_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {t(preset.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('dlgFcBorderStyle')}
                <select
                  value={draft.borderStyle}
                  onChange={(e) => set('borderStyle', e.target.value)}
                >
                  {BORDER_LINE_STYLES.map((style) => (
                    <option key={style.value} value={style.value}>
                      {t(style.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('dlgFcColor')}
                <input
                  type="color"
                  value={draft.borderColor}
                  onChange={(e) => set('borderColor', e.target.value)}
                />
              </label>
            </div>
          )}
          {tab === 'Fill' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Fill Mode Switcher */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 6,
                }}
              >
                {(['solid', 'gradient', 'pattern'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      borderRadius: 4,
                      border: '1px solid var(--border)',
                      background:
                        fillMode === m
                          ? 'var(--accent-subtle, rgba(59, 130, 246, 0.1))'
                          : 'transparent',
                      color: fillMode === m ? 'var(--accent)' : 'inherit',
                      fontWeight: fillMode === m ? 600 : 400,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setFillMode(m)
                      if (m === 'gradient') {
                        const s =
                          gradType === 'horizontal'
                            ? `linear-gradient(90deg, ${gradColor1}, ${gradColor2})`
                            : gradType === 'vertical'
                              ? `linear-gradient(180deg, ${gradColor1}, ${gradColor2})`
                              : `linear-gradient(45deg, ${gradColor1}, ${gradColor2})`
                        set('fill', s)
                        set('noFill', false)
                      } else if (m === 'pattern') {
                        const p =
                          patternStyle === 'horiz'
                            ? `repeating-linear-gradient(0deg, ${patternFg}, ${patternFg} 2px, ${patternBg} 2px, ${patternBg} 6px)`
                            : patternStyle === 'vert'
                              ? `repeating-linear-gradient(90deg, ${patternFg}, ${patternFg} 2px, ${patternBg} 2px, ${patternBg} 6px)`
                              : patternStyle === 'cross'
                                ? `repeating-linear-gradient(45deg, ${patternFg} 0, ${patternFg} 1px, ${patternBg} 0, ${patternBg} 6px)`
                                : `radial-gradient(${patternFg} 1.5px, ${patternBg} 1.5px)`
                        set('fill', p)
                        set('noFill', false)
                      }
                    }}
                  >
                    {m === 'solid'
                      ? 'Theme & Solid Colors'
                      : m === 'gradient'
                        ? 'Gradient Fill'
                        : 'Pattern Fill'}
                  </button>
                ))}
              </div>

              {fillMode === 'solid' && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                    }}
                  >
                    Theme Colors
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(10, 1fr)',
                      gap: 3,
                      marginBottom: 8,
                    }}
                  >
                    {THEME_BASE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        style={{
                          width: 24,
                          height: 20,
                          background: c,
                          border:
                            draft.fill === c
                              ? '2px solid var(--accent)'
                              : '1px solid rgba(0,0,0,0.15)',
                          borderRadius: 2,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        title={c}
                        onClick={() => {
                          set('fill', c)
                          set('noFill', false)
                        }}
                      />
                    ))}
                    {THEME_TINTS.map((row, rIdx) =>
                      row.map((c, cIdx) => (
                        <button
                          key={`${rIdx}-${cIdx}`}
                          type="button"
                          style={{
                            width: 24,
                            height: 16,
                            background: c,
                            border:
                              draft.fill === c
                                ? '2px solid var(--accent)'
                                : '1px solid rgba(0,0,0,0.08)',
                            borderRadius: 2,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                          title={c}
                          onClick={() => {
                            set('fill', c)
                            set('noFill', false)
                          }}
                        />
                      )),
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                    }}
                  >
                    Standard Colors
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(10, 1fr)',
                      gap: 3,
                      marginBottom: 10,
                    }}
                  >
                    {STANDARD_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        style={{
                          width: 24,
                          height: 20,
                          background: c,
                          border:
                            draft.fill === c
                              ? '2px solid var(--accent)'
                              : '1px solid rgba(0,0,0,0.15)',
                          borderRadius: 2,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        title={c}
                        onClick={() => {
                          set('fill', c)
                          set('noFill', false)
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      More Colors:
                      <input
                        type="color"
                        value={draft.fill && draft.fill.startsWith('#') ? draft.fill : '#ffffff'}
                        disabled={draft.noFill}
                        onChange={(e) => {
                          set('fill', e.target.value)
                          set('noFill', false)
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {fillMode === 'gradient' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 12 }}>Direction:</label>
                    <select
                      value={gradType}
                      style={{ fontSize: 12, padding: '2px 8px' }}
                      onChange={(e) => {
                        const next = e.target.value as any
                        setGradType(next)
                        const s =
                          next === 'horizontal'
                            ? `linear-gradient(90deg, ${gradColor1}, ${gradColor2})`
                            : next === 'vertical'
                              ? `linear-gradient(180deg, ${gradColor1}, ${gradColor2})`
                              : `linear-gradient(45deg, ${gradColor1}, ${gradColor2})`
                        set('fill', s)
                        set('noFill', false)
                      }}
                    >
                      <option value="horizontal">Horizontal</option>
                      <option value="vertical">Vertical</option>
                      <option value="diagonal">Diagonal (45°)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      Color 1:
                      <input
                        type="color"
                        value={gradColor1}
                        onChange={(e) => {
                          setGradColor1(e.target.value)
                          const s =
                            gradType === 'horizontal'
                              ? `linear-gradient(90deg, ${e.target.value}, ${gradColor2})`
                              : gradType === 'vertical'
                                ? `linear-gradient(180deg, ${e.target.value}, ${gradColor2})`
                                : `linear-gradient(45deg, ${e.target.value}, ${gradColor2})`
                          set('fill', s)
                          set('noFill', false)
                        }}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      Color 2:
                      <input
                        type="color"
                        value={gradColor2}
                        onChange={(e) => {
                          setGradColor2(e.target.value)
                          const s =
                            gradType === 'horizontal'
                              ? `linear-gradient(90deg, ${gradColor1}, ${e.target.value})`
                              : gradType === 'vertical'
                                ? `linear-gradient(180deg, ${gradColor1}, ${e.target.value})`
                                : `linear-gradient(45deg, ${gradColor1}, ${e.target.value})`
                          set('fill', s)
                          set('noFill', false)
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {fillMode === 'pattern' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 12 }}>Pattern Style:</label>
                    <select
                      value={patternStyle}
                      style={{ fontSize: 12, padding: '2px 8px' }}
                      onChange={(e) => {
                        const style = e.target.value
                        setPatternStyle(style)
                        const p =
                          style === 'horiz'
                            ? `repeating-linear-gradient(0deg, ${patternFg}, ${patternFg} 2px, ${patternBg} 2px, ${patternBg} 6px)`
                            : style === 'vert'
                              ? `repeating-linear-gradient(90deg, ${patternFg}, ${patternFg} 2px, ${patternBg} 2px, ${patternBg} 6px)`
                              : style === 'cross'
                                ? `repeating-linear-gradient(45deg, ${patternFg} 0, ${patternFg} 1px, ${patternBg} 0, ${patternBg} 6px)`
                                : `radial-gradient(${patternFg} 1.5px, ${patternBg} 1.5px)`
                        set('fill', p)
                        set('noFill', false)
                      }}
                    >
                      <option value="gray50">50% Gray</option>
                      <option value="horiz">Horizontal Stripe</option>
                      <option value="vert">Vertical Stripe</option>
                      <option value="cross">Diagonal Crosshatch</option>
                      <option value="dots">Dots</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      Pattern Color:
                      <input
                        type="color"
                        value={patternFg}
                        onChange={(e) => {
                          setPatternFg(e.target.value)
                          const p =
                            patternStyle === 'horiz'
                              ? `repeating-linear-gradient(0deg, ${e.target.value}, ${e.target.value} 2px, ${patternBg} 2px, ${patternBg} 6px)`
                              : patternStyle === 'vert'
                                ? `repeating-linear-gradient(90deg, ${e.target.value}, ${e.target.value} 2px, ${patternBg} 2px, ${patternBg} 6px)`
                                : patternStyle === 'cross'
                                  ? `repeating-linear-gradient(45deg, ${e.target.value} 0, ${e.target.value} 1px, ${patternBg} 0, ${patternBg} 6px)`
                                  : `radial-gradient(${e.target.value} 1.5px, ${patternBg} 1.5px)`
                          set('fill', p)
                          set('noFill', false)
                        }}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      Background:
                      <input
                        type="color"
                        value={patternBg}
                        onChange={(e) => {
                          setPatternBg(e.target.value)
                          const p =
                            patternStyle === 'horiz'
                              ? `repeating-linear-gradient(0deg, ${patternFg}, ${patternFg} 2px, ${e.target.value} 2px, ${e.target.value} 6px)`
                              : patternStyle === 'vert'
                                ? `repeating-linear-gradient(90deg, ${patternFg}, ${patternFg} 2px, ${e.target.value} 2px, ${e.target.value} 6px)`
                                : patternStyle === 'cross'
                                  ? `repeating-linear-gradient(45deg, ${patternFg} 0, ${patternFg} 1px, ${e.target.value} 0, ${e.target.value} 6px)`
                                  : `radial-gradient(${patternFg} 1.5px, ${e.target.value} 1.5px)`
                          set('fill', p)
                          set('noFill', false)
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* No Fill toggle & Sample Preview */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--border)',
                  paddingTop: 10,
                }}
              >
                <label className="dialog-check">
                  <input
                    type="checkbox"
                    checked={draft.noFill}
                    onChange={(e) => set('noFill', e.target.checked)}
                  />
                  {t('dlgFcNoFill')}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sample:</span>
                  <div
                    style={{
                      width: 90,
                      height: 28,
                      borderRadius: 4,
                      border: '1px solid var(--border-strong, #ccc)',
                      background: draft.noFill ? '#ffffff' : draft.fill || '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    Sample
                  </div>
                </div>
              </div>
            </div>
          )}
          {tab === 'Protection' && (
            <div className="dialog-grid">
              <label>
                {t('dlgFcLocked')}
                <select
                  value={draft.locked}
                  onChange={(e) => set('locked', e.target.value as FormatCellsDraft['locked'])}
                >
                  <option value="">{t('dlgFcUnchanged')}</option>
                  <option value="on">{t('dlgFcOn')}</option>
                  <option value="off">{t('dlgFcOff')}</option>
                </select>
              </label>
              <label>
                {t('dlgFcHidden')}
                <select
                  value={draft.hidden}
                  onChange={(e) => set('hidden', e.target.value as FormatCellsDraft['hidden'])}
                >
                  <option value="">{t('dlgFcUnchanged')}</option>
                  <option value="on">{t('dlgFcOn')}</option>
                  <option value="off">{t('dlgFcOff')}</option>
                </select>
              </label>
              <p className="dialog-note">{t('dlgFcProtectionNote')}</p>
            </div>
          )}
        </section>
        <footer className="dialog-actions">
          <button className="secondary" onClick={onClose}>
            {t('dlgCancel')}
          </button>
          <button className="primary-action" onClick={handleApply}>
            {t('dlgOk')}
          </button>
        </footer>
      </div>
    </div>
  )
}
