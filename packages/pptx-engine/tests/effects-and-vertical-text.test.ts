import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  openPptx,
  patchElementEffects,
  patchBodyPrVert,
  setBodyPrVert,
  setElementEffects,
  copyElementData,
  pasteElements,
  type Slide,
  type TextElement,
  type OpenedPptx,
} from '../src/index'

describe('Effects patch (patchElementEffects)', () => {
  const sampleShapeXml = `<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:spPr>
    <a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>
    <a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
  </p:spPr>
</p:sp>`

  it('adds outer shadow, glow, soft edge, and reflection into a new a:effectLst', () => {
    const patched = patchElementEffects(sampleShapeXml, {
      shadow: {
        color: '#000000',
        blurRad: 50800,
        dist: 38100,
        dirDeg: 45,
      },
      glow: {
        color: '#00FF00',
        radius: 63500,
      },
      softEdge: 25400,
      reflection: {
        blurRad: 12700,
        stA: 60000,
        endA: 500,
        dist: 10000,
        dirDeg: 90,
      },
    })

    expect(patched).toContain('<a:effectLst>')
    expect(patched).toContain('<a:outerShdw blurRad="50800" dist="38100" dir="2700000"><a:srgbClr val="000000"/></a:outerShdw>')
    expect(patched).toContain('<a:glow rad="63500"><a:srgbClr val="00FF00"/></a:glow>')
    expect(patched).toContain('<a:softEdge rad="25400"/>')
    expect(patched).toContain('<a:reflection blurRad="12700" stA="60000" endA="500" dist="10000" dir="5400000"/>')
  })

  it('updates existing effects and can selectively remove them', () => {
    const xmlWithEffects = `<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:spPr>
    <a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm>
    <a:effectLst>
      <a:outerShdw blurRad="10000" dist="10000" dir="0"><a:srgbClr val="000000"/></a:outerShdw>
      <a:glow rad="20000"><a:srgbClr val="FF0000"/></a:glow>
    </a:effectLst>
  </p:spPr>
</p:sp>`

    // Remove glow (null) and update shadow
    const patched = patchElementEffects(xmlWithEffects, {
      shadow: {
        color: '#0000FF',
        blurRad: 99999,
        dist: 88888,
        dirDeg: 180,
      },
      glow: null,
    })

    expect(patched).toContain('<a:outerShdw blurRad="99999" dist="88888" dir="10800000"><a:srgbClr val="0000FF"/></a:outerShdw>')
    expect(patched).not.toContain('<a:glow')
  })
})

describe('Vertical text patch (patchBodyPrVert & setBodyPrVert)', () => {
  const shapeWithTxBody = `<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>
  <p:txBody>
    <a:bodyPr rtlCol="1"/>
    <a:p><a:r><a:t>Vertical Writing</a:t></a:r></a:p>
  </p:txBody>
</p:sp>`

  it('sets vert attribute on existing a:bodyPr', () => {
    const patched = patchBodyPrVert(shapeWithTxBody, 'vert')
    expect(patched).toContain('<a:bodyPr rtlCol="1" vert="vert"/>')
  })

  it('sets eaVert for East Asian vertical text', () => {
    const patched = patchBodyPrVert(shapeWithTxBody, 'eaVert')
    expect(patched).toContain('<a:bodyPr rtlCol="1" vert="eaVert"/>')
  })

  it('clears vert attribute when horz or null is passed', () => {
    const xmlWithVert = `<p:txBody><a:bodyPr vert="vert"/><a:p><a:r><a:t>Hi</a:t></a:r></a:p></p:txBody>`
    const cleared = patchBodyPrVert(xmlWithVert, 'horz')
    expect(cleared).not.toContain('vert=')
    expect(cleared).toContain('<a:bodyPr/>')
  })

  it('setBodyPrVert mutates slide model and triggers structureDirty', () => {
    const shapeEl: TextElement = {
      id: 'sp_1',
      type: 'shape',
      anchor: {
        spIndex: 0,
        originalXml: shapeWithTxBody,
        range: [0, shapeWithTxBody.length],
      },
      transform: {
        offset: { x: 0, y: 0, cx: 100, cy: 100 },
        rot: 0,
        flipH: false,
        flipV: false,
      },
      text: {
        paragraphs: [{ runs: [{ text: 'Hello' }] }],
      },
    }
    const slide: Slide = {
      path: 'ppt/slides/slide1.xml',
      originalXml: '',
      bodyPrefix: '',
      bodySuffix: '',
      elements: [shapeEl],
    }

    const ok = setBodyPrVert(slide, 'sp_1', 'vert')
    expect(ok).toBe(true)
    expect(slide.structureDirty).toBe(true)
    expect(shapeEl.text?.vert).toBe('vert')
    expect(shapeEl.anchor.originalXml).toContain('vert="vert"')

    // Reset to horz
    setBodyPrVert(slide, 'sp_1', 'horz')
    expect(shapeEl.text?.vert).toBeUndefined()
    expect(shapeEl.anchor.originalXml).not.toContain('vert=')
  })
})

const fx = (name: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', name))

describe('Cross-window copy/paste with media parts', () => {
  it('serializes and deserializes embedded mediaParts for cross-deck paste', async () => {
    const source = await openPptx(fx('01_standard_business.pptx'))
    const target = await openPptx(fx('05_unicode_cjk_emoji.pptx'))

    // Pick first element from source slide
    const el = source.deck.slides[0].elements[0]
    expect(el).toBeDefined()

    // 1. Copy
    const clipItem = copyElementData(source, source.deck.slides[0], el)
    expect(clipItem.xml).toBeDefined()

    // Simulate cross-process serialization through JSON buffer (as in OS clipboard)
    const serialized = JSON.stringify([clipItem])
    const deserialized = JSON.parse(serialized)

    // 2. Paste into target deck
    const beforeCount = target.deck.slides[0].elements.length
    const res = pasteElements(target, 0, deserialized, { dx: 1000, dy: 1000 })
    expect(res).not.toBeNull()
    expect(target.deck.slides[0].elements.length).toBe(beforeCount + 1)
  })
})
