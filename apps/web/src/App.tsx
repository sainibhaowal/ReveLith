import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Download, LockKeyhole, Menu, X, Zap } from 'lucide-react'
import { DownloadModal } from './components/DownloadModal'
import { LegalModal, type LegalDoc } from './components/LegalModal'
import { FaqSection } from './components/FaqSection'
import { AppCanvas } from './components/AppCanvas'
import { PatchGrid } from './components/PatchGrid'
import { GithubIcon } from './components/GithubIcon'
import { useReveal, useScrollProgress, useStickyHeader } from './hooks/useReveal'
import { APP_MODULES, GITHUB_REPO_URL } from './data/suite-data'
import { BUILD_RELEASE, getReleaseManifest } from './release-manifest'
import './App.css'

export function App() {
  const [downloadOpen, setDownloadOpen] = useState(
    () => new URLSearchParams(window.location.search).get('download') === '1',
  )
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeModule, setActiveModule] = useState(
    () =>
      APP_MODULES.find((m) => m.id === new URLSearchParams(window.location.search).get('module')) ??
      APP_MODULES[0],
  )
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null)
  // The build-time manifest is generated from the selected release. A fresh
  // /release.json fetch can refresh it without ever showing a stale version.
  const [release, setRelease] = useState(BUILD_RELEASE)
  // True once the reader picks an app themselves — that stops the showcase
  // from rotating underneath them. A deep link counts as a deliberate choice.
  const [pinned, setPinned] = useState(() =>
    APP_MODULES.some((m) => m.id === new URLSearchParams(window.location.search).get('module')),
  )
  const [paused, setPaused] = useState(false)
  const [inView, setInView] = useState(false)
  const zoneRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void getReleaseManifest()
      .then(setRelease)
      .catch(() => undefined)
  }, [])

  useReveal()
  useStickyHeader()
  useScrollProgress()

  // Auto-switch: only while the workspace showcase is on screen and the reader
  // has not taken over. Pauses on hover or keyboard focus.
  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? false),
      { threshold: 0.35 },
    )
    observer.observe(zone)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inView || paused || pinned) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const id = window.setInterval(() => {
      setActiveModule((current) => {
        const i = APP_MODULES.findIndex((m) => m.id === current.id)
        return APP_MODULES[(i + 1) % APP_MODULES.length]
      })
    }, 3200)
    return () => window.clearInterval(id)
  }, [inView, paused, pinned])

  return (
    <div className="site-shell">
      {/* Ambient animated background: the byte grid + its patch band */}
      <div className="bg-scene" aria-hidden="true">
        <PatchGrid />
        <span className="bg-hero-scrim" />
        <span className="bg-vignette" />
      </div>

      <div className="utility-bar">
        <span>
          <Zap size={13} /> ReveLith {release.version}
        </span>
        <span>Local AI. Zero telemetry. Open source.</span>
        <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
          View source <ArrowUpRight size={13} />
        </a>
        <span className="utility-progress" aria-hidden="true" />
      </div>

      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="ReveLith home">
          <span className="wordmark-mark">
            <img src="/revelith-logo.svg" alt="" />
          </span>
          <span>ReveLith</span>
        </a>
        <nav className={mobileOpen ? 'main-nav is-open' : 'main-nav'}>
          <a href="#workspace" onClick={() => setMobileOpen(false)}>
            Workspace
          </a>
          <a href="#architecture" onClick={() => setMobileOpen(false)}>
            Architecture
          </a>
          <a href="#privacy" onClick={() => setMobileOpen(false)}>
            Privacy
          </a>
          <a href="#developers" onClick={() => setMobileOpen(false)}>
            Developers
          </a>
        </nav>
        <div className="header-actions">
          <a className="github-link" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
            <GithubIcon className="github-mark" /> GitHub
          </a>
          <button className="button button-blue button-small" onClick={() => setDownloadOpen(true)}>
            <Download size={15} /> Download
          </button>
          <button
            className="menu-button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero-section">
          <span className="hero-watermark" aria-hidden="true">
            <img src="/revelith-logo.svg" alt="" />
          </span>

          <div className="hero-copy">
            <div className="eyebrow hero-in" style={{ animationDelay: '60ms' }}>
              <span className="eyebrow-dot" /> Offline-first by design
            </div>
            <h1 className="hero-in" style={{ animationDelay: '140ms' }}>
              Documents that stay <em>yours.</em>
            </h1>
            <p className="hero-lede hero-in" style={{ animationDelay: '220ms' }}>
              A native office suite for people who care about the file after they save it. Edit
              DOCX, XLSX, PPTX, PDF, Markdown and HTML alongside drawing boards, forms and kanban
              task lists — with local AI and zero cloud dependency.
            </p>
            <div className="hero-actions hero-in" style={{ animationDelay: '300ms' }}>
              <button className="button button-blue" onClick={() => setDownloadOpen(true)}>
                <Download size={17} /> Download free
              </button>
              <a className="text-link" href="#workspace">
                Explore the workspace <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="hero-proof hero-in" style={{ animationDelay: '380ms' }}>
              <span>
                <Check size={14} /> 100% byte-preserving
              </span>
              <span>
                <LockKeyhole size={14} /> Runs offline
              </span>
              <span>Apache 2.0</span>
            </div>
          </div>

          <div className="hero-note hero-in" style={{ animationDelay: '460ms' }}>
            <span className="note-index">01</span>
            <p>Software should respect the shape of your work, not ask you to reshape it.</p>
            <span className="note-rule" />
            <span className="note-caption">The local-first office suite</span>
          </div>
        </section>

        <section className="workspace-section" id="workspace">
          <div className="section-heading scroll-reveal">
            <div>
              <span className="eyebrow">One shell / nine engines</span>
              <h2>Your files, in one focused workspace.</h2>
            </div>
            <p>
              Switch formats without switching context. Documents, sheets, slides, HTML, boards,
              forms and task lists all live in the same calm desktop shell.
            </p>
          </div>

          {/* Horizontal app switcher. Click any app to pin it; leave it alone
              and the showcase rotates through all nine while in view. */}
          <div
            ref={zoneRef}
            className="workspace-switch scroll-reveal"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
          >
            <div className="app-tabs" role="tablist" aria-label="ReveLith applications">
              {APP_MODULES.map((module) => {
                const isActive = activeModule.id === module.id
                return (
                  <button
                    key={module.id}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="app-tabpanel"
                    className={isActive ? 'app-tab is-active' : 'app-tab'}
                    style={
                      isActive
                        ? ({ '--tab-accent': module.accentColor } as React.CSSProperties)
                        : undefined
                    }
                    onClick={() => {
                      setActiveModule(module)
                      setPinned(true)
                    }}
                  >
                    <img src={module.icon} alt="" aria-hidden="true" />
                    <span className="app-tab-name">{module.name}</span>
                    <span className="app-tab-ext">{module.extension}</span>
                  </button>
                )
              })}
            </div>

            <div className="workspace-window scroll-reveal-scale">
              <div
                className="workspace-body"
                id="app-tabpanel"
                role="tabpanel"
                aria-label={`${activeModule.name} preview`}
              >
                <AppCanvas module={activeModule} />
              </div>
            </div>

            <div className="workspace-meta">
              <p className="workspace-blurb">
                <b>{activeModule.name}</b> {activeModule.description}
              </p>
              <div className="workspace-ai">
                <span className="workspace-ai-label">Copilot</span>
                <p>{activeModule.uiPreview.aiResult}</p>
              </div>
              <div className="workspace-progress" aria-hidden="true">
                {APP_MODULES.map((module) => (
                  <span key={module.id} className={activeModule.id === module.id ? 'is-on' : ''} />
                ))}
              </div>
              <span className="workspace-hint">
                {pinned
                  ? 'Pinned to ' + activeModule.name
                  : 'Auto-switching — click any app to pin'}
              </span>
            </div>
          </div>

          <div className="workspace-foot stagger-children">
            <span className="scroll-reveal">
              <b>01</b> Choose a format
            </span>
            <span className="scroll-reveal">
              <b>02</b> Work normally
            </span>
            <span className="scroll-reveal">
              <b>03</b> Save without drift
            </span>
          </div>
        </section>

        <section className="architecture-section" id="architecture">
          <div className="architecture-intro scroll-reveal-left">
            <span className="eyebrow">The difference is underneath</span>
            <h2>
              Less re-serialization.
              <br />
              <em>More fidelity.</em>
            </h2>
            <p>
              ReveLith maps document structure into isolated memory, then writes only the fragments
              you changed. The original container stays intact.
            </p>
            <a className="text-link" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
              Read the source <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="architecture-list stagger-children">
            <div className="scroll-reveal-right">
              <span>01</span>
              <h3>Parse once</h3>
              <p>Open the native container without rewriting its contents.</p>
            </div>
            <div className="scroll-reveal-right">
              <span>02</span>
              <h3>Patch precisely</h3>
              <p>Track changes at the block level, not across the whole document.</p>
            </div>
            <div className="scroll-reveal-right">
              <span>03</span>
              <h3>Save cleanly</h3>
              <p>Preserve macros, custom XML, styles, and embedded assets.</p>
            </div>
          </div>
        </section>

        <section className="privacy-section" id="privacy">
          <div className="privacy-panel scroll-reveal-scale">
            <div>
              <span className="eyebrow">A better boundary</span>
              <h2>Your documents never become our data.</h2>
            </div>
            <div className="privacy-copy">
              <p>
                AI inference, rendering, and document processing happen on your machine. No account.
                No upload queue. No invisible analytics.
              </p>
              <div className="privacy-stats">
                <span>
                  <b>0</b> documents uploaded
                </span>
                <span>
                  <b>100%</b> local processing
                </span>
                <span>
                  <b>AES-256</b> encrypted
                </span>
              </div>
            </div>
          </div>
        </section>

        <FaqSection />
      </main>

      <footer className="site-footer" id="developers">
        <span className="footer-watermark" aria-hidden="true">
          <img src="/revelith-logo.svg" alt="" />
        </span>
        <div className="footer-brand">
          <a className="wordmark" href="#top">
            <span className="wordmark-mark">
              <img src="/revelith-logo.svg" alt="" />
            </span>
            <span>ReveLith</span>
          </a>
          <p>Serious tools for sovereign work.</p>
        </div>
        <div className="footer-links">
          <a href="#workspace">Workspace</a>
          <a href="#architecture">Architecture</a>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
            GitHub <ArrowUpRight size={13} />
          </a>
          <button onClick={() => setDownloadOpen(true)}>
            Download <Download size={13} />
          </button>
        </div>
        <div className="footer-legal-row">
          <button className="footer-legal-link" onClick={() => setLegalDoc('privacy')}>
            Privacy
          </button>
          <span className="footer-dot" aria-hidden="true">
            ·
          </span>
          <button className="footer-legal-link" onClick={() => setLegalDoc('terms')}>
            Terms
          </button>
          <span className="footer-dot" aria-hidden="true">
            ·
          </span>
          <a
            className="footer-legal-link"
            href={`${GITHUB_REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
          >
            Apache 2.0
          </a>
        </div>
        <span className="footer-legal">Open source under Apache 2.0 · {release.version}</span>
      </footer>

      <DownloadModal
        isOpen={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        release={release}
      />
      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} version={release.version} />
    </div>
  )
}

export default App
