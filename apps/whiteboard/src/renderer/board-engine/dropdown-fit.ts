// ReveLith Drawboard — keep engine dropdown menus inside the viewport,
// and the library "..." menu inside the sidebar panel (it otherwise hangs
// off the panel's left edge, showing only an "Open" sliver).

const MENU_SELECTOR = '.dropdown-menu'
const MARGIN = 8

/** style.left resolves against the offset parent — convert viewport coords. */
function setLeftViewport(el: HTMLElement, targetViewportLeft: number): void {
  const op = el.offsetParent as HTMLElement | null
  const base = op ? op.getBoundingClientRect().left : 0
  el.style.left = `${Math.round(targetViewportLeft - base)}px`
  el.style.right = 'auto'
}

function fitViewportMenu(el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return
  let left = rect.left
  if (left < MARGIN) left = MARGIN
  const overflowRight = left + rect.width - (window.innerWidth - MARGIN)
  if (overflowRight > 0) left = Math.max(MARGIN, left - overflowRight)
  if (left !== rect.left) setLeftViewport(el, left)
  const maxHeight = window.innerHeight - MARGIN * 2
  if (rect.height > maxHeight) {
    el.style.maxHeight = `${Math.round(maxHeight)}px`
    el.style.overflowY = 'auto'
  }
}

/** Dock library menus inside their sidebar panel with an 8px margin. */
function fitLibraryMenu(el: HTMLElement): void {
  let panel: HTMLElement | null = null
  let p: HTMLElement | null = el.parentElement
  while (p) {
    const r = p.getBoundingClientRect()
    if (r.width > 220 && r.height > 300) {
      panel = p
      break
    }
    p = p.parentElement
  }
  if (!panel) {
    fitViewportMenu(el)
    return
  }
  const pr = panel.getBoundingClientRect()
  const mr = el.getBoundingClientRect()
  if (mr.width === 0) return
  const minLeft = pr.left + MARGIN
  const maxLeft = pr.right - MARGIN - mr.width
  let target = mr.left
  if (target < minLeft) target = minLeft
  if (target > maxLeft) target = Math.max(minLeft, maxLeft)
  if (target !== mr.left) setLeftViewport(el, target)
}

export function fitDropdowns(root: ParentNode = document): void {
  const menus = root.querySelectorAll(MENU_SELECTOR)
  menus.forEach((node) => {
    const el = node as HTMLElement
    if (el.classList.contains('library-menu')) fitLibraryMenu(el)
    else fitViewportMenu(el)
  })
}

/** Watch the document and refit menus whenever one opens or moves. */
export function installDropdownFit(): () => void {
  fitDropdowns()
  let scheduled = false
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      fitDropdowns()
    })
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  })
  const onResize = () => fitDropdowns()
  window.addEventListener('resize', onResize)
  return () => {
    observer.disconnect()
    window.removeEventListener('resize', onResize)
  }
}
