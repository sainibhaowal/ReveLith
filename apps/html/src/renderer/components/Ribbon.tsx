import React from 'react'

export type ViewLayout = 'preview' | 'split' | 'code'

interface RibbonProps {
  viewLayout: ViewLayout
  onChangeViewLayout: (layout: ViewLayout) => void
  showLayers: boolean
  onToggleLayers: () => void
  showInspector: boolean
  onToggleInspector: () => void
  onOpenDesign: () => void
  onOpenDocument: () => void
  onPresent: () => void
  onSave: () => void
  onSaveAs: () => void
  onExportWord: () => void
  onExportPdf: () => void
  onExportSingleFile: () => void
  onInsertSnippet: (kind: string) => void
  onInsertImageUrl: () => void
  dirty: boolean
  autoSave: boolean
  onToggleAutoSave: (enabled: boolean) => void
}

export function Ribbon({
  viewLayout,
  onChangeViewLayout,
  showLayers,
  onToggleLayers,
  showInspector,
  onToggleInspector,
  onOpenDesign,
  onOpenDocument,
  onPresent,
  onSave,
  onSaveAs: _onSaveAs,
  onExportWord,
  onExportPdf,
  onExportSingleFile,
  onInsertSnippet,
  onInsertImageUrl,
  dirty,
  autoSave: _autoSave,
  onToggleAutoSave: _onToggleAutoSave,
}: RibbonProps) {
  return (
    <div
      style={{
        background: '#18181b',
        borderBottom: '1px solid #27272a',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        userSelect: 'none',
        height: 48,
      }}
    >
      {/* Left: Brand + Creation Modes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
          <span style={{ fontSize: 18 }}>🌐</span>
          <span
            style={{ fontWeight: 700, fontSize: 13, color: '#f43f5e', letterSpacing: '-0.2px' }}
          >
            ReveLith HTML
          </span>
        </div>

        <div
          style={{ display: 'flex', gap: 6, borderRight: '1px solid #27272a', paddingRight: 12 }}
        >
          <button
            type="button"
            onClick={onOpenDesign}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              background: 'linear-gradient(135deg, #e11d48, #be123c)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(225, 29, 72, 0.3)',
            }}
          >
            <span>🎨</span> AI Design
          </button>
          <button
            type="button"
            onClick={onOpenDocument}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.3)',
            }}
          >
            <span>📝</span> AI Document
          </button>
        </div>

        {/* View Layout Tabs */}
        <div style={{ display: 'flex', background: '#27272a', padding: 2, borderRadius: 6 }}>
          <button
            type="button"
            onClick={() => onChangeViewLayout('preview')}
            style={{
              padding: '3px 8px',
              background: viewLayout === 'preview' ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: 'none',
              borderRadius: 4,
              color: viewLayout === 'preview' ? '#fff' : '#a1a1aa',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Live Preview
          </button>
          <button
            type="button"
            onClick={() => onChangeViewLayout('split')}
            style={{
              padding: '3px 8px',
              background: viewLayout === 'split' ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: 'none',
              borderRadius: 4,
              color: viewLayout === 'split' ? '#fff' : '#a1a1aa',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Split View
          </button>
          <button
            type="button"
            onClick={() => onChangeViewLayout('code')}
            style={{
              padding: '3px 8px',
              background: viewLayout === 'code' ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: 'none',
              borderRadius: 4,
              color: viewLayout === 'code' ? '#fff' : '#a1a1aa',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Code
          </button>
        </div>

        {/* Panel Toggles */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={onToggleLayers}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              background: showLayers ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              border: `1px solid ${showLayers ? '#3b82f6' : '#3f3f46'}`,
              borderRadius: 5,
              color: showLayers ? '#60a5fa' : '#a1a1aa',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <span>🌳</span> Layers
          </button>
          <button
            type="button"
            onClick={onToggleInspector}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              background: showInspector ? 'rgba(244, 63, 94, 0.2)' : 'transparent',
              border: `1px solid ${showInspector ? '#f43f5e' : '#3f3f46'}`,
              borderRadius: 5,
              color: showInspector ? '#fb7185' : '#a1a1aa',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <span>✨</span> Restyler
          </button>
          <button
            type="button"
            onClick={onPresent}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid #3f3f46',
              borderRadius: 5,
              color: '#a1a1aa',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <span>📽️</span> Present
          </button>
        </div>
      </div>

      {/* Right: File Actions & Exports */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={onExportWord}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: 5,
            color: '#3b82f6',
            fontSize: 11,
            cursor: 'pointer',
          }}
          title="Export to Word (.docx)"
        >
          <span>📄</span> Word
        </button>
        <button
          type="button"
          onClick={onExportPdf}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: 5,
            color: '#ef4444',
            fontSize: 11,
            cursor: 'pointer',
          }}
          title="Export to PDF"
        >
          <span>📑</span> PDF
        </button>
        <button
          type="button"
          onClick={onExportSingleFile}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: 5,
            color: '#22c55e',
            fontSize: 11,
            cursor: 'pointer',
          }}
          title="Export as Single-File HTML"
        >
          <span>📦</span> Single File
        </button>
        <select
          aria-label="Insert"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              onInsertSnippet(e.target.value)
              e.target.value = ''
            }
          }}
          style={{
            background: '#27272a',
            color: '#e4e4e7',
            border: '1px solid #3f3f46',
            borderRadius: 5,
            fontSize: 11,
            padding: '4px 6px',
          }}
          title="Insert menu"
        >
          <option value="" disabled>
            ＋ Insert
          </option>
          <option value="hero">Hero section</option>
          <option value="cards">Cards grid</option>
          <option value="table">Table</option>
          <option value="form">Form</option>
          <option value="nav">Navbar</option>
        </select>
        <button
          type="button"
          onClick={onInsertImageUrl}
          style={{
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: 5,
            color: '#e4e4e7',
            fontSize: 11,
            padding: '4px 8px',
            cursor: 'pointer',
          }}
          title="Image from URL"
        >
          🖼 URL
        </button>

        <div style={{ height: 16, width: 1, background: '#27272a', margin: '0 4px' }} />

        <button
          type="button"
          onClick={onSave}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 12px',
            background: dirty ? '#2563eb' : '#27272a',
            border: `1px solid ${dirty ? '#3b82f6' : '#3f3f46'}`,
            borderRadius: 5,
            color: dirty ? '#fff' : '#a1a1aa',
            fontSize: 11,
            fontWeight: dirty ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          <span>💾</span> Save {dirty ? '●' : ''}
        </button>
      </div>
    </div>
  )
}
