import React, { useState } from 'react'
import { Sparkles, Layers, CheckCircle2, Bot, Zap } from 'lucide-react'
import { APP_MODULES } from '../data/suite-data'

interface AppPreviewDeckProps {
  activeModuleId: string
  onSelectModule: (id: string) => void
}

// Rich mock document content per app type
const MOCK_CONTENT: Record<string, React.ReactNode> = {
  docs: (
    <div className="text-[12px] leading-relaxed text-[#1a0a3d]">
      <h3 className="text-[15px] font-bold text-[#1a0a3d] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>§ 4.2 — Data Sovereignty &amp; IP Ownership</h3>
      <p className="text-[#4a3d6d] mb-3">All intellectual property, proprietary algorithms, and documents remain <strong>strictly confidential on customer premise</strong>. No telemetry or document metadata ever leaves the machine boundary.</p>
      <div className="pl-3 border-l-2 border-[#3276cd]/40 text-[#7c6fa0] italic mb-3 text-[11px]">
        "The micro-kernel document model maps OOXML blocks into isolated memory structures — zero re-serialization on save."
      </div>
      <table className="w-full text-[11px] border-collapse mb-2">
        <thead>
          <tr className="bg-[#f3f0ff]">
            <th className="px-3 py-1.5 text-left font-semibold text-[#1a0a3d] rounded-l-lg">Metric</th>
            <th className="px-3 py-1.5 text-left font-semibold text-[#1a0a3d]">ReveLith</th>
            <th className="px-3 py-1.5 text-left font-semibold text-[#1a0a3d] rounded-r-lg">Legacy</th>
          </tr>
        </thead>
        <tbody>
          {[['Save Drift', '0.00%', '2–15%'], ['Parse Time', '14.2 ms', '380 ms'], ['Round-Trip', '✓ Byte-Match', '✗ Re-serialize']].map(([m, r, l]) => (
            <tr key={m} className="border-t border-[#f0ecff]">
              <td className="px-3 py-1.5 text-[#7c6fa0]">{m}</td>
              <td className="px-3 py-1.5 font-semibold text-[#059669]">{r}</td>
              <td className="px-3 py-1.5 text-[#e11d48]">{l}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
  sheets: (
    <div className="text-[12px] text-[#1a0a3d] overflow-x-auto">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-mono bg-[#d1fae5] text-[#059669] px-2 py-0.5 rounded font-semibold border border-[#a7f3d0]">Native Rust Core</span>
        <span className="text-[10px] font-mono text-[#7c6fa0]">1,000,000+ rows · 60 FPS</span>
      </div>
      <div className="font-mono text-[11px] bg-[#f9f7ff] rounded-xl border border-[#ede9ff] p-3 mb-3">
        <div className="text-[#7c6fa0] mb-1 text-[10px]">A1: Revenue Forecast Model</div>
        <div><span className="text-[#6c47ff]">=LET(</span><span className="text-[#1a0a3d]">Rev, </span><span className="text-[#059669]">SUM(B2:B12)</span><span className="text-[#7c6fa0]">,</span></div>
        <div><span className="text-[#6c47ff] ml-4">Growth, </span><span className="text-[#d97706]">1.34</span><span className="text-[#7c6fa0]">,</span></div>
        <div><span className="text-[#6c47ff] ml-4">FORECAST.ETS(</span><span className="text-[#1a0a3d]">C13, B2:B12, A2:A12</span><span className="text-[#6c47ff]">))</span></div>
        <div className="mt-1.5 text-[#059669] font-bold">→ $4,850,200 (Projected Q4)</div>
      </div>
      <div className="grid grid-cols-4 gap-1 text-[10px]">
        {['Q1', 'Q2', 'Q3', 'Q4 (proj)'].map((q, i) => (
          <div key={q} className="text-center p-1.5 rounded-lg border border-[#ede9ff] bg-[#f9f7ff]">
            <div className="text-[#7c6fa0]">{q}</div>
            <div className="font-bold text-[#1a0a3d]">${(1.2 + i * 0.8).toFixed(1)}M</div>
          </div>
        ))}
      </div>
    </div>
  ),
  slides: (
    <div className="text-[12px]">
      <div className="bg-gradient-to-br from-[#1a0a3d] to-[#2d1b69] rounded-xl p-4 mb-3 text-white aspect-video flex flex-col justify-between">
        <div className="text-[9px] font-mono text-white/40">Slide 04 / 18</div>
        <div>
          <div className="text-[11px] font-bold text-[#a78bfa] mb-1">THE OFFLINE-FIRST PARADIGM</div>
          <div className="text-[18px] font-extrabold leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>Why Local Compute<br/>Beats Cloud Latency</div>
        </div>
        <div className="flex gap-2">
          {['Compliance', 'Speed', 'Privacy'].map(tag => (
            <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 border border-white/20">{tag}</span>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-[#7c6fa0]">
        <span className="font-semibold text-[#d33922]">Slides Engine</span> · PPTX canvas pipeline · Master layout inheritance
      </div>
    </div>
  ),
  pdf: (
    <div className="text-[12px]">
      <div className="bg-[#fff8f8] rounded-xl border border-[#fecaca] p-4 mb-3 font-mono text-[11px]">
        <div className="text-[10px] text-[#7c6fa0] mb-2">Enterprise_Service_Agreement_v4.pdf — AES-256 Validated</div>
        <p className="text-[#1a0a3d] leading-relaxed">
          <span className="font-bold text-[#e11d48]">SECTION 4.2:</span> Data Ownership. All intellectual property, proprietary algorithms, and documents remain strictly confidential on <strong>customer premise</strong>.
        </p>
        <div className="mt-2 flex gap-2">
          <span className="text-[9px] bg-[#fef2f2] text-[#e11d48] px-2 py-0.5 rounded border border-[#fecaca] font-semibold">⚑ Clause 9.1 flagged</span>
          <span className="text-[9px] bg-[#f0fdf4] text-[#059669] px-2 py-0.5 rounded border border-[#a7f3d0] font-semibold">✓ 18 pages scanned</span>
        </div>
      </div>
      <div className="text-[10px] text-[#7c6fa0]">
        PDFium stream modifier · Font metric synthesizer · Vector annotations
      </div>
    </div>
  ),
  markdown: (
    <div className="text-[12px] font-mono">
      <div className="text-[#b4abcc] mb-1 text-[10px]">Distributed_Systems_Spec.md</div>
      <div className="text-[14px] font-bold text-[#8b5cf6] mb-2"># Consensus Protocols</div>
      <div className="bg-[#1a0a3d] rounded-xl p-3 text-[11px] leading-relaxed">
        <div className="text-[#7c6fa0] mb-1">{'```rust'}</div>
        <div><span className="text-[#a78bfa]">pub fn </span><span className="text-[#93c5fd]">apply_delta</span><span className="text-white">(</span></div>
        <div><span className="text-white ml-4">doc: </span><span className="text-[#a78bfa]">&amp;mut </span><span className="text-[#6ee7b7]">Document</span><span className="text-white">,</span></div>
        <div><span className="text-white ml-4">patch: </span><span className="text-[#a78bfa]">&amp;</span><span className="text-[#6ee7b7]">Delta</span></div>
        <div><span className="text-white">) </span><span className="text-[#a78bfa]">-&gt; </span><span className="text-[#6ee7b7]">Result</span><span className="text-white">{'<(), Error> {'}</span></div>
        <div><span className="text-[#93c5fd] ml-4">doc</span><span className="text-white">.nodes.</span><span className="text-[#93c5fd]">update</span><span className="text-white">(patch)?;</span></div>
        <div><span className="text-[#a78bfa] ml-4">Ok</span><span className="text-white">(())</span></div>
        <div className="text-white">{'}'}</div>
        <div className="text-[#7c6fa0]">{'```'}</div>
      </div>
    </div>
  ),
}

export const AppPreviewDeck: React.FC<AppPreviewDeckProps> = ({ activeModuleId, onSelectModule }) => {
  const currentModule = APP_MODULES.find((m) => m.id === activeModuleId) || APP_MODULES[0]
  const [aiRunning, setAiRunning] = useState(false)
  const [aiDone, setAiDone] = useState(false)

  const handleRunAi = () => {
    setAiRunning(true)
    setAiDone(false)
    setTimeout(() => { setAiRunning(false); setAiDone(true) }, 1400)
  }

  return (
    <section id="suite-preview" className="py-16 md:py-24 relative bg-gradient-to-b from-[#f3f0ff]/60 to-[#f8f7ff]">
      <div className="container-xl relative z-10">
        {/* Header */}
        <div className="text-center mb-10 scroll-reveal">
          <div className="section-label justify-center">Interactive Application Deck</div>
          <h2
            className="text-[28px] sm:text-[38px] md:text-[46px] font-extrabold tracking-[-0.025em] leading-[1.1] mb-3"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            One Shell.{' '}
            <span className="heading-gradient-slow">Five Engines.</span>
          </h2>
          <p className="text-[15px] text-[#4a3d6d] max-w-md mx-auto">
            Switch between document formats in milliseconds — no context switching.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-center gap-2 mb-6 no-scrollbar overflow-x-auto px-2 scroll-reveal">
          <div className="p-1.5 rounded-2xl bg-white border border-[#e4e0f7] flex items-center gap-1 shadow-[0_4px_20px_rgba(108,71,255,0.07)]">
            {APP_MODULES.map((mod) => {
              const isActive = mod.id === currentModule.id
              return (
                <button
                  key={mod.id}
                  onClick={() => { onSelectModule(mod.id); setAiDone(false) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap"
                  style={
                    isActive
                      ? { background: mod.accentColor, color: '#fff', boxShadow: `0 2px 12px ${mod.accentColor}45` }
                      : { color: '#7c6fa0' }
                  }
                >
                  <img src={mod.icon} alt="" className="w-4 h-4 object-contain" aria-hidden="true" />
                  <span>{mod.name}</span>
                  <span
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded-md font-bold"
                    style={isActive ? { background: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.9)' } : { background: '#f3f0ff', color: '#7c6fa0' }}
                  >
                    {mod.extension}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Main Preview Card */}
        <div className="bg-white border border-[#e4e0f7] rounded-3xl overflow-hidden shadow-[0_8px_50px_rgba(108,71,255,0.09)] scroll-reveal-scale">
          {/* Window chrome */}
          <div
            className="flex items-center justify-between px-5 py-3 border-b border-[#f0ecff]"
            style={{ background: `linear-gradient(to right, ${currentModule.accentColor}08, transparent)` }}
          >
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#fc625d]" />
                <span className="w-3 h-3 rounded-full bg-[#fdbc40]" />
                <span className="w-3 h-3 rounded-full bg-[#35cd4b]" />
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-lg border border-[#e4e0f7] text-xs font-mono text-[#4a3d6d]">
                <img src={currentModule.icon} alt="" className="w-3.5 h-3.5" />
                <span className="max-w-[160px] truncate">{currentModule.uiPreview.title}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {currentModule.uiPreview.metrics.map((m, i) => (
                <div key={i} className="hidden sm:flex items-center gap-1 text-[11px] font-mono">
                  <span className="text-[#b4abcc]">{m.label}:</span>
                  <span className="font-bold" style={{ color: currentModule.accentColor }}>{m.value.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-col lg:flex-row min-h-[400px]">
            {/* Left: Document canvas — rich content */}
            <div className="flex-1 p-6 border-r border-[#f0ecff] bg-[#fdfcff]">
              {/* Engine features */}
              <div className="mb-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#b4abcc] mb-2">Engine Capabilities</div>
                <ul className="space-y-1.5">
                  {currentModule.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-[#4a3d6d]">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: currentModule.accentColor }} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Rich document mock */}
              <div className="bg-white rounded-2xl border border-[#e8e4f8] p-4 shadow-[inset_0_1px_3px_rgba(108,71,255,0.04)]">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#b4abcc] mb-3">
                  Live Document Preview
                </div>
                {MOCK_CONTENT[currentModule.id]}
              </div>

              {/* Engine tag */}
              <div className="mt-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: currentModule.accentColor }} />
                <span className="text-[10px] font-mono text-[#b4abcc]">{currentModule.engineDetails}</span>
              </div>
            </div>

            {/* Right: AI Copilot */}
            <div className="w-full lg:w-[300px] p-5 bg-white flex flex-col">
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                  style={{ background: `${currentModule.accentColor}15` }}
                >
                  <Bot className="w-4 h-4" style={{ color: currentModule.accentColor }} />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-bold text-[#1a0a3d]">Native AI Copilot</div>
                  <div className="text-[10px] text-[#7c6fa0]">Local · Zero-telemetry</div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#059669] bg-[#d1fae5] px-2 py-0.5 rounded-full border border-[#6ee7b7]/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                  Live
                </div>
              </div>

              {/* Prompt */}
              <div className="rounded-2xl border border-[#e4e0f7] bg-[#f9f7ff] p-3.5 mb-3">
                <div className="text-[9px] font-bold uppercase tracking-wider text-[#b4abcc] mb-1.5">Prompt</div>
                <p className="text-[12px] text-[#4a3d6d] leading-relaxed">{currentModule.uiPreview.aiPrompt}</p>
              </div>

              {/* AI response */}
              <div
                className="rounded-2xl border p-3.5 mb-3 flex-1"
                style={{ background: `${currentModule.accentColor}06`, borderColor: `${currentModule.accentColor}20` }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3 h-3" style={{ color: currentModule.accentColor }} />
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: currentModule.accentColor }}>
                    AI Response
                  </span>
                </div>
                {aiRunning ? (
                  <div className="flex items-center gap-2 text-[12px] text-[#7c6fa0]">
                    <span className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: `${i * 100}ms` }} />
                      ))}
                    </span>
                    Generating...
                  </div>
                ) : (
                  <p className="text-[12px] text-[#4a3d6d] leading-relaxed">{currentModule.uiPreview.aiResult}</p>
                )}
              </div>

              {/* Run button */}
              <button
                onClick={handleRunAi}
                disabled={aiRunning}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-[13px] text-white transition-all"
                style={{
                  background: aiRunning ? `${currentModule.accentColor}80` : currentModule.accentColor,
                  boxShadow: aiRunning ? 'none' : `0 4px 16px ${currentModule.accentColor}40`,
                }}
              >
                <Zap className="w-3.5 h-3.5" />
                {aiRunning ? 'Running...' : 'Run AI Copilot'}
              </button>

              {/* Metrics */}
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {currentModule.uiPreview.metrics.map((m, i) => (
                  <div key={i} className="text-center p-2 rounded-xl bg-[#f9f7ff] border border-[#ede9ff]">
                    <div className="text-[9px] text-[#b4abcc] mb-0.5 leading-tight truncate" title={m.label}>{m.label}</div>
                    <div className="text-[10px] font-bold font-mono" style={{ color: currentModule.accentColor }}>
                      {m.value.split(' ')[0]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}