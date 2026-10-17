import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAll,
  deleteBlob,
  downloadBlob,
  formatBytes,
  getBlob,
  isImage,
  listBlobIds,
  MAX_ATTACHMENT_BYTES,
  putBlob,
  pruneOrphans,
  storageUsage,
} from './attachments'

beforeEach(async () => {
  await clearAll()
})

afterEach(async () => {
  await clearAll()
})

describe('blob storage', () => {
  it('stores and reads a blob back byte for byte', async () => {
    const blob = new Blob(['hello attachment'], { type: 'text/plain' })
    await putBlob('a1', blob)
    const loaded = await getBlob('a1')
    expect(loaded).not.toBeNull()
    expect(await loaded!.text()).toBe('hello attachment')
  })

  it('returns null for a missing id', async () => {
    expect(await getBlob('missing')).toBeNull()
  })

  it('preserves the mime type', async () => {
    await putBlob('png', new Blob(['x'], { type: 'image/png' }))
    expect((await getBlob('png'))!.type).toBe('image/png')
  })

  it('overwrites an existing id', async () => {
    await putBlob('a1', new Blob(['first'], { type: 'text/plain' }))
    await putBlob('a1', new Blob(['second'], { type: 'text/plain' }))
    const loaded = await getBlob('a1')
    expect(await loaded!.text()).toBe('second')
    expect(await listBlobIds()).toEqual(['a1'])
  })

  it('deletes a blob', async () => {
    await putBlob('a1', new Blob(['x']))
    await deleteBlob('a1')
    expect(await getBlob('a1')).toBeNull()
  })

  it('deleting a missing id is harmless', async () => {
    await expect(deleteBlob('never-existed')).resolves.toBeUndefined()
  })

  it('lists stored ids', async () => {
    await putBlob('a', new Blob(['1']))
    await putBlob('b', new Blob(['2']))
    expect((await listBlobIds()).sort()).toEqual(['a', 'b'])
  })

  it('stores binary content intact', async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255])
    await putBlob('bin', new Blob([bytes]))
    const loaded = await getBlob('bin')
    expect(new Uint8Array(await loaded!.arrayBuffer())).toEqual(bytes)
  })

  it('stores an empty blob', async () => {
    await putBlob('empty', new Blob([]))
    expect((await getBlob('empty'))!.size).toBe(0)
  })

  it('reports total usage', async () => {
    await putBlob('a', new Blob(['12345']))
    await putBlob('b', new Blob(['123']))
    const usage = await storageUsage()
    expect(usage.count).toBe(2)
    expect(usage.bytes).toBe(8)
  })
})

describe('pruneOrphans', () => {
  it('removes blobs with no matching attachment record', async () => {
    await putBlob('keep', new Blob(['x']))
    await putBlob('drop', new Blob(['y']))
    const removed = await pruneOrphans(['keep'])
    expect(removed).toBe(1)
    expect(await listBlobIds()).toEqual(['keep'])
  })

  it('is a no-op when everything is referenced', async () => {
    await putBlob('a', new Blob(['x']))
    expect(await pruneOrphans(['a'])).toBe(0)
  })

  it('drops everything when no records are known', async () => {
    await putBlob('a', new Blob(['x']))
    await putBlob('b', new Blob(['y']))
    expect(await pruneOrphans([])).toBe(2)
    expect(await listBlobIds()).toEqual([])
  })
})

describe('helpers', () => {
  it('formats bytes for humans', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('recognises inline image types', () => {
    expect(isImage('image/png')).toBe(true)
    expect(isImage('image/svg+xml')).toBe(true)
    expect(isImage('application/pdf')).toBe(false)
    expect(isImage('text/plain')).toBe(false)
  })

  it('sets a sane size limit', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024)
  })

  it('triggers a download with the right filename', () => {
    const clicked: { href: string; download: string }[] = []
    const original = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const element = original(tag) as HTMLAnchorElement
      if (tag === 'a') {
        element.click = () => clicked.push({ href: element.href, download: element.download })
      }
      return element
    }) as typeof document.createElement)

    expect(downloadBlob(new Blob(['x']), 'notes.txt')).toBe(true)
    expect(clicked[0].download).toBe('notes.txt')
    spy.mockRestore()
  })
})
