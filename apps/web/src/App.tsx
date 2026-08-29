import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, Download, LockKeyhole, Menu, X, Zap } from 'lucide-react'
import { DownloadModal } from './components/DownloadModal'
import { GithubIcon } from './components/GithubIcon'
import { APP_MODULES, GITHUB_REPO_URL } from './data/suite-data'
import { FALLBACK_RELEASE, getReleaseManifest } from './release-manifest'
import './App.css'

const FEATURE_SUMMARIES = [
  { name: 'Docs', extension: '.docx', icon: '/file-docx.svg', text: 'Write, review, and edit Word documents in the same workspace.' },
  { name: 'Sheets', extension: '.xlsx', icon: '/file-xlsx.svg', text: 'Work with spreadsheet files alongside your documents and presentations.' },
  { name: 'Slides', extension: '.pptx', icon: '/file-pptx.svg', text: 'Create and refine presentations with native slide tools.' },
  { name: 'PDF', extension: '.pdf', icon: '/file-pdf.svg', text: 'Read, annotate, and work with PDF documents locally.' },
  { name: 'Markdown', extension: '.md', icon: '/file-md.svg', text: 'Keep technical notes and documentation in portable plain text.' },
]

const FAQS = [
  ['Where does my data go?', 'ReveLith is designed to work with local files. When you choose an AI provider, requests are handled by that provider under its own configuration and policies.'],
  ['Can I use a local model?', 'Yes. The app supports connecting compatible local providers, including local servers you configure yourself.'],
  ['Can I bring my own API key?', 'Yes. You can connect a provider you trust with your own credentials where that provider supports it.'],
  ['Which file formats are supported?', 'ReveLith works with DOCX, XLSX, PPTX, PDF, and Markdown workflows. Check the release notes for the current scope of each editor.'],
  ['What is the license?', 'ReveLith is open source under the Apache 2.0 license.'],
]

