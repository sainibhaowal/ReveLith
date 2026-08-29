import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type ModelSettings = {
  provider: string
  providers?: Record<string, { model?: string; discoveredModels?: string[] }>
}

export const PROVIDER_LABELS: Record<string, { label: string; icon: string }> = {
  lmstudio: { label: 'LM Studio', icon: '💻' },
  ollama: { label: 'Ollama', icon: '🦙' },
  openai: { label: 'OpenAI', icon: '🟢' },
  'opencode-zen': { label: 'OpenCode Zen', icon: '⚡' },
  anthropic: { label: 'Claude', icon: '🟣' },
  gemini: { label: 'Google Gemini', icon: '🔵' },
  deepseek: { label: 'DeepSeek', icon: '🔴' },
  custom: { label: 'Custom Server', icon: '⚡' },
}

/** Unified active-model picker for AI panel headers across all ReveLith apps. */
export function QuickModelSelector({
  getSettings,
  setSettings,
}: {
  getSettings: () => Promise<ModelSettings>
  setSettings: (settings: ModelSettings) => Promise<void>
}) {
  const [settings, setLocalSettings] = useState<ModelSettings | null>(null)
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const reloadSettings = () => {
    try {
      const p = getSettings?.()
      return Promise.resolve(p)
        .then((s) => {
          if (s) setLocalSettings(s)
          return s
        })
        .catch(() => {
          try {
            const stored =
              (typeof localStorage !== 'undefined' && localStorage.getItem('revelith.aiSettings')) ||
              (typeof window !== 'undefined' && window.parent?.localStorage?.getItem?.('revelith.aiSettings'))
            if (stored) setLocalSettings(JSON.parse(stored))
          } catch {}
        })
    } catch {
      try {
        const stored =
          (typeof localStorage !== 'undefined' && localStorage.getItem('revelith.aiSettings')) ||
          (typeof window !== 'undefined' && window.parent?.localStorage?.getItem?.('revelith.aiSettings'))
        if (stored) setLocalSettings(JSON.parse(stored))
      } catch {}
      return Promise.resolve()
    }
  }

  useEffect(() => {
    void reloadSettings()
    const handleStorage = () => void reloadSettings()
    window.addEventListener('storage', handleStorage)
    window.addEventListener('ai-settings-changed', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('ai-settings-changed', handleStorage)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (!settings) return null
  const provider = settings.provider || 'lmstudio'
  const config = settings.providers?.[provider] || {}
  const model = config.model || 'Select model'
  const models = config.discoveredModels?.length ? config.discoveredModels : (config.model ? [config.model] : [])
  const providerMeta = PROVIDER_LABELS[provider] || { label: provider, icon: '🤖' }

  const choose = (nextModel: string) => {
    const next: ModelSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        [provider]: { ...config, model: nextModel },
      },
    }
    setLocalSettings(next)
    setOpen(false)
    try {
      localStorage.setItem('revelith.aiSettings', JSON.stringify(next))
      if (typeof window !== 'undefined' && window.parent?.localStorage) {
        window.parent.localStorage.setItem('revelith.aiSettings', JSON.stringify(next))
      }
    } catch {}
    window.dispatchEvent(new Event('ai-settings-changed'))
    void setSettings(next).catch(() => void reloadSettings())
  }

  const handleSelectProvider = (pId: string) => {
    const next: ModelSettings = { ...settings, provider: pId }
    setLocalSettings(next)
    setOpen(false)
    try {
      localStorage.setItem('revelith.aiSettings', JSON.stringify(next))
      if (typeof window !== 'undefined' && window.parent?.localStorage) {
        window.parent.localStorage.setItem('revelith.aiSettings', JSON.stringify(next))
      }
    } catch {}
    window.dispatchEvent(new Event('ai-settings-changed'))
    void setSettings(next).catch(() => void reloadSettings())
  }

  const openFullSettings = () => {
    setOpen(false)
    window.dispatchEvent(new CustomEvent('open-ai-settings'))
    try {
      window.parent?.postMessage({ type: 'open-ai-settings' }, '*')
    } catch {}
  }

  const toggle = () => {
    void reloadSettings().finally(() => {
      if (open) {
        setOpen(false)
        return
      }
      const box = triggerRef.current?.getBoundingClientRect()
      if (box) {
        setMenuPosition({
          left: Math.max(8, Math.min(box.left, window.innerWidth - 320)),
          top: Math.min(box.bottom + 6, window.innerHeight - 80),
        })
      }
      setOpen(true)
    })
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        className="ai-track-btn"
        onClick={toggle}
        title={`Active Engine: ${providerMeta.label} | Model: ${model}`}
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
          textOverflow: 'ellipsis',
        }}
      >
        <span>{providerMeta.icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{model}</span>
        <span style={{ fontSize: 8, opacity: 0.7 }}>▼</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            data-model-picker
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              width: 304,
              maxHeight: 'min(480px, calc(100vh - 72px))',
              overflowY: 'auto',
              background: '#1e1e24',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              padding: 8,
              zIndex: 99999,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6 }}>
              ENGINE: {providerMeta.icon} {providerMeta.label}
            </div>

            {models.length > 0 ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>
                  Discovered Models ({models.length}):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {models.map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      onClick={() => choose(candidate)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '5px 8px',
                        borderRadius: 5,
                        border: 'none',
                        background: candidate === model ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                        color: candidate === model ? '#60a5fa' : '#ddd',
                        fontSize: 11,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ wordBreak: 'break-all' }}>{candidate}</span>
                      {candidate === model && <span>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 10, color: '#888', padding: '4px 0', marginBottom: 6 }}>
                No discovered list stored yet. Fetch models in settings.
              </div>
            )}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Switch AI Engine:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {Object.entries(PROVIDER_LABELS).map(([pId, meta]) => (
                  <button
                    key={pId}
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 6px',
                      borderRadius: 5,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: pId === provider ? 'rgba(255,255,255,0.12)' : 'transparent',
                      color: pId === provider ? '#fff' : '#aaa',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                    onClick={() => handleSelectProvider(pId)}
                  >
                    <span>{meta.icon}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {meta.label}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  marginTop: 6,
                  borderRadius: 5,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
                onClick={openFullSettings}
              >
                ⚙️ Open Full Settings Modal
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
