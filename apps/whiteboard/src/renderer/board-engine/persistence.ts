// ReveLith Drawboard — legacy Op[] -> board element migration + scene persistence.
// Only new v2 board scenes are written; v1 is read-only for migration.
import { restore } from '@excalidraw/excalidraw'
import type { ExcalidrawElement as BoardElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import { normalizeDrawboardDocument } from '../../shared/ipc'
import {
  DRAWBOARD_STORAGE_KEYS,
  readMigratedStorageValue,
  sessionIdFromLocation,
} from '../../shared/types'
import { normalizeBoardElementPoints } from './element-geometry'
import { validateDrawboardRevisions, type DrawboardRevision } from './revisions'

export interface LoadedScene {
  elements: readonly BoardElement[]
  appState: Partial<AppState>
  files: BinaryFiles
  title: string
  filePath: string | null
  migratedFromLegacy: boolean
  trackingEnabled: boolean
  revisions: DrawboardRevision[]
}

type LegacyOp = {
  kind?: string
  tool?: string
  shape?: string
  color?: string
  width?: number
  points?: [number, number][]
  from?: [number, number]
  to?: [number, number]
  at?: [number, number]
  text?: string
  size?: number
}

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`

function baseElement(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: uid(),
    seed: Math.floor(Math.random() * 2 ** 31),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    angle: 0,
    ...partial,
  }
}

export function migrateLegacyOpsToElements(ops: unknown[]): BoardElement[] {
  const out: Record<string, unknown>[] = []
  let cursorY = 40
  for (const raw of ops) {
    const op = raw as LegacyOp
    if (!op || typeof op !== 'object') continue
    if (op.kind === 'stroke' && Array.isArray(op.points) && op.points.length > 0) {
      if (op.tool === 'eraser') continue // no eraser mapping — skip (non-destructive: original ops kept in backup key)
      const pts = op.points as [number, number][]
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      out.push(
        baseElement({
          type: 'freedraw',
          x: minX,
          y: minY,
          width: Math.max(1, Math.max(...xs) - minX),
          height: Math.max(1, Math.max(...ys) - minY),
          strokeColor: typeof op.color === 'string' ? op.color : '#1e1b4b',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: typeof op.width === 'number' ? Math.max(1, Math.round(op.width / 2)) : 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          points: pts.map(([x, y]) => [x - minX, y - minY]),
          pressures: [],
          simulatePressure: true,
          lastCommittedPoint: null,
        }),
      )
    } else if (op.kind === 'shape' && Array.isArray(op.from) && Array.isArray(op.to)) {
      const [x1, y1] = op.from as [number, number]
      const [x2, y2] = op.to as [number, number]
      const type = op.shape === 'line' ? 'line' : op.shape === 'ellipse' ? 'ellipse' : 'rectangle'
      out.push(
        baseElement({
          type,
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.max(1, Math.abs(x2 - x1)) || 100,
          height:
            type === 'line' ? Math.max(1, Math.abs(y2 - y1)) : Math.max(1, Math.abs(y2 - y1)) || 60,
          strokeColor: typeof op.color === 'string' ? op.color : '#1e1b4b',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: typeof op.width === 'number' ? Math.max(1, Math.round(op.width / 2)) : 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          points:
            type === 'line'
              ? [
                  [x1 - Math.min(x1, x2), y1 - Math.min(y1, y2)],
                  [x2 - Math.min(x1, x2), y2 - Math.min(y1, y2)],
                ]
              : undefined,
          lastCommittedPoint: null,
        }),
      )
    } else if (op.kind === 'text' && typeof op.text === 'string') {
      const [x, y] = (Array.isArray(op.at) ? op.at : [80, cursorY]) as [number, number]
      out.push(
        baseElement({
          type: 'text',
          x,
          y,
          width: 200,
          height: 30,
          fontSize: typeof op.size === 'number' ? op.size : 20,
          fontFamily: 2,
          text: op.text,
          textAlign: 'left',
          verticalAlign: 'top',
          autoResize: true,
          strokeColor: typeof op.color === 'string' ? op.color : '#1e1b4b',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          baseline: 24,
          lineHeight: 1.25,
        }),
      )
      cursorY += 48
    } else if (op.kind === 'note' && typeof op.text === 'string') {
      const [x, y] = (Array.isArray(op.at) ? op.at : [100, cursorY]) as [number, number]
      const noteId = uid()
      out.push(
        baseElement({
          id: noteId,
          type: 'rectangle',
          x,
          y,
          width: 200,
          height: 140,
          strokeColor: '#422006',
          backgroundColor: typeof op.color === 'string' ? op.color : '#fef08a',
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
        }),
      )
      out.push(
        baseElement({
          type: 'text',
          x: x + 12,
          y: y + 16,
          width: 176,
          height: 108,
          fontSize: 16,
          fontFamily: 2,
          text: op.text,
          textAlign: 'left',
          verticalAlign: 'top',
          autoResize: false,
          containerId: noteId,
          originalText: op.text,
          strokeColor: '#422006',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 1,
          opacity: 100,
          baseline: 20,
          lineHeight: 1.25,
        }),
      )
      cursorY += 170
    }
  }
  try {
    const restored = restore({ elements: out as unknown as BoardElement[] }, null, null, {
      repairBindings: true,
      refreshDimensions: true,
    })
    return [...(restored.elements ?? [])]
  } catch {
    return out as unknown as BoardElement[]
  }
}

export function serializeScene(
  elements: readonly BoardElement[],
  appState: Partial<AppState> | undefined,
  files: BinaryFiles | undefined,
  trackingEnabled = false,
  revisions: readonly DrawboardRevision[] = [],
): {
  version: 2
  elements: unknown[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
  trackingEnabled: boolean
  revisions: DrawboardRevision[]
} {
  return {
    version: 2,
    elements: JSON.parse(JSON.stringify(normalizeBoardElementPoints(elements ?? []))) as unknown[],
    appState: {
      viewBackgroundColor:
        (appState as { viewBackgroundColor?: string } | undefined)?.viewBackgroundColor ??
        '#ffffff',
      gridModeEnabled: !!(appState as { gridModeEnabled?: boolean } | undefined)?.gridModeEnabled,
    },
    files: (files ?? {}) as unknown as Record<string, unknown>,
    trackingEnabled,
    revisions: JSON.parse(JSON.stringify(revisions)) as DrawboardRevision[],
  }
}

function readLocal(key: string, previousKey?: string): unknown {
  try {
    const raw = previousKey ? readMigratedStorageValue(key, previousKey) : localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function loadInitialScene(
  options: { recoverLocal?: boolean } = {},
): Promise<LoadedScene> {
  const session = sessionIdFromLocation()
  let title = 'Untitled Drawing'
  let filePath: string | null = null
  let migratedFromLegacy = false

  // 1. Shell document (source of truth when hosted in Shell).
  try {
    const doc = await window.electronAPI?.getDocument()
    if (doc && !('error' in doc) && doc.content) {
      const normalized = normalizeDrawboardDocument(doc.content)
      if (normalized) {
        if (doc.title) title = doc.title
        if (doc.filePath) filePath = doc.filePath
        if (normalized.version === 2) {
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
            title,
            filePath,
            migratedFromLegacy: false,
            trackingEnabled: normalized.trackingEnabled ?? false,
            revisions: validateDrawboardRevisions(normalized.revisions),
          }
        }
        // v1 shell payload -> migrate
        const elements = migrateLegacyOpsToElements(normalized.ops)
        migratedFromLegacy = true
        return {
          elements,
          appState: {},
          files: {},
          title,
          filePath,
          migratedFromLegacy,
          trackingEnabled: false,
          revisions: [],
        }
      }
    }
  } catch {
    // fall through to local caches
  }

  // 2. Local v2 cache.
  const cachedV2 =
    options.recoverLocal === false
      ? null
      : (readLocal(
          DRAWBOARD_STORAGE_KEYS.scene(session),
          `revelith-whiteboard/scene-v2/${session}`,
        ) as { elements?: unknown[]; trackingEnabled?: boolean; revisions?: unknown[] } | null)
  if (cachedV2 && Array.isArray(cachedV2.elements)) {
    try {
      const safeElements = normalizeBoardElementPoints(cachedV2.elements)
      const restored = restore({ elements: safeElements }, null, null, {
        repairBindings: true,
        refreshDimensions: true,
      })
      return {
        elements: normalizeBoardElementPoints(restored.elements ?? []),
        appState: {},
        files: {},
        title,
        filePath,
        migratedFromLegacy: false,
        trackingEnabled: cachedV2.trackingEnabled ?? false,
        revisions: validateDrawboardRevisions(cachedV2.revisions),
      }
    } catch {
      // fall through
    }
  }

  // 3. Legacy ops cache -> migrate (kept, not deleted).
  const legacy =
    options.recoverLocal === false
      ? null
      : (readLocal(
          DRAWBOARD_STORAGE_KEYS.legacyOps(session),
          `revelith-whiteboard/ops-v1/${session}`,
        ) as unknown[] | null)
  if (Array.isArray(legacy) && legacy.length > 0) {
    migratedFromLegacy = true
    return {
      elements: migrateLegacyOpsToElements(legacy),
      appState: {},
      files: {},
      title,
      filePath,
      migratedFromLegacy,
      trackingEnabled: false,
      revisions: [],
    }
  }

  return {
    elements: [],
    appState: {},
    files: {},
    title,
    filePath,
    migratedFromLegacy,
    trackingEnabled: false,
    revisions: [],
  }
}

export function persistSceneLocal(
  elements: readonly BoardElement[],
  session = sessionIdFromLocation(),
  trackingEnabled = false,
  revisions: readonly DrawboardRevision[] = [],
): void {
  try {
    localStorage.setItem(
      DRAWBOARD_STORAGE_KEYS.scene(session),
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        elements: normalizeBoardElementPoints(elements),
        trackingEnabled,
        revisions,
      }),
    )
  } catch {
    // quota — shell save remains source of truth
  }
}

/** Luminance check for #rgb / #rrggbb paper colors. */
export function isDarkPaper(color: unknown): boolean {
  if (typeof color !== 'string') return false
  let hex = color.trim().toLowerCase()
  if (hex === 'transparent' || hex === '') return false
  if (hex.startsWith('#')) hex = hex.slice(1)
  if (/^[0-9a-f]{3}$/.test(hex))
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  if (!/^[0-9a-f]{6}$/.test(hex)) return false
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.35
}

/**
 * Keep the paper readable in every theme. The board renders dark mode through
 * the engine, so the paper itself must stay light: a dark paper turns the
 * canvas black-on-black (invisible strokes) in light mode. Returns true when
 * it corrected the paper.
 */
export function normalizePaperForTheme(
  api: { getAppState: () => unknown; updateScene: (scene: unknown) => void },
  _theme: 'light' | 'dark',
): boolean {
  try {
    const bg = (api.getAppState() as { viewBackgroundColor?: unknown } | undefined)
      ?.viewBackgroundColor
    if (isDarkPaper(bg)) {
      api.updateScene({ appState: { viewBackgroundColor: '#ffffff' } })
      return true
    }
  } catch {
    // never break the board over a cosmetic fix
  }
  return false
}
