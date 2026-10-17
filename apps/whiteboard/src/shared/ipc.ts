// ReveLith Drawboard — shared IPC + document schema.
// Scope: apps/drawboard only. Shell channels (new-app:*, app:*, ai:*) are reused unchanged.

export const DRAWBOARD_CHANNELS = {
  getDocument: 'new-app:get-document',
  newDocument: 'new-app:new-document',
  openDocument: 'new-app:open-document',
  saveDocument: 'new-app:save-document',
  saveExportFile: 'drawboard:save-export-file',
  setDocumentState: 'new-app:set-document-state',
  setDocumentPath: 'new-app:set-document-path',
  getTheme: 'app:get-theme',
  themeChanged: 'app:theme-changed',
  getLanguage: 'app:get-language',
  getAiPanelPrefs: 'app:get-ai-panel-prefs',
  setAiPanelPrefs: 'app:set-ai-panel-prefs',
} as const

export type UiTheme = 'light' | 'dark' | 'system'

/** Legacy v1 payload produced by the original ReveLith canvas. Kept for migration. */
export interface DrawboardDocumentV1 {
  version: 1
  ops: unknown[]
}

/** Current v2 payload backed by the ReveLith board scene. Files are BinaryFiles-compatible. */
export interface DrawboardDocumentV2 {
  version: 2
  elements: unknown[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
  trackingEnabled?: boolean
  revisions?: unknown[]
}

export type DrawboardDocument = DrawboardDocumentV1 | DrawboardDocumentV2

export function isDrawboardDocument(value: unknown): value is DrawboardDocument {
  if (!value || typeof value !== 'object') return false
  const v = value as { version?: unknown; ops?: unknown; elements?: unknown }
  if (v.version === 1) return Array.isArray(v.ops)
  if (v.version === 2) return Array.isArray(v.elements)
  // Tolerate shell payloads without version but with recognizable body.
  if (Array.isArray(v.ops)) return true
  if (Array.isArray(v.elements)) return true
  return false
}

export function normalizeDrawboardDocument(value: unknown): DrawboardDocument | null {
  if (!isDrawboardDocument(value)) return null
  const v = value as unknown as Record<string, unknown>
  if (Array.isArray(v.ops) && v.version !== 2) return { version: 1, ops: v.ops as unknown[] }
  return {
    version: 2,
    elements: (v.elements ?? []) as unknown[],
    appState: (v.appState as Record<string, unknown>) ?? {},
    files: (v.files as Record<string, unknown>) ?? {},
    ...(typeof v.trackingEnabled === 'boolean' ? { trackingEnabled: v.trackingEnabled } : {}),
    ...(Array.isArray(v.revisions) ? { revisions: v.revisions } : {}),
  }
}
