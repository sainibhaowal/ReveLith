import type {
  AiProviderId,
  AiProviderMeta,
  AiSettings,
  LegacyAiSettings,
  MediaSearchSettings,
} from './types'

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: 'ollama',
    label: 'Ollama (Local LLM)',
    models: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5', 'codellama'],
    defaultModel: 'llama3.2',
    keyPlaceholder: 'ollama (not required)',
    needsBaseUrl: true,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (Local LLM)',
    models: ['local-model'],
    defaultModel: 'local-model',
    keyPlaceholder: 'lmstudio (not required)',
    needsBaseUrl: true,
  },
  {
    id: 'anthropic',
    label: 'Claude',
    models: [
      'claude-sonnet-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-opus-4-5-20251101',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5-20250929',
    ],
    defaultModel: 'claude-opus-4-7',
    keyPlaceholder: 'sk-ant-api03-...',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash',
    keyPlaceholder: 'AIza...',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    models: ['deepseek-v4.1-flash', 'deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-v4.1-flash',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-6-astra', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4.1-mini',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'opencode-zen',
    label: 'OpenCode Zen',
    models: ['deepseek-v4-pro', 'glm-5.2', 'kimi-k2.7-code', 'minimax-m3'],
    defaultModel: 'deepseek-v4-pro',
    keyPlaceholder: 'OpenCode Zen API key',
    needsBaseUrl: true,
  },
  {
    id: 'codex-app-server',
    label: 'Codex App Server',
    models: ['codex-1', 'gpt-5-codex', 'codex-pro', 'o3-mini', 'o1'],
    defaultModel: 'codex-1',
    keyPlaceholder: 'Codex API Key / Access Token',
    needsBaseUrl: true,
  },
  {
    id: 'opper',
    label: 'Opper',
    models: ['opper-default', 'opper-fast', 'opper-smart'],
    defaultModel: 'opper-default',
    keyPlaceholder: 'opp-...',
    needsBaseUrl: false,
  },
  {
    id: 'custom',
    label: 'Custom Server',
    models: [],
    defaultModel: '',
    keyPlaceholder: 'API Key',
    needsBaseUrl: true,
  },
]

/**
 * Fresh settings with every provider's default model and an empty key,
 * except providers listed in `defaultApiKeys` (e.g. an app-specific
 * preconfigured Anthropic key). Callers own that policy; this package
 * has no hardcoded keys.
 */
export function defaultAiSettings(
  defaultApiKeys?: Partial<Record<AiProviderId, string>>,
): AiSettings {
  const DEFAULT_BASE_URLS: Partial<Record<AiProviderId, string>> = {
    ollama: 'http://localhost:11434/v1',
    lmstudio: 'http://localhost:1234/v1',
    'opencode-zen': 'https://opencode.ai/zen/v1',
    'codex-app-server': 'http://localhost:8765/v1',
    opper: 'https://api.opper.ai/v1',
    custom: 'http://localhost:8080/v1',
  }
  const providers = {} as AiSettings['providers']
  for (const meta of AI_PROVIDERS) {
    providers[meta.id] = {
      apiKey: defaultApiKeys?.[meta.id] ?? '',
      model: meta.defaultModel,
      baseUrl: DEFAULT_BASE_URLS[meta.id] ?? (meta.needsBaseUrl ? '' : undefined),
    }
  }
  // Local-first default. Users can select any hosted provider in Settings; a
  // first-run installation should not point at a nonexistent private server.
  return { provider: 'lmstudio', providers, mediaSearch: defaultMediaSearch() }
}

/** Fresh Media & Search settings: free search fallback, image/media follow the active chat provider. */
export function defaultMediaSearch(): MediaSearchSettings {
  return {
    webSearch: { provider: 'duckduckgo', apiKey: '' },
    imageGen: { provider: '', model: '', apiKey: '', baseUrl: '' },
    imageAnalysis: { provider: '', model: '' },
    videoAnalysis: { provider: '' },
  }
}

/** Serper key actually threaded into the main-process search handlers. */
export function resolveWebSearchKey(settings: AiSettings): string {
  return settings.mediaSearch?.webSearch.apiKey || settings.byok?.webSearchKey || ''
}

export interface EffectiveImageGen {
  provider: AiProviderId
  config: { apiKey: string; model: string; baseUrl?: string | undefined }
}

/**
 * Dedicated image-generation backend from Settings → AI Media & Search.
 * Returns null when unconfigured, in which case callers keep the legacy
 * behavior (generate with the active chat provider).
 */
export function resolveImageGenTarget(settings: AiSettings): EffectiveImageGen | null {
  const wanted = settings.mediaSearch?.imageGen
  const provider = wanted?.provider
  if (!provider) return null
  const stored = settings.providers?.[provider]
  if (!stored) return null
  const apiKey = wanted.apiKey || stored.apiKey
  // Local servers work keyless; hosted ones need a key from either field.
  const keyless = provider === 'lmstudio' || provider === 'ollama' || provider === 'custom'
  if (!apiKey && !keyless) return null
  return {
    provider,
    config: {
      apiKey: apiKey || 'local-key',
      model: wanted.model || stored.model,
      baseUrl: wanted.baseUrl || stored.baseUrl,
    },
  }
}

export interface EffectiveMediaAnalysis {
  provider: AiProviderId
  model: string
}

/**
 * Dedicated media-analysis backend from Settings → AI Media & Search.
 * Returns null when unconfigured (callers use the active chat provider).
 */
export function resolveMediaAnalysisTarget(settings: AiSettings): EffectiveMediaAnalysis | null {
  const media = settings.mediaSearch
  const provider = media?.imageAnalysis.provider
  if (!provider || !settings.providers?.[provider]) return null
  const stored = settings.providers[provider]!
  return {
    provider,
    model: media.imageAnalysis.model || stored.model,
  }
}

/**
 * Merge on-disk settings over freshly computed defaults, migrating the
 * pre-provider shape (a single OpenAI-compatible endpoint) into the
 * "custom" provider slot. `stored` is whatever the caller read from its
 * settings file (already JSON-parsed); this function does no file I/O.
 */
export function resolveAiSettings(
  stored: Partial<AiSettings> & LegacyAiSettings,
  defaults: AiSettings,
): AiSettings {
  const fresh = defaultMediaSearch()
  const s = stored.mediaSearch
  const mediaSearch: MediaSearchSettings = {
    webSearch: { ...fresh.webSearch, ...s?.webSearch },
    imageGen: { ...fresh.imageGen, ...s?.imageGen },
    imageAnalysis: { ...fresh.imageAnalysis, ...s?.imageAnalysis },
    videoAnalysis: { ...fresh.videoAnalysis, ...s?.videoAnalysis },
  }
  // Migrate legacy BYOK keys (Settings wrote them before mediaSearch existed).
  if (!mediaSearch.webSearch.apiKey && stored.byok?.webSearchKey) {
    mediaSearch.webSearch.apiKey = stored.byok.webSearchKey
  }
  const extras = {
    ...(stored.byok ? { byok: stored.byok } : {}),
    mediaSearch,
  }
  if (!stored.providers) {
    if (stored.apiKey) {
      defaults.providers.custom = {
        apiKey: stored.apiKey,
        model: stored.model ?? '',
        baseUrl: stored.baseUrl ?? 'https://api.openai.com/v1',
      }
    }
    return { ...defaults, ...extras }
  }
  return {
    provider: stored.provider ?? defaults.provider,
    providers: { ...defaults.providers, ...stored.providers },
    ...extras,
  }
}
