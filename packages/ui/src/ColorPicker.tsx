/**
 * Shared color palette: the Word-style theme row, the standard row, and a
 * "More colors…" entry that hands off to the OS picker. Apps own the open
 * state and the popover frame; this only renders the swatches.
 */
import { useRef } from 'react'
import type { ReactNode } from 'react'

/** Localized labels; `auto` renders only when the picker may return "no color". */
export interface ColorPickerStrings {
  themeColors: string
  standardColors: string
  moreColors: string
  /** label of the "no fill / automatic" entry */
  auto?: string
  /** label of the swatch that opens the OS picker */
  more?: string
}

/** Extra props for the host's hidden native color input. */
export interface ColorPickerMoreInputProps {
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
  value?: string
}

interface ColorPickerProps {
  /** current color as #rrggbb, or null for "no color" */
  value: string | null
  onPick: (hex: string | null) => void
  strings: ColorPickerStrings
  /** host passes its own input props (live apply while the OS dialog is open) */
  moreInputProps?: ColorPickerMoreInputProps
  /** theme row entries; defaults to the shared theme palette */
  themeColors?: readonly string[]
  /** standard row entries; defaults to the shared standard palette */
  standardColors?: readonly string[]
  className?: string
}

/** Office-style theme colors (the first two columns are the accent pair). */
const DEFAULT_THEME_COLORS: readonly string[] = [
  '#ffffff',
  '#000000',
  '#e7e6e6',
  '#44546a',
  '#4472c4',
  '#ed7d31',
  '#a5a5a5',
  '#ffc000',
  '#5b9bd5',
  '#70ad47',
]

/** Office standard colors. */
const DEFAULT_STANDARD_COLORS: readonly string[] = [
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

/** Normalize a picked/typed string to #rrggbb, or null when unusable. */
function normalizeHex(raw: string): string | null {
  const value = raw.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value
      .split('')
      .map((c) => c + c)
      .join('')
      .toLowerCase()}`
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value.toLowerCase()}`
  return null
}

function Swatch({
  hex,
  selected,
  title,
  onClick,
}: {
  hex: string
  selected: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="color-picker-swatch"
      data-selected={selected ? 'true' : 'false'}
      style={{ background: hex }}
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={onClick}
    />
  )
}

export function ColorPicker({
  value,
  onPick,
  strings,
  moreInputProps,
  themeColors = DEFAULT_THEME_COLORS,
  standardColors = DEFAULT_STANDARD_COLORS,
  className,
}: ColorPickerProps) {
  const moreRef = useRef<HTMLInputElement | null>(null)
  const current = value ? normalizeHex(value) : null

  const row = (label: string, colors: readonly string[]) => (
    <div className="color-picker-section">
      <div className="color-picker-section-label">{label}</div>
      <div className="color-picker-grid">
        {colors.map((hex) => (
          <Swatch
            key={hex}
            hex={hex}
            selected={current === hex.toLowerCase()}
            title={hex}
            onClick={() => onPick(hex.toLowerCase())}
          />
        ))}
      </div>
    </div>
  )

  return (
    <div className={className ? `color-picker ${className}` : 'color-picker'}>
      {strings.auto && (
        <div className="color-picker-section">
          <button
            type="button"
            className="color-picker-auto"
            data-selected={current === null ? 'true' : 'false'}
            onClick={() => onPick(null)}
          >
            {strings.auto}
          </button>
        </div>
      )}
      {row(strings.themeColors, themeColors)}
      {row(strings.standardColors, standardColors)}
      <div className="color-picker-section">
        <button
          type="button"
          className="color-picker-more"
          onClick={() => moreRef.current?.click()}
        >
          {strings.moreColors}
        </button>
        {/* kept mounted (not conditionally rendered): unmounting the input while
            the OS dialog is open would drop its change event on some platforms */}
        <input
          ref={moreRef}
          type="color"
          className="color-picker-native"
          aria-label={strings.more ?? strings.moreColors}
          value={current ?? '#000000'}
          {...moreInputProps}
        />
      </div>
    </div>
  )
}

export { DEFAULT_STANDARD_COLORS, DEFAULT_THEME_COLORS, normalizeHex }

/** Wrap custom children in the panel's spacing; kept for parity with the popovers. */
export function ColorPickerPanel({ children }: { children: ReactNode }) {
  return <div className="color-picker-panel">{children}</div>
}
