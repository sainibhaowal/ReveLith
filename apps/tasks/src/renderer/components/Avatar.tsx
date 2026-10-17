import { memberInitials } from '../../domain/types'
import type { CSSProperties } from 'react'
import { colorVar } from '../styles'

/**
 * A small coloured circle with a member's initials.
 *
 * Used on task cards, in the task detail and in the bulk bar, so ownership is
 * readable at a glance without opening anything. Size is the only knob; colour
 * comes from the member record.
 */
export function Avatar({
  name,
  color,
  size = 20,
  title,
}: {
  name: string
  color: string
  size?: number
  title?: string
}) {
  return (
    <span
      title={title ?? name}
      aria-label={name}
      role="img"
      style={{
        ...avatar,
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.42)),
        // A muted wash of the member colour keeps the circle readable in both themes.
        background: `color-mix(in srgb, ${colorVar(color)} 22%, transparent)`,
        color: colorVar(color),
        borderColor: `color-mix(in srgb, ${colorVar(color)} 45%, transparent)`,
      }}
    >
      {memberInitials(name)}
    </span>
  )
}

/** The "no owner" placeholder, so an unassigned card still shows a stable slot. */
export function UnassignedAvatar({ size = 20 }: { size?: number }) {
  return (
    <span
      title="Unassigned"
      aria-label="Unassigned"
      style={{
        ...avatar,
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.4)),
        background: 'transparent',
        color: 'var(--text-secondary)',
        borderColor: 'var(--border)',
        borderStyle: 'dashed',
      }}
    >
      ?
    </span>
  )
}

const avatar: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  borderWidth: 1,
  borderStyle: 'solid',
  fontWeight: 700,
  letterSpacing: 0.2,
  flexShrink: 0,
  userSelect: 'none',
  lineHeight: 1,
}