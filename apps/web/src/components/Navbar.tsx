import React, { useState, useEffect } from 'react'
import { Download, Menu, X, Star, ChevronDown } from 'lucide-react'
import { GithubIcon } from './GithubIcon'
import { GITHUB_REPO_URL, LATEST_VERSION, APP_MODULES } from '../data/suite-data'

interface NavbarProps {
  onOpenDownload: () => void
  onSelectModule: (moduleId: string) => void
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenDownload, onSelectModule }) => {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { href: '#suite-preview', label: 'Suite' },
    { href: '#architecture', label: 'Architecture' },
    { href: '#privacy', label: 'Privacy' },
    { href: '#comparison', label: 'Benchmark' },
    { href: '#quickstart', label: 'Developers' },
  ]

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-xl border-b border-[#e4e0f7] shadow-[0_4px_24px_rgba(108,71,255,0.08)]'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="container-xl flex items-center justify-between h-16 gap-2 sm:gap-4">
        {/* Brand */}
        <a href="#" className="flex items-center gap-3 group" aria-label="ReveLith Home">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-[#ddd5ff] bg-gradient-to-br from-[#f3f0ff] to-[#ede9ff] group-hover:border-[#a78bfa] group-hover:shadow-[0_0_14px_rgba(108,71,255,0.2)] transition-all duration-200"
          >
            <img src="/revelith-logo.svg" alt="" className="w-5 h-5 object-contain" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="text-xl font-bold text-[#1a0a3d] tracking-tight"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Reve<span style={{ color: 'var(--color-brand)' }}>Lith</span>
            </span>
            <span className="hidden min-[400px]:inline-block text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md bg-[#f3f0ff] text-[#6c47ff] border border-[#ddd5ff]">
              {LATEST_VERSION}
            </span>
          </div>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-0.5" role="navigation">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="btn-ghost-nav">
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#e4e0f7] bg-white hover:border-[#c4b5fd] hover:bg-[#f9f7ff] transition-all text-sm font-medium text-[#4a3d6d] hover:text-[#6c47ff]"
          >
            <GithubIcon className="w-4 h-4" aria-hidden="true" />
            <span>GitHub</span>
            <span className="flex items-center gap-1 text-[11px] bg-[#f3f0ff] text-[#6c47ff] px-2 py-0.5 rounded-full font-semibold border border-[#ddd5ff]">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              Open
            </span>
          </a>

          <button
            onClick={onOpenDownload}
            className="btn-brand px-5 py-2.5 text-sm"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Download Free</span>
          </button>
        </div>

        {/* Mobile Toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-xl border border-[#e4e0f7] bg-white text-[#4a3d6d] hover:text-[#6c47ff] hover:border-[#c4b5fd] transition-all"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div className="md:hidden px-4 pb-6 pt-3 bg-white border-b border-[#e4e0f7] shadow-[0_8px_24px_rgba(108,71,255,0.08)]">
          <nav className="flex flex-col gap-1 mb-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-[#4a3d6d] hover:text-[#6c47ff] hover:bg-[#f9f7ff] transition-all"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {APP_MODULES.map((mod) => (
              <button
                key={mod.id}
                onClick={() => {
                  onSelectModule(mod.id)
                  setMobileOpen(false)
                  document.getElementById('suite-preview')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="flex items-center gap-2.5 p-3 rounded-xl border border-[#e4e0f7] bg-[#f9f7ff] hover:border-[#c4b5fd] transition-all text-sm font-semibold text-[#1a0a3d]"
              >
                <img src={mod.icon} alt="" className="w-4 h-4" aria-hidden="true" />
                {mod.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setMobileOpen(false); onOpenDownload() }}
            className="btn-brand w-full justify-center py-3"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Download ReveLith Free
          </button>
        </div>
      )}
    </header>
  )
}