import type { AppChatApi } from '@revelith/app-chat'

type ShellDocumentResult =
  | { kind: string; filePath?: string; title: string; content?: unknown }
  | { error: string }
  | null

/**
 * The host surface available to the renderer.
 *
 * Extends the shared `AppChatApi` so `@revelith/app-chat`'s `AppChatPanel` can
 * drive theme, AI settings and streaming without an app-private bridge, and adds
 * the document open/save calls the shell owns.
 */
interface ElectronAPI extends AppChatApi {
  versions: NodeJS.ProcessVersions
  platform: NodeJS.Platform
  getDocument: () => Promise<ShellDocumentResult>
  newDocument: (title: string) => Promise<boolean>
  openDocument: () => Promise<ShellDocumentResult>
  saveDocument: (
    payload: unknown,
    title: string,
    saveAs?: boolean,
    prompt?: boolean,
  ) => Promise<{ canceled?: true; filePath?: string; title?: string; error?: string }>
  setDocumentState: (dirty: boolean, title: string) => Promise<void>
  setDocumentPath: (filePath: string, title: string) => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
  interface Window {
    revelithSaveDocument?: () => Promise<boolean>
    revelithIsDocumentDirty?: () => boolean
    revelithDiscardDocument?: () => void
  }
}

export {}
