/**
 * promoteSlideBackground: full-page solid shapes at the bottom of z-order become a
 * native <p:bg> (the cloud html→pptx converter misses this when the page container
 * carries a fully transparent border : the shapes land in the deck and swallow
 * every click). Fixtures are real pptxgenjs output, run through the real
 * openPptx → promote → savePptx → openPptx chain.
 */
import { describe, it, expect } from 'vitest'
import { openPptx, savePptx, createBlankPptx, addElement } from '../src/index'
import { promoteSlideBackground, isBackgroundLikeElement } from '../src/background-promote'

const PAGE = { w: 13.333, h: 7.5 }
const EMU_PER_INCH = 914400

type ShapeSpec = {
  x?: number
  y?: number
  w?: number
  h?: number
  fill?: string
  lineTransparency?: number
  visibleLine?: boolean
  text?: string
}

async function deckWithShapes(shapes: ShapeSpec[], withContent = false): Promise<Uint8Array> {
  const opened = await openPptx(await createBlankPptx())
  const slide = opened.deck.slides[0]!
  for (const spec of shapes) {
    const x = Math.round((spec.x ?? 0) * EMU_PER_INCH)
    const y = Math.round((spec.y ?? 0) * EMU_PER_INCH)
    const cx = Math.round((spec.w ?? PAGE.w) * EMU_PER_INCH)
    const cy = Math.round((spec.h ?? PAGE.h) * EMU_PER_INCH)
    if (spec.text) {
      addElement(slide, {
        kind: 'textbox',
        offset: { x, y, cx, cy },
        fillColor: spec.fill ? (spec.fill.startsWith('#') ? spec.fill : `#${spec.fill}`) : '#0B2545',
        paragraphs: [{ runs: [{ text: spec.text }] }],
      })
    } else {
      addElement(slide, {
        kind: 'rect',
        offset: { x, y, cx, cy },
        fillColor: spec.fill ? (spec.fill.startsWith('#') ? spec.fill : `#${spec.fill}`) : '#0B2545',
        stroke: spec.visibleLine ? { color: '#FF0000', widthEmu: 25400 } : undefined,
      })
    }
  }
  if (withContent) {
    addElement(slide, {
      kind: 'textbox',
      offset: { x: 914400, y: 914400, cx: 7315200, cy: 914400 },
      paragraphs: [{ runs: [{ text: 'CONTENT' }] }],
    })
  }
  return savePptx(opened)
}

describe('promoteSlideBackground', () => {
  it('promotes stacked full-page solid rects (transparent 1px border) into <p:bg>', async () => {
    const opened = await openPptx(
      await deckWithShapes(
        [
          { fill: '112233', lineTransparency: 100 },
          { fill: '0B2545', lineTransparency: 100 },
        ],
        true,
      ),
    )
    const slide = opened.deck.slides[0]!
    const before = slide.elements.length

    expect(promoteSlideBackground(slide, opened.deck.size)).toBe(true)
    expect(slide.elements.length).toBe(before - 2)
    expect(slide.background).toEqual({ type: 'solid', color: '#0B2545' }) // topmost wins
    expect(slide.structureDirty).toBe(true)

    const reopened = await openPptx(await savePptx(opened))
    const r = reopened.deck.slides[0]!
    expect(r.background).toEqual({ type: 'solid', color: '#0B2545' })
    expect(reopened.archive.readText(r.path)).toContain('<p:bg>')
    const texts = r.elements.flatMap(
      (el) =>
        (
          el as { text?: { paragraphs: Array<{ runs: Array<{ text: string }> }> } }
        ).text?.paragraphs?.flatMap((pg) => pg.runs.map((run) => run.text)) ?? [],
    )
    expect(texts.join(' ')).toContain('CONTENT')
  })

  it('leaves shapes with a visible border alone', async () => {
    const opened = await openPptx(await deckWithShapes([{ visibleLine: true }]))
    const slide = opened.deck.slides[0]!
    const before = slide.elements.length
    expect(promoteSlideBackground(slide, opened.deck.size)).toBe(false)
    expect(slide.elements.length).toBe(before)
  })

  it('leaves non-full-page shapes and shapes with text alone', async () => {
    const opened = await openPptx(
      await deckWithShapes([
        { w: 6, h: 4 },
        { text: 'TITLE', lineTransparency: 100 },
      ]),
    )
    const slide = opened.deck.slides[0]!
    const before = slide.elements.length
    expect(promoteSlideBackground(slide, opened.deck.size)).toBe(false)
    expect(slide.elements.length).toBe(before)
  })

  it('skips shapes referenced by the timing tree', async () => {
    const opened = await openPptx(await deckWithShapes([{ lineTransparency: 100 }]))
    const slide = opened.deck.slides[0]!
    const spid = /<p:cNvPr\b[^>]*\bid="(\d+)"/.exec(slide.elements[0]!.anchor.originalXml)![1]
    slide.bodySuffix = slide.bodySuffix.replace(
      '</p:sld>',
      `<p:timing><p:spTgt spid="${spid}"/></p:timing></p:sld>`,
    )
    expect(promoteSlideBackground(slide, opened.deck.size)).toBe(false)
  })

  it('isBackgroundLikeElement matches full-page fills only', async () => {
    const opened = await openPptx(await deckWithShapes([{ lineTransparency: 100 }, { w: 6, h: 4 }]))
    const slide = opened.deck.slides[0]!
    expect(isBackgroundLikeElement(slide.elements[0]!, opened.deck.size)).toBe(true)
    expect(isBackgroundLikeElement(slide.elements[1]!, opened.deck.size)).toBe(false)
  })
})
