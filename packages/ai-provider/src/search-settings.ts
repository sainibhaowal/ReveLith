import type {
  AiSearchProviderId,
  AiSearchProviderMeta,
  AiSearchSettings,
  AiSettings,
} from './types'

export const AI_SEARCH_PROVIDERS: AiSearchProviderMeta[] = [
  { id: 'serper', label: 'Serper', keyPlaceholder: 'Serper API key', imageSearch: true },
  { id: 'serply', label: 'Serply', keyPlaceholder: 'Serply API key', imageSearch: true },
  { id: 'tavily', label: 'Tavily', keyPlaceholder: 'tvly-...', imageSearch: false },
  { id: 'parallel', label: 'Parallel', keyPlaceholder: 'Parallel API key', imageSearch: false },
]

export function defaultAiSearchSettings(): AiSearchSettings {
  return {
    provider: 'serper',
    providers: {
      serper: { apiKey: '' },
      serply: { apiKey: '' },
      tavily: { apiKey: '' },
      parallel: { apiKey: '' },
    },
  }
}

export function resolveAiSearchSettings(
  stored: Partial<AiSearchSettings> | undefined,
): AiSearchSettings {
  const defaults = defaultAiSearchSettings()
  if (!stored) return defaults
  const providers = { ...defaults.providers }
  for (const id of ['serper', 'serply', 'tavily', 'parallel'] as const) {
    const key = stored.providers?.[id]?.apiKey
    if (typeof key === 'string') providers[id] = { apiKey: key.trim() }
  }
  return { provider: stored.provider ?? defaults.provider, providers }
}

/** Parallel can run keylessly; other custom providers require a key or fall back to serper. */
export function activeSearchProvider(settings: Pick<AiSettings, 'search'>): AiSearchProviderId {
  const search = settings.search
  if (!search) return 'serper'
  if (!AI_SEARCH_PROVIDERS.some((m) => m.id === search.provider)) return 'serper'
  if (search.provider === 'parallel') return 'parallel'
  return search.providers?.[search.provider]?.apiKey?.trim() ? search.provider : 'serper'
}
