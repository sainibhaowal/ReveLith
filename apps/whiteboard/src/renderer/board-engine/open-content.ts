// ReveLith Drawboard — parse shell/opened/imported content into a board scene.
import { restore } from '@excalidraw/excalidraw'
import type { ExcalidrawElement as BoardElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import { normalizeDrawboardDocument } from '../../shared/ipc'
import { normalizeBoardElementPoints } from './element-geometry'
import { migrateLegacyOpsToElements } from './persistence'
import { validateDrawboardRevisions, type DrawboardRevision } from './revisions'

export interface ParsedScene {
  elements: readonly BoardElement[]
  appState: Partial<AppState>
  files: BinaryFiles
  trackingEnabled: boolean
  revisions: DrawboardRevision[]
}

export function loadInitialSceneFromContent(content: unknown): ParsedScene {
  const normalized = normalizeDrawboardDocument(content)
  if (!normalized) {
    // Tolerate raw board JSON ({elements:[...]}) for compatibility.
    const raw = content as { elements?: unknown[]; appState?: Partial<AppState>; files?: BinaryFiles; trackingEnabled?: boolean; revisions?: unknown }
    if (raw && Array.isArray(raw.elements)) {
      const safeElements = normalizeBoardElementPoints(raw.elements)
      const restored = restore({ elements: safeElements }, raw.appState ?? null, null, { repairBindings: true, refreshDimensions: true })
      return { elements: normalizeBoardElementPoints(restored.elements ?? []), appState: restored.appState ?? {}, files: raw.files ?? {}, trackingEnabled: raw.trackingEnabled ?? false, revisions: validateDrawboardRevisions(raw.revisions) }
    }
    throw new Error('This file does not contain a drawing.')
  }
  if (normalized.version === 1) {
    return { elements: migrateLegacyOpsToElements(normalized.ops), appState: {}, files: {}, trackingEnabled: false, revisions: [] }
  }
  const safeElements = normalizeBoardElementPoints(normalized.elements)
  const restored = restore(
    { elements: safeElements, appState: normalized.appState as Partial<AppState> },
    null,
    null,
    { repairBindings: true, refreshDimensions: true },
  )
  return {
    elements: normalizeBoardElementPoints(restored.elements ?? []),
    appState: { ...(restored.appState ?? {}), ...(normalized.appState ?? {}) },
    files: ((normalized.files ?? {}) as BinaryFiles) ?? {},
    trackingEnabled: normalized.trackingEnabled ?? false,
    revisions: validateDrawboardRevisions(normalized.revisions),
  }
}
