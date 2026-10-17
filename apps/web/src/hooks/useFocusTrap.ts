import { useEffect, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Keeps keyboard focus inside an open dialog.
 *
 * Escape, scroll-lock and initial focus are handled by the dialog itself; this
 * covers the remaining hole — Tab walking out of the dialog and into the page
 * behind it, which is invisible to sighted keyboard users and confusing to
 * screen-reader users.
 *
 * Focus is restored to whatever was focused before the dialog opened.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const node = ref.current
    if (!active || !node) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const visibleFocusable = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const items = visibleFocusable()
      if (items.length === 0) {
        // Nothing focusable inside: keep focus on the dialog itself.
        event.preventDefault()
        node.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement

      if (event.shiftKey) {
        if (current === first || current === node || !node.contains(current)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (current === last || !node.contains(current)) {
        event.preventDefault()
        first.focus()
      }
    }

    // Capture phase so the trap wins before anything inside can react.
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused?.focus?.()
    }
  }, [ref, active])
}

export default useFocusTrap
