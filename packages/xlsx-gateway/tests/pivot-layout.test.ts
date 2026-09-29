import { describe, expect, it } from 'vitest'
import {
  AGG_CAPTIONS,
  areasOverlap,
  buildPivotLayout,
  PIVOT_SOURCE_COL_LIMIT,
  PIVOT_SOURCE_ROW_LIMIT,
  PivotLayoutError,
  pivotOutputArea,
} from '../src/domain/pivot-layout'
import type { PivotScalar } from '../src/domain/pivot-layout'

const grid = (rows: PivotScalar[][]): PivotScalar[][] => rows

/** Region / product / amount, the canonical three-column pivot source. */
const SOURCE = grid([
  ['Region', 'Product', 'Amount'],
  ['North', 'Widget', 100],
  ['North', 'Gadget', 50],
  ['South', 'Widget', 200],
  ['South', 'Gadget', 25],
])

describe('pivot layout: shape', () => {
  it('emits a header, one row per member, and a grand total', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    // header + North + South + grand total
    expect(layout.matrix).toHaveLength(4)
    expect(layout.matrix[0]).toEqual(['Region', 'Sum of Amount'])
    expect(layout.height).toBe(4)
    expect(layout.width).toBe(2)
  })

  it('sums per member and across the whole table', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    expect(layout.matrix[1]).toEqual(['North', 150])
    expect(layout.matrix[2]).toEqual(['South', 225])
    expect(layout.matrix[3]).toEqual(['Grand Total', 375])
  })

  it('aggregates the other ways', () => {
    const spec = (agg: 'count' | 'average' | 'max' | 'min') => {
      const layout = buildPivotLayout(SOURCE, {
        rowFields: 'Region',
        values: [{ field: 'Amount', agg }],
      })
      return layout.matrix[1]![1]
    }
    expect(spec('count')).toBe(2)
    expect(spec('average')).toBe(75)
    expect(spec('max')).toBe(100)
    expect(spec('min')).toBe(50)
  })

  it('names every aggregation in the header caption', () => {
    expect(AGG_CAPTIONS).toEqual({
      sum: 'Sum',
      count: 'Count',
      average: 'Average',
      max: 'Max',
      min: 'Min',
    })
  })

  it('counts non-empty cells, not rows', () => {
    const gapped = grid([
      ['Region', 'Amount'],
      ['North', 1],
      ['South', null],
      ['East', ''],
    ])
    const layout = buildPivotLayout(gapped, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'count' }],
    })
    // only the row with a value counts
    expect(layout.matrix[1]![1]).toBe(1)
  })

  it('coerces numeric text, matching a later refresh', () => {
    const text = grid([
      ['Region', 'Amount'],
      ['North', '100'],
      ['North', '50'],
    ])
    const layout = buildPivotLayout(text, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    expect(layout.matrix[1]![1]).toBe(150)
  })

  it('returns null rather than 0 for an aggregate over no numbers', () => {
    const blanks = grid([
      ['Region', 'Amount'],
      ['North', null],
    ])
    const layout = buildPivotLayout(blanks, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'average' }],
    })
    expect(layout.matrix[1]![1]).toBeNull()
  })
})

describe('pivot layout: two row levels', () => {
  it('inserts a subtotal row for the non-leaf level', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: ['Region', 'Product'],
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    // header, then 2 leaf rows per region, 2 subtotals, and the grand total
    expect(layout.height).toBe(8)
    const kinds = layout.definition.rowLines.map((l) => l.t)
    expect(kinds).toEqual(['data', 'data', 'default', 'data', 'data', 'default'])
  })

  it('totals the subtotal rows correctly', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: ['Region', 'Product'],
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    const subtotalRows = layout.matrix.filter((row) => row[1] === 'Subtotal')
    expect(subtotalRows.map((r) => r[2])).toEqual([150, 225])
  })

  it('accepts a bare string or a one-element array for a single level', () => {
    const bare = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    const array = buildPivotLayout(SOURCE, {
      rowFields: ['Region'],
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    expect(array.matrix).toEqual(bare.matrix)
  })
})

describe('pivot layout: column dimension', () => {
  it('spreads a value across column members and appends a grand total', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      columnField: 'Product',
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    // header row(s) + North + South + grand total
    expect(layout.height).toBe(4)
    // row label, then the two column members in first-seen order
    // (Widget appears first in the source), then the grand total
    expect(layout.width).toBe(4)
    expect(layout.matrix.at(-1)).toEqual(['Grand Total', 300, 75, 375])
  })

  it('records a single column field by index', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      columnField: 'Product',
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    expect(layout.definition.columnFieldIndex).toBe(1)
    expect(layout.definition.columnItems).toEqual(['Widget', 'Gadget'])
    // grand total last, so the row before it is the final data row
    expect(layout.matrix.at(-2)?.[0]).toBe('South')
  })

  it('emits no per-column number formats, since one format cannot cover them', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      columnField: 'Product',
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    expect(layout.numberFormats).toEqual([])
  })
})

