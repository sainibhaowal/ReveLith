import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitDropdowns } from './board-engine/dropdown-fit'

function menuAt(x: number, w: number, h = 200): HTMLElement {
  const el = document.createElement('div')
  el.className = 'dropdown-menu'
  document.body.appendChild(el)
  el.getBoundingClientRect = () =>
    ({
      x,
      y: 100,
      width: w,
      height: h,
      top: 100,
      left: x,
      right: x + w,
      bottom: 100 + h,
      toJSON: () => ({}),
    }) as DOMRect
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('dropdown fit', () => {
  it('pulls menus clipped off the left edge into view', () => {
    const el = menuAt(-50, 200)
    fitDropdowns()
    expect(el.style.left).toBe('8px')
  })

  it('pulls menus overflowing the right edge into view', () => {
    vi.stubGlobal('innerWidth', 500)
    const el = menuAt(400, 200)
    fitDropdowns()
    // 400 + 200 - (500 - 8) = 108 overflow -> left 292
    expect(el.style.left).toBe('292px')
  })

  it('leaves fitting menus untouched', () => {
    const el = menuAt(100, 200)
    fitDropdowns()
    expect(el.style.left).toBe('')
  })

  it('docks library menus inside their sidebar panel', () => {
    const panel = document.createElement('div')
    panel.className = 'sidebar-panel'
    document.body.appendChild(panel)
    panel.getBoundingClientRect = () =>
      ({
        x: 986,
        y: 100,
        width: 294,
        height: 600,
        top: 100,
        left: 986,
        right: 1280,
        bottom: 700,
        toJSON: () => ({}),
      }) as DOMRect
    const menu = document.createElement('div')
    menu.className = 'dropdown-menu library-menu'
    panel.appendChild(menu)
    menu.getBoundingClientRect = () =>
      ({
        x: 956,
        y: 400,
        width: 196,
        height: 42,
        top: 400,
        left: 956,
        right: 1152,
        bottom: 442,
        toJSON: () => ({}),
      }) as DOMRect
    fitDropdowns()
    // panel left 986 + margin 8 -> 994 (offsetParent is null in jsdom, so viewport coords)
    expect(menu.style.left).toBe('994px')
  })
})
