export interface MatrixColumnDef {
  id: string
  name: string
  description?: string
  dataType: 'text' | 'number' | 'date' | 'boolean'
  required?: boolean
}

export interface MatrixCellCitation {
  sourceFile: string
  pageNumber?: number
  snippet: string
  confidence?: number
}

export interface MatrixCellData {
  value: string | number | boolean | null
  citation?: MatrixCellCitation
  notes?: string
}

export interface MatrixRowData {
  id: string
  documentName: string
  documentPath: string
  cells: Record<string, MatrixCellData>
  status: 'pending' | 'processing' | 'completed' | 'error'
  error?: string
}

export interface MatrixProject {
  id: string
  name: string
  description?: string
  createdAt: number
  columns: MatrixColumnDef[]
  rows: MatrixRowData[]
}

export const DEFAULT_CONTRACT_COLUMNS: MatrixColumnDef[] = [
  {
    id: 'parties',
    name: 'Contract Parties',
    description: 'Names of all parties involved',
    dataType: 'text',
  },
  {
    id: 'effectiveDate',
    name: 'Effective Date',
    description: 'Date the agreement becomes active',
    dataType: 'date',
  },
  {
    id: 'termDuration',
    name: 'Term / Expiration',
    description: 'Duration or end date of agreement',
    dataType: 'text',
  },
  {
    id: 'contractValue',
    name: 'Total Value / Fee',
    description: 'Monetary compensation or price',
    dataType: 'text',
  },
  {
    id: 'governingLaw',
    name: 'Governing Law',
    description: 'Jurisdiction or state governing the contract',
    dataType: 'text',
  },
  {
    id: 'liabilityCap',
    name: 'Liability Cap',
    description: 'Maximum limitation of liability',
    dataType: 'text',
  },
  {
    id: 'terminationNotice',
    name: 'Termination Notice',
    description: 'Notice required to terminate',
    dataType: 'text',
  },
]

export const DEFAULT_INVOICE_COLUMNS: MatrixColumnDef[] = [
  {
    id: 'vendorName',
    name: 'Vendor / Supplier',
    description: 'Name of issuing company',
    dataType: 'text',
  },
  {
    id: 'invoiceNumber',
    name: 'Invoice #',
    description: 'Unique invoice identifier',
    dataType: 'text',
  },
  {
    id: 'invoiceDate',
    name: 'Invoice Date',
    description: 'Date invoice was issued',
    dataType: 'date',
  },
  { id: 'dueDate', name: 'Due Date', description: 'Payment due date', dataType: 'date' },
  {
    id: 'subtotal',
    name: 'Subtotal Amount',
    description: 'Amount before taxes',
    dataType: 'number',
  },
  { id: 'taxAmount', name: 'Tax / VAT', description: 'Total tax charged', dataType: 'number' },
  { id: 'totalAmount', name: 'Total Due', description: 'Final payable amount', dataType: 'number' },
]
