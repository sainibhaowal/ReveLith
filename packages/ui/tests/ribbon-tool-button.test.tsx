/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RibbonQuickButton, RibbonToolButton } from '../src/RibbonToolButton'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (element: ReactNode) => act(() => root.render(element))

describe('shared ribbon controls', () => {
  it('preserves accessible names, ScreenTip details, toggle state, and command callbacks', () => {
    const onClick = vi.fn()
    render(
      createElement(RibbonToolButton, {
        icon: createElement('svg', { 'data-testid': 'ribbon-icon' }),
        label: 'Undo',
        tooltip: 'Undo the last change',
        shortcut: 'Ctrl+Z',
        onClick,
        active: true,
        pressed: true,
      }),
    )

    const button = host.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('Undo')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('data-tip')).toBe('Undo the last change')
    expect(button.getAttribute('data-tip-kbd')).toBe('Ctrl+Z')
    expect(button.hasAttribute('title')).toBe(false)
    expect(button.querySelector('[data-testid="ribbon-icon"]')).toBeTruthy()
    act(() => button.click())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('keeps quick actions compact, named, and disabled commands inert', () => {
    const onClick = vi.fn()
    render(
      createElement(RibbonQuickButton, {
        icon: createElement('svg'),
        label: 'Save',
        tooltip: 'Save this document',
        onClick,
        disabled: true,
      }),
    )

    const button = host.querySelector('button')!
    expect(button.classList.contains('revelith-ribbon-tool--quick')).toBe(true)
    expect(button.getAttribute('aria-label')).toBe('Save')
    expect(button.getAttribute('data-tip')).toBe('Save this document')
    expect(button.querySelector('.revelith-ribbon-tool-label')).toBeNull()
    expect(button.disabled).toBe(true)
    act(() => button.click())
    expect(onClick).not.toHaveBeenCalled()
  })
})
