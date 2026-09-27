import { useState } from 'react'

export interface AiDocumentRequest {
  docType: 'report' | 'whitepaper' | 'documentation' | 'article' | 'proposal'
  tone: 'professional' | 'technical' | 'executive' | 'journalistic'
  topic: string
  includeToc: boolean
  includeTables: boolean
}

interface AiDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  onGenerate: (req: AiDocumentRequest) => void
  isGenerating?: boolean
}

export function AiDocumentModal({ isOpen, onClose, onGenerate, isGenerating }: AiDocumentModalProps) {
  const [docType, setDocType] = useState<'report' | 'whitepaper' | 'documentation' | 'article' | 'proposal'>('report')
  const [tone, setTone] = useState<'professional' | 'technical' | 'executive' | 'journalistic'>('professional')
  const [topic, setTopic] = useState('')
  const [includeToc, setIncludeToc] = useState(true)
  const [includeTables, setIncludeTables] = useState(true)

  if (!isOpen) return null

  const handleGenerate = () => {
    if (!topic.trim()) return
    onGenerate({ docType, tone, topic: topic.trim(), includeToc, includeTables })
  }

  const DOC_TYPES = [
    { id: 'report' as const, icon: '📑', label: 'Report', desc: 'Detailed business or operational report' },
    { id: 'whitepaper' as const, icon: '🏛️', label: 'Whitepaper', desc: 'In-depth industry research and analysis' },
    { id: 'documentation' as const, icon: '📘', label: 'Documentation', desc: 'API / system specs, guides and code' },
    { id: 'proposal' as const, icon: '💼', label: 'Proposal', desc: 'Project plans, scope, timeline and deliverables' },
    { id: 'article' as const, icon: '📰', label: 'Long Article', desc: 'Editorial deep-dive with headings and quotes' },
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
            <span style={{ fontSize: 20 }}>📝</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>AI Document Mode</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: 18 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Document Type */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#a1a1aa', display: 'block', marginBottom: 8 }}>
              1. Document Format
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {DOC_TYPES.map((dt) => (
                <button
                  key={dt.id}
                  type="button"
                  onClick={() => setDocType(dt.id)}
                  style={{
                    padding: 10,
                    background: docType === dt.id ? 'rgba(59, 130, 246, 0.15)' : '#27272a',
                    border: `1.5px solid ${docType === dt.id ? '#3b82f6' : '#3f3f46'}`,
                    borderRadius: 8,
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{dt.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: docType === dt.id ? '#60a5fa' : '#fff' }}>
                    {dt.label}
                  </div>
                  <div style={{ fontSize: 10, color: '#a1a1aa' }}>{dt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tone & Options */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#a1a1aa', display: 'block', marginBottom: 6 }}>
                2. Writing Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: '#27272a',
                  border: '1px solid #3f3f46',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 12,
                }}
              >
                <option value="professional">Professional / Business</option>
                <option value="technical">Technical / Engineering</option>
                <option value="executive">Executive / C-Suite Brief</option>
                <option value="journalistic">Journalistic / Feature Story</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#a1a1aa', display: 'block', marginBottom: 6 }}>
                Document Features
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#e4e4e7', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={includeToc}
                    onChange={(e) => setIncludeToc(e.target.checked)}
                  />
                  Include Table of Contents
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#e4e4e7', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={includeTables}
                    onChange={(e) => setIncludeTables(e.target.checked)}
                  />
                  Include Data / Comparison Tables
                </label>
              </div>
            </div>
          </div>

          {/* Topic & Objectives */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#a1a1aa', display: 'block', marginBottom: 8 }}>
              3. Topic, Outlines & Key Findings
            </label>
            <textarea
              placeholder="e.g. 'A comprehensive analysis of Q3 Cloud Infrastructure Costs comparing AWS, GCP, and Azure with Kubernetes clusters, serverless GPU pricing, and actionable cost-reduction recommendations.'"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
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
            disabled={!topic.trim() || isGenerating}
            onClick={handleGenerate}
            style={{
              padding: '8px 20px',
              background: topic.trim() ? '#2563eb' : '#3f3f46',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontWeight: 600,
              fontSize: 12,
              cursor: topic.trim() && !isGenerating ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {isGenerating ? 'Writing Document...' : 'Write Long-form HTML'}
          </button>
        </div>
      </div>
    </div>
  )
}
