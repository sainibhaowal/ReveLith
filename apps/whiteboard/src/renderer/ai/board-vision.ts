import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@revelith/ai-provider'
import { getProviderAdapter, modelLacksVision } from '@revelith/ai-provider/browser'

export interface BoardVisionApi {
  aiStream(request: AiStreamRequest): Promise<void>
  aiStreamCancel(requestId: string): Promise<void>
  onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
}

export function chatModelSupportsBoardVision(settings: AiSettings): boolean {
  const model = settings.providers[settings.provider]?.model ?? ''
  return getProviderAdapter(settings.provider).capabilities.vision && !modelLacksVision(model)
}

/** Review an exported board image with the user's selected chat model. */
export async function reviewBoardWithChatModel(
  api: BoardVisionApi,
  settings: AiSettings,
  imageDataUrl: string,
  requirements: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/i.exec(imageDataUrl)
  if (!match) return { ok: false, error: 'The rendered board image could not be decoded.' }

  const requestId = `draw-visual-review-${crypto.randomUUID()}`
  const mime = match[1]!.toLowerCase()
  const base64 = match[2]!
  const request: AiStreamRequest = {
    requestId,
    settings,
    system:
      'You are ReveLith Draw’s visual quality reviewer. Inspect the supplied board image against the user requirements. ' +
      'Describe only visible evidence, point out specific composition, legibility, overlap, alignment, perspective, or rendering defects, ' +
      'and give concise actionable corrections. Do not claim to edit the drawing.',
    messages: [{ role: 'user', text: requirements, images: [{ base64, mime }] }],
    tools: [],
    maxTokens: 1800,
  }

  return new Promise((resolve) => {
    let settled = false
    let text = ''
    let unsubscribe: () => void = () => undefined
    const finish = (result: { ok: boolean; text?: string; error?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      resolve(result)
    }
    const timer = setTimeout(() => {
      void api.aiStreamCancel(requestId)
      finish({ ok: false, error: 'Visual review timed out.' })
    }, 200_000)

    unsubscribe = api.onAiStream((chunk) => {
      if (chunk.requestId !== requestId) return
      if (chunk.type === 'delta') text += chunk.text ?? ''
      if (chunk.type === 'error')
        finish({ ok: false, error: chunk.error ?? 'The chat model could not review this drawing.' })
      if (chunk.type === 'done') {
        finish(
          text.trim()
            ? { ok: true, text: text.trim() }
            : { ok: false, error: 'The chat model returned no visual assessment.' },
        )
      }
    })
    void api.aiStream(request).catch((error: unknown) => {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) })
    })
  })
}
