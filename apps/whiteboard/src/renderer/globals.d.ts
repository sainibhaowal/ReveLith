import type { AppChatApi } from '@revelith/app-chat'

type ShellDocumentResult = { kind: string; filePath?: string; title: string; content?: unknown } | { error: string } | null

interface ElectronAPI {
  versions: NodeJS.ProcessVersions
  platform: NodeJS.Platform
  getDocument: () => Promise<ShellDocumentResult>
  newDocument: (title: string) => Promise<boolean>
  openDocument: () => Promise<ShellDocumentResult>
  saveDocument: (payload: unknown, title: string, saveAs?: boolean, prompt?: boolean) => Promise<{ canceled?: true; filePath?: string; title?: string; error?: string }>
  saveExportFile: (fileName: string, bytes: ArrayBuffer) => Promise<{ canceled?: true; filePath?: string; error?: string }>
  setDocumentState: (dirty: boolean, title: string) => Promise<void>
  getAutoSaveDefault?: () => Promise<{ on: boolean; updatedAt: number }>
  onAutoSaveDefaultChanged?: (handler: (value: { on: boolean; updatedAt: number }) => void) => () => void
  setDocumentPath: (filePath: string, title: string) => Promise<boolean>
  onMenuAction?: (handler: (action: string) => void) => () => void
  getTheme: () => Promise<'light' | 'dark' | 'system'>
  getLanguage?: () => Promise<string>
  onThemeChanged?: (handler: (theme: 'light' | 'dark' | 'system') => void) => () => void
  getAiPanelPrefs?: () => Promise<unknown>
  setAiPanelPrefs?: (patch: unknown) => Promise<unknown>
  onAiPanelPrefsChanged?: (handler: (prefs: unknown) => void) => () => void
  getAiSettings: AppChatApi['getAiSettings']
  aiStream: AppChatApi['aiStream']
  aiStreamCancel: AppChatApi['aiStreamCancel']
  onAiStream: AppChatApi['onAiStream']
  webSearch: AppChatApi['webSearch']
  imageSearch: NonNullable<AppChatApi['imageSearch']>
  fetchImage: (url: string) => Promise<{ base64: string; mime: string } | null>
  generateImage?: (op: { prompt: string; aspectRatio?: string }) => Promise<{ base64: string; mime: string } | { error: string }>
  getGskStatus?: (withEmail?: boolean) => Promise<{ loggedIn: boolean; email?: string }>
}

declare global {
  interface Window { electronAPI?: ElectronAPI }
  interface Window { revelithSaveDocument?: () => Promise<boolean> }
}
export {}
