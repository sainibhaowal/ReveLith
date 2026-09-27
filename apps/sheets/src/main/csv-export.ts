/// CSV export: prompts for file destination and writes RFC-4180 CSV with UTF-8 BOM.

import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog } from 'electron'
import { Workbook } from 'exceljs'
import { showSaveDialogWithMemory } from '@revelith/electron-utils'
import type { IpcMainInvokeEvent } from 'electron'
import type { WorkbookExportCsvRequest, WorkbookExportCsvResult } from '../shared/desktop-api'

export async function exportCsv(
  event: IpcMainInvokeEvent,
  request: WorkbookExportCsvRequest,
): Promise<WorkbookExportCsvResult> {
  const parent = BrowserWindow.fromWebContents(event.sender)
  const baseName = request.fileName.endsWith('.csv') ? request.fileName : `${request.fileName}.csv`
  const dialogOptions = {
    defaultPath: baseName,
    filters: [{ name: 'CSV (Comma delimited)', extensions: ['csv'] }],
  }
  const selection = await showSaveDialogWithMemory(dialog, parent, dialogOptions)
  if (selection.canceled || !selection.filePath) return { canceled: true }

  const filePath = selection.filePath.endsWith('.csv')
    ? selection.filePath
    : `${selection.filePath}.csv`

  // Prefix UTF-8 BOM (\ufeff) if not already present so Microsoft Excel opens it correctly
  const bom = '\ufeff'
  const content = request.csv.startsWith(bom) ? request.csv : `${bom}${request.csv}`

  await writeFile(filePath, content, 'utf8')
  return { canceled: false, path: filePath }
}

/**
 * Reads an XLSX file from disk (e.g. temp session copy) and writes its active/first sheet
 * directly to a target CSV file with UTF-8 BOM.
 */
export async function exportWorksheetToCsv(xlsxPath: string, outputPath: string): Promise<void> {
  const wb = new Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const csvBuffer = Buffer.from(await wb.csv.writeBuffer({ encoding: 'utf-8' }))
  const bom = Buffer.from([0xef, 0xbb, 0xbf])
  const finalBuffer = csvBuffer.subarray(0, 3).equals(bom)
    ? csvBuffer
    : Buffer.concat([bom, csvBuffer])
  await writeFile(outputPath, finalBuffer)
}
