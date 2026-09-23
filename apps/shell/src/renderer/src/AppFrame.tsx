import { useEffect, useState } from 'react'
import { Home } from './Home'
import { Onboarding } from './Onboarding'
import { SettingsModal } from './SettingsModal'
import { TabBar } from './TabBar'

interface AppFrameProps {
  /** resolved before first paint (main.tsx) so home never flashes under the overlay */
  initialOnboardingSeen: boolean
}

const RENDERER_URLS: Record<string, string> = {
  docs: 'http://localhost:5173',
  sheets: 'http://localhost:5174',
  slides: 'http://localhost:5175',
  pdf: 'http://localhost:5176',
  markdown: 'http://localhost:5177',
}

export function AppFrame({ initialOnboardingSeen }: AppFrameProps) {
  const [homeActive, setHomeActive] = useState(true)
  const [activeTabKind, setActiveTabKind] = useState<string>('home')
  const [activeTabTitle, setActiveTabTitle] = useState<string>('Home')
  const [showOnboarding, setShowOnboarding] = useState(!initialOnboardingSeen)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [iframeLoading, setIframeLoading] = useState(true)

  useEffect(() => {
    const applyTabs = (tabs: Awaited<ReturnType<typeof window.aiOfficeTabs.list>>) => {
      const active = tabs.find((tab) => tab.active)
      const kind = active?.kind || 'home'
      setActiveTabKind(kind)
      setActiveTabTitle(active?.title || 'Editor')
      setHomeActive(!active || kind === 'home')
      setIframeLoading(true)
    }
    void window.aiOfficeTabs.list().then(applyTabs)
    return window.aiOfficeTabs.onChanged(applyTabs)
  }, [])

  // Native editor tabs are Electron WebContentsViews, which otherwise paint
  // above DOM content. The main process hides only the active one while the
  // shell Settings modal is open.
  useEffect(() => {
    void window.aiOffice?.setSettingsOverlay?.(showSettingsModal)
    return () => {
      if (showSettingsModal) void window.aiOffice?.setSettingsOverlay?.(false)
    }
  }, [showSettingsModal])

  useEffect(() => {
    const handleOpenSettings = () => setShowSettingsModal(true)
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-ai-settings') {
        setShowSettingsModal(true)
      }
    }
    window.addEventListener('open-ai-settings', handleOpenSettings)
    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('open-ai-settings', handleOpenSettings)
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  const finishOnboarding = () => {
    setShowOnboarding(false)
    void window.aiOffice?.setOnboardingSeen?.().catch(() => {})
  }

  const activeUrl = RENDERER_URLS[activeTabKind] || 'http://localhost:5173'

  const KIND_TITLES: Record<string, string> = {
    docs: 'AI Docs',
    sheets: 'AI Sheets',
    slides: 'AI Slides',
    pdf: 'AI PDF',
    markdown: 'AI Markdown',
  }

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'system'
  const iframeSrcWithTheme = `${activeUrl}${activeUrl.includes('?') ? '&' : '?'}mode=tab&theme=${currentTheme}`

  return (
    <div className="app-frame" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface, #141416)' }}>
      <TabBar />
      <div className="app-frame-content" style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--surface, #141416)' }}>
        <div style={{ width: '100%', height: '100%', display: homeActive ? 'block' : 'none' }}>
          <Home />
        </div>
        {!homeActive && (
          <>
            {iframeLoading && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--surface, #141416)',
                  color: 'var(--text-primary, #ffffff)',
                  animation: 'tabAppear 0.2s ease forwards',
                }}
              >
                <div style={{ position: 'relative', width: '56px', height: '56px', marginBottom: '20px' }}>
                  <svg width="56" height="56" viewBox="0 0 32 32" fill="none" style={{ animation: 'spin 3s linear infinite' }}>
                    <circle cx="16" cy="16" r="2.2" fill="#38bdf8" />
                    <ellipse cx="16" cy="16" rx="13" ry="5.5" stroke="#38bdf8" strokeWidth="2" />
                    <circle cx="28" cy="16" r="2" fill="#67e8f9" />
                    <ellipse cx="16" cy="16" rx="13" ry="5.5" stroke="#60a5fa" strokeWidth="2" transform="rotate(60 16 16)" />
                    <circle cx="10" cy="5.6" r="2" fill="#93c5fd" />
                    <ellipse cx="16" cy="16" rx="13" ry="5.5" stroke="#818cf8" strokeWidth="2" transform="rotate(120 16 16)" />
                    <circle cx="10" cy="26.4" r="2" fill="#c7d2fe" />
                  </svg>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em', marginBottom: '12px' }}>
                  Opening {KIND_TITLES[activeTabKind] || 'Document'}…
                </div>
                <div
                  style={{
                    width: '140px',
                    height: '3px',
                    borderRadius: '3px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '50%',
                      background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
                      borderRadius: '3px',
                      animation: 'loadingProgress 1s ease-in-out infinite',
                    }}
                  />
                </div>
              </div>
            )}
            <iframe
              id="subapp-frame"
              src={iframeSrcWithTheme}
              title={activeTabTitle}
              onLoad={(e) => {
                setIframeLoading(false)
                try {
                  const targetTheme = document.documentElement.getAttribute('data-theme') || 'system'
                  const frame = e.currentTarget
                  frame.contentWindow?.postMessage({ type: 'theme-change', theme: targetTheme }, '*')
                } catch {}
              }}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                background: 'var(--surface, #141416)',
                opacity: iframeLoading ? 0 : 1,
                transition: 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          </>
        )}
      </div>
      {showOnboarding && homeActive && <Onboarding onDone={finishOnboarding} />}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  )
}
