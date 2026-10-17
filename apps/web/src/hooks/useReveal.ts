import { useEffect } from 'react'

/**
 * Bidirectional scroll reveal.
 *
 * Every element carrying a `scroll-reveal*` class starts hidden (see
 * index.css) and gains `is-visible` when it enters the viewport, then loses
 * it again once it leaves. Because the class is removed on exit, the
 * animation replays when the element is scrolled back into view — so content
 * animates in on the way down *and* on the way up.
 *
 * Elements already on screen at mount are revealed immediately.
 */
export function useReveal(): void {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[class*="scroll-reveal"]'))
    if (nodes.length === 0) return

    // Honour the user's motion preference: show everything, animate nothing.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      nodes.forEach((n) => n.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            continue
          }
          // Only re-hide elements that are genuinely below the fold, so the
          // animation can replay on the way back up.
          const { bottom } = entry.boundingClientRect
          const belowFold = bottom > window.innerHeight + 8
          if (belowFold) entry.target.classList.remove('is-visible')
        }
      },
      {
        // Reach below the fold so content reveals just before it is scrolled
        // into view, but never hide anything already on screen. The margin is
        // deliberately generous: a tight negative margin can permanently
        // dead-lock elements that sit in the final viewport of the document.
        rootMargin: '0px 0px 160px 0px',
        threshold: 0,
      },
    )

    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [])
}

/**
 * Applies `is-stuck` to the header once the page has scrolled past the
 * utility bar, so the sticky bar can condense and gain a shadow.
 */
export function useStickyHeader(): void {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.site-header')
    if (!header) return
    const onScroll = () => {
      header.classList.toggle('is-stuck', window.scrollY > 36)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
}

/**
 * Drives the document scroll-progress indicator in the top bar and exposes
 * scroll position as a CSS variable for the hero parallax.
 */
export function useScrollProgress(): void {
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const doc = document.documentElement
      const max = Math.max(1, doc.scrollHeight - window.innerHeight)
      const progress = Math.min(1, Math.max(0, window.scrollY / max))
      doc.style.setProperty('--scroll-progress', progress.toFixed(4))
    }
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])
}
