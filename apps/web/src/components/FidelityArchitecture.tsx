import React, { useState } from 'react'
import { Code2, ChevronRight, Layers } from 'lucide-react'

const STAGES = [
  {
    id: 'parse',
    label: '01 — Parse',
    color: '#6c47ff',
    title: 'OOXML Structural Parser',
    description: 'The document container is opened without touching source bytes. Only the specific modified XML node is delta-patched and cleanly synced back into the zip stream.',
    code: `// Stage 1: Zero-Copy Ingestion
const container = await ZipArchive.open("contract.docx");
const mfrag    = await fragment.readFragment(container);
// Isolated modified nodes stored as raw pointer slices
const patch    = delta.compute(mfrag.nodes, editBuffer);`,
  },
  {
    id: 'delta',
    label: '02 — Delta Patch',
    color: '#ff6b35',
    title: 'Byte-Fingerprint & Offset Map',
    description: 'ReveLith maps each document node to exact byte fingerprints. Only the changed fragments are re-serialized. Untouched XML remains pristine.',
    code: `// Stage 2: Minimal Delta Serialization
const fingerprint = await hashNode(mfrag);
if (fingerprint !== cache.get(nodeId)) {
  patch.nodes.push({ id: nodeId, diff: computeDiff() });
} // unchanged nodes → never re-serialized`,
  },
  {
    id: 'save',
    label: '03 — Byte-Safe Save',
    color: '#10b981',
    title: 'Lossless Byte-to-Byte Output',
    description: 'Outputs source-container intact. The save writes only the delta stream into the original zip, preserving all vendor extensions, macros, and custom XML.',
    code: `// Stage 3: Zero-Drift Write-Back
await container.applyPatch(patch, {
  preserveCustomXml: true,
  preserveMacros:    true,
  validateChecksum:  true, // 100% byte-match
});
await container.flush("contract.docx");`,
  },
]

