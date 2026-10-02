/**
 * Context-menu submenu reliability fix.
 * Univer's ContextMenuMenuItem component has an issue where re-entering
 * an item with a submenu while the 500ms close delay timer is active (or on quick mouse movements)
 * sets `submenuPositionReady` to false while `submenuVisible` remains true. Because
 * the positioning effect only depends on `[submenuVisible]`, it fails to re-run,
 * leaving the submenu hidden with `visibility: hidden` and `pointerEvents: none`.
 *
 * This fix monitors mouseover/mousemove over context menu items and immediately
 * restores visibility, correct positioning, and interactive pointer events on the submenu
 * so submenus reopen reliably every time.
 */

export function installSubmenuFix(): { dispose(): void } {
  const onPointerEnterOrMove = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null
    if (!target) return
    const menuItem = target.closest<HTMLElement>('.univer-relative')
    if (!menuItem) return

    // Look for active submenu in document.body
    const submenu = document.querySelector<HTMLElement>('[data-u-context-menu-submenu="true"]')
    if (!submenu) return

    if (submenu.style.visibility === 'hidden' || submenu.style.pointerEvents === 'none') {
      const itemRect = menuItem.getBoundingClientRect()
      const subRect = submenu.getBoundingClientRect()
      const useLeft =
        itemRect.right + subRect.width + 8 > window.innerWidth && itemRect.left - subRect.width >= 8
      const left = useLeft ? itemRect.left - subRect.width + 2 : itemRect.right - 2
      const maxTop = window.innerHeight - 8 - subRect.height
      const top = maxTop < 8 ? 8 : Math.min(Math.max(itemRect.top, 8), Math.max(8, maxTop))

      submenu.style.left = `${left}px`
      submenu.style.top = `${top}px`
      submenu.style.visibility = 'visible'
      submenu.style.pointerEvents = 'auto'
    }
  }

  document.addEventListener('mouseover', onPointerEnterOrMove, true)
  document.addEventListener('mousemove', onPointerEnterOrMove, true)

  return {
    dispose() {
      document.removeEventListener('mouseover', onPointerEnterOrMove, true)
      document.removeEventListener('mousemove', onPointerEnterOrMove, true)
    },
  }
}
