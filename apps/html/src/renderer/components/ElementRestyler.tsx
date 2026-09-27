import { useState, useEffect } from 'react'

export interface SelectedElementData {
  tagName: string
  id?: string
  className?: string
  outerHtml: string
  innerText: string
  styles: {
    color: string
    backgroundColor: string
    fontSize: string
    fontWeight: string
    textAlign: string
    padding: string
    margin: string
    borderRadius: string
    display: string
  }
}

interface ElementRestylerProps {
  element: SelectedElementData | null
  onApplyStyle: (property: string, value: string) => void
  onUpdateText: (newText: string) => void
  onDeleteElement: () => void
  onDuplicateElement: () => void
  onAskAi: (instruction: string) => void
  onClose: () => void
}

export function ElementRestyler({
  element,
  onApplyStyle,
  onUpdateText,
  onDeleteElement,
  onDuplicateElement,
  onAskAi,
  onClose,
}: ElementRestylerProps) {
  const [aiPrompt, setAiPrompt] = useState('')
  const [textVal, setTextVal] = useState('')

  useEffect(() => {
    if (element) setTextVal(element.innerText || '')
  }, [element])

  if (!element) {
    return (
      <div
        style={{
          width: 280,
          background: '#18181b',
          borderLeft: '1px solid #27272a',
          padding: 16,
          color: '#71717a',
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 24, marginBottom: 8 }}>👆</span>
        Click any element in the live preview to inspect, restyle, or ask AI to change just that part.
      </div>
    )
  }

  const handleAsk = () => {
    if (!aiPrompt.trim()) return
    onAskAi(aiPrompt.trim())
    setAiPrompt('')
  }

  return (
    <div
      style={{
        width: 300,
        background: '#18181b',
        borderLeft: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: '#e4e4e7',
        fontSize: 12,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, color: '#f43f5e' }}>&lt;{element.tagName}&gt;</span>
          {element.className && (
            <span
              style={{
                color: '#10b981',
                fontSize: 11,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 120,
              }}
            >
              .{element.className.split(' ')[0]}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      {/* Ask AI on selected element */}
      <div style={{ padding: 12, borderBottom: '1px solid #27272a', background: 'rgba(59, 130, 246, 0.05)' }}>
        <div style={{ fontWeight: 600, color: '#60a5fa', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>✨</span> Ask AI on This Element
        </div>
        <textarea
          placeholder="e.g. 'Make this a glowing modern card with glassmorphism and an icon', 'Rewrite as punchy headline'..."
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAsk()
          }}
          rows={3}
          style={{
            width: '100%',
            padding: 8,
            fontSize: 11,
            background: '#27272a',
            border: '1px solid #3b82f6',
            borderRadius: 6,
            color: '#fff',
            resize: 'vertical',
            outline: 'none',
          }}
        />
        <button
          type="button"
          disabled={!aiPrompt.trim()}
          onClick={handleAsk}
          style={{
            width: '100%',
            marginTop: 6,
            padding: '6px 12px',
            background: aiPrompt.trim() ? '#2563eb' : '#3f3f46',
            border: 'none',
            borderRadius: 5,
            color: '#fff',
            fontWeight: 600,
            fontSize: 11,
            cursor: aiPrompt.trim() ? 'pointer' : 'default',
          }}
        >
          Change Just This Part
        </button>
      </div>

      {/* Quick Actions */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #27272a', display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={onDuplicateElement}
          style={{
            flex: 1,
            padding: '4px 8px',
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: 4,
            color: '#d4d4d8',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={onDeleteElement}
          style={{
            flex: 1,
            padding: '4px 8px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: 4,
            color: '#f87171',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Delete
        </button>
      </div>

      {/* Text Content */}
      <div style={{ padding: 12, borderBottom: '1px solid #27272a' }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: '#a1a1aa' }}>Content Text</div>
        <textarea
          value={textVal}
          onChange={(e) => {
            setTextVal(e.target.value)
            onUpdateText(e.target.value)
          }}
          rows={2}
          style={{
            width: '100%',
            padding: '6px 8px',
            fontSize: 11,
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: 4,
            color: '#fff',
            outline: 'none',
          }}
        />
      </div>

      {/* Styling Controls */}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 600, color: '#a1a1aa' }}>Visual Styling</div>

        {/* Colors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 10, color: '#71717a', display: 'block', marginBottom: 4 }}>Text Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="color"
                defaultValue={element.styles.color || '#000000'}
                onChange={(e) => onApplyStyle('color', e.target.value)}
                style={{ width: 28, height: 28, border: 'none', borderRadius: 4, background: 'none', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{element.styles.color || 'inherit'}</span>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#71717a', display: 'block', marginBottom: 4 }}>Background</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="color"
                defaultValue={element.styles.backgroundColor || '#ffffff'}
                onChange={(e) => onApplyStyle('backgroundColor', e.target.value)}
                style={{ width: 28, height: 28, border: 'none', borderRadius: 4, background: 'none', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{element.styles.backgroundColor || 'none'}</span>
            </div>
          </div>
        </div>

        {/* Typography */}
        <div>
          <label style={{ fontSize: 10, color: '#71717a', display: 'block', marginBottom: 4 }}>Font Size & Weight</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              defaultValue={element.styles.fontSize || '16px'}
              onChange={(e) => onApplyStyle('fontSize', e.target.value)}
              style={{ flex: 1, padding: 4, fontSize: 11, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 4, color: '#fff' }}
            >
              <option value="12px">Small (12px)</option>
              <option value="14px">Normal (14px)</option>
              <option value="16px">Medium (16px)</option>
              <option value="20px">Large (20px)</option>
              <option value="24px">XL (24px)</option>
              <option value="32px">2XL (32px)</option>
              <option value="48px">Hero (48px)</option>
            </select>
            <select
              defaultValue={element.styles.fontWeight || '400'}
              onChange={(e) => onApplyStyle('fontWeight', e.target.value)}
              style={{ flex: 1, padding: 4, fontSize: 11, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 4, color: '#fff' }}
            >
              <option value="300">Light (300)</option>
              <option value="400">Regular (400)</option>
              <option value="600">SemiBold (600)</option>
              <option value="700">Bold (700)</option>
              <option value="900">Black (900)</option>
            </select>
          </div>
        </div>

        {/* Text Alignment */}
        <div>
          <label style={{ fontSize: 10, color: '#71717a', display: 'block', marginBottom: 4 }}>Alignment</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {['left', 'center', 'right', 'justify'].map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => onApplyStyle('textAlign', align)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  fontSize: 11,
                  background: element.styles.textAlign === align ? 'rgba(59, 130, 246, 0.3)' : '#27272a',
                  border: '1px solid #3f3f46',
                  borderRadius: 4,
                  color: element.styles.textAlign === align ? '#60a5fa' : '#ccc',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {align}
              </button>
            ))}
          </div>
        </div>

        {/* Spacing & Borders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 10, color: '#71717a', display: 'block', marginBottom: 4 }}>Padding</label>
            <input
              type="text"
              placeholder="e.g. 12px 20px"
              defaultValue={element.styles.padding || ''}
              onBlur={(e) => onApplyStyle('padding', e.target.value)}
              style={{ width: '100%', padding: '4px 6px', fontSize: 11, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 4, color: '#fff' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, color: '#71717a', display: 'block', marginBottom: 4 }}>Border Radius</label>
            <input
              type="text"
              placeholder="e.g. 8px, 9999px"
              defaultValue={element.styles.borderRadius || ''}
              onBlur={(e) => onApplyStyle('borderRadius', e.target.value)}
              style={{ width: '100%', padding: '4px 6px', fontSize: 11, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 4, color: '#fff' }}
            />
          </div>
        </div>

        {/* Quick Style Presets */}
        <div>
          <label style={{ fontSize: 10, color: '#71717a', display: 'block', marginBottom: 4 }}>Style Presets</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button
              type="button"
              onClick={() => {
                onApplyStyle('background', 'rgba(255, 255, 255, 0.08)')
                onApplyStyle('backdropFilter', 'blur(12px)')
                onApplyStyle('border', '1px solid rgba(255, 255, 255, 0.15)')
                onApplyStyle('borderRadius', '12px')
                onApplyStyle('boxShadow', '0 8px 32px 0 rgba(0, 0, 0, 0.37)')
              }}
              style={{ padding: '3px 8px', fontSize: 10, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 4, color: '#e4e4e7', cursor: 'pointer' }}
            >
              Glassmorphism
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyStyle('background', 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)')
                onApplyStyle('color', '#ffffff')
                onApplyStyle('borderRadius', '8px')
                onApplyStyle('border', 'none')
              }}
              style={{ padding: '3px 8px', fontSize: 10, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 4, color: '#e4e4e7', cursor: 'pointer' }}
            >
              Purple Gradient
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyStyle('boxShadow', '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)')
                onApplyStyle('border', '1px solid #e2e8f0')
                onApplyStyle('borderRadius', '8px')
              }}
              style={{ padding: '3px 8px', fontSize: 10, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 4, color: '#e4e4e7', cursor: 'pointer' }}
            >
              Card Shadow
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