export const FidelityArchitecture: React.FC = () => {
  const [activeStage, setActiveStage] = useState(0)
  const stage = STAGES[activeStage]

  return (
    <section id="architecture" className="py-20 md:py-28 relative">
      <div className="container-xl">
        {/* Header */}
        <div className="text-center mb-16 scroll-reveal">
          <div className="section-label justify-center">Architecture & Fidelity</div>
          <h2
            className="text-[32px] sm:text-[44px] md:text-[52px] font-extrabold tracking-[-0.025em] leading-[1.1] mb-4 text-[#1a0a3d]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Why Traditional Editors{' '}
            <span className="heading-gradient-warm">Corrupt Files</span>
            {' '}— And How ReveLith Solves It
          </h2>
          <p className="text-[16px] text-[#4a3d6d] max-w-2xl mx-auto leading-relaxed">
            Standard web and cloud editors re-serialize entire XML files on save, destroying styles and macros. ReveLith uses a patented zero-drift byte patching engine.
          </p>
        </div>

        {/* Comparison Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-16 scroll-reveal">
          {/* Traditional */}
          <div className="card-feature border-[#fecaca]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#fee2e2] flex items-center justify-center text-lg">⚠️</div>
              <div>
                <div className="font-bold text-[#1a0a3d]">Traditional &amp; Cloud Editors</div>
                <div className="text-xs text-[#e11d48] font-semibold">Destructive Round-Trips</div>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { icon: '✗', text: 'Re-serializes entire XML on every save', color: 'text-[#e11d48]' },
                { icon: '✗', text: 'Re-orders attributes, strips custom schemas', color: 'text-[#e11d48]' },
                { icon: '✗', text: 'Breaks macros, cause formatting drift', color: 'text-[#e11d48]' },
                { icon: '✗', text: 'Tablet for normal tables not preserved', color: 'text-[#e11d48]' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`${item.color} font-bold text-sm mt-0.5 w-4 shrink-0`}>{item.icon}</span>
                  <span className="text-[13px] text-[#4a3d6d]">{item.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 p-3 rounded-xl bg-[#fff1f2] border border-[#fecaca] font-mono text-[11px] text-[#be123c]">
              {'[Over File]\n100% Re-serialize → Format Corruption'}
            </div>
          </div>

          {/* ReveLith */}
          <div className="card-feature border-[#a7f3d0]" style={{ '--tw-border-opacity': '1' } as React.CSSProperties}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#d1fae5] flex items-center justify-center text-lg">✓</div>
              <div>
                <div className="font-bold text-[#1a0a3d]">ReveLith Architecture</div>
                <div className="text-xs text-[#059669] font-semibold">Zero-Drift Delta Patching</div>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { icon: '✓', text: 'Byte-fingerprints every XML block independently', color: 'text-[#059669]' },
                { icon: '✓', text: 'Only modified nodes get re-serialized', color: 'text-[#059669]' },
                { icon: '✓', text: 'Untouched XML returned byte-for-byte identical', color: 'text-[#059669]' },
                { icon: '✓', text: '100% Byte Preserving Roundtrip — verified', color: 'text-[#059669]' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`${item.color} font-bold text-sm mt-0.5 w-4 shrink-0`}>{item.icon}</span>
                  <span className="text-[13px] text-[#4a3d6d]">{item.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 p-3 rounded-xl bg-[#f0fdf4] border border-[#a7f3d0] font-mono text-[11px] text-[#065f46]">
              {'→ Fragment affected → Targeted Byte Rewrite\n→ 100% Byte Preserving Roundtrip ✓'}
            </div>
          </div>
        </div>

        {/* Pipeline Stage Selector */}
        <div className="scroll-reveal-scale">
          <div className="bg-white rounded-3xl border border-[#e4e0f7] overflow-hidden shadow-[0_8px_50px_rgba(108,71,255,0.08)]">
            {/* Stage tabs */}
            <div className="flex border-b border-[#f0ecff]">
              {STAGES.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setActiveStage(i)}
                  className={`flex-1 px-4 py-4 text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    activeStage === i
                      ? 'text-white'
                      : 'text-[#7c6fa0] hover:text-[#1a0a3d] hover:bg-[#f9f7ff]'
                  }`}
                  style={activeStage === i ? { background: s.color } : {}}
                >
                  <span>{s.label}</span>
                  {activeStage === i && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>

            {/* Stage content */}
            <div className="flex flex-col lg:flex-row">
              {/* Explanation */}
              <div className="flex-1 p-8">
                <div
                  className="text-xs font-bold uppercase tracking-[0.12em] mb-2"
                  style={{ color: stage.color }}
                >
                  {stage.label}
                </div>
                <h3
                  className="text-[22px] font-bold text-[#1a0a3d] mb-3"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {stage.title}
                </h3>
                <p className="text-[14px] text-[#4a3d6d] leading-relaxed">{stage.description}</p>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#f9f7ff] border border-[#ede9ff] text-center">
                    <div className="text-lg font-bold text-[#6c47ff]">100%</div>
                    <div className="text-[11px] text-[#7c6fa0]">Byte Fidelity</div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#f9f7ff] border border-[#ede9ff] text-center">
                    <div className="text-lg font-bold text-[#059669]">0.00%</div>
                    <div className="text-[11px] text-[#7c6fa0]">Format Drift</div>
                  </div>
                </div>
              </div>

              {/* Code block */}
              <div className="flex-1 p-6">
                <div className="code-block h-full min-h-[200px]">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                    <Code2 className="w-3.5 h-3.5 text-[#7c6fa0]" />
                    <span className="text-[11px] font-mono text-[#7c6fa0]">revelith-engine-pipeline.ts</span>
                    <span
                      className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ color: stage.color, background: `${stage.color}20` }}
                    >
                      STAGE {activeStage + 1} / 3
                    </span>
                  </div>
                  <pre className="text-[12px] leading-relaxed whitespace-pre-wrap">
                    <code>{stage.code}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}