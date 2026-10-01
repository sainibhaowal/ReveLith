import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Full-text search indexing (src/main/search-index.ts): files saved/opened in
 * the app must land in the index with their body text, so Home search finds
 * words inside documents. Regression cover for the empty-index bug (the
 * `files` table had no `content` column while upsert + the FTS triggers
 * referenced it, and the JSON fallback upsert took an object while
 * indexFile passes positional args).
 */

const electronMockDirs: string[] = []

vi.mock('electron', () => ({
  // fresh profile dir per test so the JSON fallback file never leaks entries
  app: {
    getPath: () => {
      const dir = mkdtempSync(join(tmpdir(), 'revelith-search-profile-'))
      electronMockDirs.push(dir)
      return dir
    },
  },
}))

async function loadService() {
  const mod = await import('../src/main/search-index')
  mod.resetSearchIndex()
  // constructor takes the profile dir explicitly: one isolated index per test
  const dir = mkdtempSync(join(tmpdir(), 'revelith-search-profile-'))
  return new mod.SearchIndexService(dir)
}

describe('search indexing', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })

  afterEach(() => {
    vi.resetModules()
  })

  function writeDoc(name: string, content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'revelith-search-doc-'))
    dirs.push(dir)
    const path = join(dir, name)
    writeFileSync(path, content, 'utf8')
    return path
  }

  it('indexes a markdown file and finds a word inside it with a snippet', async () => {
    const service = await loadService()
    const path = writeDoc('notes.md', '# Birds\n\nThe quetzal lives in cloud forests.\n')
    await service.indexFile(path)

    const results = service.search({ query: 'quetzal' })
    expect(results).toHaveLength(1)
    expect(results[0].filePath).toBe(path)
    expect(results[0].snippet).toContain('quetzal')
  })

  it('upsert accepts the positional args indexFile passes (fallback parity)', async () => {
    const service = await loadService()
    const path = writeDoc('a.md', 'alpha beta')
    // same 6-arg shape the service uses for both backends
    await service.indexFile(path)
    await service.indexFile(path) // re-index (upsert path) must not duplicate
    expect(service.search({ query: 'alpha' })).toHaveLength(1)
    expect(service.getStats().totalFiles).toBe(1)
  })

  it('removes deleted files from results', async () => {
    const service = await loadService()
    const path = writeDoc('gone.md', 'quetzal habitat')
    await service.indexFile(path)
    expect(service.search({ query: 'quetzal' })).toHaveLength(1)
    service.removeFile(path)
    expect(service.search({ query: 'quetzal' })).toHaveLength(0)
  })

  it('ignores unsupported extensions', async () => {
    const service = await loadService()
    const path = writeDoc('binary.exe', 'quetzal')
    await service.indexFile(path)
    expect(service.search({ query: 'quetzal' })).toHaveLength(0)
    expect(service.getStats().totalFiles).toBe(0)
  })
})
