import type { ReactElement } from 'react'

export interface LoadingScreenProps {
  /** The app-specific product name shown above the activity indicator. */
  title: string
  /** Short, localizable description of the operation in progress. */
  message: string
}

/** Shared, accessible ReveLith startup/document loading treatment. */
export function LoadingScreen({ title, message }: LoadingScreenProps): ReactElement {
  return (
    <div
      className="rvl-loading-screen"
      role="status"
      aria-live="polite"
      aria-label={`${title}: ${message}`}
    >
      <svg
        className="rvl-loading-mark"
        width="60"
        height="60"
        viewBox="0 0 120 120"
        fill="none"
        aria-hidden="true"
      >
        <g transform="translate(10 10)">
          <circle cx="50" cy="50" r="7.5" fill="#38bdf8" />
          <ellipse cx="50" cy="50" rx="42" ry="18" stroke="#38bdf8" strokeWidth="6.5" />
          <circle cx="88" cy="50" r="6.5" fill="#67e8f9" />
          <ellipse
            cx="50"
            cy="50"
            rx="42"
            ry="18"
            stroke="#60a5fa"
            strokeWidth="6.5"
            transform="rotate(60 50 50)"
          />
          <circle cx="31" cy="17" r="6.5" fill="#93c5fd" />
          <ellipse
            cx="50"
            cy="50"
            rx="42"
            ry="18"
            stroke="#818cf8"
            strokeWidth="6.5"
            transform="rotate(120 50 50)"
          />
          <circle cx="31" cy="83" r="6.5" fill="#c7d2fe" />
        </g>
      </svg>
      <p className="rvl-loading-title">{title}</p>
      <span className="rvl-loading-ring" aria-hidden="true" />
      <p className="rvl-loading-message">
        {message}
        <span className="rvl-loading-dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
    </div>
  )
}
