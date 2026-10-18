import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

// a real settings file always carries the chat provider block; without it every section resets to defaults
function settingsFile(dir: string, settings: Record<string, unknown>): string {
  const path = join(dir, 'ai-settings.json')
  writeFileSync(path, JSON.stringify({ provider: 'anthropic', providers: {}, ...settings }))
  return path
}

describe('revelith capabilities', () => {
  it('reports nothing configured when signed out with default settings', async () => {
    const dir = tempDir()
    const r = await run(['capabilities', '--json'], {
      env: {
        ...process.env,
        REVELITH_AI_SETTINGS: join(dir, 'missing.json'),
        REVELITH_APP_BIN: '',
      },
    })
    expect(r.code).toBe(0)
    const d = r.json().detail
    expect(d.search.available).toBe(false)
    expect(d.image_search.available).toBe(false)
    expect(d.image_generation.available).toBe(false)
    expect(d.media_analysis.available).toBe(false)
  })

  it('counts a Serper key as search + image search and a BYOK image model as generation', async () => {
    const dir = tempDir()
    mkdirSync(join(dir, 'bin'))
    const settings = settingsFile(dir, {
      search: {
        provider: 'serper',
        providers: { serper: { apiKey: 'k' }, tavily: { apiKey: '' } },
      },
      media: {
        imageProvider: 'openai',
        providers: { openai: { apiKey: 'sk', imageModel: 'gpt-image-1' } },
      },
    })
    const r = await run(['capabilities', '--json'], {
      env: {
        ...process.env,
        REVELITH_AI_SETTINGS: settings,
        REVELITH_APP_BIN: join(dir, 'bin', 'app'),
      },
    })
    expect(r.code).toBe(0)
    const d = r.json().detail
    expect(d.search).toEqual({ available: true, via: 'serper' })
    expect(d.image_search).toEqual({ available: true, via: 'serper' })
    expect(d.image_generation).toEqual({ available: true, via: 'openai' })
    expect(d.media_analysis).toEqual({ available: true, via: 'openai' })
    expect(d.app.available).toBe(true)
    expect(r.json().summary).toContain('image_generation')
  })

  it('counts a Serply key as search + image search', async () => {
    const settings = settingsFile(tempDir(), {
      search: { provider: 'serply', providers: { serply: { apiKey: 'k' } } },
    })
    const r = await run(['capabilities', '--json'], {
      env: { ...process.env, REVELITH_AI_SETTINGS: settings },
    })
    const d = r.json().detail
    expect(d.search).toEqual({ available: true, via: 'serply' })
    expect(d.image_search).toEqual({ available: true, via: 'serply' })
  })

  it.each(['tavily', 'parallel'])('%s gives web search but no image search', async (provider) => {
    const dir = tempDir()
    const settings = settingsFile(dir, {
      search: {
        provider,
        providers: { [provider]: { apiKey: 'test-key' } },
      },
    })
    const r = await run(['capabilities', '--json'], {
      env: { ...process.env, REVELITH_AI_SETTINGS: settings },
    })
    const d = r.json().detail
    expect(d.search).toEqual({ available: true, via: provider })
    expect(d.image_search.available).toBe(false)
  })

  it('reports selected keyless Parallel as web search without requiring a login', async () => {
    const settings = settingsFile(tempDir(), {
      search: { provider: 'parallel', providers: { parallel: { apiKey: '' } } },
    })
    const r = await run(['capabilities', '--json'], {
      env: { ...process.env, REVELITH_AI_SETTINGS: settings },
    })
    expect(r.json().detail.search).toEqual({ available: true, via: 'parallel' })
    expect(r.json().detail.image_search).toEqual({ available: false, via: null })
  })
})
