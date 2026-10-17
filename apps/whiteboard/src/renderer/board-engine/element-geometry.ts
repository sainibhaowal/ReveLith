import type { ExcalidrawElement as BoardElement } from '@excalidraw/excalidraw/element/types'

type PointTuple = [number, number]
type ElementRecord = Record<string, unknown>

const LINEAR_ELEMENT_TYPES = new Set(['line', 'draw', 'arrow', 'freedraw'])
const SUPPORTED_ELEMENT_TYPES = new Set([
  'rectangle',
  'ellipse',
  'diamond',
  'line',
  'draw',
  'arrow',
  'freedraw',
  'text',
  'image',
  'iframe',
  'embeddable',
  'frame',
  'magicframe',
])

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizedId(value: unknown, index: number, usedIds: Set<string>): string {
  const source = typeof value === 'string' && value.trim() ? value.trim() : `recovered-${index + 1}`
  let id = source
  let suffix = 2
  while (usedIds.has(id)) id = `${source}-${suffix++}`
  usedIds.add(id)
  return id
}

function normalizedBindings(value: unknown): Array<{ id: string; type: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((binding) => {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) return []
    const record = binding as ElementRecord
    if (
      typeof record.id !== 'string' ||
      !record.id.trim() ||
      typeof record.type !== 'string' ||
      !record.type.trim()
    )
      return []
    return [{ id: record.id, type: record.type }]
  })
}

function pointTuple(value: unknown): PointTuple | null {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    return [Number(value[0]), Number(value[1])]
  }
  if (value && typeof value === 'object') {
    const point = value as { x?: unknown; y?: unknown }
    if (Number.isFinite(point.x) && Number.isFinite(point.y))
      return [Number(point.x), Number(point.y)]
  }
  return null
}

/**
 * Excalidraw linear elements require local coordinate tuples: `[[x, y], ...]`.
 * Older Draw builds emitted `{x, y}` objects, which crash the canvas while it
 * calculates element bounds. Normalize old documents and imports before the
 * scene reaches the renderer; malformed strokes become a safe diagonal using
 * their saved dimensions so the rest of the board remains recoverable.
 */
