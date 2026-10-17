import type { ExcalidrawElement as BoardElement } from '@excalidraw/excalidraw/element/types'

export type DrawboardRevisionKind = 'added' | 'edited' | 'deleted'
export type DrawboardRevisionStatus = 'pending' | 'accepted' | 'rejected'

export interface DrawboardRevision {
  id: string
  elementId: string
  kind: DrawboardRevisionKind
  before: BoardElement | null
  after: BoardElement | null
  status: DrawboardRevisionStatus
  createdAt: number
}

const semanticElement = (element: BoardElement | null): string => {
  if (!element) return ''
  const {
    version: _version,
    versionNonce: _nonce,
    updated: _updated,
    ...semantic
  } = element as BoardElement & {
    version?: number
    versionNonce?: number
    updated?: number
  }
  return JSON.stringify(semantic)
}

export function diffBoardElements(
  before: readonly BoardElement[],
  after: readonly BoardElement[],
): DrawboardRevision[] {
  const oldById = new Map(before.map((element) => [element.id, element]))
  const newById = new Map(after.map((element) => [element.id, element]))
  const revisions: DrawboardRevision[] = []
  for (const id of new Set([...oldById.keys(), ...newById.keys()])) {
    const oldElement = oldById.get(id) ?? null
    const newElement = newById.get(id) ?? null
    const oldLive = oldElement && !oldElement.isDeleted ? oldElement : null
    const newLive = newElement && !newElement.isDeleted ? newElement : null
    if (semanticElement(oldLive) === semanticElement(newLive)) continue
    const kind: DrawboardRevisionKind = !oldLive ? 'added' : !newLive ? 'deleted' : 'edited'
    revisions.push({
      id: crypto.randomUUID(),
      elementId: id,
      kind,
      before: oldLive ? structuredClone(oldLive) : null,
      after: newLive ? structuredClone(newLive) : null,
      status: 'pending',
      createdAt: Date.now(),
    })
  }
  return revisions
}

export function validateDrawboardRevisions(value: unknown): DrawboardRevision[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is DrawboardRevision => {
    if (!entry || typeof entry !== 'object') return false
    const revision = entry as Partial<DrawboardRevision>
    return (
      typeof revision.id === 'string' &&
      typeof revision.elementId === 'string' &&
      (revision.kind === 'added' || revision.kind === 'edited' || revision.kind === 'deleted') &&
      (revision.status === 'pending' ||
        revision.status === 'accepted' ||
        revision.status === 'rejected') &&
      typeof revision.createdAt === 'number'
    )
  })
}

/** Revert a pending revision only while its recorded result is still current. */
export function rejectBoardRevision(
  elements: readonly BoardElement[],
  revision: DrawboardRevision,
): BoardElement[] | null {
  const current =
    elements.find((element) => element.id === revision.elementId && !element.isDeleted) ?? null
  if (semanticElement(current) !== semanticElement(revision.after)) return null
  const rest = elements.filter((element) => element.id !== revision.elementId)
  if (revision.before) return [...rest, structuredClone(revision.before)]
  return rest
}
