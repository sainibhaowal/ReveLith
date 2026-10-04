import type { AiSettings, AiProviderConfig, AiProviderId } from './types'
import { chatForProvider } from './chat'

/**
 * Resolve settings specifically for inline completion: fast, low-token, no-tools.
 * Falls back to the default provider if the active one isn't configured.
 */
export async function resolveAiSettingsForInline(
  settings: AiSettings,
): Promise<{ provider: AiProviderId; config: AiProviderConfig; model: string } | null> {
  const provider = settings.provider
  const config = settings.providers?.[provider]
  if (
    !config ||
    (!config.apiKey &&
      provider !== 'lmstudio' &&
      provider !== 'ollama' &&
      provider !== 'codex' &&
      provider !== 'custom')
  ) {
    // Try fallback to a local provider
    for (const fallback of ['lmstudio', 'ollama'] as const) {
      const fbConfig = settings.providers?.[fallback]
      if (fbConfig && (fbConfig.apiKey || fallback === 'lmstudio' || fallback === 'ollama')) {
        return { provider: fallback, config: fbConfig, model: fbConfig.model || '' }
      }
    }
    return null
  }
  return { provider, config, model: config.model || '' }
}

/**
 * One-shot inline completion: returns the completion text or null on error.
 * Optimized for speed: low temperature, small max tokens, no tools.
 */
export async function inlineComplete(
  settings: AiSettings,
  before: string,
  after: string,
  signal?: AbortSignal,
  groundedContext?: string,
): Promise<string | null> {
  const resolved = await resolveAiSettingsForInline(settings)
  if (!resolved) return null

  const { provider, config, model } = resolved
  if (!model) return null

  // Build a focused prompt for inline completion
  const system = `You are an inline text completion engine for a document editor.
Complete the user's text naturally. Output ONLY the continuation text, no explanations, no formatting, no markdown.
Keep it concise: 1-3 sentences or a single formula.
Match the user's language, tone, and style.${groundedContext ? '\nUse ONLY facts from the provided sources when relevant.' : ''}`

  const user = `${groundedContext ? `Grounded sources (only use these facts):\n${groundedContext.slice(0, 4000)}\n\n` : ''}Text before cursor:
${before.slice(-800)}

Text after cursor:
${after.slice(0, 200)}

Continue naturally from the cursor position.`

  try {
    const result = await chatForProvider(provider, config, system, user, signal)
    if (!result.ok || !result.content) return null
    // Trim to first complete sentence or reasonable length
    return result.content.trim()
  } catch {
    return null
  }
}
