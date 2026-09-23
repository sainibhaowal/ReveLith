import React from 'react'
import { CheckCircle2, X, Minus, Zap, Lock, Code2 } from 'lucide-react'
import { COMPARISON_DATA } from '../data/suite-data'

const DIFFERENTIATORS = [
  {
    icon: <Zap className="w-5 h-5" />,
    title: 'Rust-Powered Speed',
    description: 'Sub-millisecond formula calculation. Native spreadsheet engine processes 1M+ rows without freezing. 60 FPS steady scrolling on massive sheets.',
    color: '#d97706',
    bg: '#fef3c7',
  },
  {
    icon: <Lock className="w-5 h-5" />,
    title: 'Offline Sovereign',
    description: 'No tracking. No subscriptions. No cloud lock-in. ReveLith runs entirely locally, forever. Your intellectual property stays yours.',
    color: '#059669',
    bg: '#d1fae5',
  },
  {
    icon: <Code2 className="w-5 h-5" />,
    title: 'Open Source & Hackable',
    description: 'Full API access to every engine. Build plugins, automate workflows, add custom AI models. 100% open source under Apache 2.0.',
    color: '#6c47ff',
    bg: '#f3f0ff',
  },
]

export const ComparisonMatrix: React.FC = () => {
  return (
    <section id="comparison" className="py-20 md:py-28 relative">
      <div className="container-xl">
        {/* Header */}
        <div className="text-center mb-14 scroll-reveal">
          <div className="section-label justify-center">Productivity Benchmark</div>
          <h2
            className="text-[32px] sm:text-[44px] md:text-[52px] font-extrabold tracking-[-0.025em] leading-[1.1] mb-4 text-[#1a0a3d]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            How{' '}
            <span className="heading-gradient-slow">ReveLith</span>
            {' '}Compares
          </h2>
          <p className="text-[16px] text-[#4a3d6d] max-w-xl mx-auto leading-relaxed">
            Built from scratch for power users and engineers who demand speed, fidelity, and sovereign local control.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="scroll-reveal-scale overflow-x-auto mb-14">
          <table className="comparison-table">
            <thead>
              <tr>
                <th className="w-[35%] text-[#4a3d6d]">Capability / Feature</th>
                <th className="col-revelith text-center text-[#6c47ff]">
                  <div className="flex items-center justify-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#6c47ff]" />
                    ReveLith Suite
                  </div>
                </th>
                <th className="text-center text-[#4a3d6d]">Legacy Desktop</th>
                <th className="text-center text-[#4a3d6d]">Cloud Web Suite</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_DATA.map((row, i) => (
                <tr key={i}>
                  <td className="font-semibold text-[#1a0a3d] text-[13px]">{row.feature}</td>
                  <td className="col-revelith text-[13px]">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#6c47ff] shrink-0 mt-0.5" />
                      <span className="text-[#1a0a3d] font-medium">{row.revelith}</span>
                    </div>
                  </td>
                  <td className="text-[13px]">
                    <div className="flex items-start gap-2 text-[#7c6fa0]">
                      <X className="w-4 h-4 text-[#e11d48] shrink-0 mt-0.5" />
                      <span>{row.traditional}</span>
                    </div>
                  </td>
                  <td className="text-[13px]">
                    <div className="flex items-start gap-2 text-[#7c6fa0]">
                      <Minus className="w-4 h-4 text-[#d97706] shrink-0 mt-0.5" />
                      <span>{row.cloud}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Differentiator Cards */}
        <div className="grid sm:grid-cols-3 gap-6 stagger-children">
          {DIFFERENTIATORS.map((d, i) => (
            <div key={i} className="card scroll-reveal">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4 border"
                style={{
                  background: d.bg,
                  color: d.color,
                  borderColor: d.color + '30',
                }}
              >
                {d.icon}
              </div>
              <h3 className="text-[16px] font-bold text-[#1a0a3d] mb-2">{d.title}</h3>
              <p className="text-[13px] text-[#7c6fa0] leading-relaxed">{d.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}