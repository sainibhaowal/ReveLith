/**
 * Export active worksheet as RFC-4180 CSV with UTF-8 BOM.
 */
import type { UniverRuntime } from './univer-state'
import { showToast } from './toast-bus'

export function buildCsvText(rows: (string | number | boolean | null | undefined)[][]): string {
  const escapeField = (val: unknown): string => {
    if (val === null || val === undefined) return ''
    const text = String(val)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return `${rows.map((row) => row.map(escapeField).join(',')).join('\r\n')}\r\n`
}

export async function handleExportActiveSheetCsv(
  runtime: UniverRuntime | null,
  setMessage: (msg: string) => void,
): Promise<void> {
  const workbook = runtime?.univerAPI.getActiveWorkbook()
  const worksheet = workbook?.getActiveSheet()
  if (!worksheet) return

  const sheetName = worksheet.getSheetName() || 'Sheet1'
  const lastRow = Math.max(0, worksheet.getLastRow())
  const lastCol = Math.max(0, worksheet.getLastColumn())
  const rows = lastRow + 1
  const cols = lastCol + 1

  const range = worksheet.getRange(0, 0, rows, cols)
  const rawValues = range.getValues() as (string | number | boolean | null | undefined)[][]
  const displayValues = range.getDisplayValues()

  const formattedRows = rawValues.map((row, r) =>
    row.map((val, c) => {
      if (val === null || val === undefined) return ''
      const disp = displayValues[r]?.[c]
      if (disp !== undefined && disp !== null && disp !== '') return disp
      return String(val)
    }),
  )

  const csv = buildCsvText(formattedRows)
  const result = await window.desktopApi.exportCsv({
    fileName: `${sheetName}.csv`,
    csv,
  })
  if (!result.canceled) {
    const msg = `Exported active sheet to ${result.path}`
    setMessage(msg)
    showToast(msg)
  }
}
