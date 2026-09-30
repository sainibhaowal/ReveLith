import { describe, it, expect } from 'vitest'
import type { ChartModel } from '@revelith/pptx-engine'
import {
  applyManualPlot,
  buildChartNode,
  layoutLegendFlow,
  legendIsRtl,
  legendOrigin,
} from '../src/build-chart'
import { HeuristicMetrics } from '../src/metrics'
import { makeViewport } from '../src/coords'

/**
 * Chart fidelity rendering: manual plot frames, RTL legend flow, and
 * varyColors palette cycling.
 */

const vp = makeViewport({ cx: 12192000, cy: 6858000 }, 1280)
const metrics = new HeuristicMetrics()
const box = {
  x: 0,
  y: 0,
  w: 600,
  h: 400,
  centerX: 300,
  centerY: 200,
  rotationDeg: 0,
  flipH: false,
  flipV: false,
}

function barModel(overrides: Partial<ChartModel> = {}): ChartModel {
  return {
    kind: 'bar',
    categories: ['A', 'B', 'C'],
    series: [{ name: 'S', values: [10, 20, 30] }],
    ...overrides,
  } as ChartModel
}

describe('applyManualPlot', () => {
  const auto = { x: 50, y: 40, w: 400, h: 300 }
  const frame = { w: 600, h: 400 }

  it('passes auto layout through when absent', () => {
    expect(applyManualPlot(undefined, auto, frame)).toEqual(auto)
  })

  it('edge mode takes fractions of the chart box', () => {
    const out = applyManualPlot(
      { x: 0.1, y: 0.2, w: 0.7, h: 0.6, xMode: 'edge', yMode: 'edge' },
      auto,
      frame,
    )
    expect(out).toEqual({ x: 60, y: 80, w: 420, h: 240 })
  })

  it('factor mode scales the auto frame (1 = default)', () => {
    const out = applyManualPlot(
      { x: 1, y: 1, w: 1, h: 1, xMode: 'factor', yMode: 'factor' },
      auto,
      frame,
    )
    expect(out).toEqual(auto)
    const half = applyManualPlot(
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5, xMode: 'factor', yMode: 'factor' },
      auto,
      frame,
    )
    expect(half).toEqual({ x: 25, y: 20, w: 200, h: 150 })
  })
})

describe('legend flow', () => {
  it('LTR: swatches left of labels, flowing left to right', () => {
    const placed = layoutLegendFlow([50, 60], [30, 40], 100, 10, false)
    expect(placed).toEqual([
      { swX: 100, labelX: 114 },
      { swX: 150, labelX: 164 },
    ])
  })

  it('RTL: items run right to left with swatches right of labels', () => {
    const placed = layoutLegendFlow([50, 60], [30, 40], 100, 10, true)
    // total 110 → spans [160,210] and [100,160]
    expect(placed[0]).toEqual({ swX: 160 + 30 + 4, labelX: 160 })
    expect(placed[1]).toEqual({ swX: 100 + 40 + 4, labelX: 100 })
  })

  it('detects RTL label sets', () => {
    expect(legendIsRtl(['Sales', 'Cost'])).toBe(false)
    expect(legendIsRtl(['מכירות', 'עלות'])).toBe(true)
    expect(legendIsRtl([])).toBe(false)
  })

  it('legendOrigin honors edge mode and passes auto through', () => {
    expect(legendOrigin(undefined, 10, 20, box)).toEqual({ x: 10, y: 20 })
    expect(
      legendOrigin({ x: 0.8, y: 0.2, w: 0.1, h: 0.5, xMode: 'edge', yMode: 'edge' }, 10, 20, box),
    ).toEqual({ x: 480, y: 80 })
  })
})

describe('varyColors bars', () => {
  it('cycles the palette per category for single-series charts', () => {
    const node = buildChartNode('c1', 's1', barModel({ varyColors: true }), box, vp, metrics)!
    const colors = node.bars.map((b) => b.color)
    expect(colors).toEqual(['#4472C4', '#ED7D31', '#A5A5A5'])
  })

  it('keeps the series color without varyColors', () => {
    const node = buildChartNode('c1', 's1', barModel(), box, vp, metrics)!
    for (const b of node.bars) expect(b.color).toBe('#4472C4')
  })

  it('explicit per-point colors still win over varyColors', () => {
    const node = buildChartNode(
      'c1',
      's1',
      barModel({
        varyColors: true,
        series: [{ name: 'S', values: [10, 20, 30], pointColors: [undefined, '#123456'] }],
      }),
      box,
      vp,
      metrics,
    )!
    expect(node.bars.map((b) => b.color)).toEqual(['#4472C4', '#123456', '#A5A5A5'])
  })
})

