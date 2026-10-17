import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

vi.mock('@revelith/app-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@revelith/app-chat')>()
  return { ...actual, AppChatPanel: () => null }
})

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('confirm', () => true)
  vi.stubGlobal('alert', () => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Forms app shell', () => {
  it('explains local form hosting and persists the dismissal independently', () => {
    render(<App />)
    const notice = screen.getByRole('complementary', {
      name: 'AI Forms is local-first, not a hosted service',
    })
    expect(notice.textContent).toContain("responses won't sync back here")

    fireEvent.click(screen.getByRole('button', { name: "Don't show again" }))
    expect(window.localStorage.getItem('revelith-forms-builder/local-first-notice-dismissed')).toBe(
      '1',
    )
  })
})
