import { describe, expect, it } from 'vitest'
import {
  measureBlocks,
  measureBlocksAsync,
  yieldToUI,
  PAGINATE_CHUNK_THRESHOLD,
  PAGINATE_CHUNK_SIZE,
  type BlockBox,
} from '../src/renderer/pagination'

/** Build a fake ProseMirror container with stubbed layout rects. */
function buildContainer(specs: Array<{
  top: number
  height: number
  cls?: string
  idx?: number
  br?: boolean
  text?: string
  gap?: boolean
}>): HTMLElement {
  const pm = document.createElement('div')
  for (const s of specs) {
    const el = document.createElement('div')
    if (s.cls) el.className = s.cls
    if (s.idx !== undefined) el.setAttribute('data-idx', String(s.idx))
    if (s.br) {
      const br = document.createElement('span')
      br.className = 'doc-page-br'
      el.appendChild(br)
    }
    el.textContent = s.text ?? 'lorem ipsum'
    const top = s.top
    const height = s.height
    el.getBoundingClientRect = () =>
      ({ top, height, left: 0, right: 100, bottom: top + height, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    pm.appendChild(el)
  }
  return pm
}

function stripEl(blocks: BlockBox[]) {
  return blocks.map(({ el: _el, ...rest }) => rest)
}

describe('measureBlocksAsync equivalence', () => {
  it('matches measureBlocks on a mixed container', async () => {
    const pm = buildContainer([
      { top: 0, height: 20, idx: 0 },
      { top: 24, height: 20, idx: 1, cls: 'page-break-before' },
      { top: 48, height: 0, idx: 2 }, // zero-height: skipped
      { top: 48, height: 30, idx: 3, br: true, text: '' }, // break-only
      { top: 82, height: 20, idx: 4 },
    ])
    const origin = 0
    const factor = 1
    const sync = measureBlocks(pm, origin, factor)
    const asyncRes = await measureBlocksAsync(pm, origin, factor, { chunkSize: 2 })
    expect(asyncRes).not.toBeNull()
    expect(stripEl(asyncRes!.blocks)).toEqual(stripEl(sync.blocks))
    expect(asyncRes!.totalHeight).toBe(sync.totalHeight)
    // el references are preserved
    expect(asyncRes!.blocks.map((b) => b.el)).toEqual(sync.blocks.map((b) => b.el))
  })

  it('subtracts page-gap decorations identically', async () => {
    const pm = buildContainer([
      { top: 0, height: 20, idx: 0 },
      { top: 20, height: 40, cls: 'page-gap', text: '' },
      { top: 60, height: 20, idx: 1 },
    ])
    const sync = measureBlocks(pm, 0, 1)
    const asyncRes = await measureBlocksAsync(pm, 0, 1, { chunkSize: 1 })
    expect(asyncRes).not.toBeNull()
    // second content block sits at virtual top 20 (gap subtracted)
    expect(sync.blocks[1]!.top).toBe(20)
    expect(stripEl(asyncRes!.blocks)).toEqual(stripEl(sync.blocks))
    expect(asyncRes!.totalHeight).toBe(sync.totalHeight)
  })

  it('handles an empty container', async () => {
    const pm = document.createElement('div')
    const asyncRes = await measureBlocksAsync(pm, 0, 1)
    expect(asyncRes).toEqual({ blocks: [], totalHeight: 0 })
  })

  it('applies zoom factor identically', async () => {
    const pm = buildContainer([
      { top: 0, height: 40, idx: 0 },
      { top: 44, height: 40, idx: 1 },
    ])
    const sync = measureBlocks(pm, 10, 2)
    const asyncRes = await measureBlocksAsync(pm, 10, 2, { chunkSize: 1 })
    expect(asyncRes).not.toBeNull()
    expect(stripEl(asyncRes!.blocks)).toEqual(stripEl(sync.blocks))
    expect(asyncRes!.totalHeight).toBe(sync.totalHeight)
  })
})

describe('measureBlocksAsync progress + abort', () => {
  it('reports increasing progress per chunk', async () => {
    const specs = Array.from({ length: 10 }, (_, i) => ({ top: i * 24, height: 20, idx: i }))
    const pm = buildContainer(specs)
    const seen: Array<{ done: number; total: number }> = []
    const res = await measureBlocksAsync(pm, 0, 1, {
      chunkSize: 3,
      onProgress: (p) => seen.push({ ...p }),
    })
    expect(res).not.toBeNull()
    expect(res!.blocks.length).toBe(10)
    expect(seen.length).toBeGreaterThan(1)
    expect(seen[seen.length - 1]).toEqual({ done: 10, total: 10 })
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.done).toBeGreaterThan(seen[i - 1]!.done)
    }
  })

  it('aborts immediately when shouldAbort is set', async () => {
    const pm = buildContainer([{ top: 0, height: 20, idx: 0 }])
    const res = await measureBlocksAsync(pm, 0, 1, { shouldAbort: () => true })
    expect(res).toBeNull()
  })

  it('aborts mid-run and returns null', async () => {
    const specs = Array.from({ length: 10 }, (_, i) => ({ top: i * 24, height: 20, idx: i }))
    const pm = buildContainer(specs)
    let calls = 0
    const res = await measureBlocksAsync(pm, 0, 1, {
      chunkSize: 2,
      shouldAbort: () => ++calls > 1,
    })
    expect(res).toBeNull()
  })
})

describe('pagination chunking constants', () => {
  it('uses sane thresholds', () => {
    expect(PAGINATE_CHUNK_THRESHOLD).toBeGreaterThan(0)
    expect(PAGINATE_CHUNK_SIZE).toBeGreaterThan(0)
    expect(PAGINATE_CHUNK_SIZE).toBeLessThanOrEqual(PAGINATE_CHUNK_THRESHOLD)
  })

  it('yieldToUI resolves', async () => {
    await expect(yieldToUI()).resolves.toBeUndefined()
  })
})
