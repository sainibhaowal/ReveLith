import type { CSSProperties, ReactNode } from 'react'

export type RibbonToolVariant = 'large' | 'compact' | 'icon' | 'quick'

export interface RibbonToolButtonProps {
  icon: ReactNode
  label: string
  tooltip?: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  /** Set only when the command is semantically a toggle. */
  pressed?: boolean
  expanded?: boolean
  controls?: string
  ariaLabel?: string
  accent?: boolean
  aiEntry?: boolean
  variant?: RibbonToolVariant
  className?: string
  iconClassName?: string
  labelClassName?: string
  style?: CSSProperties
}

/** Shared, theme-aware command control for ReveLith ribbon tool groups. */
export function RibbonToolButton({
  icon,
  label,
  tooltip,
  shortcut,
  onClick,
  disabled = false,
  active = false,
  pressed,
  expanded,
  controls,
  ariaLabel,
  accent = false,
  aiEntry = false,
  variant = 'large',
  className,
  iconClassName,
  labelClassName,
  style,
}: RibbonToolButtonProps) {
  const classes = [
    'revelith-ribbon-tool',
    `revelith-ribbon-tool--${variant}`,
    active && 'active',
    active && 'is-active',
    accent && 'is-accent',
    aiEntry && 'is-ai-entry',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      aria-label={ariaLabel ?? label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      data-active={active ? 'true' : undefined}
      data-tip={tooltip || label}
      data-tip-kbd={shortcut || undefined}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      <span className={['revelith-ribbon-tool-icon', iconClassName].filter(Boolean).join(' ')}>
        {icon}
      </span>
      {variant !== 'icon' && variant !== 'quick' ? (
        <span className={['revelith-ribbon-tool-label', labelClassName].filter(Boolean).join(' ')}>
          {label}
        </span>
      ) : null}
    </button>
  )
}

export interface RibbonQuickButtonProps {
  icon: ReactNode
  label: string
  tooltip?: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  className?: string
}

/** Compact, icon-only quick-access command with an accessible name and ScreenTip. */
export function RibbonQuickButton({
  icon,
  label,
  tooltip,
  shortcut,
  onClick,
  disabled,
  primary,
  className,
}: RibbonQuickButtonProps) {
  return (
    <RibbonToolButton
      variant="quick"
      icon={icon}
      label={label}
      {...(tooltip !== undefined ? { tooltip } : {})}
      {...(shortcut !== undefined ? { shortcut } : {})}
      onClick={onClick}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(primary !== undefined ? { accent: primary } : {})}
      {...(className !== undefined ? { className } : {})}
    />
  )
}
