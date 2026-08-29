import React from 'react'
import { ExternalLink, Heart } from 'lucide-react'
import { GithubIcon } from './GithubIcon'
import { GITHUB_REPO_URL, LATEST_VERSION } from '../data/suite-data'

const LINKS = {
  Suite: ['Docs Editor', 'Sheets Engine', 'Slides Designer', 'PDF Editor', 'Markdown Workspace'],
  Resources: ['Documentation', 'API Reference', 'Plugin System', 'Release Notes', 'Roadmap'],
  Company: ['About ReveLith', 'Open Source', 'Security Policy', 'Privacy Pledge', 'Contact'],
}

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#1a0a3d] text-white relative overflow-hidden">
      {/* Top wave */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#6c47ff]/60 to-transparent" />

      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(rgba(108,71,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(108,71,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
      />

      {/* Blob */}
      <div className="absolute bottom-0 left-1/4 w-[600px] h-[400px] bg-[#6c47ff]/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

      <div className="container-xl relative z-10 pt-16 pb-10">
        {/* Top section */}
        <div className="grid lg:grid-cols-4 gap-10 mb-12 pb-12 border-b border-white/10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-[#6c47ff]/20 border border-[#6c47ff]/40 flex items-center justify-center">
                <img src="/revelith-logo.svg" alt="" className="w-5 h-5" aria-hidden="true" />
              </div>
              <span className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
                Reve<span style={{ color: '#a78bfa' }}>Lith</span>
              </span>
            </div>
            <p className="text-sm text-white/50 leading-relaxed mb-5">
              The intelligent offline-first office suite built for engineers, writers, and analysts who demand sovereignty and precision.
            </p>
            <div className="flex items-center gap-3">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/12 hover:border-white/20 transition-all"
                aria-label="GitHub"
              >
                <GithubIcon className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Links */}
          {Object.entries(LINKS).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-white/40 mb-4">{category}</h3>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-white/60 hover:text-white transition-colors hover:translate-x-1 inline-block"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[13px] text-white/40">
            <span>© 2025 ReveLith · Open Source under</span>
            <a
              href={`${GITHUB_REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#a78bfa] hover:text-white font-semibold transition-colors"
            >
              Apache 2.0
            </a>
          </div>

          <div className="flex items-center gap-4 text-[12px] text-white/40">
            <span className="font-mono text-[#a78bfa]">{LATEST_VERSION}</span>
            <span className="flex items-center gap-1">
              Made with <Heart className="w-3 h-3 text-[#f43f5e] fill-[#f43f5e]" /> by the ReveLith team
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}