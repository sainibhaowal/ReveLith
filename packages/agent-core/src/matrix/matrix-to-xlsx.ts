import type { MatrixProject } from './types'
import {
  createBufferEntrySource,
  planCellEditsToXlsx,
  assembleWithJsZip,
  type CellEdit,
  type SheetEditPlan,
  type SheetStructuralOps,
} from '@revelith/xlsx-gateway'

import { BASE64_BLANK_XLSX } from './blank-xlsx'

export interface MatrixXlsxResult {
  fileName: string
  buffer: Buffer
  rowCount: number
  colCount: number
}

/**
 * Builds a real .xlsx workbook for the Matrix project using @revelith/xlsx-gateway.
 * Includes: formatted headers, frozen header row, auto-filter, cell comments with citations,
 * and revelith-source:// hyperlinks for deep-linking to source PDFs.
 */
export async function buildMatrixXlsx(project: MatrixProject): Promise<MatrixXlsxResult> {
  // Create edits for the matrix grid
  const edits: CellEdit[] = []
  const headers = ['Document', ...project.columns.map((c) => c.name)]
  const colCount = headers.length

  // Row 0: Headers with professional styling
  for (let c = 0; c < colCount; c++) {
    edits.push({
      sheetName: project.name,
      row: 0,
      column: c,
      writeValue: true,
      cell: { value: headers[c]! },
      style: {
        bold: true,
        fill: { pattern: 'solid', fg: '#2E5090' }, // Professional dark blue
        fontColor: '#FFFFFF',
        fontSize: 11,
        fontFamily: 'Calibri',
        horizontalAlignment: 'center',
      },
    })
  }

  // Data rows
  for (let r = 0; r < project.rows.length; r++) {
    const row = project.rows[r]!
    // Column 0: Document name
    edits.push({
      sheetName: project.name,
      row: r + 1,
      column: 0,
      writeValue: true,
      cell: { value: row.documentName },
    })

    // Data columns
    for (let c = 0; c < project.columns.length; c++) {
      const col = project.columns[c]!
      const cell = row.cells[col.id]
      const cellRow = r + 1
      const cellCol = c + 1

      if (cell && cell.value !== null && cell.value !== undefined) {
        const value = String(cell.value)
        let commentText = ''
        let hyperlink: string | undefined

        if (cell.citation?.snippet) {
          commentText = `Source: ${cell.citation.snippet} (p. ${cell.citation.pageNumber ?? 1})`
          // Create deep-link to source PDF
          if (row.documentPath) {
            const encodedPath = encodeURIComponent(row.documentPath)
            const page = cell.citation.pageNumber ?? 1
            const snippet = encodeURIComponent(cell.citation.snippet.slice(0, 200))
            hyperlink = `revelith-source://${encodedPath}?page=${page}&snippet=${snippet}`
          }
        }

        edits.push({
          sheetName: project.name,
          row: cellRow,
          column: cellCol,
          writeValue: true,
          cell: {
            value,
            ...(hyperlink ? { hyperlink } : {}),
          },
          ...(commentText ? { comment: commentText } : {}),
        })
      }
    }
  }

  // Sheet plan
  const plan: SheetEditPlan = {
    renames: [],
    additions: [],
    removals: [],
    order: [project.name],
  }

  // Structural ops: only row/column shifts
  const structuralOps: SheetStructuralOps[] = []

  // Gateway payloads: freeze panes and auto-filter
  // CellArea for the filter range (0-based indices)
  const filterRange: { startRow: number; endRow: number; startColumn: number; endColumn: number } =
    {
      startRow: 0,
      endRow: project.rows.length,
      startColumn: 0,
      endColumn: colCount - 1,
    }

  const filterStates = [
    {
      sheetName: project.name,
      filter: {
        range: filterRange,
        columns: [],
      },
      hiddenRows: [],
      visibilityRange: filterRange,
    },
  ]

  const pageSetupStates = [
    {
      sheetName: project.name,
      frozenRows: 1,
      frozenColumns: 0,
    },
  ]

  // Decode base64 blank xlsx
  const blankBuffer = Buffer.from(BASE64_BLANK_XLSX, 'base64')
  const source = await createBufferEntrySource(blankBuffer)

  // Plan and assemble
  const mutationPlan = await planCellEditsToXlsx(
    source,
    edits,
    structuralOps,
    [], // chartEdits
    plan,
    filterStates,
    [], // hyperlinkEdits
    [], // cfStates
    [], // dvStates
    [], // sheetProtections
    null, // definedNamesState
    [], // visualAdditions
    pageSetupStates,
    [], // noteStates
    [], // tableAdditions
    [], // pivotAdditions
    [], // pivotCacheRefreshPaths
    [], // pivotRefreshUpdates
    [], // visualEdits
    [], // sparklineAdditions
    [], // formulaValues
    null, // themeState
    null, // workbookProtectionState
    [], // protectedRangeStates
    [], // bulkConstantFills
  )

  const mutation = await assembleWithJsZip(blankBuffer, mutationPlan)

  return {
    fileName: `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_matrix.xlsx`,
    buffer: mutation.buffer,
    rowCount: project.rows.length + 1,
    colCount,
  }
}
