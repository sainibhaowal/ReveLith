import { describe, it, expect } from 'vitest'
import { parseChartXml } from '../src/chart'
import type { Theme } from '../src/theme'

/**
 * Advanced chart fidelity: manual layouts, varyColors, and theme style
 * references (fillRef → fmtScheme) resolve into the model.
 */

const MANUAL_CHART = `<?xml version="1.0"?><c:chartSpace xmlns:c="c" xmlns:a="a"><c:chart><c:plotArea><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.1"/><c:y val="0.15"/><c:w val="0.7"/><c:h val="0.6"/></c:manualLayout></c:layout>
<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="1"/>
<c:ser><c:idx val="0"/><c:tx><c:v>S</c:v></c:tx>
<c:cat><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>A</c:v></c:pt><c:pt idx="1"><c:v>B</c:v></c:pt></c:strCache></c:cat>
<c:val><c:numCache><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt></c:numCache></c:val>
</c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea>
<c:legend><c:legendPos val="r"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.8"/><c:y val="0.2"/><c:w val="0.15"/><c:h val="0.5"/></c:manualLayout></c:layout></c:legend>
<c:title><c:tx><c:rich><a:p><a:r><a:t>T</a:t></a:r></a:p></c:rich></c:tx><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.3"/><c:y val="0.01"/><c:w val="0.4"/><c:h val="0.08"/></c:manualLayout></c:layout></c:title>
</c:chart></c:chartSpace>`

const FILLREF_CHART = `<?xml version="1.0"?><c:chartSpace xmlns:c="c" xmlns:a="a"><c:chart><c:plotArea>
<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>
<c:ser><c:idx val="0"/><c:tx><c:v>S</c:v></c:tx>
<c:spPr><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef></c:spPr>
<c:cat><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>A</c:v></c:pt></c:strCache></c:cat>
<c:val><c:numCache><c:ptCount val="1"/><c:pt idx="0"><c:v>1</c:v></c:pt></c:numCache></c:val>
</c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart></c:plotArea></c:chart></c:chartSpace>`

const theme: Theme = {
  colors: { accent1: '#FF0000' },
  fillStyles: [{ 'a:solidFill': { 'a:srgbClr': { '@_val': '00FF00' } } }],
} as unknown as Theme

describe('manualLayout parsing', () => {
  it('reads plot, legend and title layouts with edge modes', () => {
    const m = parseChartXml(MANUAL_CHART)!
    expect(m.plotLayout).toEqual({ x: 0.1, y: 0.15, w: 0.7, h: 0.6, xMode: 'edge', yMode: 'edge' })
    expect(m.legendLayout).toEqual({
      x: 0.8,
      y: 0.2,
      w: 0.15,
      h: 0.5,
      xMode: 'edge',
      yMode: 'edge',
    })
    expect(m.titleLayout).toEqual({
      x: 0.3,
      y: 0.01,
      w: 0.4,
      h: 0.08,
      xMode: 'edge',
      yMode: 'edge',
    })
  })

  it('charts without manualLayout stay auto', () => {
    const m = parseChartXml(MANUAL_CHART.replace(/<c:layout>[\s\S]*?<\/c:layout>/g, ''))!
    expect(m.plotLayout).toBeUndefined()
    expect(m.legendLayout).toBeUndefined()
    expect(m.titleLayout).toBeUndefined()
  })
})

describe('varyColors parsing', () => {
  it('flags single-series multi-color charts', () => {
    expect(parseChartXml(MANUAL_CHART)!.varyColors).toBe(true)
  })
})

describe('fillRef resolution', () => {
  it('resolves a series fillRef through the theme fmtScheme', () => {
    const m = parseChartXml(FILLREF_CHART, theme)!
    expect(m.series[0]!.color).toBe('#00FF00')
  })

  it('falls back to the palette without a theme', () => {
    const m = parseChartXml(FILLREF_CHART)!
    // fillRef idx=1 with no theme: ref color itself is unresolvable → undefined
    expect(m.series[0]!.color).toBeUndefined()
  })

  it('resolves the first gradient stop as the series color', () => {
    const xml = FILLREF_CHART.replace(
      '<a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>',
      '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="0000FF"/></a:gs>' +
        '<a:gs pos="100000"><a:srgbClr val="FF0000"/></a:gs></a:gsLst></a:gradFill>',
    )
    const m = parseChartXml(xml)!
    expect(m.series[0]!.color).toBe('#0000FF')
  })
})

describe('legend entry deletes', () => {
  const xml = MANUAL_CHART.replace(
    '<c:legendPos val="r"/>',
    '<c:legendPos val="r"/><c:legendEntry><c:idx val="0"/><c:delete val="1"/></c:legendEntry>',
  )
  it('parses deleted legend entry indexes', () => {
    expect(parseChartXml(xml)!.hiddenLegendEntries).toEqual([0])
  })

  it('absent deletes leave the field unset', () => {
    expect(parseChartXml(MANUAL_CHART)!.hiddenLegendEntries).toBeUndefined()
  })
})
