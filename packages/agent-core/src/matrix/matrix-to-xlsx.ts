import type { MatrixProject, MatrixRowData } from './types'

export interface MatrixXlsxResult {
  fileName: string
  csvContent: string
  rowCount: number
  colCount: number
}

/**
 * Builds an audit-ready CSV / tabular data export for the Matrix project.
 * Uses RFC-4180 compliant CSV formatting with citations and source references.
 */
export function buildMatrixCsv(project: MatrixProject): MatrixXlsxResult {
  const headers = ['Document', ...project.columns.map((c) => c.name)]
  const rows: string[][] = []

  for (const row of project.rows) {
    const rowValues: string[] = [row.documentName]
    for (const col of project.columns) {
      const cell = row.cells[col.id]
      let text = ''
      if (cell && cell.value !== null && cell.value !== undefined) {
        text = String(cell.value)
        if (cell.citation?.snippet) {
          text += ` [Source: ${cell.citation.snippet} (p. ${cell.citation.pageNumber ?? 1})]`
        }
      }
      rowValues.push(text)
    }
    rows.push(rowValues)
  }

  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  const csvLines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ]

  const safeTitle = project.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
  return {
    fileName: `${safeTitle}_matrix.csv`,
    csvContent: csvLines.join('\r\n'),
    rowCount: rows.length,
    colCount: headers.length,
  }
}
