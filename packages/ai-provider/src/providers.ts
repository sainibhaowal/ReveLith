import type { AiProviderId, AiProviderMeta, AiSettings, LegacyAiSettings } from './types'

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
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
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
    custom: 'http://localhost:8080/v1',
  }
  const providers = {} as AiSettings['providers']
  for (const meta of AI_PROVIDERS) {
    providers[meta.id] = {
      apiKey: defaultApiKeys?.[meta.id] ?? '',
      model: meta.defaultModel,
      baseUrl: meta.needsBaseUrl ? (DEFAULT_BASE_URLS[meta.id] ?? '') : undefined,
    }
  }
  // Local-first default. Users can select any hosted provider in Settings; a
  // first-run installation should not point at a nonexistent private server.
  return { provider: 'lmstudio', providers }
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
  if (!stored.providers) {
    if (stored.apiKey) {
      defaults.providers.custom = {
        apiKey: stored.apiKey,
        model: stored.model ?? '',
        baseUrl: stored.baseUrl ?? 'https://api.openai.com/v1',
      }
    }
    return defaults
  }
  return {
    provider: stored.provider ?? defaults.provider,
    providers: { ...defaults.providers, ...stored.providers },
  }
}
