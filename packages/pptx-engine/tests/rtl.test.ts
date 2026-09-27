/**
 * Right-to-left support: <a:pPr rtl>, run <a:rtl/>, <a:bodyPr rtlCol>,
 * <a:tblPr rtl> parse → model → save round-trips, plus the direction toggle
 * ops (paragraph + table).
 */
import { describe, it, expect } from 'vitest'
import { parseSlide } from '../src/parse'
import {
  patchedElementXml,
  setBodyPrRtlCol,
  setElementParagraphFormat,
  setTableRtl,
} from '../src/index'
import { generateParagraphXml, generateRunXml } from '../src/generate'
import type { Slide, TableElement, TextElement } from '../src/types'

const slideWith = (sp: string) =>
  '<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld>' +
  `<p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${sp}</p:spTree></p:cSld></p:sld>`
const spWith = (txBodyInner: string) =>
  '<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>' +
  `<p:txBody>${txBodyInner}</p:txBody></p:sp>`

const parseOne = (txBodyInner: string) => {
  const slide = parseSlide({
    path: 'ppt/slides/slide1.xml',
    slideXml: slideWith(spWith(txBodyInner)),
    ctx: {},
  })
  return { slide, el: slide.elements[0] as TextElement }
}

const TABLE_FRAME = (tblPr: string) =>
  '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="T"/></p:nvGraphicFramePr>' +
  '<p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm>' +
  '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
  `<a:tbl>${tblPr}` +
  '<a:tblGrid><a:gridCol w="1828800"/></a:tblGrid>' +
  '<a:tr h="914400"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>x</a:t></a:r></a:p></a:txBody>' +
  '<a:tcPr/></a:tc></a:tr>' +
  '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>'

function parseTable(tblPr: string): { slide: Slide; el: TableElement } {
  const slide = parseSlide({
    path: 'ppt/slides/slide1.xml',
    slideXml: slideWith(TABLE_FRAME(tblPr)),
    ctx: {},
  })
  const el = slide.elements.find((e) => e.type === 'table') as TableElement | undefined
  if (!el) throw new Error('fixture has no table')
  return { slide, el }
}

describe('RTL parse', () => {
  it('reads pPr rtl + run a:rtl + bodyPr rtlCol', () => {
    const { el } = parseOne(
      '<a:bodyPr rtlCol="1"/>' +
        '<a:p><a:pPr rtl="1"/><a:r><a:rPr><a:rtl/></a:rPr><a:t>مرحبا</a:t></a:r></a:p>',
    )
    expect(el.text!.paragraphs[0]!.rtl).toBe(true)
    expect(el.text!.paragraphs[0]!.runs[0]!.rtl).toBe(true)
    expect(el.text!.rtlCol).toBe(true)
  })

  it('leaves rtl unset for plain LTR content', () => {
    const { el } = parseOne('<a:bodyPr/><a:p><a:r><a:t>Hello</a:t></a:r></a:p>')
    expect(el.text!.paragraphs[0]!.rtl).toBeUndefined()
    expect(el.text!.paragraphs[0]!.runs[0]!.rtl).toBeUndefined()
    expect(el.text!.rtlCol).toBeUndefined()
  })

  it('reads tblPr rtl on tables', () => {
    const { el } = parseTable('<a:tblPr rtl="1"/>')
    expect(el.rtl).toBe(true)
  })

  it('tables without rtl stay unset', () => {
    const { el } = parseTable('<a:tblPr firstRow="1"/>')
    expect(el.rtl).toBeUndefined()
  })
})

