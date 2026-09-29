import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  defaultAiSettings,
  defaultMediaSearch,
  resolveAiSettings,
  resolveImageGenTarget,
  resolveMediaAnalysisTarget,
  resolveWebSearchKey,
} from '../src/providers'

describe('defaultAiSettings', () => {
  it('gives every provider its default model and an empty key by default', () => {
    const settings = defaultAiSettings()
    expect(settings.provider).toBe('lmstudio')
    for (const meta of AI_PROVIDERS) {
      expect(settings.providers[meta.id].apiKey).toBe('')
      expect(settings.providers[meta.id].model).toBe(meta.defaultModel)
    }
    expect(settings.providers.custom.baseUrl).toBe('http://localhost:8080/v1')
    expect(settings.providers.anthropic.baseUrl).toBeUndefined()
  })

  it('applies caller-supplied default keys only to the listed providers', () => {
    const settings = defaultAiSettings({ anthropic: 'sk-ant-preset' })
    expect(settings.providers.anthropic.apiKey).toBe('sk-ant-preset')
    expect(settings.providers.gemini.apiKey).toBe('')
  })
})

describe('resolveAiSettings', () => {
  it('returns fresh defaults when nothing is stored', () => {
    const defaults = defaultAiSettings({ anthropic: 'sk-ant-preset' })
    expect(resolveAiSettings({}, defaults)).toEqual(defaults)
  })

  it('migrates the pre-provider single-endpoint shape into the custom provider', () => {
    const defaults = defaultAiSettings()
    const resolved = resolveAiSettings(
      { apiKey: 'legacy-key', model: 'legacy-model', baseUrl: 'https://legacy.example.com/v1' },
      defaults,
    )
    expect(resolved.providers.custom).toEqual({
      apiKey: 'legacy-key',
      model: 'legacy-model',
      baseUrl: 'https://legacy.example.com/v1',
    })
    // untouched providers keep their defaults
    expect(resolved.providers.anthropic).toEqual(defaults.providers.anthropic)
  })

  it('defaults the legacy base URL to the OpenAI endpoint when omitted', () => {
    const resolved = resolveAiSettings({ apiKey: 'legacy-key' }, defaultAiSettings())
    expect(resolved.providers.custom.baseUrl).toBe('https://api.openai.com/v1')
  })

  it('merges stored multi-provider settings over the defaults, provider by provider', () => {
    const defaults = defaultAiSettings({ anthropic: 'preset-key' })
    const resolved = resolveAiSettings(
      {
        provider: 'gemini',
        providers: {
          gemini: { apiKey: 'stored-gemini-key', model: 'gemini-2.5-pro' },
        } as never,
      },
      defaults,
    )
    expect(resolved.provider).toBe('gemini')
    expect(resolved.providers.gemini).toEqual({
      apiKey: 'stored-gemini-key',
      model: 'gemini-2.5-pro',
    })
    // provider not mentioned in stored.providers keeps the computed default
    expect(resolved.providers.anthropic.apiKey).toBe('preset-key')
  })

  it('supports DeepSeek V4.1 Flash, gpt-6-astra, and Opper provider', () => {
    const deepseek = AI_PROVIDERS.find((p) => p.id === 'deepseek')
    expect(deepseek?.models).toContain('deepseek-v4.1-flash')
    expect(deepseek?.defaultModel).toBe('deepseek-v4.1-flash')

    const openai = AI_PROVIDERS.find((p) => p.id === 'openai')
    expect(openai?.models).toContain('gpt-6-astra')

    const opper = AI_PROVIDERS.find((p) => p.id === 'opper')
    expect(opper).toBeDefined()
    expect(opper?.defaultModel).toBe('opper-default')

    const defaults = defaultAiSettings()
    expect(defaults.providers.opper.baseUrl).toBe('https://api.opper.ai/v1')
  })
})

describe('mediaSearch', () => {
  it('defaults to the free search fallback with no dedicated backends', () => {
    const settings = defaultAiSettings()
    expect(settings.mediaSearch).toEqual(defaultMediaSearch())
    expect(settings.mediaSearch?.webSearch.provider).toBe('duckduckgo')
    expect(resolveWebSearchKey(settings)).toBe('')
    expect(resolveImageGenTarget(settings)).toBeNull()
    expect(resolveMediaAnalysisTarget(settings)).toBeNull()
  })

  it('preserves stored mediaSearch and byok through resolveAiSettings', () => {
    const stored = {
      provider: 'openai',
      providers: { openai: { apiKey: 'sk-x', model: 'gpt-4.1-mini' } },
      byok: { webSearchKey: 'legacy-serper' },
      mediaSearch: {
        ...defaultMediaSearch(),
        webSearch: { provider: 'serper', apiKey: 'tvly-new' },
      },
    } as never
    const resolved = resolveAiSettings(stored, defaultAiSettings())
    expect(resolved.byok?.webSearchKey).toBe('legacy-serper')
    expect(resolved.mediaSearch?.webSearch).toEqual({ provider: 'serper', apiKey: 'tvly-new' })
    expect(resolveWebSearchKey(resolved)).toBe('tvly-new')
  })

  it('migrates legacy byok webSearchKey into mediaSearch', () => {
    const resolved = resolveAiSettings(
      { byok: { webSearchKey: 'legacy-serper' }, providers: {} } as never,
      defaultAiSettings(),
    )
    expect(resolved.mediaSearch?.webSearch.apiKey).toBe('legacy-serper')
    expect(resolved.mediaSearch?.webSearch.provider).toBe('duckduckgo')
    expect(resolveWebSearchKey(resolved)).toBe('legacy-serper')
  })

  it('resolves the dedicated image backend only when usable', () => {
    const settings = defaultAiSettings()
    // no dedicated provider -> legacy behavior (null)
    expect(resolveImageGenTarget(settings)).toBeNull()
    // hosted provider without any key -> null
    const nokey = resolveAiSettings(
      {
        mediaSearch: {
          ...defaultMediaSearch(),
          imageGen: { provider: 'openai', model: 'gpt-image-1', apiKey: '', baseUrl: '' },
        },
      } as never,
      settings,
    )
    expect(resolveImageGenTarget(nokey)).toBeNull()
    // hosted provider with key -> dedicated target with stored fallbacks
    const keyed = resolveAiSettings(
      {
        mediaSearch: {
          ...defaultMediaSearch(),
          imageGen: { provider: 'openai', model: '', apiKey: 'sk-img', baseUrl: '' },
        },
      } as never,
      settings,
    )
    expect(resolveImageGenTarget(keyed)).toEqual({
      provider: 'openai',
      config: { apiKey: 'sk-img', model: 'gpt-4.1-mini', baseUrl: undefined },
    })
    // keyless local provider works without a key
    const local = resolveAiSettings(
      {
        mediaSearch: {
          ...defaultMediaSearch(),
          imageGen: { provider: 'ollama', model: 'llama3.2', apiKey: '', baseUrl: '' },
        },
      } as never,
      settings,
    )
    expect(resolveImageGenTarget(local)?.provider).toBe('ollama')
  })

  it('resolves the dedicated media-analysis backend with model override', () => {
    const settings = defaultAiSettings()
    expect(resolveMediaAnalysisTarget(settings)).toBeNull()
    const withAnalysis = resolveAiSettings(
      {
        mediaSearch: {
          ...defaultMediaSearch(),
          imageAnalysis: { provider: 'gemini', model: 'gemini-2.0-flash' },
        },
      } as never,
      settings,
    )
    expect(resolveMediaAnalysisTarget(withAnalysis)).toEqual({
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    })
  })
})