export function App() {
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeModule, setActiveModule] = useState(APP_MODULES[0])
  const [release, setRelease] = useState(FALLBACK_RELEASE)
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    void getReleaseManifest().then(setRelease).catch(() => undefined)
  }, [])

  useEffect(() => {
    const revealObserver = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed')
          revealObserver.unobserve(entry.target)
        }
      }),
      { threshold: 0.16, rootMargin: '0px 0px -48px' },
    )
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => revealObserver.observe(element))

    const updateProgress = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      setScrollProgress(maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0)
    }
    const addRipple = (event: PointerEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('.pressable')
      if (!target) return
      const box = target.getBoundingClientRect()
      target.style.setProperty('--ripple-x', `${event.clientX - box.left}px`)
      target.style.setProperty('--ripple-y', `${event.clientY - box.top}px`)
      target.classList.remove('is-pressed')
      void target.offsetWidth
      target.classList.add('is-pressed')
    }
    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    document.addEventListener('pointerdown', addRipple)
    return () => {
      revealObserver.disconnect()
      window.removeEventListener('scroll', updateProgress)
      document.removeEventListener('pointerdown', addRipple)
    }
  }, [])

    return (
      <div className="site-shell">
        <div className="scroll-progress" style={{ transform: `scaleX(${scrollProgress})` }} aria-hidden="true" />
        <div className="utility-bar">
          <span><Zap size={13} /> ReveLith {release.version}</span>
          <span>Native files. Your provider. Your choice.</span>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">View source <ArrowUpRight size={13} /></a>
        </div>

        <header className="site-header">
          <a className="wordmark pressable" href="#top" aria-label="ReveLith home">
            <span className="wordmark-mark"><img src="/revelith-logo.svg" alt="" /></span>
            <span>ReveLith</span>
          </a>
          <nav className={mobileOpen ? 'main-nav is-open' : 'main-nav'}>
            <a className="pressable" href="#workspace" onClick={() => setMobileOpen(false)}>Workspace</a>
            <a className="pressable" href="#architecture" onClick={() => setMobileOpen(false)}>Architecture</a>
            <a className="pressable" href="#privacy" onClick={() => setMobileOpen(false)}>Privacy</a>
            <a className="pressable" href="#developers" onClick={() => setMobileOpen(false)}>Developers</a>
          </nav>
          <div className="header-actions">
            <a className="github-link pressable" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer"><GithubIcon className="github-mark" /> GitHub</a>
            <button className="button button-blue button-small pressable" onClick={() => setDownloadOpen(true)}><Download size={15} /> Download</button>
            <button className="menu-button pressable" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>

        <main id="top">
          <section className="hero-section">
            <div className="hero-copy hero-enter">
              <div className="eyebrow"><span className="eyebrow-dot" /> Native-first by design</div>
              <h1>Work with files. <em>Choose your AI.</em></h1>
              <p className="hero-lede">ReveLith is a native office suite for DOCX, XLSX, PPTX, PDF, and Markdown. Connect Ollama, LM Studio, OpenAI, OpenCode Zen, Claude, Gemini, DeepSeek, or any OpenAI-compatible server—without a ReveLith AI account or credit system.</p>
              <div className="hero-actions">
                <button className="button button-blue pressable" onClick={() => setDownloadOpen(true)}><Download size={17} /> Download free</button>
                <a className="text-link pressable" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer"><GithubIcon className="github-mark" /> View on GitHub <ArrowUpRight size={16} /></a>
                <a className="text-link pressable" href="#workspace">Explore the workspace <ArrowUpRight size={16} /></a>
              </div>
              <div className="hero-proof"><span><Check size={14} /> Native file workflows</span><span><LockKeyhole size={14} /> Local or BYOK AI</span><span>Apache 2.0</span></div>
            </div>
            <div className="hero-note hero-note-enter">
              <span className="note-index">01</span>
              <p>Software should respect the shape of your work—and let you choose the model that helps you make it.</p>
              <span className="note-rule" />
              <span className="note-caption">The local-first office suite</span>
            </div>
          </section>

          <section className="workspace-section" id="workspace">
            <div className="section-heading" data-reveal>
              <div><span className="eyebrow">One shell / five engines</span><h2>Your files, in one focused workspace.</h2></div>
              <p>Switch formats without switching context. Every engine is native to the same calm, capable desktop shell.</p>
            </div>
            <div className="workspace-window" data-reveal>
              <div className="window-topline"><div className="window-dots"><i /><i /><i /></div><span className="window-path">revelith / workspace</span><span className="window-status"><b /> Local mode</span></div>
              <div className="workspace-body">
                <aside className="workspace-sidebar">
                  <span className="sidebar-label">Your formats</span>
                  {APP_MODULES.map((module) => <button key={module.id} className={`${activeModule.id === module.id ? 'module-button active' : 'module-button'} pressable`} onClick={() => setActiveModule(module)}><img src={module.icon} alt="" /><span>{module.name}</span><small>{module.extension}</small></button>)}
                  <div className="sidebar-bottom"><LockKeyhole size={14} /><span>Private workspace<br /><b>Nothing leaves this device</b></span></div>
                </aside>
                <div className="document-area">
                  <div className="document-toolbar"><span className="document-type" style={{ color: activeModule.accentColor }}>{activeModule.name}</span><span>Ready for a local file</span><span className="toolbar-meta">Local workspace</span></div>
                  <div className="document-page">
                    <span className="page-kicker">{activeModule.extension} workspace</span>
                    <h3>Open a file and start working.</h3>
                    <p>{activeModule.description}</p>
                    <div className="document-line long" /><div className="document-line medium" /><div className="document-line short" />
                    <div className="document-callout"><Check size={15} /><span>Use your configured provider when you choose to use AI.</span></div>
                  </div>
                </div>
                <aside className="copilot-panel"><div className="copilot-heading"><span className="copilot-icon">AI</span><div><b>AI settings</b><small>Optional and provider controlled</small></div></div><span className="panel-label">Your connection</span><p>Connect a local or compatible provider in Settings, then choose a model when you want AI help.</p><div className="copilot-result"><span>Privacy first</span>ReveLith does not require a separate AI account or credit system.</div><button className="copilot-button pressable">Open settings <ArrowUpRight size={14} /></button></aside>
              </div>
            </div>
            <div className="workspace-foot"><span><b>01</b> Choose a format</span><span><b>02</b> Work normally</span><span><b>03</b> Save without drift</span></div>
          </section>

          <section className="architecture-section" id="architecture">
            <div className="architecture-intro" data-reveal><span className="eyebrow">The difference is underneath</span><h2>One suite.<br /><em>Any capable model.</em></h2><p>ReveLith keeps editing tools native to each format and uses your configured AI provider only when you ask it to. No mandatory hosted deck generator or separate AI subscription.</p><a className="text-link pressable" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">Read the source <ArrowUpRight size={16} /></a></div>
            <div className="architecture-list" data-reveal><div><span>01</span><h3>Connect once</h3><p>Add a local model, a BYOK provider, or a compatible server in Settings.</p></div><div><span>02</span><h3>Choose live models</h3><p>Discover available models and switch the active model from the editor.</p></div><div><span>03</span><h3>Use native tools</h3><p>Each app applies changes with its own document, sheet, slide, or Markdown tools.</p></div></div>
          </section>

          <section className="privacy-section" id="privacy"><div className="privacy-panel" data-reveal><div><span className="eyebrow">A better boundary</span><h2>Your provider, your data boundary.</h2></div><div className="privacy-copy"><p>Use a local provider such as Ollama or LM Studio, or connect your own API key to a provider you trust. ReveLith does not require a separate ReveLith AI login, credits, or a proprietary generation service.</p><div className="privacy-stats"><span><b>Local</b> provider options</span><span><b>BYOK</b> supported</span><span><b>Your choice</b> of model</span></div></div></div></section>

          <section className="features-section" id="features" data-reveal>
            <div className="section-heading"><div><span className="eyebrow">Made for real files</span><h2>One workspace for the formats you already use.</h2></div><p>Each format has its own editor, while your files stay in one focused desktop workspace.</p></div>
            <div className="feature-grid">{FEATURE_SUMMARIES.map((feature) => <article className="feature-card" key={feature.name}><img src={feature.icon} alt="" /><div><span>{feature.extension}</span><h3>{feature.name}</h3><p>{feature.text}</p></div></article>)}</div>
          </section>

          <section className="download-section" id="download" data-reveal>
            <div><span className="eyebrow">Get started</span><h2>Download ReveLith.</h2><p>Choose an available installer for your operating system. Release notes contain the latest installation details.</p></div>
            <div className="download-list">{release.downloads.map((item) => <a className="download-row pressable" href={item.url} key={`${item.os}-${item.format}`}><span className="download-platform">{item.emoji}</span><span><b>{item.os}</b><small>{item.format} · {item.tag}</small></span><ArrowUpRight size={17} /></a>)}<a className="text-link pressable" href={GITHUB_REPO_URL + '/releases'} target="_blank" rel="noreferrer">Read release notes <ArrowUpRight size={16} /></a></div>
          </section>

          <section className="faq-section" id="faq" data-reveal><div className="section-heading"><div><span className="eyebrow">Questions, answered</span><h2>Good to know before you start.</h2></div></div><div className="faq-list">{FAQS.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>
        </main>

        <footer className="site-footer" id="developers"><div className="footer-brand"><a className="wordmark" href="#top"><span className="wordmark-mark"><img src="/revelith-logo.svg" alt="" /></span><span>ReveLith</span></a><p>Serious tools for sovereign work.</p></div><div className="footer-links"><a href="#workspace">Workspace</a><a href="#features">Features</a><a href="#faq">FAQ</a><a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} /></a><button onClick={() => setDownloadOpen(true)}>Download <Download size={13} /></button></div><span className="footer-legal">Open source under Apache 2.0 · {release.version}</span></footer>
        <DownloadModal isOpen={downloadOpen} onClose={() => setDownloadOpen(false)} release={release} />
      </div>
    )
  }

export default App
