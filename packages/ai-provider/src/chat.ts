import { chatAnthropic } from './protocols/anthropic'
import { chatGemini } from './protocols/gemini'
import { chatOpenAiCompatible } from './protocols/openai-compatible'
import { ResponseBodyTooLargeError } from './protocols/shared'
import { chatCodexAppServer } from './codex-app-server'
import { listCustomModels } from './custom-models'
import { getProviderAdapter, type ResolvedEndpoint } from './registry'
import type { AiChatResponse, AiProviderConfig, AiProviderId } from './types'
import { AI_CHAT_RESPONSE_TIMEOUT_MS, createStreamWatchdog } from './watchdog'

/** route a one-shot (non-streaming, non-tool-calling) chat call by provider id */
export async function chatForProvider(
  provider: AiProviderId,
  config: AiProviderConfig,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  // non-streaming: the server generates the full answer before the headers arrive,
  // so the connect phase gets the long budget; the body read then gets the idle budget
  const wd = createStreamWatchdog(signal, AI_CHAT_RESPONSE_TIMEOUT_MS)
  const result = wd.guard(async () => {
    let endpoint: ResolvedEndpoint
    try {
      endpoint = getProviderAdapter(provider).resolveEndpoint(config)
    } catch (e) {
      // config errors (unknown provider, missing base URL) report as a failed reply, not a rejection
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }
    }
    if (provider === 'lmstudio' && !config.model?.trim()) {
      try {
        const cat = await listCustomModels(endpoint.baseUrl || 'http://127.0.0.1:1234/v1', config.apiKey)
        const first = cat.models[0]
        if (first) {
          config = { ...config, model: first }
        }
      } catch {
        // probe failed, proceed with config
      }
    }
    if (endpoint.model) config = { ...config, model: endpoint.model }
    switch (endpoint.protocol) {
      case 'codex-app-server':
        return chatCodexAppServer(config, system, user, wd.signal)
      case 'anthropic':
        return chatAnthropic(wd, config, system, user, endpoint.baseUrl)
      case 'gemini':
        return chatGemini(wd, config, system, user, endpoint.baseUrl, {
          omitTemperature: endpoint.omitTemperature,
        })
      case 'openai-compatible':
        return chatOpenAiCompatible(wd, endpoint.baseUrl, config, system, user, {
          omitTemperature: endpoint.omitTemperature,
          bodyExtras: endpoint.bodyExtras,
        })
    }
  })
  return result.catch((e) => {
    if (e instanceof ResponseBodyTooLargeError) return { ok: false as const, error: e.message }
    if (provider === 'lmstudio') {
      const msg = e instanceof Error ? e.message : String(e)
      if (
        msg.includes('fetch failed') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('Failed to fetch') ||
        msg.includes('connect')
      ) {
        return {
          ok: false as const,
          error: `Could not connect to LM Studio at ${config.baseUrl || 'http://127.0.0.1:1234/v1'}. Please make sure LM Studio is running and the Local Server is started.`,
        }
      }
    }
    throw e
  })
}
