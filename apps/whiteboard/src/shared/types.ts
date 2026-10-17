// ReveLith Drawboard — shared renderer/main types (no runtime deps).
// Board element types are imported with `import type` only so the
// Electron main process never bundles browser code.

import type { ExcalidrawElement as BoardElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import type { DrawboardDocument, DrawboardDocumentV2 } from './ipc'

export type { DrawboardDocument, DrawboardDocumentV2 }
export type { BoardElement }

export interface BoardScene {
  elements: readonly BoardElement[]
  appState?: Partial<AppState>
  files?: BinaryFiles
}

export const DRAWBOARD_STORAGE_KEYS = {
  scene: (session: string) => `revelith-drawboard/scene-v2/${session}`,
  legacyOps: (session: string) => `revelith-drawboard/ops-v1/${session}`,
  chatOpen: 'revelith-drawboard/chat-open',
  theme: 'revelith-drawboard/theme',
} as const

/** Read older local data once, then keep writing only under Drawboard keys. */
export function readMigratedStorageValue(key: string, previousKey: string): string | null {
  try {
    const current = localStorage.getItem(key)
    if (current !== null) return current
    const previous = localStorage.getItem(previousKey)
    if (previous !== null) {
      try {
        localStorage.setItem(key, previous)
      } catch {
        // The old value is still returned if storage is temporarily read-only.
      }
    }
    return previous
  } catch {
    return null
  }
}

export function migrateStorageKey(key: string, previousKey: string): string {
  readMigratedStorageValue(key, previousKey)
  return key
}

export function sessionIdFromLocation(search = window.location.search): string {
  try {
    return new URLSearchParams(search).get('session') ?? 'browser'
  } catch {
    return 'browser'
  }
}

export function isNonEmptyScene(doc: DrawboardDocument | null): doc is DrawboardDocumentV2 {
  return !!doc && doc.version === 2 && Array.isArray(doc.elements) && doc.elements.length > 0
}
