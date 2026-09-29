import { createRoot } from 'react-dom/client'
import { htmlLang, type Lang } from '@revelith/i18n'
import App from './App'
import { LocaleProvider } from './i18n/locale'
import type { UiTheme } from '../shared/ipc'
import '@revelith/ui/tokens.css'
import '@revelith/ui/screentip.css'
import '@revelith/ui/color-picker.css'
import '@revelith/ui/dropdown.css'
import '@revelith/ui/ribbon-collapse.css'
import '@revelith/ui/markdown.css'
import '@revelith/ui/ai-panel-prefs.css'
import '@revelith/ui/ai-scope-quote.css'
import './styles.css'
import { applyAiPanelPrefs, installScreenTips } from '@revelith/ui'

installScreenTips()

function applyTheme(theme: UiTheme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

void (async () => {
  const [lang, theme] = await Promise.all([
    window.pdfApi.getLanguage().catch(() => 'zh' as const),
    window.pdfApi.getTheme().catch(() => 'system' as const),
  ])
  document.documentElement.lang = htmlLang(lang as Lang)
  applyTheme(theme)
  window.pdfApi.onThemeChanged(applyTheme)
  void window.pdfApi
    ?.getAiPanelPrefs?.()
    .then(applyAiPanelPrefs)
    .catch(() => {})
  window.pdfApi?.onAiPanelPrefsChanged?.(applyAiPanelPrefs)
  createRoot(document.getElementById('root')!).render(
    <LocaleProvider initial={lang}>
      <App />
    </LocaleProvider>,
  )
})()
