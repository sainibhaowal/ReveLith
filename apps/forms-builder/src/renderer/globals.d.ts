import type { AppChatApi } from '@revelith/app-chat'

type ShellDocumentResult = { kind: string; filePath?: string; title: string; content?: unknown } | { error: string } | null

interface ElectronAPI {
  versions: NodeJS.ProcessVersions
  platform: NodeJS.Platform
  getDocument: () => Promise<ShellDocumentResult>
  newDocument: (title: string) => Promise<boolean>
  openDocument: () => Promise<ShellDocumentResult>
  saveDocument: (payload: unknown, title: string, saveAs?: boolean, prompt?: boolean) => Promise<{ canceled?: true; filePath?: string; title?: string; error?: string }>
  setDocumentState: (dirty: boolean, title: string) => Promise<void>
  setDocumentPath: (filePath: string, title: string) => Promise<boolean>
  getAiSettings: AppChatApi['getAiSettings']
  scanFile: (bytes: Uint8Array) => Promise<{ status: 'clean' | 'threat' | 'unavailable'; detail?: string }>
  aiStream: AppChatApi['aiStream']
  aiStreamCancel: AppChatApi['aiStreamCancel']
  onAiStream: AppChatApi['onAiStream']
  webSearch: AppChatApi['webSearch']
}

declare global {
  interface Window { electronAPI?: ElectronAPI }
  interface Window { revelithSaveDocument?: () => Promise<boolean> }
}
export {}
