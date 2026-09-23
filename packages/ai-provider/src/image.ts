import { aiFetch } from './fetch'
import { httpBodyDetail } from './http-error'
import type { AiProviderConfig, AiProviderId } from './types'

export interface AiImageResult {
  ok: boolean
  url?: string
  error?: string
}

const OPENAI_IMAGE_BASE_URLS: Partial<Record<AiProviderId, string>> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
}

/**
 * Generate an image through the selected provider only. OpenAI-compatible local
 * servers can implement /v1/images/generations; unsupported text-only servers
 * return a capability error and are never replaced by a hosted fallback.
 */
export async function generateImageForProvider(
  provider: AiProviderId,
  config: AiProviderConfig,
  prompt: string,
  options: { model?: string; aspectRatio?: string } = {},
): Promise<AiImageResult> {
  if (provider === 'anthropic' || provider === 'gemini') {
    return {
      ok: false,
      error: `${provider} image generation is not available through this provider API. Select an OpenAI-compatible image server.`,
    }
  }
  const baseUrl = config.baseUrl || OPENAI_IMAGE_BASE_URLS[provider]
  if (!baseUrl) return { ok: false, error: 'The selected provider has no Base URL.' }
  const cleanBase = baseUrl.replace(/\/$/, '')
  const body: Record<string, unknown> = {
    prompt,
    n: 1,
    response_format: 'b64_json',
  }
  const model = options.model || config.model
  if (model) body.model = model
  if (options.aspectRatio) body.aspect_ratio = options.aspectRatio
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`

  let response: Response
  try {
    response = await aiFetch(`${cleanBase}/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  if (!response.ok) {
    const detail = httpBodyDetail(await response.text())
    if (response.status === 404 || response.status === 405) {
      return {
        ok: false,
        error: `The selected provider does not expose image generation (${response.status}). Configure an image-capable OpenAI-compatible server.`,
      }
    }
    return { ok: false, error: `Image generation failed (HTTP ${response.status}): ${detail}` }
  }
  const json = (await response.json().catch(() => null)) as
    | { data?: Array<{ url?: string; b64_json?: string }> }
    | null
  const image = json?.data?.[0]
  if (image?.url) return { ok: true, url: image.url }
  if (image?.b64_json) return { ok: true, url: `data:image/png;base64,${image.b64_json}` }
  return { ok: false, error: 'The image provider returned no image URL or image data.' }
}
