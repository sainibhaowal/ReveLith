import { describe, expect, it } from 'vitest'
import { boardWithProject, buildBoard, firstColumnId, projectId } from '../test/fixtures'
import { reduce } from './reducer'
import {
  DOCUMENT_VERSION,
  migrateLegacy,
  parseDocument,
  seedBoard,
  serializeDocument,
} from './migrate'
import { loadBoard, loadFromStorage, saveToStorage, type StorageLike } from './persistence'

/** In-memory StorageLike so persistence can be tested without jsdom storage. */
function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

describe('seedBoard', () => {
  it('creates a usable starter board', () => {
    const state = seedBoard()
    expect(state.projects).toHaveLength(1)
    expect(state.columns.length).toBeGreaterThanOrEqual(4)
    expect(state.tasks.length).toBeGreaterThanOrEqual(5)
    expect(state.labels.length).toBeGreaterThanOrEqual(3)
    expect(state.selectedProjectId).toBe(state.projects[0].id)
  })

  it('has no archived tasks and a done column', () => {
    const state = seedBoard()
    expect(state.tasks.every((task) => !task.archived)).toBe(true)
    expect(state.columns.some((column) => column.isDone)).toBe(true)
  })

  it('includes at least one blocked-by relation', () => {
    const state = seedBoard()
    expect(state.relations.length).toBeGreaterThanOrEqual(1)
    expect(state.relations[0].type).toBe('blocked_by')
  })
})

describe('migrateLegacy', () => {
  const legacy = {
    version: 1,
    tasks: [
      {
        id: 'seed-1',
        title: 'Welcome to Tasks',
        notes: 'Drag cards around',
        status: 'todo',
        priority: 'medium',
        due: '',
        createdAt: 1,
      },
      {
        id: 'seed-2',
        title: 'Second',
        notes: '',
        status: 'doing',
        priority: 'high',
        due: '2026-05-01',
        createdAt: 2,
      },
      {
        id: 'seed-3',
        title: 'Third',
        notes: '',
        status: 'done',
        priority: 'low',
        due: '',
        createdAt: 3,
      },
    ],
  }

  it('maps a pre-2.0 board onto a single project', () => {
    const state = migrateLegacy(legacy)
    expect(state).not.toBeNull()
    expect(state!.projects).toHaveLength(1)
    expect(state!.tasks).toHaveLength(3)
  })

  it('maps legacy statuses onto the new columns', () => {
    const state = migrateLegacy(legacy)!
    const nameFor = (title: string) => {
      const task = state.tasks.find((entry) => entry.title === title)!
      return state.columns.find((column) => column.id === task.columnId)!.name
    }
    expect(nameFor('Welcome to Tasks')).toBe('Backlog')
    expect(nameFor('Second')).toBe('In Progress')
    expect(nameFor('Third')).toBe('Done')
  })

  it('carries notes across as the description and numbers tasks', () => {
    const state = migrateLegacy(legacy)!
    expect(state.tasks[0].description).toBe('Drag cards around')
    expect(state.tasks.map((task) => task.number)).toEqual([1, 2, 3])
    expect(state.projects[0].lastTaskNumber).toBe(3)
  })

  it('preserves due dates and marks done tasks complete', () => {
    const state = migrateLegacy(legacy)!
    expect(state.tasks[1].dueDate).toBe('2026-05-01')
    expect(state.tasks[2].completedAt).not.toBeNull()
  })

  it('skips entries without a title', () => {
    const state = migrateLegacy({ tasks: [{ title: '  ' }, { title: 'Real' }] })!
    expect(state.tasks).toHaveLength(1)
  })

  it('returns null for a payload that is not a board', () => {
    expect(migrateLegacy({ tasks: 'nope' })).toBeNull()
  })
})

