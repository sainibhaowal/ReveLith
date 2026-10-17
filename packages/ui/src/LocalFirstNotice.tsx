import { useState, type AnimationEvent } from 'react'
import './local-first-notice.css'

export interface LocalFirstNoticeProps {
  storageKey: string
  title: string
  children: string
}

function wasDismissed(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}

export function LocalFirstNotice({ storageKey, title, children }: LocalFirstNoticeProps) {
  const [visible, setVisible] = useState(() => !wasDismissed(storageKey))
  const [leaving, setLeaving] = useState(false)

  if (!visible) return null

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey, '1')
    } catch {
      // Dismissal still works for this session if browser storage is unavailable.
    }
    setLeaving(true)
  }

  const finishAnimation = (event: AnimationEvent<HTMLElement>) => {
    if (leaving && event.animationName === 'local-first-notice-out') setVisible(false)
  }

  return (
    <aside
      className={`local-first-notice${leaving ? ' is-leaving' : ''}`}
      aria-label={title}
      onAnimationEnd={finishAnimation}
    >
      <div className="local-first-notice-copy">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
      <button className="local-first-notice-dismiss" type="button" onClick={dismiss}>
        Don&apos;t show again
      </button>
    </aside>
  )
}
