import type { AgentSkill } from '@revelith/agent-core'
import type { ImageSearchResult } from '../../shared/desktop-api'

const IMAGES_SYSTEM_PROMPT = `## Images
- image_search finds real web images (returns direct imageUrl entries); generate_image creates an illustration with AI when no suitable real image exists or the user explicitly wants generated art.
- To place an image on a sheet, pass the URL to propose_operations {op:"add_image", sheetId, path:"<https url>", anchorCell} — field details in guide charts. The image anchors at that cell and is written into the file on save (imported xlsx only).
- Only insert images the user asked for; data correctness always outranks decoration.`

/** Image acquisition skill: web search plus AI generation, placed via add_image. */

/** Renderer bridge (window in production, absent under node tests) */
function bridge(): {
  imageSearch: (query: string, maxResults: number) => Promise<ImageSearchResult>
  generateImage: (request: { prompt: string; aspectRatio?: string }) => Promise<{ url?: string; error?: string }>
} | null {
  const api = (
    globalThis as unknown as {
      window?: {
        desktopApi?: {
          imageSearch?: unknown
          generateImage?: unknown
        }
      }
    }
  ).window?.desktopApi
  if (!api || typeof api.imageSearch !== 'function' || typeof api.generateImage !== 'function') {
    return null
  }
  return api as {
    imageSearch: (query: string, maxResults: number) => Promise<ImageSearchResult>
    generateImage: (request: { prompt: string; aspectRatio?: string }) => Promise<{ url?: string; error?: string }>
  }
}
export function createImageSkill(): AgentSkill {
  return {
    id: 'images',
    systemPrompt: IMAGES_SYSTEM_PROMPT,
    tools: [
      {
        name: 'image_search',
        description:
          'Search the web for images. Returns a numbered list of direct imageUrl entries with pixel sizes; ' +
          'pick one and insert it with propose_operations add_image (path = the URL).',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Image search keywords (English works better)' },
            maxResults: { type: 'integer', description: 'Maximum number of results, default 8' },
          },
          required: ['query'],
        },
      },
      {
        name: 'generate_image',
        description:
          'Generate an image with AI from a text prompt. Returns a URL to insert ' +
          'with propose_operations add_image. Use for illustrations/decorative art; prefer image_search for real-world subjects.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'What to draw — subject, style, composition (English works better)',
            },
            aspectRatio: {
              type: 'string',
              description: 'Aspect ratio like "1:1", "16:9", "4:3"; default 1:1',
            },
          },
          required: ['prompt'],
        },
      },
    ],
    executeTool: async (call) => {
      const desktop = bridge()
      if (!desktop) {
        return { output: 'desktop bridge unavailable', isError: true, summary: call.name }
      }
      if (call.name === 'image_search') {
        const query = String(call.input.query ?? '').trim()
        if (!query) {
          return { output: 'query must not be empty', isError: true, summary: 'Search images' }
        }
        const result = await desktop.imageSearch(
          query,
          Number(call.input.maxResults) || 8,
        )
        if (result.method === 'error') {
          return {
            output: `image search failed (service error, not an empty result : you may retry): ${result.error ?? 'unknown error'}`,
            isError: true,
            summary: 'Image search',
          }
        }
        const lines = result.images.map(
          (image, index) =>
            `${index + 1}. ${image.title || '(untitled)'} [${image.width ?? '?'}x${image.height ?? '?'}]\n   ${image.imageUrl}`,
        )
        return {
          output: lines.join('\n') || '(no images found)',
          mutated: false,
          summary: 'Image search',
        }
      }
      if (call.name === 'generate_image') {
        const prompt = String(call.input.prompt ?? '').trim()
        if (!prompt) {
          return { output: 'prompt must not be empty', isError: true, summary: 'Generate image' }
        }
        const aspect = call.input.aspectRatio === undefined ? undefined : String(call.input.aspectRatio)
        const result = await desktop.generateImage(
          aspect === undefined ? { prompt } : { prompt, aspectRatio: aspect },
        )
        if (!result.url) {
          return {
            output: `image generation failed: ${result.error ?? 'unknown error'}`,
            isError: true,
            summary: 'Generate image',
          }
        }
        return {
          output: `Generated image URL: ${result.url}\nInsert it with propose_operations add_image.`,
          mutated: false,
          summary: 'Generate image',
        }
      }
      return { output: `Unknown tool: ${call.name}`, isError: true, summary: call.name }
    },
  }
}
