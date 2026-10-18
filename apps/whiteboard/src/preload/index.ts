import { contextBridge, ipcRenderer, webUtils } from 'electron'

// ReveLith Drawboard preload. Keeps the existing `window.electronAPI`
// contract (used by the Shell WebContentsView) and adds a typed
// `window.drawboardApi` for drawboard-specific helpers. No direct
// ipcRenderer use from renderer code.
contextBridge.exposeInMainWorld('electronAPI', {
  versions: process.versions,
  platform: process.platform,
  getAiSettings: () => ipcRenderer.invoke('ai:get-settings'),
  setAiSettings: (settings: unknown) => ipcRenderer.invoke('ai:set-settings', settings),
  testAiMediaSettings: (input: unknown) => ipcRenderer.invoke('ai:media-test', input),
  getTheme: () => ipcRenderer.invoke('app:get-theme'),
  // Chat attachments read/parsed in the main process by the shared ReveLith
  // file bridges (registered once by the shell); the renderer never sees bytes
  // or the filesystem directly.
  pickAttachments: () => ipcRenderer.invoke('files:pick'),
  addAttachmentPaths: (paths: string[]) => ipcRenderer.invoke('files:add', paths),
  readAttachment: (path: string, offset: number, maxChars: number) =>
    ipcRenderer.invoke('files:read', path, offset, maxChars),
  readAttachmentImage: (path: string) => ipcRenderer.invoke('files:read-image', path),
  analyzeMedia: (op: { mediaUrls: string[]; requirements: string }) =>
    ipcRenderer.invoke('docs:analyze-media', op),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getLanguage: () => ipcRenderer.invoke('app:get-language'),
  getAutoSaveDefault: () => ipcRenderer.invoke('app:get-auto-save-default'),
  onAutoSaveDefaultChanged: (handler: (value: { on: boolean; updatedAt: number }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: { on: boolean; updatedAt: number },
    ) => handler(value)
    ipcRenderer.on('app:auto-save-default-changed', listener)
    return () => ipcRenderer.removeListener('app:auto-save-default-changed', listener)
  },
  onThemeChanged: (handler: (theme: 'light' | 'dark' | 'system') => void) => {
    const listener = (_event: Electron.IpcRendererEvent, theme: 'light' | 'dark' | 'system') =>
      handler(theme)
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
  getAiPanelPrefs: () => ipcRenderer.invoke('app:get-ai-panel-prefs'),
  setAiPanelPrefs: (patch: unknown) => ipcRenderer.invoke('app:set-ai-panel-prefs', patch),
  onAiPanelPrefsChanged: (handler: (prefs: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, prefs: unknown) => handler(prefs)
    ipcRenderer.on('app:ai-panel-prefs-changed', listener)
    return () => ipcRenderer.removeListener('app:ai-panel-prefs-changed', listener)
  },
  aiStream: (request: unknown) => ipcRenderer.invoke('ai:stream', request),
  aiStreamCancel: (requestId: string) => ipcRenderer.invoke('ai:stream-cancel', requestId),
  onAiStream: (handler: (chunk: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, chunk: unknown) => handler(chunk)
    ipcRenderer.on('ai:stream-chunk', listener)
    return () => ipcRenderer.removeListener('ai:stream-chunk', listener)
  },
  webSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('ai:web-search', query, maxResults),
  imageSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('ai:image-search', query, maxResults),
  fetchImage: (url: string) => ipcRenderer.invoke('ai:fetch-image', url),
  // Image generation goes through the app-wide AI handler registry (the shell
  // registers drawboard:ai-generate-image); it answers with raw bytes exactly
  // like fetchImage, so the board places the result through the same path.
  generateImage: (op: { prompt: string; aspectRatio?: string }) =>
    ipcRenderer.invoke('drawboard:ai-generate-image', op),
  getDocument: () => ipcRenderer.invoke('new-app:get-document'),
  newDocument: (title: string) => ipcRenderer.invoke('new-app:new-document', title),
  openDocument: () => ipcRenderer.invoke('new-app:open-document'),
  saveDocument: (payload: unknown, title: string, saveAs = false, prompt = true) =>
    ipcRenderer.invoke('new-app:save-document', payload, title, saveAs, prompt),
  saveExportFile: (fileName: string, bytes: ArrayBuffer) =>
    ipcRenderer.invoke('drawboard:save-export-file', fileName, bytes),
  setDocumentState: (dirty: boolean, title: string) =>
    ipcRenderer.invoke('new-app:set-document-state', dirty, title),
  setDocumentPath: (filePath: string, title: string) =>
    ipcRenderer.invoke('new-app:set-document-path', filePath, title),
  onMenuAction: (handler: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => handler(action)
    ipcRenderer.on('drawboard:menu-action', listener)
    return () => ipcRenderer.removeListener('drawboard:menu-action', listener)
  },
})

contextBridge.exposeInMainWorld('drawboardApi', {
  platform: process.platform,
  getTheme: () => ipcRenderer.invoke('app:get-theme').catch(() => 'system'),
  getLanguage: () => ipcRenderer.invoke('app:get-language').catch(() => 'en'),
  onThemeChanged: (handler: (theme: 'light' | 'dark' | 'system') => void) => {
    const listener = (_event: Electron.IpcRendererEvent, theme: 'light' | 'dark' | 'system') =>
      handler(theme)
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
})
