import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { Lang } from '@revelith/i18n'
import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@revelith/ai-provider'
import { HTML_CHANNELS, type HtmlDesktopApi, type SaveHtmlRequest, type ExportDocxRequest, type ExportPdfRequest, type UiTheme, type SaveMode } from '../shared/ipc'

const api: HtmlDesktopApi = {
  consumePendingOpen: () => ipcRenderer.invoke(HTML_CHANNELS.consumePending),
  readFile: (path: string) => ipcRenderer.invoke(HTML_CHANNELS.readFile, path),
  save: (req: SaveHtmlRequest) => ipcRenderer.invoke(HTML_CHANNELS.save, req),
  notifyDirty: (dirty: boolean) => ipcRenderer.send(HTML_CHANNELS.dirtyChanged, dirty),
  onSaveRequest: (handler: (mode: SaveMode) => void) => {
    const listener = (_e: IpcRendererEvent, mode: SaveMode) => handler(mode)
    ipcRenderer.on(HTML_CHANNELS.saveRequest, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.saveRequest, listener)
  },
  sendSaveRequestAck: (saved: boolean) => ipcRenderer.send(HTML_CHANNELS.saveRequestAck, saved),
  onCloseSaveRequest: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on(HTML_CHANNELS.closeSaveRequest, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.closeSaveRequest, listener)
  },
  sendCloseSaveResult: (saved: boolean) => ipcRenderer.send(HTML_CHANNELS.closeSaveResult, saved),
  onFileRenamed: (handler: (newPath: string) => void) => {
    const listener = (_e: IpcRendererEvent, newPath: string) => handler(newPath)
    ipcRenderer.on(HTML_CHANNELS.fileRenamed, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.fileRenamed, listener)
  },
  exportDocx: (req: ExportDocxRequest) => ipcRenderer.invoke(HTML_CHANNELS.exportDocx, req),
  exportPdf: (req: ExportPdfRequest) => ipcRenderer.invoke(HTML_CHANNELS.exportPdf, req),
  getLanguage: () => ipcRenderer.invoke(HTML_CHANNELS.getLanguage),
  onLanguageChanged: (handler: (lang: Lang) => void) => {
    const listener = (_e: IpcRendererEvent, lang: Lang) => handler(lang)
    ipcRenderer.on(HTML_CHANNELS.languageChanged, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.languageChanged, listener)
  },
  getTheme: () => ipcRenderer.invoke(HTML_CHANNELS.getTheme),
  onThemeChanged: (handler: (theme: UiTheme) => void) => {
    const listener = (_e: IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on(HTML_CHANNELS.themeChanged, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.themeChanged, listener)
  },
  // Shared AI
  getAiSettings: () => ipcRenderer.invoke('ai:get-settings'),
  setAiSettings: (settings: AiSettings) => ipcRenderer.invoke('ai:set-settings', settings),
  onAiSettingsChanged: (handler: (settings: AiSettings) => void) => {
    const listener = (_e: IpcRendererEvent, settings: AiSettings) => handler(settings)
    ipcRenderer.on('ai:settings-changed', listener)
    return () => ipcRenderer.removeListener('ai:settings-changed', listener)
  },
  aiStream: (request: AiStreamRequest) => ipcRenderer.invoke('ai:stream', request),
  onAiStream: (handler: (chunk: AiStreamChunk) => void) => {
    const listener = (_e: IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk)
    ipcRenderer.on('ai:stream-chunk', listener)
    return () => ipcRenderer.removeListener('ai:stream-chunk', listener)
  },
  aiStreamCancel: (requestId: string) => ipcRenderer.invoke('ai:stream-cancel', requestId),
  webSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('ai:web-search', query, maxResults),
}

contextBridge.exposeInMainWorld('htmlApi', api)
