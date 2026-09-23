import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateImageForProvider } from '../src/image'

afterEach(() => vi.unstubAllGlobals())

describe('generateImageForProvider', () => {
  it('uses the selected OpenAI-compatible endpoint and returns inline image data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await generateImageForProvider(
      'custom',
      { apiKey: '', model: 'local-image-model', baseUrl: 'http://127.0.0.1:8188/v1' },
      'a mountain',
    )
    expect(result).toEqual({ ok: true, url: 'data:image/png;base64,aW1hZ2U=' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8188/v1/images/generations',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('reports unsupported local image endpoints without falling back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await generateImageForProvider(
      'lmstudio',
      { apiKey: '', model: 'text-only', baseUrl: 'http://127.0.0.1:1234/v1' },
      'anything',
    )
    expect(result.error).toMatch(/does not expose image generation/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
