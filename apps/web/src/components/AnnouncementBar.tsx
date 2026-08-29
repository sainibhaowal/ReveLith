import React from 'react'
import { Zap, Sparkles, ArrowRight } from 'lucide-react'
import { GithubIcon } from './GithubIcon'
import { LATEST_VERSION, GITHUB_REPO_URL } from '../data/suite-data'

export const AnnouncementBar: React.FC = () => {
  const items = [
    { icon: <Zap className="w-3 h-3" />, text: `ReveLith ${LATEST_VERSION} — Rust Calculation Core 3× Faster` },
    { icon: <Sparkles className="w-3 h-3" />, text: 'Local AI Copilot Now Supports Llama 3.1, Mistral & Phi-3' },
    { icon: <GithubIcon className="w-3 h-3" />, text: 'Open Source under Apache 2.0 — Star us on GitHub' },
    { icon: <Zap className="w-3 h-3" />, text: 'Zero Telemetry · 100% Offline · Native Desktop Performance' },
    { icon: <Sparkles className="w-3 h-3" />, text: 'Byte-Preserving DOCX / XLSX / PPTX Round-Trip Fidelity' },
  ]

  const doubledItems = [...items, ...items]

  return (
    <div className="relative bg-gradient-to-r from-[#6c47ff] via-[#5537d9] to-[#4f2fe0] overflow-hidden h-8 flex items-center">
      <div className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 1px, transparent 1px, transparent 40px)'
        }}
      />
      <div className="overflow-hidden flex-1 relative">
        <div className="ticker-track">
          {doubledItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-8 whitespace-nowrap">
              <span className="text-white/70">{item.icon}</span>
              <span className="text-white/90 text-xs font-medium tracking-wide">{item.text}</span>
              <span className="text-white/30 text-xs ml-4">✦</span>
            </div>
          ))}
        </div>
      </div>
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 flex items-center gap-1 px-4 text-[11px] font-bold text-white/90 hover:text-white border-l border-white/20 h-full hover:bg-white/10 transition-colors"
      >
        GitHub <ArrowRight className="w-3 h-3" />
      </a>
    </div>
  )
}