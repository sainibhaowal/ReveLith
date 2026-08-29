import React, { useState } from 'react'
import { Terminal, Copy, CheckCircle2, ExternalLink, Code2, Package } from 'lucide-react'
import { GITHUB_REPO_URL } from '../data/suite-data'
import { GithubIcon } from './GithubIcon'

const COMMANDS = [
  { label: 'Install via Homebrew (macOS)', cmd: 'brew install revelith/tap/revelith', shell: 'brew' },
  { label: 'Install via Winget (Windows)', cmd: 'winget install ReveLith.ReveLith', shell: 'powershell' },
  { label: 'Install via Snap (Linux)', cmd: 'sudo snap install revelith --classic', shell: 'bash' },
]

const PACKAGES = [
  { name: '@revelith/docx-engine', desc: 'OOXML delta-patching engine', badge: 'npm', color: '#6c47ff' },
  { name: '@revelith/xlsx-engine', desc: 'Rust-powered XLSX calculation', badge: 'npm', color: '#059669' },
  { name: '@revelith/pptx-engine', desc: 'PowerPoint canvas pipeline', badge: 'npm', color: '#d97706' },
  { name: 'revelith-ai-sdk', desc: 'Local AI copilot integration', badge: 'npm', color: '#e11d48' },
]

export const DeveloperQuickstart: React.FC = () => {
  const [copied, setCopied] = useState<number | null>(null)

  const copy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(idx)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <section id="quickstart" className="py-20 md:py-28 relative bg-gradient-to-b from-[#f8f7ff] to-[#f0eeff]">
      <div className="container-xl">
        {/* Header */}
        <div className="text-center mb-14 scroll-reveal">
          <div className="section-label justify-center">Developer Sandbox &amp; Commands</div>
          <h2
            className="text-[32px] sm:text-[44px] md:text-[52px] font-extrabold tracking-[-0.025em] leading-[1.1] mb-4 text-[#1a0a3d]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Built for Engineers.{' '}
            <span className="heading-gradient">Hackable by Design.</span>
          </h2>
          <p className="text-[16px] text-[#4a3d6d] max-w-xl mx-auto leading-relaxed">
            ReveLith's desktop shell, OOXML delta sidecars, and computation sidecars are 100% open-source under Apache 2.0.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Install commands */}
          <div className="scroll-reveal-left">
            <h3 className="text-[17px] font-bold text-[#1a0a3d] mb-4 flex items-center gap-2">
              <Terminal className="w-4.5 h-4.5 text-[#6c47ff]" />
              Install Commands
            </h3>
            <div className="space-y-3">
              {COMMANDS.map((c, i) => (
                <div key={i} className="bg-white rounded-2xl border border-[#e4e0f7] overflow-hidden shadow-[0_2px_12px_rgba(108,71,255,0.05)]">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f0ecff] bg-[#f9f7ff]">
                    <span className="text-[11px] font-semibold text-[#7c6fa0]">{c.label}</span>
                    <button
                      onClick={() => copy(c.cmd, i)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6c47ff] hover:text-[#4f2fe0] transition-colors"
                      aria-label="Copy command"
                    >
                      {copied === i ? (
                        <><CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" /> Copied!</>
                      ) : (
                        <><Copy className="w-3.5 h-3.5" /> Copy</>
                      )}
                    </button>
                  </div>
                  <div className="px-4 py-3.5">
                    <code className="text-[13px] font-mono text-[#1a0a3d] font-semibold">
                      <span className="text-[#6c47ff]">$</span> {c.cmd}
                    </code>
                  </div>
                </div>
              ))}
            </div>

            {/* GitHub links */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-brand flex-1 justify-center py-3 text-sm"
              >
                <GithubIcon className="w-4 h-4" />
                Open GitHub Monorepo
              </a>
              <a
                href={`${GITHUB_REPO_URL}/releases`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline flex-1 justify-center py-3 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                View Releases
              </a>
            </div>
          </div>

          {/* NPM Packages */}
          <div className="scroll-reveal-right">
            <h3 className="text-[17px] font-bold text-[#1a0a3d] mb-4 flex items-center gap-2">
              <Package className="w-4.5 h-4.5 text-[#6c47ff]" />
              Open Source Packages
            </h3>
            <div className="space-y-3">
              {PACKAGES.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-[#e4e0f7] bg-white hover:border-[#c4b5fd] hover:shadow-[0_4px_20px_rgba(108,71,255,0.08)] transition-all duration-200 group"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                    style={{ background: p.color + '12', color: p.color, borderColor: p.color + '30' }}
                  >
                    <Code2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-semibold text-[13px] text-[#1a0a3d] truncate">
                      {p.name}
                    </div>
                    <div className="text-[12px] text-[#7c6fa0]">{p.desc}</div>
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
                    style={{ color: p.color, background: p.color + '12', border: `1px solid ${p.color}30` }}
                  >
                    {p.badge}
                  </span>
                </div>
              ))}
            </div>

            {/* Feature highlight */}
            <div className="mt-6 p-5 rounded-2xl bg-gradient-to-br from-[#f3f0ff] to-[#ede9ff] border border-[#ddd5ff]">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#6c47ff] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-[#1a0a3d] mb-1">100% Hackable Plugin API</div>
                  <div className="text-xs text-[#4a3d6d] leading-relaxed">
                    Every document engine is exposed through a stable TypeScript API. Build custom import/export pipelines, AI workflows, or full custom editors on top of ReveLith's native rendering stack.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}