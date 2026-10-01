import React from 'react'
import { createRoot } from 'react-dom/client'
import { htmlLang } from '@revelith/i18n'
import { AppFrame } from './AppFrame'
import { LocaleProvider } from './locale'
import '@revelith/ui/tokens.css'
import '@revelith/ui/screentip.css'
import '@revelith/ui/dropdown.css'
import './home.css'
import './tabbar.css'
import { installScreenTips } from '@revelith/ui'

installScreenTips()

// macOS shell window is created with vibrancy; a transparent body lets the
// editor views' translucent regions (e.g. slides thumbnail pane) show it
const IS_MAC = navigator.platform.toLowerCase().includes('mac')
if (IS_MAC) document.body.classList.add('vib')
// non-mac: the tab strip doubles as the title bar (caption buttons overlay it)
document.body.classList.add(IS_MAC ? 'mac' : 'overlay-title-bar')

// resolve the persisted language, first-run flag, and theme before first paint
// so the UI never flashes (home showing briefly before the onboarding overlay)
const getInitState = async () => {
  const lang = (await window.aiOffice?.getLanguage?.().catch(() => 'en' as const)) ?? 'en'
  const onboardingSeen =
    (await window.aiOffice?.onboardingSeen?.().catch(() => true)) ?? true
  const theme =
    (await window.aiOffice?.getTheme?.().catch(() => 'system' as const)) ?? 'system'
  return { lang, onboardingSeen, theme }
}

getInitState()
  .then(({ lang, onboardingSeen, theme }) => {
    document.documentElement.lang = htmlLang(lang)
    // apply theme attribute before first paint to avoid flash
    if (theme !== 'system') {
      document.documentElement.setAttribute('data-theme', theme)
    }
    window.aiOffice?.onThemeChanged?.((next) => {
      if (next === 'system') document.documentElement.removeAttribute('data-theme')
      else document.documentElement.setAttribute('data-theme', next)
    })
    createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <LocaleProvider initial={lang}>
          <AppFrame initialOnboardingSeen={Boolean(onboardingSeen)} />
        </LocaleProvider>
      </React.StrictMode>,
    )
  })
  .catch((err) => {
    console.error('[ReveLith] Failed to initialize AppFrame:', err)
    createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <LocaleProvider initial="en">
          <AppFrame initialOnboardingSeen={true} />
        </LocaleProvider>
      </React.StrictMode>,
    )
  })
