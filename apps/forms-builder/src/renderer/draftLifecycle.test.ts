import { describe, expect, it } from 'vitest'
import { consumeNewDocumentFlag } from './draftLifecycle'

describe('fresh form draft lifecycle', () => {
  it('consumes the new-document flag while preserving the session for reload recovery', () => {
    let nextUrl = ''
    const fresh = consumeNewDocumentFlag('file:///forms/index.html?session=session-1&newDocument=1', (href) => { nextUrl = href })

    expect(fresh).toBe(true)
    expect(new URL(nextUrl).searchParams.get('newDocument')).toBeNull()
    expect(new URL(nextUrl).searchParams.get('session')).toBe('session-1')
  })

  it('does not restart an existing session as a blank form after the flag has been consumed', () => {
    let replaced = false
    const fresh = consumeNewDocumentFlag('file:///forms/index.html?session=session-1', () => { replaced = true })

    expect(fresh).toBe(false)
    expect(replaced).toBe(false)
  })
})
