import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readCloudProjectsStore, syncCloudProjects } from '../src/main/cloud-projects'

describe('retired hosted project integration', () => {
  it('does not read or delete a pre-existing local cache', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cloud-store-disabled-'))
    const storePath = join(dir, 'cloud-projects.json')
    const previous = JSON.stringify({ projects: [{ title: 'old local cache' }] })
    writeFileSync(storePath, previous)

    try {
      expect(readCloudProjectsStore(storePath)).toBeNull()
      await expect(syncCloudProjects(storePath)).resolves.toEqual({
        available: false,
        projects: [],
        syncedAt: 0,
      })
      expect(existsSync(storePath)).toBe(true)
      expect(readFileSync(storePath, 'utf-8')).toBe(previous)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