export function normalizeBoardElementPoints(elements: readonly unknown[]): BoardElement[] {
  const usedIds = new Set<string>()
  const normalized = elements.flatMap((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    // AI/tool-created elements are plain objects rather than Excalidraw's
    // `newElement` instances.  Excalidraw normally supplies these fields, but
    // it assumes `groupIds` is always an array when selection/group state is
    // recomputed.  Missing it is harmless until a later move or selection, at
    // which point the renderer crashes with `groupIds.find`.
    const element: ElementRecord = { ...(value as ElementRecord) }
    const rawType = typeof element.type === 'string' ? element.type : ''
    if (!SUPPORTED_ELEMENT_TYPES.has(rawType)) return []
    const type = rawType === 'draw' ? 'line' : rawType
    element.type = type

    element.id = normalizedId(element.id, index, usedIds)
    element.groupIds = Array.isArray(element.groupIds)
      ? Array.from(
          new Set(
            element.groupIds.filter(
              (groupId): groupId is string => typeof groupId === 'string' && groupId.trim() !== '',
            ),
          ),
        )
      : []
    element.boundElements = normalizedBindings(element.boundElements)
    element.isDeleted = element.isDeleted === true
    element.locked = element.locked === true
    element.angle = finiteNumber(element.angle, 0)
    element.x = finiteNumber(element.x, 0)
    element.y = finiteNumber(element.y, 0)
    element.width = Math.max(0, finiteNumber(element.width, 1))
    element.height = Math.max(0, finiteNumber(element.height, 1))
    element.version = Math.max(1, Math.floor(finiteNumber(element.version, 1)))
    element.versionNonce = Math.max(0, Math.floor(finiteNumber(element.versionNonce, 0)))
    element.seed = Math.max(0, Math.floor(finiteNumber(element.seed, 1)))
    element.updated = Math.max(0, finiteNumber(element.updated, 0))
    element.index = element.index ?? null
    element.frameId =
      typeof element.frameId === 'string' && element.frameId.trim() ? element.frameId : null
    element.roundness = element.roundness ?? null
    element.isDeleted = element.isDeleted === true
    element.link = typeof element.link === 'string' ? element.link : null
    element.strokeColor = typeof element.strokeColor === 'string' ? element.strokeColor : '#1e1b4b'
    element.backgroundColor =
      typeof element.backgroundColor === 'string' ? element.backgroundColor : 'transparent'
    element.fillStyle = typeof element.fillStyle === 'string' ? element.fillStyle : 'solid'
    element.strokeStyle = typeof element.strokeStyle === 'string' ? element.strokeStyle : 'solid'
    element.strokeWidth = Math.max(1, finiteNumber(element.strokeWidth, 2))
    element.roughness = Math.max(0, finiteNumber(element.roughness, 1))
    element.opacity = Math.max(0, Math.min(100, finiteNumber(element.opacity, 100)))

    if (type === 'text') {
      element.text = typeof element.text === 'string' ? element.text : ''
      element.originalText =
        typeof element.originalText === 'string' ? element.originalText : element.text
      element.fontSize = Math.max(8, finiteNumber(element.fontSize, 20))
      element.fontFamily = Math.max(1, Math.floor(finiteNumber(element.fontFamily, 2)))
      element.textAlign = typeof element.textAlign === 'string' ? element.textAlign : 'left'
      element.verticalAlign =
        typeof element.verticalAlign === 'string' ? element.verticalAlign : 'top'
      element.containerId =
        typeof element.containerId === 'string' && element.containerId.trim()
          ? element.containerId
          : null
      element.autoResize = element.autoResize !== false
    }

    if (type === 'image') {
      element.fileId = typeof element.fileId === 'string' ? element.fileId : ''
      element.status = typeof element.status === 'string' ? element.status : 'pending'
      element.scale =
        Array.isArray(element.scale) && element.scale.length >= 2
          ? [finiteNumber(element.scale[0], 1), finiteNumber(element.scale[1], 1)]
          : [1, 1]
      element.crop = element.crop ?? null
    }

    if (!LINEAR_ELEMENT_TYPES.has(type)) return [element as unknown as BoardElement]

    const rawPoints = Array.isArray(element.points) ? element.points : []
    let points: PointTuple[]
    if (
      rawPoints.length > 1 &&
      rawPoints.every((point) => typeof point === 'number' && Number.isFinite(point))
    ) {
      const flat = rawPoints as number[]
      points =
        flat.length % 2 === 0
          ? Array.from(
              { length: flat.length / 2 },
              (_, index) => [flat[index * 2]!, flat[index * 2 + 1]!] as PointTuple,
            )
          : []
    } else {
      points = rawPoints.map(pointTuple).filter((point): point is PointTuple => point !== null)
    }

    if (points.length < 2) {
      const width = finiteNumber(element.width, 0)
      const height = finiteNumber(element.height, 0)
      points = [
        [0, 0],
        [width || (height ? 0 : 1), height || (width ? 0 : 1)],
      ]
    }
    element.points = points
    element.lastCommittedPoint = null
    if (type === 'freedraw') {
      element.pressures = Array.isArray(element.pressures) ? element.pressures : []
      element.simulatePressure = element.simulatePressure !== false
    } else {
      element.startBinding = element.startBinding ?? null
      element.endBinding = element.endBinding ?? null
      element.startArrowhead = element.startArrowhead ?? null
      element.endArrowhead = element.endArrowhead ?? (type === 'arrow' ? 'arrow' : null)
    }
    return [element as unknown as BoardElement]
  })
  const validIds = new Set(normalized.map((element) => element.id))
  return normalized.map((value) => {
    const element = { ...(value as unknown as ElementRecord) }
    if (typeof element.frameId !== 'string' || !validIds.has(element.frameId))
      element.frameId = null
    if (typeof element.containerId !== 'string' || !validIds.has(element.containerId))
      element.containerId = null
    element.boundElements = normalizedBindings(element.boundElements).filter((binding) =>
      validIds.has(binding.id),
    )
    for (const key of ['startBinding', 'endBinding'] as const) {
      const binding = element[key]
      if (
        !binding ||
        typeof binding !== 'object' ||
        typeof (binding as ElementRecord).elementId !== 'string' ||
        !validIds.has((binding as ElementRecord).elementId as string)
      ) {
        element[key] = null
      }
    }
    return element as unknown as BoardElement
  })
}
