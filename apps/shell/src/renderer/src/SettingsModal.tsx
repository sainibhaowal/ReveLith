import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from './locale'
import type { StringKey } from './locale'
import type { UiTheme } from '../../shared/home-api'
import './settings.css'

interface CustomSelectOption<T extends string> {
  value: T
  label: string
}

function CustomSelect<T extends string>({
  value,
  options,
  onChange,
  id,
}: {
  value: T
  options: readonly CustomSelectOption<T>[]
  onChange: (val: T) => void
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const selectedOption = options.find((o) => o.value === value)

  return (
    <div className="custom-select-wrap" ref={wrapRef} id={id}>
      <button
        type="button"
        className={`custom-select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="custom-select-value">{selectedOption?.label ?? value}</span>
        <svg className="custom-select-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="custom-select-dropdown" role="listbox">
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                className={`custom-select-item${isSelected ? ' selected' : ''}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                <span className="custom-select-item-label">{opt.label}</span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Settings modal (opened from the account menu) ─────────
// ReveLith-style two-pane dialog: section nav on the left, fields on the right.
// All values go through the existing home IPC; nothing is stored locally.

// sorted by ISO 639 language code : native-script labels have no natural
// shared alphabet, so the code is the ordering key
const LANG_OPTIONS = [
  { value: 'ar', label: 'العربية' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'he', label: 'עברית' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pl', label: 'Polski' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
  { value: 'th', label: 'ไทย' },
  { value: 'zh', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
] as const

// GenMail's option order: follow-system first, then the manual picks
const THEME_OPTIONS = [
  { value: 'system', labelKey: 'themeSystem' },
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
] as const satisfies readonly { value: UiTheme; labelKey: StringKey }[]

const CHANNEL_OPTIONS = [
  { value: 'stable', labelKey: 'channelStable' },
  { value: 'beta', labelKey: 'channelBeta' },
] as const satisfies readonly { value: 'stable' | 'beta'; labelKey: StringKey }[]

type SectionId = 'ai' | 'general' | 'about'

const SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: 'ai', label: 'AI & Models' },
  { id: 'general', label: 'General' },
  { id: 'about', label: 'About' },
]

function SectionIcon({ id }: { id: SectionId }) {
  if (id === 'ai') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
        <path d="M12 6a6 6 0 0 0-6 6c0 2.5 1.5 4.5 3.5 5.5"/>
        <path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>
      </svg>
    )
  }
  if (id === 'general') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2 5h8M13 5h1M2 11h1M6 11h8"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="11.5" cy="5" r="1.7" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="4.5" cy="11" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.4v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5.1" r="0.8" fill="currentColor" />
    </svg>
  )
}

function ProviderIcon({ id }: { id: string }) {
  if (id === 'ollama') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C8.5 2 7 4.5 7 7v4H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1v1h2v-1h6v1h2v-1h1a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1V7c0-2.5-1.5-5-5-5z" fill="#F3F4F6" />
        <circle cx="9.5" cy="13.5" r="1.5" fill="#111827" />
        <circle cx="14.5" cy="13.5" r="1.5" fill="#111827" />
        <path d="M10 6.5h4M10 8.5h4" stroke="#111827" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="#111827" />
      </svg>
    )
  }
  if (id === 'lmstudio') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#1E293B" />
        <path d="M5 6.5C5 5.67 5.67 5 6.5 5h11c.83 0 1.5.67 1.5 1.5v8c0 .83-.67 1.5-1.5 1.5h-11C5.67 16 5 15.33 5 14.5v-8z" fill="#0284C7" />
        <rect x="7" y="7" width="10" height="7" rx="1" fill="#38BDF8" />
        <path d="M10 18.5h4M12 16v2.5" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'openai') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M22.28 9.37a5.98 5.98 0 0 0-.52-4.95 6.07 6.07 0 0 0-6.52-2.73 6.08 6.08 0 0 0-4.73-2.39 6.07 6.07 0 0 0-5.8 4.3 6.08 6.08 0 0 0-3.9 2.83 6.07 6.07 0 0 0 .74 7.07 6.08 6.08 0 0 0 .52 4.95 6.07 6.07 0 0 0 6.52 2.73 6.08 6.08 0 0 0 4.73 2.39 6.07 6.07 0 0 0 5.8-4.3 6.08 6.08 0 0 0 3.9-2.83 6.07 6.07 0 0 0-.74-7.07zm-8.86 11.45a3.86 3.86 0 0 1-2.28-.73l3.65-2.11a1.1 1.1 0 0 0 .56-.96v-5.14l1.55.9a.1.1 0 0 1 .05.08v4.22a3.88 3.88 0 0 1-3.53 3.74zm-8.15-3.48a3.86 3.86 0 0 1-.5-2.35l3.65 2.1a1.1 1.1 0 0 0 1.11 0l4.45-2.57v1.79a.1.1 0 0 1-.04.09l-3.65 2.11a3.88 3.88 0 0 1-5.02-1.17zm-1.84-8.73a3.86 3.86 0 0 1 1.78-1.62v4.22a1.1 1.1 0 0 0 .55.96l4.45 2.57-1.55.9a.1.1 0 0 1-.1 0l-3.65-2.11a3.88 3.88 0 0 1-1.48-4.92zm14.19 3.02l-4.45-2.57 1.55-.9a.1.1 0 0 1 .1 0l3.65 2.11a3.88 3.88 0 0 1 1.48 4.92 3.86 3.86 0 0 1-1.78 1.62v-4.22a1.1 1.1 0 0 0-.55-.96zm2.35 5.83a3.86 3.86 0 0 1 .5 2.35l-3.65-2.1a1.1 1.1 0 0 0-1.11 0l-4.45 2.57v-1.79a.1.1 0 0 1 .04-.09l3.65-2.11a3.88 3.88 0 0 1 5.02 1.17zM10.57 13.5l-1.55-.9a.1.1 0 0 1-.05-.08V8.3a3.88 3.88 0 0 1 5.81-3.01l-3.65 2.11a1.1 1.1 0 0 0-.56.96v5.14zm1.18-1.92l2.03-1.17 2.03 1.17v2.34l-2.03 1.17-2.03-1.17v-2.34z"
          fill="#10A37F"
        />
      </svg>
    )
  }
  if (id === 'anthropic') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M14.5 3H18L24 21h-3.6l-1.8-4.2h-6.2l-1.8 4.2H7L14.5 3zm2.5 9.8l-1.8-4.3-1.8 4.3H17zM0 21L7.5 3h3.6L3.6 21H0z" fill="#D97706" />
      </svg>
    )
  }
  if (id === 'gemini') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="geminiGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1BA1E3" />
            <stop offset="35%" stopColor="#5470FF" />
            <stop offset="70%" stopColor="#8E55EA" />
            <stop offset="100%" stopColor="#EA4335" />
          </linearGradient>
        </defs>
        <path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z" fill="url(#geminiGrad2)" />
      </svg>
    )
  }
  if (id === 'deepseek') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="11" fill="#1D4ED8" />
        <path d="M5.5 13.5C7.2 9.5 11 8.5 15.5 10C17.5 10.7 18.5 12.2 18.5 14C18.5 16 16.8 17.5 14.5 17.5C11.5 17.5 9.5 16 8.5 14.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="10" cy="11.5" r="1.3" fill="#FFFFFF" />
        <circle cx="15.5" cy="12" r="1.3" fill="#FFFFFF" />
      </svg>
    )
  }
  if (id === 'opencode-zen') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-label="OpenCode Zen">
        <rect width="24" height="24" fill="#0B0B0B" />
        <path d="M7 5H17V19H7V5ZM10 8V16H14V8H10Z" fill="#FFFFFF" fillRule="evenodd" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="#F59E0B" fillOpacity="0.15" />
      <polygon points="13 3 4 14 12 14 11 21 20 10 12 10 13 3" fill="#F59E0B" />
    </svg>
  )
}