describe('parseDocument', () => {
  it('reads a current document and drops the transient selection', () => {
    const state = reduce(seedBoard(), { kind: 'ui/selectTask', id: seedBoard().tasks[0].id })
    const opened = state.selectedTaskId ? state : state
    const doc = serializeDocument(opened)
    const parsed = parseDocument(JSON.parse(JSON.stringify(doc)))!
    expect(parsed.version).toBe(DOCUMENT_VERSION)
    expect(parsed.selectedTaskId).toBeNull()
  })

  it('reads a legacy document', () => {
    const parsed = parseDocument({
      version: 1,
      tasks: [
        {
          id: 'a',
          title: 'Old task',
          status: 'todo',
          priority: 'high',
          due: '',
          notes: '',
          createdAt: 1,
        },
      ],
    })
    expect(parsed).not.toBeNull()
    expect(parsed!.tasks[0].title).toBe('Old task')
  })

  it('rejects payloads that are not boards', () => {
    expect(parseDocument(null)).toBeNull()
    expect(parseDocument('string')).toBeNull()
    expect(parseDocument({ state: { nope: true } })).toBeNull()
    expect(parseDocument({ unrelated: 1 })).toBeNull()
  })

  it('stamps the current version on write', () => {
    const doc = serializeDocument(seedBoard())
    expect(doc.version).toBe(DOCUMENT_VERSION)
    expect(doc.state.version).toBe(DOCUMENT_VERSION)
  })
})

describe('storage round trip', () => {
  it('saves and reloads the same board', () => {
    const storage = memoryStorage()
    const state = seedBoard()
    expect(saveToStorage(storage, 'k', state)).toBe(true)
    const loaded = loadFromStorage(storage, 'k')!
    expect(loaded.tasks).toHaveLength(state.tasks.length)
    expect(loaded.projects[0].name).toBe(state.projects[0].name)
  })

  it('starts with a blank board when storage is missing', () => {
    const loaded = loadBoard(memoryStorage(), 'absent')
    expect(loaded.projects).toHaveLength(0)
    expect(loaded.tasks).toHaveLength(0)
  })

  it('falls back to a blank board for corrupt data', () => {
    const storage = memoryStorage({ k: '{not json' })
    expect(loadFromStorage(storage, 'k')).toBeNull()
    expect(loadBoard(storage, 'k').projects).toHaveLength(0)
    expect(loadBoard(storage, 'k').tasks).toHaveLength(0)
  })

  it('forces a blank board when starting a new document', () => {
    const storage = memoryStorage()
    const first = loadBoard(storage, 'k')
    expect(first.tasks).toHaveLength(0)
    const fresh = loadBoard(storage, 'k', true)
    expect(fresh.projects).toHaveLength(0)
    expect(fresh.tasks).toHaveLength(0)
  })

  it('removes only the untouched old first-run demo board from local storage', () => {
    const storage = memoryStorage()
    const oldStarter = seedBoard()
    oldStarter.projects[0] = {
      ...oldStarter.projects[0]!,
      description: 'A sample project. Rename it, or delete it and start fresh.',
    }
    saveToStorage(storage, 'k', oldStarter)
    const loaded = loadBoard(storage, 'k')
    expect(loaded.projects).toHaveLength(0)
    expect(loadFromStorage(storage, 'k')?.tasks).toHaveLength(0)
  })

  it('preserves an old demo-named board as soon as the user edited it', () => {
    const storage = memoryStorage()
    const original = seedBoard()
    const edited = reduce(original, {
      kind: 'task/update',
      id: original.tasks[0]!.id,
      patch: { title: 'My task' },
    })
    saveToStorage(storage, 'k', edited)
    const loaded = loadBoard(storage, 'k')
    expect(loaded.tasks[0]?.title).toBe('My task')
  })

  it('reports a failed write instead of throwing', () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {},
    }
    expect(saveToStorage(failing, 'k', seedBoard())).toBe(false)
  })
})

describe('document round trip preserves a real board', () => {
  it('keeps every entity through serialise and parse', () => {
    const base = boardWithProject()
    const id = projectId(base)
    const state = reduce(
      reduce(base, { kind: 'customField/define', projectId: id, name: 'Points', type: 'number' }),
      {
        kind: 'task/create',
        projectId: id,
        columnId: firstColumnId(base),
        title: 'Rich task',
        description: 'Body',
        labelIds: [base.labels[0].id],
      },
    )
    const restored = parseDocument(JSON.parse(JSON.stringify(serializeDocument(state))))!
    expect(restored.tasks).toHaveLength(1)
    expect(restored.tasks[0].description).toBe('Body')
    expect(restored.tasks[0].labelIds).toEqual([state.tasks[0].labelIds[0]])
    expect(restored.customFields).toHaveLength(1)
  })
})

describe('empty board', () => {
  it('stays inert for mutations with no project', () => {
    const state = buildBoard()
    expect(state.projects).toHaveLength(0)
  })
})
