/**
 * PDF to Excel import handler for Sheets app
 * Handles PDF file import and table extraction with Excel conversion
 */

import { dialog } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IpcMainInvokeEvent } from 'electron'
import { extractTablesFromPdf, tablesToExcelWorkbook, type ExtractionOptions } from './pdf-table-extractor'
import { Workbook } from 'exceljs'

export interface PdfImportRequest {
  pdfPath: string
  options?: ExtractionOptions | undefined
}

export type PdfImportResult = {
  ok: true
  worksheets: Record<string, {
    cells: Record<string, string>
    merges: string[]
  }>
  metadata: {
    totalTables: number
    totalRows: number
    totalColumns: number
  }
} | {
  ok: false
  error: string
}

export async function importPdfToExcel(
  event: IpcMainInvokeEvent,
  request: PdfImportRequest
): Promise<PdfImportResult> {
  const { pdfPath, options = {} } = request

  try {
    // Extract tables from PDF
    const tables = await extractTablesFromPdf(pdfPath, options)

    if (tables.length === 0) {
      return {
        ok: false,
        error: 'No tables detected in the PDF'
      }
    }

    // Convert to Excel workbook format
    const workbookData = tablesToExcelWorkbook(tables)

    return {
      ok: true,
      ...workbookData
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function saveExcelFromPdf(
  pdfPath: string,
  outputPath: string,
  options?: ExtractionOptions
): Promise<{ ok: true; savedPath: string } | { ok: false; error: string }> {
  try {
    // Extract tables from PDF
    const tables = await extractTablesFromPdf(pdfPath, options)

    if (tables.length === 0) {
      return {
        ok: false,
        error: 'No tables detected in the PDF'
      }
    }

    // Create Excel workbook
    const workbook = new Workbook()
    const workbookData = tablesToExcelWorkbook(tables)

    // Add worksheets
    Object.entries(workbookData.worksheets).forEach(([sheetName, sheetData]) => {
      const worksheet = workbook.addWorksheet(sheetName)
      
      // Add cells
      Object.entries(sheetData.cells).forEach(([cellRef, value]) => {
        worksheet.getCell(cellRef).value = value
      })

      // Add merges
      sheetData.merges.forEach(mergeRange => {
        worksheet.mergeCells(mergeRange)
      })
    })

    // Save workbook
    await workbook.xlsx.writeFile(outputPath)

    return {
      ok: true,
      savedPath: outputPath
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}