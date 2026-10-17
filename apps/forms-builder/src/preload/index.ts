import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  versions: process.versions,
  platform: process.platform,
  getAiSettings: () => ipcRenderer.invoke('ai:get-settings'),
  scanFile: (bytes: Uint8Array) => ipcRenderer.invoke('forms:scan-file', bytes),
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
  getDocument: () => ipcRenderer.invoke('new-app:get-document'),
  newDocument: (title: string) => ipcRenderer.invoke('new-app:new-document', title),
  openDocument: () => ipcRenderer.invoke('new-app:open-document'),
  saveDocument: (payload: unknown, title: string, saveAs = false, prompt = true) =>
    ipcRenderer.invoke('new-app:save-document', payload, title, saveAs, prompt),
  setDocumentState: (dirty: boolean, title: string) =>
    ipcRenderer.invoke('new-app:set-document-state', dirty, title),
  setDocumentPath: (filePath: string, title: string) =>
    ipcRenderer.invoke('new-app:set-document-path', filePath, title),
})
