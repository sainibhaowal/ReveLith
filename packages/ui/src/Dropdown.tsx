/**
 * Select-style dropdown: a trigger that shows the current value, and a floating
 * list to pick a new one. Used wherever a native <select> would look wrong in
 * the ribbon (device presets, font pickers, form fields inside a page).
 *
 * The class names are prefixed `rv-dd` (ReveLith dropdown) and are styled by
 * each app's own stylesheet, so a control can adopt the surrounding chrome
 * (a PDF form field, a compact status-bar pill) just by adding a class.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

export interface DropdownOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

export interface DropdownProps<T extends string = string> {
  /** currently selected value; must be one of `options` */
  value: T
  options: readonly DropdownOption<T>[]
  onPick: (value: T) => void
  /** extra classes on the wrapper (the app supplies the control's look) */
  className?: string
  /** accessible name; also the tooltip when `tip` is absent */
  ariaLabel?: string
  /** form semantics, for a dropdown that stands in for a required field */
  ariaRequired?: boolean
  ariaInvalid?: boolean
  /** tooltip override for the trigger */
  tip?: string
  disabled?: boolean
}

export function Dropdown<T extends string = string>({
  value,
  options,
  onPick,
  className,
  ariaLabel,
  ariaRequired,
  ariaInvalid,
  tip,
  disabled = false,
}: DropdownProps<T>): ReactElement {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const selected = options.find((option) => option.value === value) ?? options[0]
  const enabledIndexes = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  // outside press / focus loss closes: a menu must never trap the user
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  // keep the highlighted row inside the visible part of a long list
  useEffect(() => {
    if (!open || !listRef.current) return
    const row = listRef.current.children[activeIndex] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const openList = (startIndex: number) => {
    const first = enabledIndexes.includes(startIndex) ? startIndex : (enabledIndexes[0] ?? 0)
    setActiveIndex(first)
    setOpen(true)
  }

  const move = (delta: number) => {
    if (enabledIndexes.length === 0) return
    const pos = enabledIndexes.indexOf(activeIndex)
    const nextPos = (pos + delta + enabledIndexes.length) % enabledIndexes.length
    setActiveIndex(enabledIndexes[nextPos] ?? activeIndex)
  }

  const pick = (option: DropdownOption<T> | undefined) => {
    if (!option || option.disabled) return
    onPick(option.value)
    close()
  }

  const title = tip ?? ariaLabel

  return (
    <div className={`rv-dd${className ? ` ${className}` : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="rv-dd-btn"
        data-open={open ? 'true' : 'false'}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel ?? title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        onClick={() => (open ? close() : openList(options.findIndex((o) => o.value === value)))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (open) move(1)
            else openList(options.findIndex((o) => o.value === value))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (open) move(-1)
            else openList(options.findIndex((o) => o.value === value))
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (open) pick(options[activeIndex])
            else openList(options.findIndex((o) => o.value === value))
          }
        }}
      >
        <span className="rv-dd-label">{selected?.label ?? ''}</span>
        <span className="rv-dd-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div
          className="rv-dd-list"
          role="listbox"
          ref={listRef}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              move(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              move(-1)
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              pick(options[activeIndex])
            } else if (e.key === 'Home') {
              e.preventDefault()
              setActiveIndex(enabledIndexes[0] ?? 0)
            } else if (e.key === 'End') {
              e.preventDefault()
              setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? 0)
            }
          }}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className="rv-dd-item"
              data-active={index === activeIndex ? 'true' : 'false'}
              data-selected={option.value === value ? 'true' : 'false'}
              data-disabled={option.disabled ? 'true' : undefined}
              onMouseEnter={() => !option.disabled && setActiveIndex(index)}
              onMouseDown={(e) => {
                // mousedown, so the list does not lose focus before the pick
                e.preventDefault()
                pick(option)
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
