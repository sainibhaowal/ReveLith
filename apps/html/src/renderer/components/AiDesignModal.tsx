import { useState } from 'react'

export interface AiDesignRequest {
  layoutType: 'landing' | 'dashboard' | 'slides'
  styleDirection:
    'modern-dark' | 'glassmorphism' | 'clean-corporate' | 'minimalist' | 'vibrant-gradient'
  brief: string
}

interface AiDesignModalProps {
  isOpen: boolean
  onClose: () => void
  onGenerate: (req: AiDesignRequest) => void
  isGenerating?: boolean
  error?: string | null
  onCancel?: () => void
}

export function AiDesignModal({
  isOpen,
  onClose,
  onGenerate,
  isGenerating,
  error,
  onCancel,
}: AiDesignModalProps) {
  const [layoutType, setLayoutType] = useState<'landing' | 'dashboard' | 'slides'>('landing')
  const [styleDirection, setStyleDirection] = useState<
    'modern-dark' | 'glassmorphism' | 'clean-corporate' | 'minimalist' | 'vibrant-gradient'
  >('modern-dark')
  const [brief, setBrief] = useState('')

  if (!isOpen) return null

  const handleGenerate = () => {
    if (!brief.trim()) return
    onGenerate({ layoutType, styleDirection, brief: brief.trim() })
  }

  const LAYOUTS = [
    {
      id: 'landing' as const,
      icon: '🚀',
      title: 'Landing Page',
      desc: 'Hero section, feature grid, pricing & CTA',
    },
    {
      id: 'dashboard' as const,
      icon: '📊',
      title: 'Dashboard',
      desc: 'KPI cards, charts, activity table & filters',
    },
    {
      id: 'slides' as const,
      icon: '🎞️',
      title: 'Slides-Style',
      desc: '16:9 presentation decks with slide containers',
    },
  ]

  const STYLES = [
    {
      id: 'modern-dark' as const,
      label: 'Modern Dark',
      desc: 'Deep background with glowing accents',
    },
    {
      id: 'glassmorphism' as const,
      label: 'Glassmorphism',
      desc: 'Frosted glass cards & backdrop blur',
    },
    {
      id: 'clean-corporate' as const,
      label: 'Clean Corporate',
      desc: 'Refined enterprise white & slate layout',
    },
    {
      id: 'minimalist' as const,
      label: 'Minimalist',
      desc: 'Monochrome, generous whitespace & crisp fonts',
    },
    {
      id: 'vibrant-gradient' as const,
      label: 'Vibrant Gradient',
      desc: 'Energetic gradients & punchy buttons',
    },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50000,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#18181b',
          border: '1px solid #27272a',
          borderRadius: 12,
          width: '100%',
          maxWidth: 620,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #27272a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🎨</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#f43f5e' }}>AI Design Mode</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#71717a',
              cursor: 'pointer',
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            padding: 20,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Step 1: Layout Type */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#a1a1aa',
                display: 'block',
                marginBottom: 8,
              }}
            >
              1. Choose Page Type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {LAYOUTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLayoutType(item.id)}
                  style={{
                    padding: 12,
                    background: layoutType === item.id ? 'rgba(244, 63, 94, 0.12)' : '#27272a',
                    border: `1.5px solid ${layoutType === item.id ? '#f43f5e' : '#3f3f46'}`,
                    borderRadius: 8,
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{item.icon}</div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: layoutType === item.id ? '#fb7185' : '#fff',
                    }}
                  >
                    {item.title}
                  </div>
                  <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 2 }}>{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Style Direction */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#a1a1aa',
                display: 'block',
                marginBottom: 8,
              }}
            >
              2. Style Direction
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStyleDirection(st.id)}
                  style={{
                    padding: '8px 12px',
                    background: styleDirection === st.id ? 'rgba(59, 130, 246, 0.15)' : '#27272a',
                    border: `1.5px solid ${styleDirection === st.id ? '#3b82f6' : '#3f3f46'}`,
                    borderRadius: 6,
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: styleDirection === st.id ? '#60a5fa' : '#fff',
                    }}
                  >
                    {st.label}
                  </div>
                  <div style={{ fontSize: 10, color: '#a1a1aa' }}>{st.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Brief */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#a1a1aa',
                display: 'block',
                marginBottom: 8,
              }}
            >
              3. Project Brief & Content Instructions
            </label>
            <textarea
              placeholder="e.g. 'A landing page for an AI accounting app called LedgerAI with instant receipts, live cashflow forecast, and Stripe sync. Include hero section, 3-tier pricing, and customer quotes.'"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 12,
                background: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: 8,
                color: '#fff',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #27272a',
            background: '#121214',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          {error && (
            <span style={{ marginRight: 'auto', fontSize: 12, color: '#f87171' }}>⚠ {error}</span>
          )}
          {isGenerating && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                background: '#27272a',
                border: '1px solid #ef4444',
                borderRadius: 6,
                color: '#fca5a5',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: 6,
              color: '#d4d4d8',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!brief.trim() || isGenerating}
            onClick={handleGenerate}
            style={{
              padding: '8px 20px',
              background: brief.trim() ? '#e11d48' : '#3f3f46',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontWeight: 600,
              fontSize: 12,
              cursor: brief.trim() && !isGenerating ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {isGenerating ? 'Building with AI...' : 'Build Visual Page'}
          </button>
        </div>
      </div>
    </div>
  )
}
