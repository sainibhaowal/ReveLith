import type { Lang } from '@revelith/i18n'
import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@revelith/ai-provider'

export const HTML_CHANNELS = {
  consumePending: 'html:consume-pending',
  readFile: 'html:read-file',
  save: 'html:save',
  saveRequest: 'html:save-request',
  saveRequestAck: 'html:save-request-ack',
  dirtyChanged: 'html:dirty-changed',
  closeSaveRequest: 'html:close-save-request',
  closeSaveResult: 'html:close-save-result',
  fileRenamed: 'html:file-renamed',
  exportDocx: 'html:export-docx',
  exportPdf: 'html:export-pdf',
  getLanguage: 'app:get-language',
  languageChanged: 'app:language-changed',
  getTheme: 'app:get-theme',
  themeChanged: 'app:theme-changed',
} as const

export type UiTheme = 'light' | 'dark' | 'system'
export type SaveMode = 'save' | 'saveAs'

export interface SaveHtmlRequest {
  html: string
  mode: SaveMode
  suggestedName?: string
}

export type SaveHtmlResult =
  | { ok: true; path: string }
  | { ok: true; canceled: true }
  | { ok: false; error: string }

export interface ExportDocxRequest {
  base64: string
  suggestedName: string
}

export interface ExportPdfRequest {
  html: string
  suggestedName: string
}

export interface ExportResult {
  ok: boolean
  path?: string
  canceled?: boolean
  error?: string
}

export interface HtmlDesktopApi {
  consumePendingOpen(): Promise<{ path: string | null; initialHtml?: string }>
  readFile(path: string): Promise<string>
  save(req: SaveHtmlRequest): Promise<SaveHtmlResult>
  notifyDirty(dirty: boolean): void
  onSaveRequest(handler: (mode: SaveMode) => void): () => void
  sendSaveRequestAck(saved: boolean): void
  onCloseSaveRequest(handler: () => void): () => void
  sendCloseSaveResult(saved: boolean): void
  onFileRenamed(handler: (newPath: string) => void): () => void
  exportDocx(req: ExportDocxRequest): Promise<ExportResult>
  exportPdf(req: ExportPdfRequest): Promise<ExportResult>
  getLanguage(): Promise<Lang>
  onLanguageChanged(handler: (lang: Lang) => void): () => void
  getTheme(): Promise<UiTheme>
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  // Shared AI
  getAiSettings(): Promise<AiSettings>
  setAiSettings(settings: AiSettings): Promise<void>
  onAiSettingsChanged(handler: (settings: AiSettings) => void): () => void
  aiStream(request: AiStreamRequest): Promise<void>
  onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
  aiStreamCancel(requestId: string): Promise<void>
  webSearch?(query: string, maxResults?: number): Promise<{ results: Array<{ title: string; url: string; snippet: string }> }>
}

declare global {
  interface Window {
    htmlApi: HtmlDesktopApi
  }
}
