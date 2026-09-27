import { describe, expect, it } from 'vitest'
import { parseDocx } from '../src/index'
import type { TableModel } from '../src/index'
import { generateTableModelXml, mergeRPrModel } from '../src/generate'
import { buildDocx } from './helpers/build-docx'

function tableOf(doc: Awaited<ReturnType<typeof parseDocx>>): TableModel {
  const block = doc.blocks.find((b) => b.type === 'table')
  if (!block || block.type !== 'table') throw new Error('fixture has no table')
  return (block as { table: TableModel }).table
}

const FLOATING_TABLE_XML =
  '<w:tbl><w:tblPr>' +
  '<w:tblpPr w:leftFromText="180" w:rightFromText="180" w:topFromText="180" w:bottomFromText="180" ' +
  'w:horzAnchor="margin" w:tblpXSpec="right" w:vertAnchor="text"/>' +
  '<w:tblOverlap w:val="never"/>' +
  '</w:tblPr>' +
  '<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>' +
  '<w:tr><w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc>' +
  '<w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr>' +
  '</w:tbl>'

const VANISH_PARA_XML =
  '<w:p><w:r><w:t>visible </w:t></w:r>' +
  '<w:r><w:rPr><w:vanish/></w:rPr><w:t>secret</w:t></w:r></w:p>'

describe('floating tables (w:tblpPr)', () => {
  it('parses anchors, specs, margins and overlap into the model', async () => {
    const doc = await parseDocx(await buildDocx({ bodyXml: FLOATING_TABLE_XML }))
    const floating = tableOf(doc).floating
    expect(floating).toMatchObject({
      horizAnchor: 'margin',
      xSpec: 'right',
      vertAnchor: 'text',
      overlap: 'never',
      leftFromTextTwips: 180,
      rightFromTextTwips: 180,
      topFromTextTwips: 180,
      bottomFromTextTwips: 180,
    })
  })

  it('regenerates tblpPr + tblOverlap from the model', async () => {
    const doc = await parseDocx(await buildDocx({ bodyXml: FLOATING_TABLE_XML }))
    const xml = generateTableModelXml(tableOf(doc))
    expect(xml).toContain('<w:tblpPr')
    expect(xml).toContain('w:horzAnchor="margin"')
    expect(xml).toContain('w:tblpXSpec="right"')
    expect(xml).toContain('w:vertAnchor="text"')
    expect(xml).toContain('<w:tblOverlap w:val="never"/>')
  })

  it('absolute offsets round-trip', async () => {
    const xml = FLOATING_TABLE_XML.replace('w:tblpXSpec="right"', 'w:tblpX="1440" w:tblpY="720"')
    const doc = await parseDocx(await buildDocx({ bodyXml: xml }))
    const floating = tableOf(doc).floating
    expect(floating).toMatchObject({ xTwips: 1440, yTwips: 720 })
    expect(floating?.xSpec).toBeUndefined()
  })

  it('tables without tblpPr stay inline (no floating model)', async () => {
    const xml =
      '<w:tbl><w:tblPr><w:jc w:val="center"/></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid>' +
      '<w:tr><w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    const doc = await parseDocx(await buildDocx({ bodyXml: xml }))
    const table = tableOf(doc)
    expect(table.floating).toBeUndefined()
    expect(generateTableModelXml(table)).not.toContain('w:tblpPr')
  })
})

describe('hidden text (w:vanish)', () => {
  it('parses vanish runs into the model', async () => {
    const doc = await parseDocx(await buildDocx({ bodyXml: VANISH_PARA_XML }))
    const block = doc.blocks.find((b) => b.type === 'paragraph')
    if (!block || block.type !== 'paragraph') throw new Error('fixture has no paragraph')
    const runs = (block as { runs: Array<{ text: string; vanish?: boolean }> }).runs ?? []
    expect(runs.map((r) => r.text)).toEqual(['visible ', 'secret'])
    expect(runs[1]?.vanish).toBe(true)
    expect(runs[0]?.vanish).toBeUndefined()
  })

  it('mergeRPrModel keeps vanish when modeled, drops it when cleared', () => {
    const raw = '<w:rPr><w:vanish/></w:rPr>'
    expect(mergeRPrModel(raw, { text: 'secret', vanish: true }, false)).toContain('<w:vanish/>')
    expect(mergeRPrModel(raw, { text: 'secret' }, false)).not.toContain('w:vanish')
  })
})
