import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createImageSkill } from '../src/renderer/ai/image-skill'

const api = () =>
  (globalThis as unknown as { window: { desktopApi: Record<string, ReturnType<typeof vi.fn>> } }).window
    .desktopApi

beforeEach(() => {
  ;(globalThis as unknown as { window: unknown }).window = {
    desktopApi: {
      imageSearch: vi.fn(async () => ({
        images: [
          {
            title: 'A cat',
            imageUrl: 'https://img.example/cat.jpg',
            sourceUrl: 'https://example.com',
            source: 'example',
            width: 800,
            height: 600,
          },
        ],
        method: 'account',
      })),
      generateImage: vi.fn(async () => ({ url: 'https://img.example/generated.png' })),
    },
  }
})

const call = (name: string, input: Record<string, unknown> = {}) => ({ id: 't1', name, input })

describe('createImageSkill', () => {
  it('declares image_search and generate_image tools', () => {
    const skill = createImageSkill()
    expect(skill.id).toBe('images')
    expect(skill.tools.map((tool) => tool.name).sort()).toEqual(['generate_image', 'image_search'])
    expect(skill.systemPrompt).toContain('add_image')
  })

  it('searches images and reports failures as retryable', async () => {
    const skill = createImageSkill()
    const ok = await skill.executeTool(call('image_search', { query: 'cat' }), new AbortController().signal)
    expect(ok.isError).toBeFalsy()
    expect(ok.output).toContain('1. A cat [800x600]')
    expect(ok.output).toContain('https://img.example/cat.jpg')
    expect(api().imageSearch).toHaveBeenCalledWith('cat', 8)

    api().imageSearch = vi.fn(async () => ({ images: [], method: 'error', error: 'boom' }))
    const failed = await skill.executeTool(call('image_search', { query: 'cat' }), new AbortController().signal)
    expect(failed.isError).toBe(true)
    expect(failed.output).toContain('boom')

    const empty = await skill.executeTool(call('image_search', { query: '  ' }), new AbortController().signal)
    expect(empty.isError).toBe(true)
  })

  it('generates images and surfaces failures', async () => {
    const skill = createImageSkill()
    const ok = await skill.executeTool(
      call('generate_image', { prompt: 'a diagram', aspectRatio: '16:9' }),
      new AbortController().signal,
    )
    expect(ok.isError).toBeFalsy()
    expect(ok.output).toContain('https://img.example/generated.png')
    expect(api().generateImage).toHaveBeenCalledWith({ prompt: 'a diagram', aspectRatio: '16:9' })

    api().generateImage = vi.fn(async () => ({ error: 'not logged in' }))
    const failed = await skill.executeTool(
      call('generate_image', { prompt: 'x' }),
      new AbortController().signal,
    )
    expect(failed.isError).toBe(true)
    expect(failed.output).toContain('not logged in')
  })

  it('rejects unknown tools', async () => {
    const skill = createImageSkill()
    const result = await skill.executeTool(call('nope'), new AbortController().signal)
    expect(result.isError).toBe(true)
  })
})
