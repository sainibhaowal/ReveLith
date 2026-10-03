import { describe, expect, it } from 'vitest'
import { claimsSelection, verifySheetsResponse } from '../src/renderer/ai/response-verify'
import { pruneFailedExchange } from '../src/renderer/ai/retry-prune'
import type { AiChatMessage } from '../src/renderer/ai/AiChatPanel'

describe('claimsSelection', () => {
  it('detects narrated selection actions', () => {
    expect(claimsSelection('I have selected the range B2:C4 for you')).toBe(true)
    expect(claimsSelection("I've highlighted the errors")).toBe(true)
    expect(claimsSelection('The selection has been moved to column D')).toBe(true)
    expect(claimsSelection('已选中B2:C4区域')).toBe(true)
  })

  it('ignores instructions and plain summaries', () => {
    expect(claimsSelection('Done. Please select the rows to continue.')).toBe(false)
    expect(claimsSelection('The already-selected range looks fine.')).toBe(false)
    expect(claimsSelection('Here is a summary of the sheet.')).toBe(false)
    expect(claimsSelection('I selected the data first, then computed the total.')).toBe(true)
  })
})

describe('verifySheetsResponse', () => {
  it('passes clean replies and real select_range runs', () => {
    expect(verifySheetsResponse('Here is a summary.', [])).toBeNull()
    expect(
      verifySheetsResponse('I have selected B2 for you', [{ name: 'select_range', ok: true }]),
    ).toBeNull()
  })

  it('corrects claimed selections with no successful call', () => {
    const correction = verifySheetsResponse('I already located C10 for you', [
      { name: 'read_range', ok: true },
    ])
    expect(correction).toContain('select_range')
    const failed = verifySheetsResponse('I have selected B2', [{ name: 'select_range', ok: false }])
    expect(failed).toContain('select_range')
  })
})

const user = (text: string, extra: Partial<AiChatMessage> = {}): AiChatMessage => ({
  role: 'user',
  text,
  tools: [],
  ...extra,
})

const assistant = (text: string, extra: Partial<AiChatMessage> = {}): AiChatMessage => ({
  role: 'assistant',
  text,
  tools: [],
  ...extra,
})

describe('pruneFailedExchange', () => {
  it('drops the failed bubble and its paired error reply', () => {
    const chat = [
      user('a'),
      assistant('ok'),
      user('b', { undelivered: true }),
      assistant('boom', { isError: true }),
    ]
    expect(pruneFailedExchange(chat, 2)).toEqual([user('a'), assistant('ok')])
  })

  it('drops a lone failed bubble and leaves healthy chats alone', () => {
    expect(pruneFailedExchange([user('b', { undelivered: true })], 0)).toEqual([])
    const healthy = [user('a'), assistant('ok')]
    expect(pruneFailedExchange(healthy, 0)).toBe(healthy)
    expect(pruneFailedExchange(healthy, 5)).toBe(healthy)
  })
})
