import { installAppChatShellTheme } from '@revelith/app-chat'
import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'

// Side-effect stylesheets the ReveLith shell expects every app entry to import.
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
