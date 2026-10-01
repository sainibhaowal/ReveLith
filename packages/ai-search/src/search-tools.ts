import {
  activeSearchProvider,
  type AiSearchProviderId,
  type AiSettings,
} from '@revelith/ai-provider'
import { imageSearch, webSearch } from './index'
import { readAiSettingsFile } from './media-tools'

export interface SearchOptions {
  useGsk?: boolean
  serperKey?: string
  serplyKey?: string
  tavilyKey?: string
  parallelKey?: string
  prefer?: 'serper' | 'serply' | 'tavily' | 'parallel'
}

export function searchOptionsFromSettings(settings: AiSettings): SearchOptions {
  const provider = activeSearchProvider(settings)
  const searchProviders = settings.search?.providers
  const key = searchProviders && provider in searchProviders
    ? (searchProviders as any)[provider]?.apiKey?.trim() ?? ''
    : ''
  if (provider === 'parallel') return { useGsk: false, parallelKey: key, prefer: 'parallel' }
  if (provider === 'serply') return { useGsk: false, serplyKey: key, prefer: 'serply' }
  return provider === 'tavily'
    ? { useGsk: false, tavilyKey: key, prefer: 'tavily' }
    : { useGsk: false, serperKey: key }
}

export function webSearchTool(settingsPath: string, query: string, maxResults = 6) {
  const opts = searchOptionsFromSettings(readAiSettingsFile(settingsPath))
  return webSearch(query, maxResults, opts.serperKey || opts.tavilyKey || undefined)
}

export function imageSearchTool(settingsPath: string, query: string, maxResults = 8) {
  const opts = searchOptionsFromSettings(readAiSettingsFile(settingsPath))
  return imageSearch(query, maxResults, opts.serperKey || undefined)
}

export async function testSearchProvider(
  provider: AiSearchProviderId,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  apiKey = apiKey.trim()
  if (!apiKey && provider !== 'parallel') return { ok: false, error: 'API key is empty' }
  return { ok: true }
}

