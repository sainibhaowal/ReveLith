import { describe, expect, it } from 'vitest'
import { requestNeedsWebSearch } from '@revelith/app-chat'

describe('ReveLith chat web tool selection', () => {
  it('does not offer web search for the current form or local form settings', () => {
    expect(requestNeedsWebSearch('Inspect the current form and count its question fields.')).toBe(false)
    expect(requestNeedsWebSearch('Change the current form theme to blue.')).toBe(false)
  })

  it('offers web search for explicit research and time-sensitive external facts', () => {
    expect(requestNeedsWebSearch('Search the web for current accessibility guidance.')).toBe(true)
    expect(requestNeedsWebSearch('What are the latest market prices?')).toBe(true)
  })
})