describe('RTL generate', () => {
  it('emits rtl="1" only for explicit rtl paragraphs', () => {
    const rtl = generateParagraphXml({
      runs: [{ text: 'x' }],
      rtl: true,
      pPrExplicit: { rtl: true },
    })
    expect(rtl).toContain('rtl="1"')
    const inherited = generateParagraphXml({ runs: [{ text: 'x' }], rtl: true })
    expect(inherited).toContain('rtl="1"')
    const plain = generateParagraphXml({ runs: [{ text: 'x' }] })
    expect(plain).not.toContain('rtl=')
  })

  it('emits <a:rtl/> for complex-script runs', () => {
    expect(generateRunXml({ text: 'x', rtl: true })).toContain('<a:rtl/>')
    expect(generateRunXml({ text: 'x' })).not.toContain('<a:rtl/>')
  })
})

describe('direction toggle ops', () => {
  it('setElementParagraphFormat direction sets and clears rtl="1" (run bytes untouched)', () => {    const RUN = '<a:r><a:rPr sz="1800"/><a:t>مرحبا</a:t></a:r>'
    const { slide, el } = parseOne(`<a:bodyPr/><a:p>${RUN}</a:p>`)
    expect(setElementParagraphFormat(slide, el.id, { direction: 'rtl' })).toBe(true)
    expect(el.text!.paragraphs[0]!.rtl).toBe(true)
    const out = patchedElementXml(el)
    expect(out).toContain('rtl="1"')
    expect(out).toContain(RUN)

    expect(setElementParagraphFormat(slide, el.id, { direction: 'ltr' })).toBe(true)
    expect(el.text!.paragraphs[0]!.rtl).toBe(false)
    expect(patchedElementXml(el)).not.toContain('rtl=')
  })

  it('setTableRtl toggles tblPr rtl and the model flag', () => {
    const { slide, el } = parseTable('<a:tblPr firstRow="1"/>')
    expect(setTableRtl(slide, el.id, true)).toBe(true)
    expect(el.rtl).toBe(true)
    expect(el.anchor.originalXml).toContain('rtl="1"')
    expect(el.anchor.originalXml).toContain('firstRow="1"')
    expect(setTableRtl(slide, el.id, false)).toBe(true)
    expect(el.rtl).toBeUndefined()
    expect(el.anchor.originalXml).not.toContain('rtl=')
  })

  it('setTableRtl creates tblPr when absent', () => {    const slide = parseSlide({
      path: 'ppt/slides/slide1.xml',
      slideXml: slideWith(
        TABLE_FRAME('')
          .replace('<a:tbl>', '<a:tbl>')
          .replace(/<a:tblPr[^>]*\/>/, ''),
      ),
      ctx: {},
    })
    const el = slide.elements.find((e) => e.type === 'table') as TableElement | undefined
    if (!el) throw new Error('fixture has no table')
    expect(setTableRtl(slide, el.id, true)).toBe(true)
    expect(el.anchor.originalXml).toContain('<a:tblPr rtl="1"/>')
  })

  it('setBodyPrRtlCol toggles the text-frame column flag with the model', () => {
    const { slide, el } = parseOne('<a:bodyPr/><a:p><a:r><a:t>x</a:t></a:r></a:p>')
    expect(setBodyPrRtlCol(slide, el.id, true)).toBe(true)
    expect(el.anchor.originalXml).toContain('rtlCol="1"')
    expect(el.text!.rtlCol).toBe(true)
    expect(setBodyPrRtlCol(slide, el.id, false)).toBe(true)
    expect(el.anchor.originalXml).not.toContain('rtlCol=')
    expect(el.text!.rtlCol).toBeUndefined()
  })

  it('paragraph direction + frame flag compose a complete RTL text frame', () => {
    const { slide, el } = parseOne('<a:bodyPr/><a:p><a:r><a:t>x</a:t></a:r></a:p>')
    expect(setElementParagraphFormat(slide, el.id, { direction: 'rtl' })).toBe(true)
    expect(setBodyPrRtlCol(slide, el.id, true)).toBe(true)
    const out = patchedElementXml(el)
    expect(out).toContain('rtl="1"')
    expect(out).toContain('rtlCol="1"')
  })
})
