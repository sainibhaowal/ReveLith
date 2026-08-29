import type { WorkbookCommandBatch } from '../domain/workbook-dsl'

export class UnsupportedPromptError extends Error {
  constructor() {
    super('Try “set A1 to 42”, “formula B1 = SUM(A1:A10)”, or “rename sheet to Budget”.')
    this.name = 'UnsupportedPromptError'
  }
}

export function planPrompt(
  prompt: string,
  options: { readonly revision: number; readonly sheetId: string },
): WorkbookCommandBatch {
  const transactionId = `local-${crypto.randomUUID()}`
  const normalized = prompt.trim()
  const setMatch = /^set\s+([a-z]{1,3}[1-9][0-9]{0,6})\s+to\s+(.+)$/i.exec(normalized)
  if (setMatch) {
    const address = setMatch[1]
    const rawValue = setMatch[2]
    if (!address || !rawValue) {
      throw new UnsupportedPromptError()
    }
    return {
      dslVersion: 1,
      transactionId,
      baseRevision: options.revision,
      summary: `Set ${address.toUpperCase()}`,
      operations: [{
        op: 'set_cell',
        sheetId: options.sheetId,
        address: address.toUpperCase(),
        value: parseScalar(rawValue),
      }],
    }
  }

  const formulaMatch = /^formula\s+([a-z]{1,3}[1-9][0-9]{0,6})\s*=\s*(.+)$/i.exec(normalized)
  if (formulaMatch) {
    const address = formulaMatch[1]
    const formula = formulaMatch[2]
    if (!address || !formula) {
      throw new UnsupportedPromptError()
    }
    return {
      dslVersion: 1,
      transactionId,
      baseRevision: options.revision,
      summary: `Set formula in ${address.toUpperCase()}`,
      operations: [{
        op: 'set_formula',
        sheetId: options.sheetId,
        address: address.toUpperCase(),
        formula: `=${formula}`,
      }],
    }
  }

  const renameMatch = /^rename\s+sheet\s+to\s+(.+)$/i.exec(normalized)
  if (renameMatch?.[1]) {
    return {
      dslVersion: 1,
      transactionId,
      baseRevision: options.revision,
      summary: 'Rename current sheet',
      operations: [{
        op: 'rename_sheet',
        sheetId: options.sheetId,
        name: renameMatch[1].trim(),
      }],
    }
  }

  // Detailed expansion request (e.g., "add more detailed", "more details", "expand")
  if (/detail|more|expand|add\s+more/i.test(normalized)) {
    return {
      dslVersion: 1,
      transactionId,
      baseRevision: options.revision,
      summary: 'Added Detailed Budget Items & Calculations',
      operations: [
        { op: 'set_cell', sheetId: options.sheetId, address: 'A5', value: 'Wireless Keyboards' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'B5', value: 80 },
        { op: 'set_cell', sheetId: options.sheetId, address: 'C5', value: 10 },
        { op: 'set_formula', sheetId: options.sheetId, address: 'D5', formula: '=B5*C5' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'A6', value: 'Ergonomic Mice' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'B6', value: 60 },
        { op: 'set_cell', sheetId: options.sheetId, address: 'C6', value: 10 },
        { op: 'set_formula', sheetId: options.sheetId, address: 'D6', formula: '=B6*C6' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'A7', value: 'USB-C Thunderbolt Docks' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'B7', value: 200 },
        { op: 'set_cell', sheetId: options.sheetId, address: 'C7', value: 5 },
        { op: 'set_formula', sheetId: options.sheetId, address: 'D7', formula: '=B7*C7' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'A8', value: 'Grand Total' },
        { op: 'set_formula', sheetId: options.sheetId, address: 'D8', formula: '=SUM(D2:D7)' },
      ],
    }
  }

  // Sample demonstration / natural language requests (e.g., "how to use", "hi", "sample table", "budget")
  if (/how|show|table|sample|demo|hi|hello|help|excel|use/i.test(normalized) || !normalized) {
    return {
      dslVersion: 1,
      transactionId,
      baseRevision: options.revision,
      summary: 'Created Sample Excel Table with Formulas',
      operations: [
        { op: 'set_cell', sheetId: options.sheetId, address: 'A1', value: 'Item Name' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'B1', value: 'Unit Price ($)' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'C1', value: 'Quantity' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'D1', value: 'Total ($)' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'A2', value: 'Office Chairs' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'B2', value: 150 },
        { op: 'set_cell', sheetId: options.sheetId, address: 'C2', value: 4 },
        { op: 'set_formula', sheetId: options.sheetId, address: 'D2', formula: '=B2*C2' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'A3', value: 'Standing Desks' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'B3', value: 450 },
        { op: 'set_cell', sheetId: options.sheetId, address: 'C3', value: 2 },
        { op: 'set_formula', sheetId: options.sheetId, address: 'D3', formula: '=B3*C3' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'A4', value: 'Monitors 27-inch' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'B4', value: 300 },
        { op: 'set_cell', sheetId: options.sheetId, address: 'C4', value: 3 },
        { op: 'set_formula', sheetId: options.sheetId, address: 'D4', formula: '=B4*C4' },
        { op: 'set_cell', sheetId: options.sheetId, address: 'A5', value: 'Grand Total' },
        { op: 'set_formula', sheetId: options.sheetId, address: 'D5', formula: '=SUM(D2:D4)' },
      ],
    }
  }

  // Fallback for general cell entry
  return {
    dslVersion: 1,
    transactionId,
    baseRevision: options.revision,
    summary: `Set A1 to "${normalized}"`,
    operations: [{
      op: 'set_cell',
      sheetId: options.sheetId,
      address: 'A1',
      value: normalized,
    }],
  }
}

function parseScalar(rawValue: string): string | number | boolean | null {
  if (rawValue === 'null') return null
  if (rawValue.toLowerCase() === 'true') return true
  if (rawValue.toLowerCase() === 'false') return false
  const numericValue = Number(rawValue)
  return Number.isFinite(numericValue) && rawValue.trim() !== '' ? numericValue : rawValue
}
