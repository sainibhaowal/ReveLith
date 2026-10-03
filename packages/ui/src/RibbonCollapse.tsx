/**
 * Collapsible-ribbon behavior (Office-style): the tab row stays, the command
 * groups fold away. The preference is persisted per app key so each editor
 * remembers its own state, and the two chevron buttons are shared so every
 * app's ribbon chrome matches.
 *
 * Word's interaction is the model: double-click the tab row (or Ctrl+F1)
 * toggles, and clicking the already-active tab folds the ribbon away.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement, RefObject } from 'react'

/** Localized labels for the two chevron buttons and the tab tooltips. */
export interface RibbonCollapseOptions {
  collapse: string
  expand: string
}

/** Everything a host threads through its ribbon chrome. */
export interface RibbonCollapseState {
  collapsed: boolean
  /** class for the ribbon root: marks the folded state */
  rootClass: string
  /** attach to the ribbon root (the double-click target) */
  rootRef: RefObject<HTMLDivElement | null>
  onTabsDoubleClick: () => void
  /** class for a tab button */
  tabClass(active: boolean): string
  /** tooltip for a tab button: what a double-click does right now */
  tabTip(active: boolean): string
  /** called when a tab is pressed; `wasActive` is Word's "click again to fold" */
  onTabPress(wasActive: boolean): void
  collapseLabel: string
  expandLabel: string
  toggle: () => void
}

const readStored = (key: string): boolean | null => {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return raw === '1' || raw === 'true'
  } catch {
    return null
  }
}

const writeStored = (key: string, collapsed: boolean) => {
  try {
    localStorage.setItem(key, collapsed ? '1' : '0')
  } catch {
    /* private mode: the ribbon just will not remember */
  }
}

/**
 * Ribbon collapse state, persisted under `key`. The hook also honors the
 * app-wide toggle dispatched by the shell, so a fold started in one editor is
 * reflected in every open editor of the same app.
 */
export function useRibbonCollapse(
  key: string,
  options: RibbonCollapseOptions,
): RibbonCollapseState {
  const [collapsed, setCollapsed] = useState<boolean>(() => readStored(key) ?? false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const setCollapsedState = useCallback(
    (next: boolean) => {
      setCollapsed(next)
      writeStored(key, next)
    },
    [key],
  )

  const toggle = useCallback(() => setCollapsedState(!collapsed), [collapsed, setCollapsedState])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'F1') return
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      setCollapsedState(!collapsed)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, setCollapsedState])

  // another surface (the chevron button, a keyboard shortcut in another view)
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed?: boolean }>).detail
      if (typeof detail?.collapsed === 'boolean') setCollapsedState(detail.collapsed)
    }
    window.addEventListener('revelith-ribbon-collapse', onChange)
    return () => window.removeEventListener('revelith-ribbon-collapse', onChange)
  }, [setCollapsedState])

  return {
    collapsed,
    rootClass: collapsed ? 'ribbon-collapsed' : '',
    rootRef,
    onTabsDoubleClick: toggle,
    tabClass: (active: boolean) => (active ? 'active' : ''),
    tabTip: () => (collapsed ? options.expand : options.collapse),
    onTabPress: (wasActive: boolean) => {
      // pressing the active tab folds the ribbon; pressing a different tab
      // switches to it, and if the ribbon was folded it has to come back
      if (wasActive) setCollapsedState(!collapsed)
      else if (collapsed) setCollapsedState(false)
    },
    collapseLabel: options.collapse,
    expandLabel: options.expand,
    toggle,
  }
}

interface RibbonCollapseButtonProps {
  state: RibbonCollapseState
  label?: string
}

/** Chevron shown on the collapsed ribbon to bring it back. */
export function RibbonExpandButton({ state, label }: RibbonCollapseButtonProps): ReactElement {
  return (
    <button
      type="button"
      className="ribbon-expand-button"
      title={label ?? state.expandLabel}
      aria-label={label ?? state.expandLabel}
      aria-expanded={false}
      onClick={state.toggle}
    >
      <span className="ribbon-chevron" aria-hidden="true">
        ▲
      </span>
    </button>
  )
}

/** Chevron shown on the expanded ribbon to fold the command groups away. */
export function RibbonCollapseButton({ state, label }: RibbonCollapseButtonProps): ReactElement {
  return (
    <button
      type="button"
      className="ribbon-collapse-button"
      title={label ?? state.collapseLabel}
      aria-label={label ?? state.collapseLabel}
      aria-expanded
      onClick={state.toggle}
    >
      <span className="ribbon-chevron" aria-hidden="true">
        ▼
      </span>
    </button>
  )
}
