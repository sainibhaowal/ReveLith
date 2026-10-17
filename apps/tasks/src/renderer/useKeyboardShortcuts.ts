import { useEffect } from 'react'

/**
 * Global keyboard shortcuts.
 *
 * Every binding is inert while the user is typing, so a task description full of
 * the letter "n" never spawns a new task. Bindings are declared here rather
 * than scattered across components so the full map lives in one place.
 */

export interface ShortcutHandlers {
  /** `n` — new task. */
  onNewTask: () => void
  /** `/` or `f` — focus the search box. */
  onFocusSearch: () => void
  /** `Escape` — close the topmost panel. */
  onEscape: () => void
  /** `1`–`9` — move the selected task into the nth column. */
  onMoveToColumn: (index: number) => void
  /** `u` — undo. */
  onUndo: () => void
  /** `Ctrl/Cmd+Shift+Z` — redo. */
  onRedo: () => void
  /** `?` - toggle the shortcut help sheet. */
  onToggleHelp: () => void
  /** `Ctrl/Cmd+K` - open the command palette. */
  onCommandPalette: () => void
  canMoveToColumn: boolean
  canUndo: boolean
}

/** True when the event target is somewhere the user types. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey

      // Undo/redo work even while typing, so a mistake in a description is fixable.
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) handlers.onRedo()
        else handlers.onUndo()
        return
      }

      // The command palette owns Ctrl/Cmd+K, including while typing.
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        handlers.onCommandPalette()
        return
      }

      if (event.key === 'Escape') {
        handlers.onEscape()
        return
      }

      if (isTypingTarget(event.target) || modifier || event.altKey) return

      switch (event.key.toLowerCase()) {
        case 'n':
          event.preventDefault()
          handlers.onNewTask()
          return
        case '/':
        case 'f':
          event.preventDefault()
          handlers.onFocusSearch()
          return
        case 'u':
          event.preventDefault()
          handlers.onUndo()
          return
        case '?':
          event.preventDefault()
          handlers.onToggleHelp()
          return
        default:
          break
      }

      // Number keys move the open task into a column.
      const index = Number(event.key)
      if (Number.isInteger(index) && index >= 1 && index <= 9 && handlers.canMoveToColumn) {
        event.preventDefault()
        handlers.onMoveToColumn(index - 1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers])
}

/** Shown in the shortcut help sheet. */
export const SHORTCUT_HELP: { keys: string; description: string }[] = [
  { keys: 'n', description: 'New task' },
  { keys: '/ or f', description: 'Focus search' },
  { keys: '1 – 9', description: 'Move the open task to that column' },
  { keys: 'u', description: 'Undo' },
  { keys: 'Ctrl/⌘ + Z', description: 'Undo' },
  { keys: 'Ctrl/⌘ + ⇧ + Z', description: 'Redo' },
  { keys: 'Ctrl/Cmd + K', description: 'Open or close the command palette' },
  { keys: 'Escape', description: 'Close the open panel' },
  { keys: '?', description: 'Show or hide this help' },
]
