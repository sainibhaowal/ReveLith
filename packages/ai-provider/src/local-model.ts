import { aiFetch } from './fetch'
import type { AiProviderConfig, AiProviderId } from './types'

/**
 * LM Studio exposes actual model ids at /v1/models, while a fresh ReveLith
 * profile only has the neutral `local-model` placeholder. Resolve it lazily so
 * a first-run local installation works without manually typing a model id.
 */
export async function resolveLocalModelConfig(
  provider: AiProviderId,
  config: AiProviderConfig,
  signal?: AbortSignal,
): Promise<AiProviderConfig> {
  if (provider !== 'lmstudio' || config.model !== 'local-model') return config
  const baseUrl = (config.baseUrl || 'http://localhost:1234/v1').replace(/\/$/, '')
  try {
    const response = await aiFetch(`${baseUrl}/models`, {
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    })
    if (!response.ok) return config
    const body = (await response.json()) as { data?: Array<{ id?: string }> }
    const model = body.data
      ?.map((entry) => entry.id?.trim() ?? '')
      .find((id) => id.length > 0 && !/embed|rerank/i.test(id))
    return model ? { ...config, model } : config
  } catch {
    return config
  }
}
