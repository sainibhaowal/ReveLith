import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName } from 'pdf-lib'
import { createDocument, cropPages, insertBlankPage, replacePages, setPageSize } from '../src/main/page-ops'

async function makePdf(sizes: [number, number][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const size of sizes) doc.addPage(size)
  return doc.save({ useObjectStreams: false })
}

async function sizesOf(bytes: Uint8Array): Promise<[number, number][]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => {
    const s = p.getSize()
    return [s.width, s.height]
  })
}

describe('insertBlankPage', () => {
  it('inserts after the given page with the neighbor size', async () => {
    const before = await makePdf([
      [595, 842],
      [595, 842],
    ])
    const { bytes, pageCount } = await insertBlankPage(before, 0)
    expect(pageCount).toBe(3)
    expect(await sizesOf(bytes)).toEqual([
      [595, 842],
      [595, 842],
      [595, 842],
    ])
  })

  it('honors an explicit size and rejects bad positions', async () => {
    const before = await makePdf([[595, 842]])
    const { bytes } = await insertBlankPage(before, -1, 300, 400)
    expect(await sizesOf(bytes)).toEqual([
      [300, 400],
      [595, 842],
    ])
    await expect(insertBlankPage(before, 5)).rejects.toThrow('out of range')
    await expect(insertBlankPage(before, 0, 10, 10)).rejects.toThrow('36..2880')
  })
})

describe('setPageSize', () => {
  it('resizes the given pages only', async () => {
    const before = await makePdf([
      [595, 842],
      [595, 842],
    ])
    const { bytes } = await setPageSize(before, [1], 300, 300)
    expect(await sizesOf(bytes)).toEqual([
      [595, 842],
      [300, 300],
    ])
    await expect(setPageSize(before, [7], 300, 300)).rejects.toThrow('out of range')
    await expect(setPageSize(before, [], 300, 300)).rejects.toThrow('no pages')
  })
})

describe('cropPages', () => {
  it('sets the CropBox inside the media box', async () => {
    const before = await makePdf([[595, 842]])
    const { bytes } = await cropPages(before, [0], [72, 72, 523, 770])
    const doc = await PDFDocument.load(bytes)
    const box = doc.getPage(0).node.get(PDFName.of('CropBox'))
    expect(box).toBeDefined()
    await expect(cropPages(before, [0], [0, 0, 900, 900])).rejects.toThrow('exceeds page 1')
    await expect(cropPages(before, [0], [10, 10, 11, 11])).rejects.toThrow('too small')
    await expect(cropPages(before, [0], [50, 50, 40, 60])).rejects.toThrow('x1 < x2')
  })
})

describe('replacePages', () => {
  it('swaps the range for the source pages', async () => {
    const before = await makePdf([
      [595, 842],
      [595, 842],
      [595, 842],
    ])
    const other = await makePdf([[300, 300]])
    const { bytes, pageCount } = await replacePages(before, [1], other)
    expect(pageCount).toBe(3)
    expect(await sizesOf(bytes)).toEqual([
      [595, 842],
      [300, 300],
      [595, 842],
    ])
    await expect(replacePages(before, [9], other)).rejects.toThrow('out of range')
  })
})

describe('createDocument', () => {
  it('builds titled multi-page documents', async () => {
    const bytes = await createDocument(2, 'Summary', 'First line\nSecond line')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getTitle()).toBe('Summary')
    await expect(createDocument(0)).rejects.toThrow('1..100')
  })
})