describe('pivot layout: show data as', () => {
  it('divides by the whole table for percentOfTotal', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'sum', showDataAs: 'percentOfTotal' }],
    })
    expect(layout.matrix[1]![1]).toBeCloseTo(150 / 375, 10)
  })

  it('divides by the row bucket for percentOfRow', () => {
    // "Show as % of row total" needs something varying within the row, which
    // is the column dimension. Without one, each row is its own whole and
    // every cell would be 1.
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      columnField: 'Product',
      values: [{ field: 'Amount', agg: 'sum', showDataAs: 'percentOfRow' }],
    })
    // North: Widget 100/150 and Gadget 50/150, then the row total as 1
    const north = layout.matrix.find((row) => row[0] === 'North')
    expect(north![1]).toBeCloseTo(100 / 150, 10)
    expect(north![2]).toBeCloseTo(50 / 150, 10)
    expect(north![3]).toBeCloseTo(1, 10)
  })

  it('returns null when the base is zero rather than a misleading 0%', () => {
    const zeros = grid([
      ['Region', 'Amount'],
      ['North', 0],
    ])
    const layout = buildPivotLayout(zeros, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'sum', showDataAs: 'percentOfTotal' }],
    })
    expect(layout.matrix[1]![1]).toBeNull()
  })

  it('defaults a percent mode to a 0.00% format', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'sum', showDataAs: 'percentOfTotal' }],
    })
    expect(layout.numberFormats).toEqual([{ columnOffset: 1, format: '0.00%' }])
  })
})

describe('pivot layout: filters', () => {
  it('hides members a label filter excludes, and records their indexes', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'sum' }],
      filters: [{ kind: 'label', field: 'Region', op: 'equal', value: 'North' }],
    })
    expect(layout.matrix.some((row) => row[0] === 'South')).toBe(false)
    expect(layout.definition.filters).toHaveLength(1)
    expect(layout.definition.rowHiddenItems).toEqual([[1]])
  })

  it('excludes a filtered-out region from the grand total', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'sum' }],
      filters: [{ kind: 'label', field: 'Region', op: 'equal', value: 'North' }],
    })
    expect(layout.matrix.at(-1)![1]).toBe(150)
  })

  it('omits filter fields entirely when nothing is filtered', () => {
    const layout = buildPivotLayout(SOURCE, {
      rowFields: 'Region',
      values: [{ field: 'Amount', agg: 'sum' }],
    })
    expect(layout.definition.filters).toBeUndefined()
    expect(layout.definition.rowHiddenItems).toBeUndefined()
  })
})

describe('pivot layout: rejections', () => {
  const expectCode = (fn: () => unknown, code: string) => {
    try {
      fn()
      throw new Error(`expected ${code} but nothing was thrown`)
    } catch (e) {
      expect(e).toBeInstanceOf(PivotLayoutError)
      expect((e as PivotLayoutError).code).toBe(code)
    }
  }

  it('needs a header row plus at least one data row', () => {
    expectCode(() => buildPivotLayout([['A']], { rowFields: 'A', values: [] }), 'sourceNeedsRows')
  })

  it('rejects a blank header cell', () => {
    expectCode(
      () =>
        buildPivotLayout(
          [
            ['Region', '  '],
            ['North', 1],
          ],
          { rowFields: 'Region', values: [{ field: 'Region', agg: 'count' }] },
        ),
      'headerBlank',
    )
  })

  it('rejects duplicate headers, case-insensitively', () => {
    expectCode(
      () =>
        buildPivotLayout(
          [
            ['Region', 'region'],
            ['North', 1],
          ],
          { rowFields: 'Region', values: [{ field: 'Region', agg: 'count' }] },
        ),
      'headerDuplicate',
    )
  })

  it('names the field that is not a header', () => {
    try {
      buildPivotLayout(SOURCE, {
        rowFields: 'Nowhere',
        values: [{ field: 'Amount', agg: 'sum' }],
      })
      throw new Error('expected a rejection')
    } catch (e) {
      expect((e as PivotLayoutError).code).toBe('fieldNotHeader')
      expect((e as Error).message).toContain('Nowhere')
    }
  })

  it('rejects a calculated field that shadows a header', () => {
    expectCode(
      () =>
        buildPivotLayout(SOURCE, {
          rowFields: 'Region',
          // the calculated field is named after a header it would shadow
          values: [{ field: 'Amount', agg: 'sum', formula: 'Amount' }],
        }),
      'calcFieldNameClash',
    )
  })

  it('rejects duplicate calculated field names', () => {
    expectCode(
      () =>
        buildPivotLayout(SOURCE, {
          rowFields: 'Region',
          values: [
            { field: 'X', agg: 'sum', formula: 'Amount' },
            { field: 'x', agg: 'sum', formula: 'Amount' },
          ],
        }),
      'calcFieldNameDuplicate',
    )
  })

  it('caps the source size and reports it', () => {
    expect(PIVOT_SOURCE_ROW_LIMIT).toBe(10_001)
    expect(PIVOT_SOURCE_COL_LIMIT).toBe(200)
  })
})

describe('pivot output placement', () => {
  const layout = buildPivotLayout(SOURCE, {
    rowFields: 'Region',
    values: [{ field: 'Amount', agg: 'sum' }],
  })

  it('places the grid from the anchor and its own size', () => {
    expect(pivotOutputArea({ row: 4, column: 2 }, layout)).toEqual({
      startRow: 4,
      startColumn: 2,
      endRow: 4 + layout.height - 1,
      endColumn: 2 + layout.width - 1,
    })
  })

  it('detects overlap, including a single shared cell', () => {
    const a = { startRow: 0, startColumn: 0, endRow: 2, endColumn: 2 }
    expect(areasOverlap(a, { startRow: 2, startColumn: 2, endRow: 5, endColumn: 5 })).toBe(true)
    expect(areasOverlap(a, { startRow: 3, startColumn: 0, endRow: 5, endColumn: 2 })).toBe(false)
  })

  it('treats edge adjacency as no overlap', () => {
    // a pivot may sit immediately below its source
    const source = { startRow: 0, startColumn: 0, endRow: 2, endColumn: 2 }
    const below = { startRow: 3, startColumn: 0, endRow: 6, endColumn: 2 }
    expect(areasOverlap(source, below)).toBe(false)
  })
})
