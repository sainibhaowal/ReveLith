import { describe, expect, it, vi } from 'vitest'
import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@revelith/ai-provider'
import { chatModelSupportsBoardVision, reviewBoardWithChatModel } from './board-vision'

function settings(provider = 'codex', model = 'gpt-6-luna'): AiSettings {
  return {
    provider: provider as AiSettings['provider'],
    providers: { [provider]: { apiKey: '', model } } as AiSettings['providers'],
  }
}

describe('Draw visual review with the configured chat model', () => {
  it('uses vision capability from the selected chat provider and respects text-only models', () => {
    expect(chatModelSupportsBoardVision(settings())).toBe(true)
    expect(chatModelSupportsBoardVision(settings('deepseek', 'deepseek-v4-pro'))).toBe(false)
  })

  it('sends the exported board image through the normal chat stream and collects its review', async () => {
    let listener: ((chunk: AiStreamChunk) => void) | undefined
    let sent: AiStreamRequest | undefined
    const api = {
      onAiStream: vi.fn((handler: (chunk: AiStreamChunk) => void) => {
        listener = handler
        return vi.fn()
      }),
      aiStream: vi.fn(async (request: AiStreamRequest) => {
        sent = request
        listener?.({ requestId: request.requestId, type: 'delta', text: 'The cabin is centered.' })
        listener?.({ requestId: request.requestId, type: 'done' })
      }),
      aiStreamCancel: vi.fn(async () => undefined),
    }

    const result = await reviewBoardWithChatModel(
      api,
      settings(),
      'data:image/png;base64,ZmFrZS1wbmc=',
      'Review the cabin perspective.',
    )
    expect(result).toEqual({ ok: true, text: 'The cabin is centered.' })
    expect(sent?.messages).toEqual([{
      role: 'user',
      text: 'Review the cabin perspective.',
      images: [{ base64: 'ZmFrZS1wbmc=', mime: 'image/png' }],
    }])
    expect(sent?.tools).toEqual([])
    expect(api.aiStreamCancel).not.toHaveBeenCalled()
  })
})
