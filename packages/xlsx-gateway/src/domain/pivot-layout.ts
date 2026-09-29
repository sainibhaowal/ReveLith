/**
 * Pivot layout: from a source grid, both the output the app bakes into cells and
 * the definition the gateway writes as OOXML.
 *
 * Pure, and shared on purpose: the app and the headless CLI both call this and
 * then place the result on a sheet, so there is one definition of what a pivot
 * looks like rather than two that drift.
 */
import { allowedByValueFilter, matchesLabelFilter, type PivotFilterDef } from './pivot-filters'
import { evaluatePivotFormula, parsePivotFormula } from './pivot-formula'
import { groupValue, type PivotFieldGrouping } from './pivot-grouping'
import type { AddPivotOperation } from './workbook-dsl'

export type PivotScalar = string | number | boolean | null

/**
 * Numeric coercion, mirroring the pivot engine so the grid baked here and a
 * later refresh total the same thing. A cell holding the text "42" is a number
 * to both; blank, empty and unparseable cells are not.
 */
function numericValue(value: PivotScalar): number | null {
  if (value === null || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(numeric) ? numeric : null
}

/**
 * Every way a layout can be rejected. Each code carries a message a person can
 * act on, because a pivot that silently produces an empty grid is worse than one
 * that says which field name was not a header.
 */
export type PivotLayoutErrorCode =
  | 'sourceNeedsRows'
  | 'sourceRowLimit'
  | 'sourceColLimit'
  | 'headerBlank'
  | 'headerDuplicate'
  | 'fieldNotHeader'
  | 'calcFieldNameClash'
  | 'calcFieldNameDuplicate'
  | 'valueFilterFieldMissing'
  | 'tooManyRowItems'
  | 'tooManyColItems'
  | 'tooManyColLines'
  | 'tooManyRowLines'
  | 'needsValues'

const MESSAGES: Record<PivotLayoutErrorCode, string> = {
  sourceNeedsRows: 'The pivot source needs a header row plus data rows.',
  sourceRowLimit: 'The pivot source is limited to 10,000 data rows.',
  sourceColLimit: 'The pivot source is limited to 200 columns.',
  headerBlank: 'Every source header cell must be non-blank.',
  headerDuplicate: 'Source header names must be unique.',
  fieldNotHeader: 'Field "{label}" is not a source header.',
  calcFieldNameClash: 'The calculated field "{name}" cannot share a name with a source header.',
  calcFieldNameDuplicate: 'Calculated field names must be unique.',
  valueFilterFieldMissing: 'The value filter references value field {index}, which does not exist.',
  tooManyRowItems: 'The pivot has more than 10,000 row items.',
  tooManyColItems: 'The pivot has more than 1,000 column items.',
  tooManyColLines: 'The pivot has more than 1,000 column lines.',
  tooManyRowLines: 'The pivot has more than 20,000 row lines.',
  needsValues: 'The pivot needs one values entry.',
}

export class PivotLayoutError extends Error {
  constructor(
    readonly code: PivotLayoutErrorCode,
    readonly params: Record<string, string | number> = {},
  ) {
    super(
      MESSAGES[code].replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`)),
    )
    this.name = 'PivotLayoutError'
  }
}

export interface PivotLayoutLabels {
  readonly subtotal: string
  readonly grandTotal: string
}

export interface PivotLayoutValue {
  fieldIndex: number
  agg: 'sum' | 'count' | 'average' | 'max' | 'min'
  numFmt?: string | undefined
  showDataAs?: 'percentOfTotal' | 'percentOfRow' | 'percentOfCol' | undefined
  formula?: string | undefined
  calcName?: string | undefined
}

/** One output line: either a data row/column, or a default (subtotal) line. */
export interface PivotLayoutLine {
  t: 'data' | 'default'
  members: number[]
}

/**
 * The sheet-independent half of a pivot addition: what the OOXML definition
 * needs. Mutable so it feeds the app's edit journal unchanged.
 */
export interface PivotLayoutDefinition {
  fieldNames: string[]
  rowFieldIndices: number[]
  columnFieldIndex?: number | undefined
  pageFieldIndices?: number[] | undefined
  rowItems: string[]
  rowLevelItems: string[][]
  rowLines: PivotLayoutLine[]
  columnItems?: string[] | undefined
  columnFieldIndices?: number[] | undefined
  colLevelItems?: string[][] | undefined
  colLines?: PivotLayoutLine[] | undefined
  groupings?: ({ fieldIndex: number } & PivotFieldGrouping)[] | undefined
  filters?: PivotFilterDef[] | undefined
  rowHiddenItems?: number[][] | undefined
  colHiddenItems?: number[][] | undefined
  values: PivotLayoutValue[]
}

export interface PivotLayout {
  readonly definition: PivotLayoutDefinition
  /** baked output grid, header rows first, grand total last */
  readonly matrix: readonly (readonly (string | number | null)[])[]
  readonly width: number
  readonly height: number
  /**
   * Number formats for value columns, offset from the anchor column. Only
   * populated without column dimensions, since with them every value cell sits
   * in the same column and one format cannot describe them all.
   */
  readonly numberFormats: readonly { readonly columnOffset: number; readonly format: string }[]
}

export type PivotLayoutSpec = Pick<
  AddPivotOperation,
  'rowFields' | 'columnField' | 'pageFields' | 'values' | 'groupings' | 'filters'
>

export const AGG_CAPTIONS: Record<PivotLayoutValue['agg'], string> = {
  sum: 'Sum',
  count: 'Count',
  average: 'Average',
  max: 'Max',
  min: 'Min',
}

export const PIVOT_SOURCE_ROW_LIMIT = 10_001
export const PIVOT_SOURCE_COL_LIMIT = 200

export function buildPivotLayout(
  grid: readonly (readonly PivotScalar[])[],
  op: PivotLayoutSpec,
  labels: PivotLayoutLabels = { subtotal: 'Subtotal', grandTotal: 'Grand Total' },
): PivotLayout {
  if (grid.length < 2) throw new PivotLayoutError('sourceNeedsRows')
  if (grid.length > PIVOT_SOURCE_ROW_LIMIT) throw new PivotLayoutError('sourceRowLimit')
  if ((grid[0]?.length ?? 0) > PIVOT_SOURCE_COL_LIMIT) throw new PivotLayoutError('sourceColLimit')

  const fieldNames = (grid[0] ?? []).map((value) => String(value ?? '').trim())
  if (fieldNames.some((name) => name.length === 0)) throw new PivotLayoutError('headerBlank')
  // case-insensitive: two headers differing only in case produce a pivot whose
  // field references are ambiguous
  if (new Set(fieldNames.map((name) => name.toLowerCase())).size !== fieldNames.length) {
    throw new PivotLayoutError('headerDuplicate')
  }
  const fieldIndex = (label: string): number => {
    const index = fieldNames.indexOf(label)
    if (index < 0) throw new PivotLayoutError('fieldNotHeader', { label })
    return index
  }
  const rowFieldsArray = Array.isArray(op.rowFields) ? op.rowFields : [op.rowFields]
  const rowFieldIndices = rowFieldsArray.map(fieldIndex)
  const levels = rowFieldIndices.length
  const columnFieldsArray =
    op.columnField === undefined
      ? []
      : Array.isArray(op.columnField)
        ? op.columnField
        : [op.columnField]
  const columnFieldIndices = columnFieldsArray.map(fieldIndex)
  const colLevels = columnFieldIndices.length
  const pageFieldIndices = (op.pageFields ?? []).map(fieldIndex)
  const groupings = (op.groupings ?? []).map(({ field, ...rule }) => ({
    fieldIndex: fieldIndex(field),
    ...rule,
  }))
  const groupingByField = new Map<number, PivotFieldGrouping>()
  for (const { fieldIndex: groupedField, ...rule } of groupings) {
    groupingByField.set(groupedField, rule)
  }
  const dimGroupValue = (
    fieldIdx: number,
    row: readonly PivotScalar[],
  ): { label: string; sort: number | null } => {
    const grouping = groupingByField.get(fieldIdx)
    if (!grouping) return { label: String(row[fieldIdx] ?? ''), sort: null }
    return groupValue(grouping, row[fieldIdx])
  }
  const dimValue = (fieldIdx: number, row: readonly PivotScalar[]): string =>
    dimGroupValue(fieldIdx, row).label

  const valueSpecs = op.values.map((value) => {
    const isCalc = value.formula !== undefined
    // a calculated field shares the value namespace with the headers, so a
    // clash would make its own reference unresolvable
    if (
      isCalc &&
      fieldNames.some((name) => name.toLowerCase() === value.field.trim().toLowerCase())
    ) {
      throw new PivotLayoutError('calcFieldNameClash', { name: value.field })
    }
    return {
      fieldIndex: isCalc ? -1 : fieldIndex(value.field),
      agg: value.agg,
      // percent modes default to 0.00%, matching dataField numFmtId=10
      numFmt: value.numFmt ?? (value.showDataAs !== undefined ? '0.00%' : undefined),
      showDataAs: value.showDataAs,
      ...(isCalc ? { formula: value.formula, calcName: value.field } : {}),
      caption: `${AGG_CAPTIONS[value.agg]} of ${value.field}`,
      ast: isCalc ? parsePivotFormula(value.formula!, fieldNames) : null,
    }
  })
  const calcNameKeys = valueSpecs
    .filter((spec) => spec.calcName !== undefined)
    .map((spec) => spec.calcName!.trim().toLowerCase())
  if (new Set(calcNameKeys).size !== calcNameKeys.length) {
    throw new PivotLayoutError('calcFieldNameDuplicate')
  }

  // One globally deduplicated member list per level. First-seen order is the
  // sharedItems order the definition records.
  const levelItems: string[][] = rowFieldIndices.map(() => [])
  const comboKeys = new Set<string>()
  const colLevelItems: string[][] = columnFieldIndices.map(() => [])
  const colComboKeys = new Set<string>()
  const levelSortKeys: Map<string, number | null>[] = rowFieldIndices.map(() => new Map())
  const colLevelSortKeys: Map<string, number | null>[] = columnFieldIndices.map(() => new Map())
  // NUL-joined so two members whose concatenation is ambiguous cannot collide
  const joinPath = (path: readonly string[]): string => path.join('\u0000')
  const dataRows = grid.slice(1)
  for (const row of dataRows) {
    rowFieldIndices.forEach((fieldIdx, level) => {
      const { label: key, sort } = dimGroupValue(fieldIdx, row)
      if (!levelItems[level]!.includes(key)) {
        levelItems[level]!.push(key)
        levelSortKeys[level]!.set(key, sort)
      }
    })
    columnFieldIndices.forEach((fieldIdx, level) => {
      const { label: key, sort } = dimGroupValue(fieldIdx, row)
      if (!colLevelItems[level]!.includes(key)) {
        colLevelItems[level]!.push(key)
        colLevelSortKeys[level]!.set(key, sort)
      }
    })
  }
  // Grouped levels sort by bucket; pass-through values keep first-seen order
  // after them.
  const sortGroupedLevel = (
    items: string[],
    fieldIdx: number,
    sortKeys: Map<string, number | null>,
  ): void => {
    if (!groupingByField.has(fieldIdx)) return
    items.sort((a, b) => {
      const sortA = sortKeys.get(a) ?? null
      const sortB = sortKeys.get(b) ?? null
      if (sortA !== null && sortB !== null) return sortA - sortB
      if (sortA !== null) return -1
      if (sortB !== null) return 1
      return 0
    })
  }
  rowFieldIndices.forEach((fieldIdx, level) =>
    sortGroupedLevel(levelItems[level]!, fieldIdx, levelSortKeys[level]!),
  )
  columnFieldIndices.forEach((fieldIdx, level) =>
    sortGroupedLevel(colLevelItems[level]!, fieldIdx, colLevelSortKeys[level]!),
  )
  const rowItems = levelItems[0] ?? []
  if (levelItems.some((items) => items.length > 10_000)) {
    throw new PivotLayoutError('tooManyRowItems')
  }
  if (colLevelItems.some((items) => items.length > 1_000)) {
    throw new PivotLayoutError('tooManyColItems')
  }

  const aggregate = (
    rows: readonly (readonly PivotScalar[])[],
    spec: (typeof valueSpecs)[number],
  ): number | null => {
    if (spec.ast) {
      // a calculated field aggregates a whole row, so a field reference
      // resolves to that field's total across the rows in scope
      return evaluatePivotFormula(spec.ast, (name) => {
        const refIndex = fieldIndex(name)
        return rows
          .map((row) => numericValue(row[refIndex] ?? null))
          .filter((value): value is number => value !== null)
          .reduce((total, value) => total + value, 0)
      })
    }
    if (spec.agg === 'count') {
      return rows.filter((row) => row[spec.fieldIndex] != null && row[spec.fieldIndex] !== '')
        .length
    }
    const numbers = rows
      .map((row) => numericValue(row[spec.fieldIndex] ?? null))
      .filter((value): value is number => value !== null)
    if (numbers.length === 0) return null
    switch (spec.agg) {
      case 'sum':
        return numbers.reduce((total, value) => total + value, 0)
      case 'average':
        return numbers.reduce((total, value) => total + value, 0) / numbers.length
      case 'max':
        return numbers.reduce((max, value) => (value > max ? value : max))
      case 'min':
        return numbers.reduce((min, value) => (value < min ? value : min))
    }
  }

  const filterEntries: PivotFilterDef[] = (op.filters ?? []).map((filter) =>
    filter.kind === 'label'
      ? { kind: 'label', field: fieldIndex(filter.field), op: filter.op, value: filter.value }
      : {
          kind: 'value',
          field: fieldIndex(filter.field),
          dataField: filter.valueIndex,
          op: filter.op,
          ...(filter.count !== undefined ? { count: filter.count } : {}),
          ...(filter.from !== undefined ? { from: filter.from } : {}),
          ...(filter.to !== undefined ? { to: filter.to } : {}),
        },
  )
  // Label filters pick members outright; a value filter aggregates each
  // candidate over the label-filtered rows, so it has to run after them.
  const membersOfField = (fieldIdx: number): string[] => {
    const rowLevel = rowFieldIndices.indexOf(fieldIdx)
    if (rowLevel >= 0) return levelItems[rowLevel]!
    const colLevel = columnFieldIndices.indexOf(fieldIdx)
    return colLevel >= 0 ? colLevelItems[colLevel]! : []
  }
  const hiddenByField = new Map<number, Set<string>>()
  for (const filter of filterEntries) {
    if (filter.kind !== 'label') continue
    const hidden = hiddenByField.get(filter.field) ?? new Set<string>()
    for (const member of membersOfField(filter.field)) {
      if (!matchesLabelFilter(filter, member)) hidden.add(member)
    }
    hiddenByField.set(filter.field, hidden)
  }
  const rowVisible = (row: readonly PivotScalar[]): boolean => {
    for (const [fieldIdx, hidden] of hiddenByField) {
      if (hidden.has(dimValue(fieldIdx, row))) return false
    }
    return true
  }
  for (const filter of filterEntries) {
    if (filter.kind !== 'value') continue
    const spec = valueSpecs[filter.dataField]
    if (!spec) {
      throw new PivotLayoutError('valueFilterFieldMissing', { index: filter.dataField + 1 })
    }
    const labelRows = dataRows.filter(rowVisible)
    const hidden = hiddenByField.get(filter.field) ?? new Set<string>()
    const candidates = membersOfField(filter.field).filter((member) => !hidden.has(member))
    const totals = candidates.map((member) => ({
      key: member,
      total: aggregate(
        labelRows.filter((row) => dimValue(filter.field, row) === member),
        spec,
      ),
    }))
    const kept = allowedByValueFilter(filter, totals)
    for (const member of candidates) {
      if (!kept.has(member)) hidden.add(member)
    }
    hiddenByField.set(filter.field, hidden)
  }
  const visibleRows = dataRows.filter(rowVisible)
  // Members are hidden by index, because the definition indexes into the
  // sharedItems list rather than naming members.
  const hiddenIndexesOf = (
    fieldIndices: readonly number[],
    items: readonly (readonly string[])[],
  ): number[][] =>
    fieldIndices.map((fieldIdx, level) => {
      const hidden = hiddenByField.get(fieldIdx)
      if (!hidden) return []
      return (items[level] ?? []).flatMap((member, index) => (hidden.has(member) ? [index] : []))
    })
  const rowHiddenItems = hiddenIndexesOf(rowFieldIndices, levelItems)
  const colHiddenItems = hiddenIndexesOf(columnFieldIndices, colLevelItems)

  // Only combinations that actually occur become a line; a cartesian product
  // over all members would emit lines for members no row has.
  for (const row of visibleRows) {
    const path: string[] = []
    rowFieldIndices.forEach((fieldIdx) => {
      path.push(dimValue(fieldIdx, row))
      comboKeys.add(joinPath(path))
    })
    const colPath: string[] = []
    columnFieldIndices.forEach((fieldIdx) => {
      colPath.push(dimValue(fieldIdx, row))
      colComboKeys.add(joinPath(colPath))
    })
  }

  // Column lines, without the grand-total column: a data column at each leaf,
  // and a subtotal column after every non-leaf member.
  const colLines: PivotLayoutLine[] = []
  const colLinePaths: string[][] = []
  const emitColLevel = (path: string[], indices: number[], depth: number): void => {
    colLevelItems[depth]!.forEach((member, memberIndex) => {
      if (!colComboKeys.has(joinPath([...path, member]))) return
      if (depth === colLevels - 1) {
        colLines.push({ t: 'data', members: [...indices, memberIndex] })
        colLinePaths.push([...path, member])
      } else {
        emitColLevel([...path, member], [...indices, memberIndex], depth + 1)
        colLines.push({ t: 'default', members: [...indices, memberIndex] })
        colLinePaths.push([...path, member])
      }
    })
  }
  if (colLevels > 0) emitColLevel([], [], 0)
  if (colLines.length > 1_000) throw new PivotLayoutError('tooManyColLines')

  const bucketRows = (prefix: readonly string[], colPrefix: readonly string[]): PivotScalar[][] =>
    visibleRows.filter((row) => {
      for (let level = 0; level < prefix.length; level += 1) {
        if (dimValue(rowFieldIndices[level]!, row) !== prefix[level]) return false
      }
      for (let level = 0; level < colPrefix.length; level += 1) {
        if (dimValue(columnFieldIndices[level]!, row) !== colPrefix[level]) return false
      }
      return true
    }) as PivotScalar[][]

  const applyShowDataAs = (
    raw: number | null,
    spec: (typeof valueSpecs)[number],
    prefix: readonly string[],
    colPrefix: readonly string[],
  ): number | null => {
    if (spec.showDataAs === undefined || raw === null) return raw
    // the denominator is the whole bucket the cell sits in, computed by
    // dropping the level that varies within that bucket
    const base =
      spec.showDataAs === 'percentOfTotal'
        ? aggregate(bucketRows([], []), spec)
        : spec.showDataAs === 'percentOfRow'
          ? aggregate(bucketRows(prefix, []), spec)
          : aggregate(bucketRows([], colPrefix), spec)
    // a zero or empty base has no meaningful percentage; null says "not
    // computable" rather than showing a 0% that looks like a real value
    return base === null || base === 0 ? null : raw / base
  }

  const valueCells = (prefix: readonly string[]): (number | null)[] => {
    if (colLevels === 0) {
      return valueSpecs.map((spec) =>
        applyShowDataAs(aggregate(bucketRows(prefix, []), spec), spec, prefix, []),
      )
    }
    // with a column dimension, one value entry spreads across the column lines
    const spec = valueSpecs[0]
    if (!spec) throw new PivotLayoutError('needsValues')
    return [
      ...colLinePaths.map((colPrefix) =>
        applyShowDataAs(aggregate(bucketRows(prefix, colPrefix), spec), spec, prefix, colPrefix),
      ),
      applyShowDataAs(aggregate(bucketRows(prefix, []), spec), spec, prefix, []),
    ]
  }

  const matrix: (string | number | null)[][] = []
  if (colLevels === 0) {
    matrix.push([...rowFieldsArray, ...valueSpecs.map((spec) => spec.caption)])
  } else {
    const totalWidth = levels + colLines.length + 1
    const headers: (string | number | null)[][] = Array.from({ length: colLevels }, () =>
      new Array<string | number | null>(totalWidth).fill(null),
    )
    // row field names sit on the last header row, where they label the
    // leftmost columns
    rowFieldsArray.forEach((name, level) => {
      headers[colLevels - 1]![level] = name
    })
    let previousColPath: readonly string[] | null = null
    colLines.forEach((line, index) => {
      const colOffset = levels + index
      const path = colLinePaths[index]!
      if (line.t === 'default') {
        path.forEach((member, level) => {
          headers[level]![colOffset] = member
        })
        if (path.length < colLevels) headers[path.length]![colOffset] = labels.subtotal
        previousColPath = null
      } else {
        path.forEach((member, level) => {
          // a label already printed on the previous column carries down as
          // long as the prefix is unchanged, which is how a grouped header
          // spans its members instead of repeating
          if (previousColPath !== null && level < path.length - 1) {
            let samePrefix = true
            for (let k = 0; k <= level; k += 1) {
              if (previousColPath[k] !== path[k]) {
                samePrefix = false
                break
              }
            }
            if (samePrefix) return
          }
          headers[level]![colOffset] = member
        })
        previousColPath = path
      }
    })
    headers[0]![levels + colLines.length] = labels.grandTotal
    matrix.push(...headers)
  }
  const rowLines: PivotLayoutLine[] = []
  // A member label is held over to the row where it first becomes the leaf, so
  // an outer level is printed once rather than on every descendant row.
  const pendingLabels: (string | null)[] = new Array(Math.max(0, levels - 1)).fill(null)
  const emitLevel = (path: string[], indices: number[], depth: number): void => {
    levelItems[depth]!.forEach((member, memberIndex) => {
      if (!comboKeys.has(joinPath([...path, member]))) return
      if (depth === levels - 1) {
        const rowLabels: (string | null)[] = [...pendingLabels, member]
        pendingLabels.fill(null)
        matrix.push([...rowLabels, ...valueCells([...path, member])])
        rowLines.push({ t: 'data', members: [...indices, memberIndex] })
      } else {
        pendingLabels[depth] = member
        emitLevel([...path, member], [...indices, memberIndex], depth + 1)
        const subtotalLabels: (string | null)[] = new Array(levels).fill(null)
        for (let level = 0; level < depth; level += 1) subtotalLabels[level] = path[level]!
        subtotalLabels[depth] = member
        subtotalLabels[depth + 1] = labels.subtotal
        matrix.push([...subtotalLabels, ...valueCells([...path, member])])
        rowLines.push({ t: 'default', members: [...indices, memberIndex] })
      }
    })
  }
  emitLevel([], [], 0)
  if (rowLines.length > 20_000) throw new PivotLayoutError('tooManyRowLines')
  matrix.push([
    ...rowFieldsArray.map((_, i) => (i === 0 ? labels.grandTotal : '')),
    ...valueCells([]),
  ])

  const height = matrix.length
  const width = matrix[0]?.length ?? 0
  const numberFormats =
    colLevels === 0
      ? valueSpecs.flatMap((spec, vi) =>
          spec.numFmt ? [{ columnOffset: levels + vi, format: spec.numFmt }] : [],
        )
      : []

  return {
    matrix,
    width,
    height,
    numberFormats,
    definition: {
      fieldNames,
      rowFieldIndices,
      // a single column field is recorded by index alone; two or more need the
      // full level list, which is the shape OOXML expects
      ...(colLevels === 1 ? { columnFieldIndex: columnFieldIndices[0]! } : {}),
      ...(pageFieldIndices.length > 0 ? { pageFieldIndices } : {}),
      rowItems,
      rowLevelItems: levelItems,
      rowLines,
      ...(colLevels === 1 ? { columnItems: colLevelItems[0]! } : {}),
      ...(colLevels >= 2 ? { columnFieldIndices, colLevelItems, colLines } : {}),
      ...(groupings.length > 0 ? { groupings } : {}),
      ...(filterEntries.length > 0
        ? { filters: filterEntries, rowHiddenItems, colHiddenItems }
        : {}),
      values: valueSpecs.map((spec) => ({
        fieldIndex: spec.fieldIndex,
        agg: spec.agg,
        ...(spec.numFmt ? { numFmt: spec.numFmt } : {}),
        ...(spec.showDataAs ? { showDataAs: spec.showDataAs } : {}),
        ...(spec.formula !== undefined ? { formula: spec.formula, calcName: spec.calcName! } : {}),
      })),
    },
  }
}

export interface PivotArea {
  readonly startRow: number
  readonly startColumn: number
  readonly endRow: number
  readonly endColumn: number
}

export function pivotOutputArea(
  anchor: { row: number; column: number },
  layout: PivotLayout,
): PivotArea {
  return {
    startRow: anchor.row,
    startColumn: anchor.column,
    endRow: anchor.row + layout.height - 1,
    endColumn: anchor.column + layout.width - 1,
  }
}

/**
 * Whether two areas share a cell. The pivot output must not overlap its own
 * source, so this is what stops a pivot from overwriting the data it reads.
 */
export function areasOverlap(a: PivotArea, b: PivotArea): boolean {
  return (
    a.startRow <= b.endRow &&
    b.startRow <= a.endRow &&
    a.startColumn <= b.endColumn &&
    b.startColumn <= a.endColumn
  )
}
