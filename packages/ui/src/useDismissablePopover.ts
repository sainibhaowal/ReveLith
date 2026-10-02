/**
 * Popover dismissal for the ribbon menus and anchored palettes.
 *
 * A popover is "open" React state plus DOM nodes rendered somewhere else (a
 * portal, or a hand-built menu in a ProseMirror plugin). Two rules keep it
 * usable without each call site re-implementing them: a pointer press outside
 * the listed elements closes it, and Escape closes it and returns focus to the
 * anchor.
 */
import { useEffect } from 'react'

export interface DismissablePopoverOptions {
  /**
   * Elements that count as "inside": the trigger and the popover body. A press
   * on any of them must not close the popover (otherwise picking a color or
   * typing in a field would dismiss it mid-gesture).
   */
  inside: () => Array<HTMLElement | null>
  /** element to refocus on Escape; defaults to the first inside element */
  returnFocusTo?: () => HTMLElement | null
  /** also close on window blur (a click into another app) */
  closeOnBlur?: boolean
}

/**
 * While `open`, wire outside-press and Escape. Returns nothing; the host owns
 * the open state and is told to close via `onClose`.
 */
export function useDismissablePopover(
  open: boolean,
  onClose: () => void,
  options: DismissablePopoverOptions,
): void {
  const { inside, returnFocusTo, closeOnBlur = true } = options

  useEffect(() => {
    if (!open) return
    return installPopoverDismiss(onClose, options)
  }, [open, onClose, inside, returnFocusTo, closeOnBlur])
}

/** Event the renderer dispatches when the shell chrome was pressed. */
export const CHROME_PRESS_EVENT = 'revelith:chrome-press'

/**
 * Framework-free sibling of `useDismissablePopover`, for popovers owned outside
 * React (a ProseMirror plugin's block menu, a command palette). Returns the
 * teardown function, so a caller that can be torn down twice is safe.
 *
 * The `app:chrome-press` bridge matters because the shell's tab strip is a
 * sibling WebContentsView: pressing it produces no DOM event in this document,
 * so without the main-process relay an open popover would survive a click on
 * the shell chrome.
 */
export function installPopoverDismiss(
  onClose: () => void,
  options: DismissablePopoverOptions,
): () => void {
  const { inside, returnFocusTo, closeOnBlur = true } = options

  const isInside = (target: EventTarget | null) =>
    target instanceof Node && inside().some((el) => el?.contains(target))

  // mousedown (not click): the handler must run before a click lands on the
  // element underneath, or that click would also fire the dismissed command.
  const onPointerDown = (event: MouseEvent) => {
    if (isInside(event.target)) return
    onClose()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onClose()
    const focusTarget = returnFocusTo?.() ?? inside()[0]
    focusTarget?.focus()
  }
  const onWindowBlur = () => {
    if (closeOnBlur) onClose()
  }
  const onChromePress = () => onClose()

  document.addEventListener('mousedown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener(CHROME_PRESS_EVENT, onChromePress)

  return () => {
    document.removeEventListener('mousedown', onPointerDown, true)
    document.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('blur', onWindowBlur)
    window.removeEventListener(CHROME_PRESS_EVENT, onChromePress)
  }
}
