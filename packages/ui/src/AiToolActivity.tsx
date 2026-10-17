import { useState, type ReactNode } from 'react'
import './ai-tool-activity.css'

/**
 * The tool-run group shown under an assistant reply: one quiet summary row that
 * auto-opens while tools run, collapses to "Worked · N steps" when they finish,
 * and yields to a manual toggle. Rows inside are step rows with 1px connectors.
 *
 * Extracted because this component and its CSS existed as separate copies in
 * docs, html, markdown and slides, while the drawboard grew a fourth, different
 * tool list. One component makes every app's run display identical.
 *
 * Labels arrive as props: this package ships no i18n.
 */
export interface ToolActivity {
  name: string
  summary: string
  /** still executing: rendered as a spinner chip, replaced in place on finish */
  running?: boolean
  isError?: boolean
  /** tool output; when set, the row can be expanded for details */
  output?: string
  /** the arguments the tool was called with, for a richer detail view */
  input?: unknown
}

export interface AiToolActivityLabels {
  /** shown while at least one tool is still running */
  working: string
  /** the collapsed summary; receives the number of steps run */
  worked: (steps: number) => string
}

export interface AiToolActivityProps {
  tools: readonly ToolActivity[]
  labels: AiToolActivityLabels
  /**
   * Optional richer detail for a step. Without it the row expands to the raw
   * tool output; an app that has more to show (the call arguments, say) supplies
   * its own body instead of losing that information.
   */
  renderDetail?: (tool: ToolActivity, index: number) => ReactNode
}

/** Step-row status glyphs (timeline style: 14px glyph in a 20px slot, 1.6 stroke) */
function StepIcon({ status }: { status: 'running' | 'done' | 'error' }) {
  if (status === 'running') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6.5 3.5h11M6.5 20.5h11M8 3.5v3.2c0 2.6 4 4.2 4 5.3 0 1.1 4 2.7 4 5.3v3.2M16 3.5v3.2c0 2.6-4 4.2-4 5.3 0 1.1-4 2.7-4 5.3v3.2" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.4 2.4 2.4 4.6-5" />
    </svg>
  )
}

export function AiToolActivity({ tools, labels, renderDetail }: AiToolActivityProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [userOpen, setUserOpen] = useState<boolean | null>(null)

  const toggle = (index: number) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  if (!tools.length) return null

  const anyRunning = tools.some((tool) => tool.running)
  // a manual toggle always wins; otherwise follow the run
  const open = userOpen ?? anyRunning
  const label = anyRunning ? labels.working : labels.worked(tools.length)

  return (
    <div className="ai-work-group">
      <button
        type="button"
        className={`ai-work-group-summary${anyRunning ? ' running' : ''}`}
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
      >
        {anyRunning && !open && <span className="ai-tool-chip-spinner" aria-hidden />}
        <span className="ai-work-group-label">{label}</span>
        <span className={`ai-tool-chip-caret${open ? ' open' : ''}`} aria-hidden>
          ›
        </span>
      </button>
      <div className={`ai-work-group-body${open ? ' open' : ''}`}>
        <div className="ai-work-group-body-inner">
          {tools.map((tool, index) => {
            // a custom detail body stays available while the tool is running
            const hasOutput = !!renderDetail || (!tool.running && !!tool.output)
            const isOpen = expanded.has(index)
            const stepStatus = tool.running ? 'running' : tool.isError ? 'error' : 'done'
            return (
              <div key={index} className="ai-step-row">
                <span className={`ai-step-icon ${stepStatus}`} aria-hidden>
                  <StepIcon status={stepStatus} />
                </span>
                <div className="ai-step-content">
                  {hasOutput ? (
                    <button
                      type="button"
                      className="ai-step-title clickable"
                      data-tip={tool.name}
                      aria-expanded={isOpen}
                      onClick={() => toggle(index)}
                    >
                      {tool.summary}
                    </button>
                  ) : (
                    <span className="ai-step-title" data-tip={tool.name}>
                      {tool.summary}
                    </span>
                  )}
                  {hasOutput && isOpen && (
                    <div className="ai-step-detail">
                      {renderDetail ? (
                        renderDetail(tool, index)
                      ) : (
                        <div className="ai-tool-output">
                          <div className="ai-tool-output-pre">{tool.output}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
