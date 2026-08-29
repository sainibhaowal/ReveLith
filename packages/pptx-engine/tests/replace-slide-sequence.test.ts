/**
 * Verifies the core replace_at sequence (redo one slide in place):
 * mergeSlideFromPptx (new slide appended at the end) → moveSlide (into position) → deleteSlide (remove old slide).
 * This is the engine-level equivalent of the replace_at branch in slides-main 'slides:html-to-pptx';
 * no Electron dependency : runs the real openPptx → operations → savePptx → openPptx chain.
 */
import { describe, it, expect } from 'vitest'
import { openPptx, savePptx, createBlankPptx, addElement, mergeSlideFromPptx, moveSlide, deleteSlide } from '../src/index'

async function onePagePptx(text: string): Promise<Uint8Array> {
  const opened = await openPptx(await createBlankPptx())
  addElement(opened.deck.slides[0]!, {
    kind: 'textbox',
    offset: { x: 914400, y: 914400, cx: 7315200, cy: 914400 },
    paragraphs: [{ runs: [{ text, fontSize: 32 }] }],
  })
  return savePptx(opened)
}

/** Readable text per slide (concatenated text/shape elements) */
function slideTexts(opened: Awaited<ReturnType<typeof openPptx>>): string[] {
  return opened.deck.slides.map((sl) =>
    sl.elements
      .filter((el) => el.type === 'text' || el.type === 'shape')
      .map(
        (el) =>
          (
            el as { text?: { paragraphs: Array<{ runs: Array<{ text: string }> }> } }
          ).text?.paragraphs
            ?.flatMap((pg) => pg.runs.map((r) => r.text))
            .join('') ?? '',
      )
      .join(' '),
  )
}

async function threePageDeck() {
  const base = await openPptx(await onePagePptx('P1'))
  await mergeSlideFromPptx(base, await onePagePptx('P2'))
  await mergeSlideFromPptx(base, await onePagePptx('P3'))
  expect(base.deck.slides.length).toBe(3)
  return base
}

describe('replace_at sequence (merge → move → delete)', () => {
  it('replace a middle slide in place: slide count unchanged, new slide in position, old slide gone', async () => {
    const base = await threePageDeck()
    const atIndex = 1 // replace P2

    const total = base.deck.slides.length
    const merged = await mergeSlideFromPptx(base, await onePagePptx('NEW_P2'))
    expect(merged).not.toBeNull()
    expect(moveSlide(base, total, atIndex)).toBe(true)
    expect(deleteSlide(base, atIndex + 1)).toBe(true)

    expect(base.deck.slides.length).toBe(3)
    const texts = slideTexts(base)
    expect(texts[0]).toContain('P1')
    expect(texts[1]).toContain('NEW_P2')
    expect(texts[1]).not.toContain('P2 ') // no leftover text from the old slide
    expect(texts[2]).toContain('P3')
  })

  it('replacing the last slide (atIndex=last) also works', async () => {
    const base = await threePageDeck()
    const atIndex = 2
    const total = base.deck.slides.length
    await mergeSlideFromPptx(base, await onePagePptx('NEW_P3'))
    expect(moveSlide(base, total, atIndex)).toBe(true)
    expect(deleteSlide(base, atIndex + 1)).toBe(true)

    const texts = slideTexts(base)
    expect(base.deck.slides.length).toBe(3)
    expect(texts[2]).toContain('NEW_P3')
  })

  it('replacing the first slide keeps order and content correct after save and reopen', async () => {
    const base = await threePageDeck()
    const atIndex = 0
    const total = base.deck.slides.length
    await mergeSlideFromPptx(base, await onePagePptx('NEW_P1'))
    expect(moveSlide(base, total, atIndex)).toBe(true)
    expect(deleteSlide(base, atIndex + 1)).toBe(true)

    const reopened = await openPptx(await savePptx(base))
    expect(reopened.deck.slides.length).toBe(3)
    const texts = slideTexts(reopened)
    expect(texts[0]).toContain('NEW_P1')
    expect(texts[1]).toContain('P2')
    expect(texts[2]).toContain('P3')
  })
})
