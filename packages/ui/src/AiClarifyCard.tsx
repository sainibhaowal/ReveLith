import { useEffect, useRef, useState } from 'react'
import './ai-clarify.css'

/**
 * The questionnaire card the ask_clarification tool docks in the composer slot
 * while it waits for the user's answers.
 *
 * Extracted from the html/slides copies so every app that can ask a clarifying
 * question shows the same card: one question at a time, single-select advances,
 * multi-select waits for Next, "decide for me" and a free-text field are added
 * by the card itself (the model only supplies the real trade-off questions).
 *
 * Labels arrive as props: this package ships no i18n, so each app passes its
 * own translated strings.
 */

export interface ClarifyQuestion {
  id: string
  label: string
  description?: string
  options: string[]
  multi?: boolean
}

export interface ClarifyAnswer {
  q: string
  a: string
}

export interface AiClarifyLabels {
  title: string
  multi: string
  selected: (count: number) => string
  decide: string
  /** the stored answer text for "decide for me" — kept distinct from the label */
  decideAnswer: string
  other: string
  skip: string
  next: string
  prev: string
  submit: string
}

export const DEFAULT_AI_CLARIFY_LABELS: AiClarifyLabels = {
  title: 'A few quick questions before I start',
  multi: 'Multiple choice',
  selected: (count) => `${count} selected`,
  decide: 'Decide for me',
  decideAnswer: '(decide for me)',
  other: 'Other (type in)',
  skip: 'Skip',
  next: 'Next',
  prev: 'Previous',
  submit: 'Continue',
}

/** Answer join separator (the CJK ideographic comma keeps names readable). */
const ANSWER_SEPARATOR = '、'

export interface AiClarifyCardProps {
  questions: ClarifyQuestion[]
  /** receives the answers as a transcript block plus the question/answer pairs */
  onSubmit: (answers: string, qa: ClarifyAnswer[]) => void
  onSkip: () => void
  labels?: Partial<AiClarifyLabels>
}

