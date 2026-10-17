import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installAppChatShellTheme } from '@revelith/app-chat'
import '@revelith/ui/tokens.css'
import '@revelith/ui/ai-panel-prefs.css'
import '@revelith/ui/ai-typing.css'
import '@revelith/ui/markdown.css'
import '@revelith/ui/app-ribbon.css'
import '@revelith/ui/screentip.css'
import './styles.css'
import { installScreenTips } from '@revelith/ui'

installAppChatShellTheme()
installScreenTips()

class DrawboardErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: Error | null; componentStack: string }
> {
  state = { error: null as Error | null, componentStack: '' }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[drawboard renderer crashed]', error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? '' })
  }

  render() {
    if (this.state.error) {
      const toolTrail = (window as Window & { __drawboardToolTrail?: unknown }).__drawboardToolTrail
      const recentTools = Array.isArray(toolTrail)
        ? toolTrail.filter((item): item is string => typeof item === 'string')
        : []
      return (
        <main
          style={{
            minHeight: '100vh',
            boxSizing: 'border-box',
            padding: 32,
            fontFamily: 'system-ui, sans-serif',
            color: 'var(--text-primary)',
            background: 'var(--surface-primary)',
          }}
        >
          <h1>Draw hit an error</h1>
          <p>Your board recovery copy is kept locally. Reload Draw to continue.</p>
          <pre
            style={{
              maxWidth: 900,
              maxHeight: '55vh',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              color: 'var(--text-secondary)',
            }}
          >
            {this.state.error.stack ?? this.state.error.message}
            {this.state.componentStack
              ? `\n\nReact component stack:${this.state.componentStack}`
              : ''}
            {recentTools.length ? `\n\nRecent AI tool calls:\n${recentTools.join('\n')}` : ''}
          </pre>
          <button onClick={() => window.location.reload()}>Reload Draw</button>
        </main>
      )
    }
    return this.props.children
  }
}

function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

async function bootstrap(): Promise<void> {
  let theme: 'light' | 'dark' | 'system' = 'system'
  let lang = 'en'
  try {
    const [t, l] = await Promise.all([
      window.electronAPI?.getTheme?.().catch(() => 'system' as const),
      (window.electronAPI as { getLanguage?: () => Promise<string> })
        ?.getLanguage?.()
        .catch(() => 'en'),
    ])
    if (t === 'light' || t === 'dark' || t === 'system') theme = t
    if (typeof l === 'string' && l) lang = l
  } catch {
    // browser / standalone without bridge — fall back to defaults
  }
  document.documentElement.lang = lang
  applyTheme(theme)
  try {
    window.electronAPI?.onThemeChanged?.(applyTheme)
  } catch {
    // ignore
  }
  document.documentElement.dataset.drawboardAppMounted = 'true'
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <DrawboardErrorBoundary>
        <App />
      </DrawboardErrorBoundary>
    </React.StrictMode>,
  )
}

void bootstrap()
