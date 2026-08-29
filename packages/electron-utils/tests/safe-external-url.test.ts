import { describe, expect, it } from 'vitest'

import { safeExternalUrl } from '../src/index'

describe('safeExternalUrl', () => {
  it('accepts http and https URLs', () => {
    expect(safeExternalUrl('https://example.com/a?b=c')).toBe('https://example.com/a?b=c')
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com')
  })

  it('rejects non-string input', () => {
    expect(safeExternalUrl(undefined)).toBeNull()
    expect(safeExternalUrl(null)).toBeNull()
    expect(safeExternalUrl(42)).toBeNull()
    expect(safeExternalUrl({ toString: () => 'https://example.com' })).toBeNull()
  })

  it('rejects mailto schemes to prevent external email clients from popping', () => {
    expect(safeExternalUrl('mailto:test@example.com')).toBeNull()
    expect(safeExternalUrl('MAILTO:test@example.com')).toBeNull()
    expect(safeExternalUrl('mailto:test@example.com?subject=hi')).toBeNull()
  })

  it('rejects dangerous protocols by default', () => {
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull()
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('smb://server/share')).toBeNull()
    expect(safeExternalUrl('mailto:test@example.com')).toBeNull()
    // prefix tricks that pass a bare startsWith('http') check
    expect(safeExternalUrl('httpx://evil.example')).toBeNull()
  })

  it('supports a custom protocol allowlist', () => {
    const opts = { allowedProtocols: ['https:', 'mailto:'] }
    expect(safeExternalUrl('mailto:test@example.com', opts)).toBe('mailto:test@example.com')
    expect(safeExternalUrl('http://example.com', opts)).toBeNull()
  })
})