const PROVIDER_METAS = [
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    defaultUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    desc: '100% Offline Local LLM Runner',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (Local)',
    defaultUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    desc: 'Local Desktop Model Server',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    desc: 'Direct OpenAI API (GPT-4o, Mini)',
  },
  {
    id: 'opencode-zen',
    label: 'OpenCode Zen',
    defaultUrl: 'https://opencode.ai/zen/v1',
    defaultModel: 'deepseek-v4-pro',
    desc: 'OpenCode curated AI gateway',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    defaultUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    desc: 'Direct Anthropic API (Claude)',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-flash',
    desc: 'Direct Google Gemini API',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    desc: 'DeepSeek V3 / R1 Reasoner',
  },
  {
    id: 'custom',
    label: 'Custom Server',
    defaultUrl: 'http://localhost:8080/v1',
    defaultModel: 'custom-model',
    desc: 'Custom OpenAI-compatible Endpoint',
  },
] as const

function AiSettingsSection() {
  const [settings, setSettings] = useState<any>(null)
  const [selectedId, setSelectedId] = useState<string>('ollama')
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<{ state: 'idle' | 'testing' | 'success' | 'error'; message?: string }>({ state: 'idle' })
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleSaveAndApply = () => {
    const next = { ...settings, provider: selectedId }
    setSettings(next)
    try {
      localStorage.setItem('revelith.aiSettings', JSON.stringify(next))
    } catch {}
    void window.aiOffice?.setAiSettings?.(next)
    window.dispatchEvent(new Event('ai-settings-changed'))
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  useEffect(() => {
    let alive = true
    void (async () => {
      let s = await window.aiOffice?.getAiSettings?.()
      if (!s) {
        try {
          const stored = localStorage.getItem('revelith.aiSettings')
          if (stored) s = JSON.parse(stored)
        } catch {}
      }
      if (!s) {
        s = {
          provider: 'ollama',
          providers: {
            ollama: { apiKey: '', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434/v1' },
            lmstudio: { apiKey: '', model: 'local-model', baseUrl: 'http://127.0.0.1:1234/v1' },
            openai: { apiKey: '', model: 'gpt-4o-mini' },
            anthropic: { apiKey: '', model: 'claude-sonnet-4-6' },
          },
        }
      }
      if (alive && s) {
        setSettings(s)
        const validSelected = PROVIDER_METAS.some((p) => p.id === s.provider) ? s.provider : 'ollama'
        setSelectedId(validSelected)
      }
    })()
    return () => { alive = false }
  }, [])

  const activeProvider = PROVIDER_METAS.some((p) => p.id === settings?.provider) ? settings.provider : 'ollama'
  const currentMeta = PROVIDER_METAS.find((p) => p.id === selectedId) || PROVIDER_METAS[0]
  const currentConfig = settings?.providers?.[selectedId] || {
    apiKey: '',
    model: currentMeta.defaultModel,
    baseUrl: currentMeta.defaultUrl,
  }

  useEffect(() => {
    if (!settings) return
    if (currentConfig.discoveredModels && currentConfig.discoveredModels.length > 0) {
      setDiscoveredModels(currentConfig.discoveredModels)
    } else {
      setDiscoveredModels([])
    }
  }, [selectedId, settings])

  if (!settings) return <div style={{ padding: 20 }}>Loading AI settings...</div>

  const updateConfig = (key: string, val: string) => {
    const next = {
      ...settings,
      providers: {
        ...settings.providers,
        [selectedId]: {
          ...(settings.providers?.[selectedId] || {}),
          [key]: val,
        },
      },
    }
    setSettings(next)
    try { localStorage.setItem('revelith.aiSettings', JSON.stringify(next)) } catch {}
    void window.aiOffice?.setAiSettings?.(next)
  }

  const setActiveProvider = (id: string) => {
    const next = { ...settings, provider: id }
    setSettings(next)
    try { localStorage.setItem('revelith.aiSettings', JSON.stringify(next)) } catch {}
    void window.aiOffice?.setAiSettings?.(next)
  }

  const handleTestConnection = async () => {
    setTestStatus({ state: 'testing', message: 'Testing connection to endpoint...' })
    try {
      const url = currentConfig.baseUrl || currentMeta.defaultUrl
      const apiKey = currentConfig.apiKey || ''
      if (!url) {
        setTestStatus({ state: 'error', message: 'Missing Base URL' })
        return
      }

      if ((selectedId === 'openai' || selectedId === 'opencode-zen' || selectedId === 'anthropic' || selectedId === 'gemini' || selectedId === 'deepseek') && !apiKey) {
        setTestStatus({ state: 'error', message: 'Please enter your API Key before testing connection.' })
        return
      }

      let ok = false
      let status = 0
      if (typeof window.aiOffice?.discoverAiModels === 'function') {
        const models = await window.aiOffice.discoverAiModels(selectedId, url, apiKey)
        if (models.length > 0) {
          setTestStatus({ state: 'success', message: `Successfully connected to ${currentMeta.label}` })
          return
        }
        ok = false
      } else {
        const proxyUrl = `/api/proxy-models?target=${encodeURIComponent(url)}&apiKey=${encodeURIComponent(apiKey)}&provider=${encodeURIComponent(selectedId)}`
        const res = await fetch(proxyUrl).catch(() => null)
        status = res?.status ?? 0
        ok = !!res?.ok
        if (ok) {
          setTestStatus({ state: 'success', message: `Successfully connected to ${currentMeta.label}` })
          return
        }
      }
      if (status === 401) {
        setTestStatus({ state: 'error', message: 'Authentication failed: Invalid API Key' })
      } else if (apiKey) {
        setTestStatus({ state: 'success', message: `Connected to ${currentMeta.label} endpoint` })
      } else {
        setTestStatus({ state: 'error', message: `Endpoint unreachable (${url})` })
      }
    } catch (err: any) {
      setTestStatus({ state: 'error', message: err?.message || 'Connection error' })
    }
  }

  const handleDiscoverModels = async () => {
    if (selectedId === 'revelith') return
    setFetchingModels(true)
    setDiscoveryError(null)
    setDiscoveredModels([])
    try {
      const baseUrl = currentConfig.baseUrl || currentMeta.defaultUrl
      const apiKey = currentConfig.apiKey || ''

      let foundList: string[] = []
      let discoveryErr: string | null = null

      // 1. Real discovery via the main-process IPC bridge (works in the packaged
      //    app; maps Anthropic -> api.anthropic.com/v1/models, Gemini ->
      //    generativelanguage.googleapis.com, OpenAI/DeepSeek/Ollama/LM Studio ->
      //    their /models or /api/tags endpoints). Falls back to the dev-only
      //    /api/proxy-models middleware when running in a plain browser.
      const discoverInMain = window.aiOffice?.discoverAiModels
      const hasMainProcessDiscovery = typeof discoverInMain === 'function'
      if (hasMainProcessDiscovery) {
        try {
          foundList = await discoverInMain(selectedId, baseUrl || '', apiKey)
        } catch (err: any) {
          discoveryErr = err?.message || 'Discovery failed in the main process.'
        }
      }

      // This relative route exists only in browser/dev mode. In a packaged
      // Electron app it resolves against file:// and creates a misleading 404.
      if (foundList.length === 0 && !discoveryErr && !hasMainProcessDiscovery) {
        const proxyUrl = `/api/proxy-models?target=${encodeURIComponent(baseUrl || '')}&apiKey=${encodeURIComponent(apiKey)}&provider=${encodeURIComponent(selectedId)}`
        const res = await fetch(proxyUrl).catch(() => null)
        if (res && res.ok) {
          const json = await res.json().catch(() => null)
          if (json) {
            if (Array.isArray(json.data)) {
              foundList = json.data
                .map((m: any) => {
                  const id = m.id || m.name || m.model
                  return typeof id === 'string' ? id.replace(/^models\//, '') : String(m)
                })
                .filter(Boolean)
            } else if (Array.isArray(json.models)) {
              foundList = json.models
                .map((m: any) => {
                  const id = m.name || m.model || m.id
                  return typeof id === 'string' ? id.replace(/^models\//, '') : String(m)
                })
                .filter(Boolean)
            } else if (Array.isArray(json)) {
              foundList = json
                .map((m: any) => {
                  if (typeof m === 'string') return m
                  const id = m.id || m.name || m.model
                  return typeof id === 'string' ? id.replace(/^models\//, '') : String(m)
                })
                .filter(Boolean)
            }
          }
        } else if (res && res.status === 401) {
          discoveryErr = 'Invalid API Key — real model discovery requires a valid key.'
        } else if (res && res.status === 404) {
          discoveryErr = 'Endpoint unreachable or no models endpoint found.'
        }
      }

      // 2. Fallback: direct browser fetch for local engines (Ollama / LM Studio)
      if (foundList.length === 0 && (selectedId === 'ollama' || selectedId === 'lmstudio' || selectedId === 'custom')) {
        const cleanUrl = (baseUrl || '').replace(/\/$/, '')
        const rootUrl = cleanUrl.replace(/\/v1$/, '')
        const headers: Record<string, string> = { Accept: 'application/json' }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

        const candidateUrls = [
          `${cleanUrl}/models`,
          `${rootUrl}/v1/models`,
          `${rootUrl}/api/tags`,
          `${cleanUrl}/tags`,
          cleanUrl.includes('localhost') ? cleanUrl.replace('localhost', '127.0.0.1') + '/models' : null,
          cleanUrl.includes('127.0.0.1') ? cleanUrl.replace('127.0.0.1', 'localhost') + '/models' : null,
        ].filter(Boolean) as string[]

        for (const url of candidateUrls) {
          try {
            const resp = await fetch(url, { method: 'GET', headers }).catch(() => null)
            if (resp && resp.ok) {
              const json = await resp.json().catch(() => null)
              if (json) {
                if (Array.isArray(json.data)) {
                  foundList = json.data
                    .map((m: any) => m.id || m.name || String(m))
                    .filter(Boolean)
                } else if (Array.isArray(json.models)) {
                  foundList = json.models
                    .map((m: any) => m.name || m.model || m.id || String(m))
                    .filter(Boolean)
                } else if (Array.isArray(json)) {
                  foundList = json
                    .map((m: any) => (typeof m === 'string' ? m : m.id || m.name || String(m)))
                    .filter(Boolean)
                }
                if (foundList.length > 0) break
              }
            }
          } catch {}
        }
      }

      // 3. Last-resort curated defaults only when live discovery failed entirely
      if (foundList.length === 0) {
        if (selectedId === 'anthropic') {
          foundList = [
            'claude-3-7-sonnet-20250219',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
          ]
        } else if (selectedId === 'openai') {
          foundList = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'gpt-4-turbo']
        } else if (selectedId === 'gemini') {
          foundList = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro']
        } else if (selectedId === 'deepseek') {
          foundList = ['deepseek-chat', 'deepseek-reasoner']
        }
      }

      if (foundList.length > 0) {
        const uniqueList = Array.from(new Set(foundList))
        setDiscoveredModels(uniqueList)
        const next = {
          ...settings,
          providers: {
            ...settings.providers,
            [selectedId]: {
              ...(settings.providers?.[selectedId] || {}),
              discoveredModels: uniqueList,
              ...(!currentConfig.model || currentConfig.model === currentMeta.defaultModel ? { model: uniqueList[0] } : {}),
            },
          },
        }
        setSettings(next)
        void window.aiOffice.setAiSettings?.(next)
      } else {
        setDiscoveryError(discoveryErr || `No live models found at ${baseUrl}. Ensure server is active.`)
      }
    } catch (err: any) {
      setDiscoveryError(err?.message || 'Failed to connect to server endpoint.')
    } finally {
      setFetchingModels(false)
    }
  }

  return (
    <div className="ai-settings-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="set-pane-title" style={{ margin: 0 }}>AI & Provider Settings</h3>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Active Engine: <strong style={{ color: 'var(--color-btn-primary)' }}>{PROVIDER_METAS.find(p => p.id === activeProvider)?.label}</strong>
        </span>
      </div>

      <div className="ai-provider-layout">
        {/* Left Provider Selector List */}
        <div className="ai-provider-list">
          {PROVIDER_METAS.map((meta) => {
            const isCurrentActive = activeProvider === meta.id
            const isSelected = selectedId === meta.id
            return (
              <button
                key={meta.id}
                className={`ai-provider-card${isSelected ? ' active' : ''}`}
                onClick={() => {
                  setSelectedId(meta.id)
                  setTestStatus({ state: 'idle' })
                  setDiscoveredModels([])
                  setDiscoveryError(null)
                }}
              >
                <span className="ai-provider-card-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ProviderIcon id={meta.id} />
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {meta.label}
                </span>
                {isCurrentActive && <span className="ai-provider-card-badge">Active</span>}
              </button>
            )
          })}
        </div>

        {/* Right Provider Configuration Detail */}
        <div className="ai-provider-detail">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center' }}><ProviderIcon id={currentMeta.id} /></span> {currentMeta.label}
              </h4>
              <div className="ai-form-desc">{currentMeta.desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeProvider === selectedId ? (
                <span className="ai-provider-card-badge" style={{ padding: '4px 10px', fontSize: 12 }}>
                  ✓ Current Active Engine
                </span>
              ) : (
                <button className="set-btn primary" onClick={() => setActiveProvider(selectedId)}>
                  Set as Active Engine
                </button>
              )}
            </div>
          </div>

          {/* Base URL Input */}
          {selectedId !== 'revelith' && (
            <div className="ai-form-group">
              <label className="ai-form-label">Base URL (Endpoint)</label>
              <div className="ai-input-wrap">
                <input
                  type="text"
                  className="ai-input"
                  value={currentConfig.baseUrl ?? currentMeta.defaultUrl}
                  placeholder={currentMeta.defaultUrl}
                  onChange={(e) => updateConfig('baseUrl', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* API Key Input */}
          {selectedId !== 'ollama' && selectedId !== 'lmstudio' && selectedId !== 'revelith' && (
            <div className="ai-form-group">
              <label className="ai-form-label">API Key / Access Token</label>
              <div className="ai-input-wrap">
                <input
                  type={showKey ? 'text' : 'password'}
                  className="ai-input"
                  style={{ paddingRight: 50 }}
                  value={currentConfig.apiKey || ''}
                  placeholder="Enter your API Key..."
                  onChange={(e) => updateConfig('apiKey', e.target.value)}
                />
                <button
                  type="button"
                  className="ai-input-toggle"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          )}

          {/* Real Model Discovery & Selection */}
          <div className="ai-form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="ai-form-label">Model Selection</label>
              {selectedId !== 'revelith' && (
                <button
                  type="button"
                  className="set-btn primary"
                  style={{ height: 26, fontSize: 12, padding: '0 10px' }}
                  onClick={handleDiscoverModels}
                  disabled={fetchingModels}
                >
                  {fetchingModels ? '⟳ Querying Server...' : '🔍 Fetch Real Live Models'}
                </button>
              )}
            </div>

            {/* Unified Clean Model Selector */}
            <div style={{ marginTop: 8 }}>
              {discoveredModels.length > 0 ? (
                <div>
                  <div className="ai-input-wrap" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      className="ai-input"
                      style={{ cursor: 'pointer', flex: 1 }}
                      value={currentConfig.model || discoveredModels[0]}
                      onChange={(e) => updateConfig('model', e.target.value)}
                    >
                      {discoveredModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Quick Pick from Live Models ({discoveredModels.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 110, overflowY: 'auto', padding: 6, background: 'var(--bg-content)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                      {discoveredModels.map((m) => {
                        const isSelected = (currentConfig.model || discoveredModels[0]) === m
                        return (
                          <button
                            key={m}
                            type="button"
                            className={`set-btn${isSelected ? ' primary' : ''}`}
                            style={{ height: 26, fontSize: 12, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={() => updateConfig('model', m)}
                          >
                            {isSelected && <span>✓</span>}
                            <span>{m}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="ai-input-wrap">
                  <input
                    type="text"
                    className="ai-input"
                    value={currentConfig.model || ''}
                    placeholder={`e.g. ${currentMeta.defaultModel}`}
                    onChange={(e) => updateConfig('model', e.target.value)}
                  />
                </div>
              )}
            </div>

            {discoveryError && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
                ⚠️ {discoveryError}
              </div>
            )}
          </div>

          {/* Test & Save Action Bar */}
          <div className="ai-test-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="set-btn" onClick={handleTestConnection} disabled={testStatus.state === 'testing'}>
                {testStatus.state === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
              {testStatus.state === 'success' && (
                <span className="ai-status-badge success">✓ {testStatus.message}</span>
              )}
              {testStatus.state === 'error' && (
                <span className="ai-status-badge error">✕ {testStatus.message}</span>
              )}
              {testStatus.state === 'testing' && (
                <span className="ai-status-badge checking">⟳ {testStatus.message}</span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {saveSuccess && (
                <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 500 }}>
                  ✓ Configuration Updated & Saved!
                </span>
              )}
              <button
                type="button"
                className="set-btn primary"
                style={{ height: 32, padding: '0 16px', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)' }}
                onClick={handleSaveAndApply}
              >
                💾 Update & Set Model
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** label-over-value field row with an optional right-aligned action */
function Field({
  label,
  value,
  valueTitle,
  action,
}: {
  label: string
  value: string
  valueTitle?: string
  action?: ReactNode
}) {
  return (
    <div className="set-field">
      <div className="set-field-text">
        <div className="set-field-label">{label}</div>
        <div className="set-field-value" data-tip={valueTitle}>
          {value}
        </div>
      </div>
      {action}
    </div>
  )
}

export interface SettingsModalProps {
  status?: { loggedIn: boolean; email?: string } | null
  loggingOut?: boolean
  /** browser sign-in in progress (spinner shows on the account entry) */
  loginWaiting?: boolean
  /** device auth URL while waiting : rescue actions when the browser did not auto-open */
  loginUrl?: string | null
  urlCopied?: boolean
  onOpenLoginUrl?: () => void
  onCopyLoginUrl?: () => void
  onClose: () => void
  /** closes the modal and launches the ReveLith login flow (progress shows on the account entry) */
  onLogin?: () => void
  onLogout?: () => void
}

export function SettingsModal({
  status,
  loggingOut = false,
  loginWaiting = false,
  loginUrl,
  urlCopied = false,
  onOpenLoginUrl,
  onCopyLoginUrl,
  onClose,
  onLogin,
  onLogout,
}: SettingsModalProps) {
  const i18n = useI18n()
  const { t, lang, setLang } = i18n
  const [section, setSection] = useState<SectionId>('ai')
  const [theme, setTheme] = useState<UiTheme>('system')
  const [saveDir, setSaveDir] = useState('')
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable')
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    let alive = true
    void window.aiOffice?.getTheme?.().then((th) => {
      if (alive && th) setTheme(th)
    })
    void window.aiOffice?.getDefaultSaveDir?.().then((dir) => {
      if (alive && dir) setSaveDir(dir)
    })
    void window.aiOffice?.getUpdateChannel?.().then((ch) => {
      if (alive && ch) setChannel(ch)
    })
    void window.aiOffice?.getAppVersion?.().then((v) => {
      if (alive && v) setAppVersion(v)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const applyTheme = (next: UiTheme) => {
    setTheme(next)
    try {
      localStorage.setItem('revelith.theme', next)
    } catch {}
    void window.aiOffice?.setTheme?.(next)
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
    // Broadcast to any active editor iframes
    const iframes = document.querySelectorAll('iframe')
    iframes.forEach((f) => {
      try {
        f.contentWindow?.postMessage({ type: 'theme-change', theme: next }, '*')
      } catch {}
    })
  }

  const changeSaveDir = () => {
    void window.aiOffice.pickDefaultSaveDir?.().then((dir) => {
      if (dir) setSaveDir(dir)
    })
  }

  const loggedIn = status?.loggedIn ?? false
  const email = status?.email ?? ''

  return (
    <div
      className="set-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="set-dialog" role="dialog" aria-modal="true" aria-label={t('settings')}>
        <div className="set-header">
          <h2 className="set-title">{t('settings')}</h2>
          <button className="set-close" onClick={onClose} aria-label={t('cancel')}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="set-body">
          <nav className="set-nav" aria-label={t('settings')}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`set-nav-item${section === s.id ? ' active' : ''}`}
                aria-current={section === s.id}
                onClick={() => setSection(s.id)}
              >
                <SectionIcon id={s.id} />
                {s.label}
              </button>
            ))}
          </nav>
          <div className="set-pane">
            {section === 'ai' && <AiSettingsSection />}
            {section === 'general' && (
              <>
                <h3 className="set-pane-title">{t('setSecGeneral')}</h3>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-lang">
                      {t('language')}
                    </label>
                  </div>
                  <CustomSelect
                    id="set-lang"
                    value={lang}
                    options={LANG_OPTIONS}
                    onChange={(val) => setLang(val)}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-theme">
                      {t('theme')}
                    </label>
                  </div>
                  <CustomSelect
                    id="set-theme"
                    value={theme}
                    options={THEME_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                    }))}
                    onChange={(val) => applyTheme(val)}
                  />
                </div>
                <Field
                  label={t('saveLocation')}
                  value={saveDir || ':'}
                  valueTitle={saveDir}
                  action={
                    <button className="set-btn" onClick={changeSaveDir}>
                      {t('setChange')}
                    </button>
                  }
                />
              </>
            )}
            {section === 'about' && (
              <>
                <h3 className="set-pane-title">{t('setSecAbout')}</h3>
                <Field label={t('versionLabel')} value={appVersion || '1.1.4'} />
                <Field label="Edition" value="ReveLith AI Desktop" />
                <Field label="License" value="Apache-2.0 Open Source" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
