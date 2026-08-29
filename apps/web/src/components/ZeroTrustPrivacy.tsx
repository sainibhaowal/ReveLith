import React from 'react'
import { Shield, WifiOff, Lock, Cpu, CheckCircle2, ArrowRight } from 'lucide-react'

const PILLARS = [
  {
    icon: <WifiOff className="w-6 h-6" />,
    title: 'Zero Unsolicited Telemetry',
    description: 'No document fingerprints, keystrokes, templates, or usage metadata ever leave your machine — period. No silent network calls without explicit config.',
    color: '#6c47ff',
    bg: '#f3f0ff',
    border: '#ddd5ff',
    badge: 'Enforced Locally',
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: 'Sandboxed Native Renders',
    description: 'Each document type runs in a memory-isolated sandbox. OOXML parsing, canvas rendering, and plugin execution are fully separated from each other.',
    color: '#0077b6',
    bg: '#e0f3fb',
    border: '#bae6fd',
    badge: 'Memory Isolated',
  },
  {
    icon: <Cpu className="w-6 h-6" />,
    title: 'Local Hardware AI Inference',
    description: 'ReveLith runs on Ollama on embedded engines. No requests to ChatGPT, Google, or any remote inference provider. Your documents stay sovereign.',
    color: '#d97706',
    bg: '#fef3c7',
    border: '#fde68a',
    badge: 'On-Device Only',
  },
  {
    icon: <Lock className="w-6 h-6" />,
    title: 'Air-Gapped Sovereign Computing',
    description: 'Functions 100% offline. Time-locked, continuous encryption, real-time memory protection, and compliance-logging enabling offline-sovereign computing.',
    color: '#059669',
    bg: '#d1fae5',
    border: '#a7f3d0',
    badge: 'Air-Gap Ready',
  },
]

const STATS = [
  { value: '0', label: 'Documents Uploaded' },
  { value: '100%', label: 'Local Processing' },
  { value: 'AES-256', label: 'Encryption Standard' },
  { value: 'Apache 2.0', label: 'Open License' },
]

export const ZeroTrustPrivacy: React.FC = () => {
  return (
    <section id="privacy" className="py-20 md:py-28 relative bg-gradient-to-b from-[#f0eeff] to-[#f8f7ff]">
      {/* Blobs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-radial from-[#6c47ff]/8 to-transparent pointer-events-none rounded-full blur-3xl" aria-hidden="true" />

      <div className="container-xl relative z-10">
        {/* Header */}
        <div className="text-center mb-16 scroll-reveal">
          <div className="section-label justify-center">Privacy &amp; Security</div>
          <h2
            className="text-[32px] sm:text-[44px] md:text-[52px] font-extrabold tracking-[-0.025em] leading-[1.1] mb-4 text-[#1a0a3d]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Your Documents.{' '}
            <span className="heading-gradient">Your Machine. Zero Leaks.</span>
          </h2>
          <p className="text-[16px] text-[#4a3d6d] max-w-xl mx-auto leading-relaxed">
            Built with strict zero-trust boundaries. ReveLith guarantees that confidential spreadsheets, legal briefs, and pitch decks stay strictly local.
          </p>
        </div>

        {/* Pillars Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14 stagger-children">
          {PILLARS.map((p, i) => (
            <div
              key={i}
              className="card-feature scroll-reveal group"
              style={{ borderColor: p.border }}
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                style={{ background: p.bg, color: p.color, border: `1px solid ${p.border}` }}
              >
                {p.icon}
              </div>

              {/* Badge */}
              <div
                className="text-[10px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full inline-block mb-3"
                style={{ color: p.color, background: p.bg, border: `1px solid ${p.border}` }}
              >
                {p.badge}
              </div>

              <h3 className="text-[15px] font-bold text-[#1a0a3d] mb-2">{p.title}</h3>
              <p className="text-[13px] text-[#7c6fa0] leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>

        {/* Stats Bar */}
        <div className="scroll-reveal-scale">
          <div className="bg-white rounded-3xl border border-[#e4e0f7] p-8 shadow-[0_8px_40px_rgba(108,71,255,0.07)]">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {STATS.map((s, i) => (
                <div key={i} className="text-center group">
                  <div
                    className="text-[26px] sm:text-[32px] font-extrabold mb-1 whitespace-nowrap transition-all duration-300 group-hover:scale-105"
                    style={{ fontFamily: 'var(--font-heading)', color: i % 2 === 0 ? '#6c47ff' : '#059669' }}
                  >
                    {s.value}
                  </div>
                  <div className="text-[13px] text-[#7c6fa0] font-medium">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-[#f0ecff] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-[13px] text-[#4a3d6d]">
                <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                <span>Enterprise Compliance Architecture — full local cryptography and local auditing</span>
              </div>
              <a
                href="#quickstart"
                className="flex items-center gap-2 text-sm font-semibold text-[#6c47ff] hover:text-[#4f2fe0] transition-colors"
              >
                Read the Architecture Docs <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}