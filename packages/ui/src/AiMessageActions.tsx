import { useEffect, useState } from 'react'
import './ai-message-actions.css'

/**
 * The assistant-message action row: copy the reply, regenerate it, and roll the
 * work back to before the run.
 *
 * Extracted because this markup and its CSS had been copied into docs, html,
 * markdown and slides, and the roll-back button separately into docs and
 * slides. One component keeps every app's chat behaving and looking the same
 * instead of drifting per copy.
 *
 * Labels arrive as props: this package ships no i18n, so each app passes its
 * own translated strings.
 */
export interface AiMessageActionsLabels {
  copy: string
  regenerate: string
  rollback: string
}

export interface AiMessageActionsProps {
  /** Assistant reply text. The copy action is hidden when this is empty. */
  text?: string
  /** Show the copy action in its confirmed state. */
  copied?: boolean
  onCopy?: () => void
  /** Rendered only when supplied, so a non-rerunnable message shows no action. */
  onRegenerate?: () => void
  /** Rendered only when supplied (nothing to roll back yet). */
  onRollback?: () => void
  disabled?: boolean
  labels: AiMessageActionsLabels
}

function CopyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M14.6113 5.34253C16.0608 5.3428 17.2363 6.518 17.2363 7.96753V15.5066C17.2361 16.956 16.0607 18.1313 14.6113 18.1316H7.07227C5.62267 18.1316 4.44751 16.9561 4.44727 15.5066V7.96753C4.44732 6.51783 5.62255 5.34253 7.07227 5.34253H14.6113ZM7.07227 6.59253C6.31291 6.59253 5.69732 7.20819 5.69727 7.96753V15.5066C5.69751 16.2658 6.31302 16.8816 7.07227 16.8816H14.6113C15.3703 16.8813 15.9861 16.2656 15.9863 15.5066V7.96753C15.9863 7.20835 15.3705 6.5928 14.6113 6.59253H7.07227ZM10.0176 2.8689C10.3626 2.86905 10.6426 3.14882 10.6426 3.4939C10.6425 3.83888 10.3626 4.11874 10.0176 4.1189H4.59961C3.84022 4.1189 3.22461 4.73451 3.22461 5.4939V11.324C3.22433 11.6689 2.94461 11.949 2.59961 11.949C2.25461 11.949 1.97489 11.6689 1.97461 11.324V5.4939C1.97461 4.04415 3.14987 2.8689 4.59961 2.8689H10.0176Z"
        fill="currentColor"
      />
    </svg>
  )
}

function CopiedIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function RegenerateIcon() {
  return (
    // 24-canvas glyph at 18px for optical parity with the copy icon
    <svg
      style={{ width: 18, height: 18 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.68881 9.85339C4.1791 8.0054 5.28205 6.30704 6.9459 5.09101C10.8046 2.27085 16.2188 3.11279 19.0389 6.97147C19.7242 7.90904 20.1932 8.93842 20.4553 10.0001" />
      <path d="M2.00452 8.46411L2.87229 10.7059C2.96814 10.9535 3.24658 11.0765 3.4942 10.9807L5.73594 10.1129" />
      <path d="M20.3308 14.4908C19.8405 16.3388 18.7376 18.0372 17.0738 19.2532C13.215 22.0734 7.80083 21.2314 4.98071 17.3728C4.22167 16.3342 3.72792 15.183 3.48686 13.9999" />
      <path d="M22.0151 15.8801L21.1474 13.6384C21.0515 13.3908 20.7731 13.2677 20.5255 13.3636L18.2837 14.2314" />
    </svg>
  )
}

export function AiMessageActions({
  text,
  copied = false,
  onCopy,
  onRegenerate,
  onRollback,
  disabled = false,
  labels,
}: AiMessageActionsProps) {
  // A confirmed copy resets itself so the row does not stay in a "done" state.
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => {
    if (!copied) {
      setConfirmed(false)
      return
    }
    setConfirmed(true)
    const timer = window.setTimeout(() => setConfirmed(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (!text && !onRegenerate && !onRollback) return null

  return (
    <div className="ai-msg-toolbar">
      {text && onCopy && (
        <button
          type="button"
          className="ai-msg-tool-btn"
          onClick={onCopy}
          aria-label={labels.copy}
          data-tip={labels.copy}
        >
          {confirmed ? <CopiedIcon /> : <CopyIcon />}
        </button>
      )}
      {onRegenerate && (
        <button
          type="button"
          className="ai-msg-tool-btn"
          disabled={disabled}
          onClick={onRegenerate}
          aria-label={labels.regenerate}
          data-tip={labels.regenerate}
        >
          <RegenerateIcon />
        </button>
      )}
      {onRollback && (
        <>
          {/* hairline between the icon actions and the labelled one; CSS shows it
              only when an icon button actually precedes it */}
          <span className="ai-rollback-sep" aria-hidden />
          <button
            type="button"
            className="ai-rollback-btn"
            disabled={disabled}
            onClick={onRollback}
          >
            {/* 24-canvas glyph at 18px: stroke 1.5 paints 1.125px */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5.91026 4L2.5 7.14791L5.91026 10.8205" />
              <path d="M3.96154 7.41028H15.1636C18.5169 7.41028 21.3646 10.1484 21.4953 13.5C21.6334 17.0416 18.707 20.0769 15.1636 20.0769H6.88384" />
            </svg>
            {labels.rollback}
          </button>
        </>
      )}
    </div>
  )
}
