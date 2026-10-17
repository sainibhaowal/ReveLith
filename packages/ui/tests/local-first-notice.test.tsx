/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalFirstNotice } from '../src/LocalFirstNotice'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function renderNotice(storageKey: string, title: string) {
  act(() =>
    root.render(createElement(LocalFirstNotice, { storageKey, title }, 'Local-first explanation.')),
  )
}

describe('local-first notice', () => {
  it('appears on first open and remembers the dismiss choice', () => {
    renderNotice('tasks-notice', 'AI Tasks is local-first')
    expect(host.textContent).toContain('Local-first explanation.')

    act(() => host.querySelector('button')?.click())
    expect(window.localStorage.getItem('tasks-notice')).toBe('1')
    expect(host.querySelector('aside')?.classList.contains('is-leaving')).toBe(true)

    act(() => root.unmount())
    root = createRoot(host)
    renderNotice('tasks-notice', 'AI Tasks is local-first')
    expect(host.querySelector('aside')).toBeNull()
  })

  it('keeps dismissal scoped to the individual app key', () => {
    window.localStorage.setItem('tasks-notice', '1')
    renderNotice('forms-notice', 'AI Forms is local-first')
    expect(host.textContent).toContain('AI Forms is local-first')
  })
})
