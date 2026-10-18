import {
  activeMediaConfig,
  activeSearchProvider,
  imageGenerationAvailable,
  mediaAnalysisAvailable,
} from '@revelith/ai-provider'
import { readAiSettingsFile } from '@revelith/ai-search'
import { aiSettingsPath, prepareNetwork } from '../cloud'
import type { CommandDef } from '../registry'
import { appLaunch } from '../resources'

/**
 * Which network features can run on this machine, decided from ReveLith's
 * own settings without a network call: a BYOK key or explicitly selected free
 * Parallel search. Unkeyed fallbacks in the
 * default chain (free Parallel MCP, DuckDuckGo) do not count as configured. Agents
 * check this once before planning work that needs photos or web facts.
 */
export const capabilitiesCommand: CommandDef = {
  name: 'capabilities',
  summary:
    'Report which search and media providers are configured in ReveLith, and whether the app is installed.',
  usage: 'capabilities',
  async run(_args, ctx) {
    await prepareNetwork(ctx.env)
    const settings = readAiSettingsFile(aiSettingsPath(ctx.env))
    const searchProvider = activeSearchProvider(settings)
    const keyedImageSearch = searchProvider === 'serper' || searchProvider === 'serply'
    const searchKey = settings.search?.providers?.[searchProvider]?.apiKey?.trim()
    const searchAvailable = searchProvider === 'parallel' || !!searchKey
    const imageGeneration = imageGenerationAvailable(settings)
    const mediaAnalysis = mediaAnalysisAvailable(settings)
    const byokImageProvider = activeMediaConfig(settings, 'image')?.provider ?? null
    const byokAnalysisProvider = activeMediaConfig(settings, 'analysis')?.provider ?? null
    const via = (provider: string | null | undefined) => provider ?? null

    const detail = {
      search: {
        available: searchAvailable,
        via: searchAvailable ? searchProvider : null,
      },
      image_search: {
        available: keyedImageSearch && !!searchKey,
        via: keyedImageSearch && !!searchKey ? searchProvider : null,
      },
      image_generation: {
        available: imageGeneration,
        via: imageGeneration ? via(byokImageProvider) : null,
      },
      media_analysis: {
        available: mediaAnalysis,
        via: mediaAnalysis ? via(byokAnalysisProvider) : null,
      },
      app: { available: appLaunch(ctx.env) !== null },
      settings_path: aiSettingsPath(ctx.env),
    }
    const on = Object.entries(detail)
      .filter(([k, v]) => k !== 'settings_path' && (v as { available: boolean }).available)
      .map(([k]) => k)
    return {
      summary: on.length
        ? `configured: ${on.join(', ')}`
        : 'no search or media provider configured',
      detail,
    }
  },
}