describe('manual plot on a real chart', () => {
  it('moves the data frame to the manual box', () => {
    const plain = buildChartNode('c1', 's1', barModel(), box, vp, metrics)!
    const manual = buildChartNode(
      'c1',
      's1',
      barModel({ plotLayout: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }),
      box,
      vp,
      metrics,
    )!
    const plainX = plain.bars.map((b) => b.x)
    const manualX = manual.bars.map((b) => b.x)
    // manual plot starts at 10% of 600 = 60
    expect(Math.min(...manualX)).toBeGreaterThanOrEqual(60)
    expect(JSON.stringify(manualX)).not.toBe(JSON.stringify(plainX))
  })
})

describe('RTL legend on a pie chart', () => {
  function pieModel(categories: string[]): ChartModel {
    return {
      kind: 'pie',
      categories,
      series: [{ name: 'S', values: categories.map(() => 10) }],
      legendPos: 'b',
    } as ChartModel
  }

  it('mirrors swatches right of labels for RTL categories', () => {
    const node = buildChartNode('c1', 's1', pieModel(['מכירות', 'עלות']), box, vp, metrics)!
    expect(node.swatches.length).toBe(2)
    // first item (rightmost in RTL flow) sits right of the second
    expect(node.swatches[0]!.x).toBeGreaterThan(node.swatches[1]!.x)
    const labels = node.labels.filter((l) => ['מכירות', 'עלות'].includes(l.text))
    expect(labels).toHaveLength(2)
    // each swatch sits right of its own label
    const swByColor = new Map(node.swatches.map((s) => [s.color, s.x]))
    // labels carry series colors in order; swatch 0 pairs with label 'מכירות'
    expect(swByColor.get(node.swatches[0]!.color)).toBeGreaterThan(
      labels.find((l) => l.text === 'מכירות')!.x,
    )
  })

  it('keeps LTR order for Latin categories', () => {
    const node = buildChartNode('c1', 's1', pieModel(['Sales', 'Cost']), box, vp, metrics)!
    expect(node.swatches[0]!.x).toBeLessThan(node.swatches[1]!.x)
  })
})

describe('hidden legend entries', () => {
  function pieModelHidden(): ChartModel {
    return {
      kind: 'pie',
      categories: ['A', 'B', 'C'],
      series: [{ name: 'S', values: [10, 20, 30] }],
      legendPos: 'b',
      hiddenLegendEntries: [1],
    } as ChartModel
  }

  it('skips deleted entries in the legend but keeps wedge colors', () => {
    const node = buildChartNode('c1', 's1', pieModelHidden(), box, vp, metrics)!
    expect(node.swatches).toHaveLength(2)
    // wedges still render all three slices
    expect(node.wedges!.length).toBe(3)
  })
})

describe('radar manual plot', () => {
  function radarModel(overrides: Partial<ChartModel> = {}): ChartModel {
    return {
      kind: 'radar',
      categories: ['A', 'B', 'C', 'D', 'E', 'F'],
      series: [{ name: 'S', values: [1, 2, 3, 2, 1, 2] }],
      ...overrides,
    } as ChartModel
  }

  it('recenters and rescales the radar on a manual box', () => {
    const plain = buildChartNode('c1', 's1', radarModel(), box, vp, metrics)!
    const manual = buildChartNode(
      'c1',
      's1',
      radarModel({ plotLayout: { x: 0.5, y: 0, w: 0.5, h: 1 } }),
      box,
      vp,
      metrics,
    )!
    const plainCx = plain.polylines[0]!.points.filter((_, i) => i % 2 === 0)
    const manualCx = manual.polylines[0]!.points.filter((_, i) => i % 2 === 0)
    // manual box starts at x=300: ring points shift right
    expect(Math.min(...manualCx)).toBeGreaterThan(Math.min(...plainCx))
  })
})
