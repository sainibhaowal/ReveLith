import { describe, it, expect } from 'vitest'
import type { ChartModel } from '@revelith/pptx-engine'
import { chartStyleInfo } from '../src/build-slide'

/**
 * ChartModel → Ribbon style summary: every Change-Type dialog entry must come
 * back identically, otherwise the dialog highlights the wrong card (e.g. a
 * percent-stacked chart showing as "Stacked Column", a horizontal bar chart
 * showing as "Clustered Column").
 */

function model(overrides: Partial<ChartModel>): ChartModel {
  return {
    kind: 'bar',
    categories: ['A', 'B'],
    series: [{ name: 'S', values: [1, 2] }],
    ...overrides,
  } as ChartModel
}

describe('chartStyleInfo kind mapping', () => {
  it('maps bar variants without collapsing subdivisions', () => {
    expect(chartStyleInfo(model({})).kind).toBe('bar')
    expect(chartStyleInfo(model({ grouping: 'stacked' })).kind).toBe('barStacked')
    expect(chartStyleInfo(model({ grouping: 'percentStacked' })).kind).toBe('barPercentStacked')
    expect(chartStyleInfo(model({ barDir: 'bar' })).kind).toBe('barH')
  })

  it('keeps combos intact', () => {
    const m = model({
      series: [
        { name: 'A', values: [1, 2] },
        { name: 'B', values: [3, 4], plotKind: 'line' },
      ],
    })
    expect(chartStyleInfo(m).kind).toBe('comboBarLine')
  })

  it('maps pie variants by hole size', () => {
    expect(chartStyleInfo(model({ kind: 'pie' })).kind).toBe('pie')
    expect(chartStyleInfo(model({ kind: 'pie', holePct: 50 })).kind).toBe('doughnut')
  })

  it('passes line/area/pieOfPie/scatter/radar through', () => {
    for (const kind of ['line', 'area', 'scatter', 'radar', 'funnel'] as const) {
      expect(chartStyleInfo(model({ kind })).kind).toBe(kind)
    }
  })
})
