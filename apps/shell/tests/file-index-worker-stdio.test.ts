import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileIndexer } from '../src/main/file-index/indexer'
import type { FileIndexStore } from '../src/main/file-index/store'

const marker = 'FILE_INDEX_WORKER_STDIO_REGRESSION'

describe('FileIndexer worker stdio', () => {
  let tempDir: string | undefined

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  })

  it('keeps worker diagnostics off the Electron process streams', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'revelith-indexer-stdio-'))
    const workerPath = join(tempDir, 'stdio-worker.cjs')
    await writeFile(
      workerPath,
      `const { parentPort } = require('node:worker_threads')\n` +
        `console.log('${marker}:out')\n` +
        `console.error('${marker}:err')\n` +
        `parentPort.on('message', (request) => parentPort.postMessage({ id: request.id, type: 'scan', files: [] }))\n`,
    )

    const stdoutWrite = vi.spyOn(process.stdout, 'write')
    const stderrWrite = vi.spyOn(process.stderr, 'write')
    const store = {
      count: () => 0,
      listAll: () => new Map(),
      remove: () => undefined,
      upsert: () => undefined,
    } as unknown as FileIndexStore
    const indexer = new FileIndexer(store, workerPath, {
      roots: () => ['unused-by-test-worker'],
      extraPaths: () => [],
    })

    try {
      await indexer.scan()
      await new Promise((resolve) => setTimeout(resolve, 25))
      const writes = [...stdoutWrite.mock.calls, ...stderrWrite.mock.calls]
      expect(writes.some(([chunk]) => String(chunk).includes(marker))).toBe(false)
    } finally {
      indexer.stop()
      stdoutWrite.mockRestore()
      stderrWrite.mockRestore()
    }
  })
})
