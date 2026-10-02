import {
  activeMediaConfig,
  activeMediaProvider,
  activeSearchProvider,
  imageGenerationAvailable,
  mediaAnalysisAvailable,
} from '@revelith/ai-provider'
import { hasGskAuth, readAiSettingsFile } from '@revelith/ai-search'
import { aiSettingsPath, prepareCloud } from '../cloud'
import type { CommandDef } from '../registry'
import { appLaunch } from '../resources'

/**
 * What the cloud commands can do on this machine, decided from ReveLith's
 * own settings without a network call: a ReveLith login with cloud tools on,
 * a BYOK key, or explicitly selected free Parallel search. Unkeyed fallbacks in the
 * default chain (free Parallel MCP, DuckDuckGo) do not count as configured. Agents
 * check this once before planning work that needs photos or web facts.
 */
export const capabilitiesCommand: CommandDef = {
  name: 'capabilities',
  summary:
    'Report which cloud features (search, image search, image generation, media analysis) are configured in ReveLith, and whether the app is installed.',
  usage: 'capabilities',
  async run(_args, ctx) {
    await prepareCloud(ctx.env)
    const settings = readAiSettingsFile(aiSettingsPath(ctx.env))
    const searchProvider = activeSearchProvider(settings)
    const keyedImageSearch = searchProvider === 'serper' || searchProvider === 'serply'
    const searchKey = settings.search?.providers?.[searchProvider]?.apiKey?.trim()
    const searchAvailable = searchProvider === 'parallel' || !!searchKey
    const gskLoggedIn = hasGskAuth()
    const imageGeneration = imageGenerationAvailable(settings, gskLoggedIn)
    const mediaAnalysis = mediaAnalysisAvailable(settings, gskLoggedIn)
    const byokImageProvider = activeMediaConfig(settings, 'image')?.provider ?? null
    const byokAnalysisProvider = activeMediaConfig(settings, 'analysis')?.provider ?? null
    const via = (byok: string | null | undefined) =>
      byok ? byok : gskLoggedIn ? 'revelith' : null

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
        : 'no cloud feature configured; the app is not installed',
      detail,
    }
  },
}
