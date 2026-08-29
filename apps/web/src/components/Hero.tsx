import React from 'react'
import { Download, ArrowRight, CheckCircle2, Lock, Cpu, Zap, Shield, Star } from 'lucide-react'
import { GithubIcon } from './GithubIcon'
import { GITHUB_REPO_URL, LATEST_VERSION, APP_MODULES } from '../data/suite-data'

interface HeroProps {
  onOpenDownload: () => void
  onSelectModule: (moduleId: string) => void
}

export const Hero: React.FC<HeroProps> = ({ onOpenDownload, onSelectModule }) => {
  return (
    <section className="relative overflow-hidden bg-grid">
      {/* Background blobs */}
      <div
        className="absolute top-[-100px] left-[-150px] w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(108,71,255,0.1) 0%, transparent 70%)', filter: 'blur(40px)' }}
        aria-hidden="true"
      />
      <div
        className="absolute top-[10%] right-[-100px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(0,180,216,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 left-[50%] w-[600px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(255,107,53,0.07) 0%, transparent 70%)', filter: 'blur(40px)' }}
        aria-hidden="true"
      />

      <div className="container-xl relative z-10 pt-8 sm:pt-14 pb-0">
        {/* Top: Centered copy */}
        <div className="max-w-3xl mx-auto text-center mb-8 sm:mb-12">
          {/* Release pill */}
          <div className="animate-fade-in-up inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white border border-[#ddd5ff] shadow-[0_4px_20px_rgba(108,71,255,0.1)] mb-7">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6c47ff] opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6c47ff]" />
            </span>
            <span className="text-xs font-semibold text-[#4a3d6d]">New — Offline-First Native AI Architecture</span>
            <span className="text-[11px] font-mono font-bold text-[#6c47ff] bg-[#f3f0ff] px-2 py-0.5 rounded-full border border-[#ddd5ff]">
              {LATEST_VERSION}
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-[30px] min-[400px]:text-[36px] sm:text-[54px] md:text-[66px] font-extrabold tracking-[-0.03em] leading-[1.04] mb-4 sm:mb-5 break-words"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            <span className="text-[#1a0a3d]">The Intelligent </span>
            <span className="heading-gradient">Offline-First</span>
            <span className="text-[#1a0a3d]"> Office Suite.</span>
          </h1>

          {/* Subtext */}
          <p className="text-[15px] sm:text-[18px] text-[#4a3d6d] max-w-[580px] mx-auto mb-6 sm:mb-7 leading-[1.6] sm:leading-[1.7]">
            Edit real{' '}
            <span className="font-mono font-semibold text-[#0077b6] bg-[#dff0fb] px-1.5 py-0.5 rounded-md">.docx</span>,{' '}
            <span className="font-mono font-semibold text-[#059669] bg-[#d1fae5] px-1.5 py-0.5 rounded-md">.xlsx</span>,{' '}
            <span className="font-mono font-semibold text-[#d97706] bg-[#fef3c7] px-1.5 py-0.5 rounded-md">.pptx</span>,{' '}
            <span className="font-mono font-semibold text-[#e11d48] bg-[#ffe4e6] px-1.5 py-0.5 rounded-md">.pdf</span>{' '}
            &amp; Markdown with <strong className="text-[#1a0a3d]">100% byte-preserving fidelity</strong> — powered by Rust &amp; local AI.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-7">
            <button
              onClick={onOpenDownload}
              className="btn-brand w-full sm:w-auto px-7 py-3.5 text-[15px]"
            >
              <Download className="w-4.5 h-4.5" aria-hidden="true" />
              Download ReveLith Free
            </button>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline w-full sm:w-auto px-6 py-3.5 text-[15px]"
            >
              <GithubIcon className="w-4.5 h-4.5" aria-hidden="true" />
              View on GitHub
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* Platform trust pills — single row */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-[12px] font-medium text-[#4a3d6d]">
            {[
              { icon: <CheckCircle2 className="w-3 h-3 text-[#0077b6]" />, label: 'Windows' },
              { icon: <CheckCircle2 className="w-3 h-3 text-[#0077b6]" />, label: 'macOS' },
              { icon: <CheckCircle2 className="w-3 h-3 text-[#0077b6]" />, label: 'Linux' },
              { icon: <Lock className="w-3 h-3 text-[#059669]" />, label: 'Zero Telemetry' },
              { icon: <Cpu className="w-3 h-3 text-[#d97706]" />, label: 'Local AI' },
              { icon: <Shield className="w-3 h-3 text-[#e11d48]" />, label: 'Apache 2.0' },
              { icon: <Star className="w-3 h-3 text-[#6c47ff] fill-[#6c47ff]" />, label: 'Open Source' },
            ].map((b, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#e4e0f7]">
                {b.icon}
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom: Product visual + Engine grid */}
        <div className="relative hidden">
          {/* Large product window mock */}
          <div className="mx-auto max-w-5xl bg-white rounded-t-3xl border border-[#e4e0f7] border-b-0 shadow-[0_-8px_60px_rgba(108,71,255,0.12)] overflow-hidden">
            {/* Window titlebar */}
            <div className="flex items-center gap-4 px-5 py-3 border-b border-[#f0ecff] bg-gradient-to-r from-[#f9f8ff] to-[#f3f0ff]">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#fc625d]" />
                <span className="w-3 h-3 rounded-full bg-[#fdbc40]" />
                <span className="w-3 h-3 rounded-full bg-[#35cd4b]" />
              </div>
              {/* App tabs */}
              <div className="flex items-center gap-1 flex-1 no-scrollbar overflow-x-auto">
                {APP_MODULES.map((mod, idx) => (
                  <button
                    key={mod.id}
                    onClick={() => {
                      onSelectModule(mod.id)
                      document.getElementById('suite-preview')?.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-all duration-150 animate-fade-in-up"
                    style={{
                      animationDelay: `${idx * 60}ms`,
                      animationFillMode: 'both',
                      background: idx === 0 ? mod.accentColor + '15' : 'transparent',
                      color: idx === 0 ? mod.accentColor : '#7c6fa0',
                      border: `1px solid ${idx === 0 ? mod.accentColor + '30' : 'transparent'}`,
                    }}
                  >
                    <img src={mod.icon} alt="" className="w-3.5 h-3.5" />
                    {mod.name}
                    <span className="font-mono text-[9px] opacity-70">{mod.extension}</span>
                  </button>
                ))}
              </div>
              {/* Status indicators */}
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] font-mono text-[#7c6fa0]">Save Drift: <span className="text-[#059669] font-bold">0.00%</span></span>
                <span className="text-[10px] font-mono text-[#7c6fa0]">Parse: <span className="text-[#6c47ff] font-bold">14ms</span></span>
                <div className="flex items-center gap-1 text-[10px] font-semibold text-[#059669]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                  AI Ready
                </div>
              </div>
            </div>

            {/* App body: 3-column layout */}
            <div className="flex h-[300px] sm:h-[340px]">
              {/* Sidebar */}
              <div className="w-[180px] shrink-0 border-r border-[#f0ecff] bg-[#fafbff] p-3 hidden sm:block">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[#b4abcc] mb-2 px-1">Documents</div>
                {['Q3_Architecture.docx', 'Financials_2026.xlsx', 'Pitch_Deck.pptx', 'Contract_v4.pdf'].map((f, i) => (
                  <div
                    key={f}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 text-[11px] ${i === 0 ? 'bg-[#f3f0ff] text-[#6c47ff] font-semibold' : 'text-[#7c6fa0] hover:bg-[#f9f7ff]'} transition-colors`}
                  >
                    <img src={APP_MODULES[Math.min(i, APP_MODULES.length - 1)].icon} alt="" className="w-3 h-3 shrink-0" />
                    <span className="truncate">{f}</span>
                  </div>
                ))}
                <div className="mt-4 px-1">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-[#b4abcc] mb-2">AI Copilot</div>
                  <div className="text-[10px] text-[#7c6fa0] leading-relaxed bg-[#f3f0ff] rounded-lg p-2 border border-[#ddd5ff]">
                    ✦ Local Llama 3.1<br />✦ Zero telemetry<br />✦ Context-aware
                  </div>
                </div>
              </div>

              {/* Document editor */}
              <div className="flex-1 bg-white p-5 overflow-hidden">
                <div className="max-w-lg">
                  <div className="text-[11px] font-mono text-[#b4abcc] mb-3">Q3_Engineering_Architecture_Report.docx</div>

                  {/* Simulated rich document content */}
                  <h2 className="text-[18px] font-bold text-[#1a0a3d] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
                    Executive Architecture Summary
                  </h2>
                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-[10px] px-2 py-0.5 bg-[#f3f0ff] text-[#6c47ff] rounded font-semibold border border-[#ddd5ff]">v3.2.1 Final</span>
                    <span className="text-[10px] text-[#7c6fa0]">Updated: Aug 24 · 42 MB</span>
                    <span className="text-[10px] font-semibold text-[#059669]">✓ Byte-Match</span>
                  </div>
                  <div className="space-y-2 text-[12px] text-[#4a3d6d] leading-relaxed">
                    <p>ReveLith implements a <strong className="text-[#1a0a3d]">micro-kernel document model</strong> that maps OOXML blocks into isolated memory structures. By generating delta-patches on save, all embedded macros, shapes, and custom XML parts remain <strong className="text-[#059669]">100% byte-for-byte identical</strong>.</p>
                    <div className="pl-3 border-l-2 border-[#6c47ff]/30 text-[#7c6fa0] italic text-[11px]">
                      "Zero re-serialization. Only the delta patch stream touches the source container."
                    </div>
                    <p>The patented zero-drift engine verifies every save with a cryptographic checksum against the original ZIP stream, <strong>guaranteeing</strong> no format corruption even across 10,000 round-trips.</p>
                  </div>
                </div>
              </div>

              {/* AI panel */}
              <div className="w-[220px] shrink-0 border-l border-[#f0ecff] bg-[#fafbff] p-4 hidden lg:flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-[#f3f0ff] flex items-center justify-center text-[10px]">✦</div>
                  <div>
                    <div className="text-[11px] font-bold text-[#1a0a3d]">AI Copilot</div>
                    <div className="text-[9px] text-[#059669] font-semibold">● Online · Local</div>
                  </div>
                </div>
                <div className="text-[10px] text-[#7c6fa0] bg-[#f9f7ff] rounded-xl p-2.5 mb-2 border border-[#ede9ff] leading-relaxed">
                  Summarize key engineering takeaways and highlight risk points for stakeholders.
                </div>
                <div className="text-[10px] text-[#1a0a3d] bg-white rounded-xl p-2.5 border border-[#6c47ff]/20 leading-relaxed flex-1">
                  <span className="text-[#6c47ff] font-bold">↳ </span>
                  Generated executive summary. Document roundtrips preserve 100% fidelity. Risk mitigation achieved through isolated memory virtualization.
                </div>
                <button className="mt-3 w-full py-2 rounded-xl text-white text-[11px] font-bold" style={{ background: '#6c47ff' }}>
                  ✦ Run Copilot
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}