export function AiClarifyCard({
  questions,
  onSubmit,
  onSkip,
  labels,
}: AiClarifyCardProps): React.JSX.Element | null {
  const text = { ...DEFAULT_AI_CLARIFY_LABELS, ...labels }
  // Per question: set of selected options + the "Other" free text
  const [picked, setPicked] = useState<Record<string, Set<string>>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  // Latest selections for the delayed auto-submit (the timer closure would
  // otherwise read the pre-click state and drop the final pick)
  const pickedRef = useRef(picked)
  pickedRef.current = picked
  const otherRef = useRef(other)
  otherRef.current = other
  // Pager view-state (one question at a time): back-nav limited to visited
  // range, single-select auto-advances after a beat, typing cancels the pending
  // advance
  const [qIdx, setQIdx] = useState(0)
  const [furthest, setFurthest] = useState(0)
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next')
  const advanceTimerRef = useRef<number | null>(null)

  const cancelAdvance = () => {
    if (advanceTimerRef.current) {
      window.clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }

  useEffect(() => cancelAdvance, [])

  const goTo = (i: number) => {
    cancelAdvance()
    const clamped = Math.max(0, Math.min(i, questions.length - 1))
    setSlideDir(clamped >= qIdx ? 'next' : 'prev')
    setQIdx(clamped)
    setFurthest((f) => Math.max(f, clamped))
  }

  const submit = () => {
    const qa = questions.map((q) => {
      const chosen = [...(pickedRef.current[q.id] ?? [])]
      const ot = (otherRef.current[q.id] ?? '').trim()
      if (ot) chosen.push(ot)
      const ans = chosen.length ? chosen.join(ANSWER_SEPARATOR) : text.decideAnswer
      return { q: q.label, a: ans }
    })
    onSubmit(qa.map(({ q, a }) => `${q}: ${a}`).join('\n'), qa)
  }

  // Single-select: picking advances; picking on the LAST question submits after
  // the same beat (typing in "Other" or navigating cancels the pending action)
  const scheduleAdvance = (from: number) => {
    cancelAdvance()
    const last = from >= questions.length - 1
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null
      if (last) submit()
      else goTo(from + 1)
    }, 250)
  }

  const toggle = (qid: string, opt: string, multi?: boolean, exclusive?: boolean) => {
    setPicked((prev) => {
      const cur = new Set(prev[qid] ?? [])
      if (multi) {
        if (exclusive) {
          cur.clear()
          cur.add(opt)
        } else {
          cur.delete(text.decideAnswer)
          if (cur.has(opt)) cur.delete(opt)
          else cur.add(opt)
        }
      } else {
        cur.clear()
        cur.add(opt)
      }
      return { ...prev, [qid]: cur }
    })
  }

  if (questions.length === 0) return null
  const q = questions[qIdx]
  if (!q) return null
  const isLast = qIdx === questions.length - 1
  const selCount = picked[q.id]?.size ?? 0
  const hasAnswer = selCount > 0 || !!other[q.id]?.trim()

  const renderOpt = (opt: string, label: string) => (
    <button
      key={opt}
      type="button"
      className={`ai-clarify-opt${q.multi ? ' multi' : ''}${picked[q.id]?.has(opt) ? ' ai-clarify-opt-on' : ''}`}
      role={q.multi ? 'checkbox' : 'radio'}
      aria-checked={picked[q.id]?.has(opt) ?? false}
      onClick={() => {
        const isDecide = opt === text.decideAnswer
        toggle(q.id, opt, q.multi, isDecide)
        if (isDecide) {
          setOther((prev) => ({ ...prev, [q.id]: '' }))
          scheduleAdvance(qIdx)
        } else if (q.multi) {
          cancelAdvance()
        } else {
          scheduleAdvance(qIdx)
        }
      }}
    >
      <span className="ai-clarify-opt-box" aria-hidden />
      <span className="ai-clarify-opt-label">{label}</span>
      {!q.multi && (
        <span className="ai-clarify-opt-arrow" aria-hidden>
          ›
        </span>
      )}
    </button>
  )

  return (
    <div className="ai-clarify-card" role="group" aria-label={text.title}>
      <div className="ai-clarify-head">
        <span className="ai-clarify-head-label">{text.title}</span>
        <span className="ai-clarify-head-progress" aria-live="polite">
          {`${qIdx + 1} / ${questions.length}`}
        </span>
        <span className="ai-clarify-head-arrows">
          <button
            type="button"
            className="ai-clarify-head-arrow"
            disabled={qIdx === 0}
            onClick={() => goTo(qIdx - 1)}
            aria-label={text.prev}
          >
            ‹
          </button>
          <button
            type="button"
            className="ai-clarify-head-arrow"
            disabled={qIdx >= furthest || !hasAnswer}
            onClick={() => goTo(qIdx + 1)}
            aria-label={text.next}
          >
            ›
          </button>
        </span>
      </div>
      <div key={q.id} className={`ai-clarify-q slide-${slideDir}`}>
        <div className="ai-clarify-question-head">
          <div className="ai-clarify-label">{q.label}</div>
          {q.multi && <span className="ai-clarify-multi-badge">{text.multi}</span>}
        </div>
        {q.description && <div className="ai-clarify-desc">{q.description}</div>}
        <div className="ai-clarify-opts">
          {q.options.map((opt) => renderOpt(opt, opt))}
          {renderOpt(text.decideAnswer, text.decide)}
        </div>
        <input
          className="ai-clarify-other"
          placeholder={text.other}
          aria-label={text.other}
          value={other[q.id] ?? ''}
          onChange={(e) => {
            cancelAdvance()
            const value = e.target.value
            setOther((p) => ({ ...p, [q.id]: value }))
            if (value.trim()) {
              setPicked((prev) => {
                const cur = new Set(prev[q.id] ?? [])
                cur.delete(text.decideAnswer)
                return { ...prev, [q.id]: cur }
              })
            }
          }}
        />
      </div>
      <div className={`ai-clarify-actions${q.multi ? ' multi' : ''}`}>
        {q.multi && selCount > 0 && (
          <span className="ai-clarify-count">{text.selected(selCount)}</span>
        )}
        <span className="ai-clarify-actions-btns">
          <button type="button" className="ai-clarify-skip" onClick={onSkip}>
            {text.skip}
          </button>
          {isLast ? (
            <button
              type="button"
              className="ai-clarify-submit"
              onClick={submit}
              disabled={!hasAnswer}
            >
              {text.submit}
            </button>
          ) : (
            /* Multi-select waits for an explicit Next; single-select advances by picking. */
            q.multi && (
              <button
                type="button"
                className="ai-clarify-next"
                onClick={() => goTo(qIdx + 1)}
                disabled={!hasAnswer}
                aria-label={text.next}
              >
                <span>{text.next}</span>
                <span className="ai-clarify-next-arrow" aria-hidden>
                  →
                </span>
              </button>
            )
          )}
        </span>
      </div>
    </div>
  )
}
