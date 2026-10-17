import { createPortal } from 'react-dom'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

export type SelectMenuOption = {
  value: string
  label: string
  color?: string
}

/** A rounded, animated select used throughout Tasks. The visually hidden
 * native select keeps keyboard/test/form semantics while the menu itself is
 * rendered in the Tasks design system. */
export function SelectMenu({
  label,
  value,
  options,
  onChange,
  placeholder,
  style,
  className = '',
}: {
  label: string
  value: string
  options: readonly SelectMenuOption[]
  onChange: (value: string) => void
  placeholder?: string
  style?: CSSProperties
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value)
  const display = selected?.label ?? placeholder ?? ''

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const gap = 6
    const estimatedHeight = Math.min(
      280,
      10 + (options.length + (placeholder && !value ? 1 : 0)) * 32,
    )
    const below = window.innerHeight - rect.bottom - gap
    const above = rect.top - gap
    const opensAbove = below < estimatedHeight && above > below
    const available = Math.max(80, Math.min(280, opensAbove ? above : below))
    const width = Math.max(rect.width, 112)
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
    setMenuPosition({
      left,
      top: opensAbove ? rect.top - gap : rect.bottom + gap,
      width,
      maxHeight: available,
      opensAbove,
    })
  }, [options.length, placeholder, value])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null)
      return
    }
    updateMenuPosition()
    const onViewportChange = () => updateMenuPosition()
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, updateMenuPosition])

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div className={`tasks-select-menu ${className}`.trim()} ref={rootRef} style={style}>
      <button
        ref={triggerRef}
        type="button"
        className="tasks-select-trigger"
        aria-label={`${label} menu`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {selected?.color ? (
          <span
            className="tasks-select-swatch"
            style={{ background: `var(--col-${selected.color})` }}
            aria-hidden="true"
          />
        ) : null}
        <span className="tasks-select-value">{display}</span>
        <span className="tasks-select-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>

      <select
        className="tasks-native-select"
        aria-label={label}
        value={value}
        tabIndex={-1}
        onChange={(event) => onChange(event.target.value)}
      >
        {placeholder && !value ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className={`tasks-select-menu-list${menuPosition.opensAbove ? ' is-above' : ''}`}
              role="listbox"
              aria-label={`${label} options`}
              style={{
                left: menuPosition.left,
                top: menuPosition.top,
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
              }}
            >
              {placeholder && !value ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  className="tasks-select-option"
                  onClick={() => choose('')}
                >
                  {placeholder}
                </button>
              ) : null}
              {options.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className="tasks-select-option"
                  key={option.value}
                  onClick={() => choose(option.value)}
                >
                  {option.color ? (
                    <span
                      className="tasks-select-swatch"
                      style={{ background: `var(--col-${option.color})` }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span>{option.label}</span>
                  {option.value === value ? (
                    <span className="tasks-select-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

type MenuPosition = {
  left: number
  top: number
  width: number
  maxHeight: number
  opensAbove: boolean
}
