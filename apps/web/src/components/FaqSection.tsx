import React, { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FAQ_ITEMS } from '../data/suite-data'

/**
 * One FAQ row.
 *
 * The open/close height is driven by a measured pixel value rather than the
 * `grid-template-rows: 0fr -> 1fr` trick — that technique silently collapses
 * to 0px in this layout (the browser computed `1fr` as `0px`), so the panel
 * never opened. `scrollHeight` is measured on the inner content instead, which
 * is also re-measured on resize so the row stays correct when text rewraps.
 */
const FaqRow: React.FC<{
  q: string
  a: string
  open: boolean
  onToggle: () => void
  idBase: string
}> = ({ q, a, open, onToggle, idBase }) => {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState(0)

  // Measure the rendered content box rather than scrollHeight: an element whose
  // ancestor is clipped by max-height:0 reports scrollHeight 0, which would
  // leave the row permanently collapsed.
  useEffect(() => {
    const node = innerRef.current
    if (!node) return

    const measure = () => {
      const content = node.firstElementChild as HTMLElement | null
      const next = Math.ceil(
        node.getBoundingClientRect().height || content?.getBoundingClientRect().height || 0,
      )
      setHeight(next)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [a])

  const panelId = `${idBase}-panel`
  const buttonId = `${idBase}-button`

  return (
    <div className={open ? 'faq-item is-open' : 'faq-item'}>
      <h3 className="faq-q">
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>{q}</span>
          <ChevronDown className="faq-chevron" size={18} aria-hidden="true" />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className="faq-panel"
        style={{ maxHeight: open ? height : 0 }}
      >
        <div className="faq-panel-inner" ref={innerRef}>
          <p>{a}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * "Good to know before you start" — the pre-purchase questions the rest of the
 * page raises but never answers in one place.
 *
 * Real buttons rather than <details> so the height can be animated and the ARIA
 * wiring stays explicit. Copy is in the DOM whether open or closed, so it stays
 * reachable by search engines and in-page find.
 */
export const FaqSection: React.FC = () => {
  const [open, setOpen] = useState<number | null>(0)
  const baseId = useId()

  return (
    <section className="faq-section" id="faq" aria-labelledby="faq-heading">
      <div className="faq-heading scroll-reveal">
        <span className="eyebrow">Questions, answered</span>
        <h2 id="faq-heading">
          Good to know before you
          <br />
          start.
        </h2>
      </div>

      <div className="faq-list scroll-reveal">
        {FAQ_ITEMS.map((item, i) => (
          <FaqRow
            key={item.q}
            q={item.q}
            a={item.a}
            open={open === i}
            onToggle={() => setOpen(open === i ? null : i)}
            idBase={`${baseId}-${i}`}
          />
        ))}
      </div>
    </section>
  )
}

export default FaqSection
