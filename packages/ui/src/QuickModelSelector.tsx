import { useEffect, useRef, useState } from 'react'

type ModelSettings = {
  provider: string
  providers: Record<string, { model?: string; discoveredModels?: string[] }>
}

/** Compact, app-agnostic active-model picker for AI panel headers. */
export function QuickModelSelector({
  getSettings,
  setSettings,
}: {
  getSettings: () => Promise<ModelSettings>
  setSettings: (settings: ModelSettings) => Promise<void>
}) {
  const [settings, setLocalSettings] = useState<ModelSettings | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const refresh = () =>
    void getSettings()
      .then(setLocalSettings)
      .catch(() => undefined)

  useEffect(() => {
    refresh()
  }, [])
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!settings) return null
  const provider = settings.provider
  const config = settings.providers[provider] ?? {}
  const model = config.model || 'Select model'
  const models = config.discoveredModels?.length ? config.discoveredModels : [model]
  const choose = (nextModel: string) => {
    const next = {
      ...settings,
      providers: { ...settings.providers, [provider]: { ...config, model: nextModel } },
    }
    setLocalSettings(next)
    setOpen(false)
    void setSettings(next).catch(refresh)
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="ai-track-btn"
        onClick={() => setOpen((value) => !value)}
        title={`Model: ${model}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          maxWidth: 160,
          padding: '2px 8px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,.15)',
          borderRadius: 12,
          background: 'rgba(255,255,255,.08)',
          color: '#e1e1e6',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        ⚡ <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{model}</span> ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: 250,
            maxHeight: 320,
            overflowY: 'auto',
            zIndex: 99999,
            padding: 8,
            borderRadius: 10,
            background: '#1e1e24',
            border: '1px solid rgba(255,255,255,.15)',
            boxShadow: '0 8px 24px rgba(0,0,0,.6)',
          }}
        >
          <div style={{ marginBottom: 6, color: '#aaa', fontSize: 10 }}>
            ACTIVE MODEL · {provider}
          </div>
          {models.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => choose(candidate)}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 8px',
                border: 0,
                borderRadius: 5,
                background: candidate === model ? 'rgba(59,130,246,.25)' : 'transparent',
                color: candidate === model ? '#60a5fa' : '#ddd',
                cursor: 'pointer',
                fontSize: 11,
                textAlign: 'left',
                wordBreak: 'break-all',
              }}
            >
              {candidate}
              {candidate === model ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
