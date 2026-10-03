import type { MatrixCellData, MatrixColumnDef, MatrixProject, MatrixRowData } from './types'

export function buildMatrixExtractionPrompt(
  documentText: string,
  columns: MatrixColumnDef[],
): { system: string; user: string } {
  const schemaDesc = columns
    .map((c) => `- ${c.name} (id: "${c.id}", type: ${c.dataType}): ${c.description || ''}`)
    .join('\n')

  const system = `You are the ReveLith Hebbia Matrix Extraction Agent. Your job is to extract structured comparative data points with exact source citations from documents.
You MUST output strictly valid JSON matching this schema:
{
  "cells": {
    "<column_id>": {
      "value": <extracted_value_or_null>,
      "citation": {
        "pageNumber": <page_num_or_1>,
        "snippet": "<exact_sentence_from_document_as_proof>",
        "confidence": <0.0_to_1.0>
      },
      "notes": "<optional_reasoning>"
    }
  }
}
If a value is not mentioned in the document, set "value": null and omit "citation".
Never hallucinate or guess. Only extract grounded facts.`

  const user = `Target Columns to Extract:
${schemaDesc}

Document Content:
${documentText.slice(0, 45000)}`

  return { system, user }
}

export function parseMatrixExtractionResponse(
  rawJson: string,
  columns: MatrixColumnDef[],
): Record<string, MatrixCellData> {
  const result: Record<string, MatrixCellData> = {}
  for (const col of columns) {
    result[col.id] = { value: null }
  }

  try {
    let clean = rawJson.trim()
    if (clean.startsWith('```json')) {
      clean = clean
        .replace(/^```json/, '')
        .replace(/```$/, '')
        .trim()
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```/, '').replace(/```$/, '').trim()
    }

    const parsed = JSON.parse(clean)
    if (parsed && typeof parsed.cells === 'object') {
      for (const col of columns) {
        if (parsed.cells[col.id]) {
          result[col.id] = parsed.cells[col.id]
        }
      }
    }
  } catch {
    // Return empty cells on parse error
  }

  return result
}

export function createMatrixProject(
  name: string,
  columns: MatrixColumnDef[],
  files: { name: string; path: string }[],
): MatrixProject {
  const rows: MatrixRowData[] = files.map((f, idx) => ({
    id: `row-${idx + 1}-${Date.now()}`,
    documentName: f.name,
    documentPath: f.path,
    cells: {},
    status: 'pending',
  }))

  return {
    id: `matrix-${Date.now()}`,
    name,
    createdAt: Date.now(),
    columns,
    rows,
  }
}
