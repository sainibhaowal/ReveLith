import { describe, expect, it } from 'vitest'
import {
  buildMatrixExtractionPrompt,
  createMatrixProject,
  parseMatrixExtractionResponse,
} from '../src/matrix/matrix-extractor'
import { DEFAULT_CONTRACT_COLUMNS } from '../src/matrix/types'

describe('matrix-extractor', () => {
  it('builds clear extraction prompt with columns and doc slice', () => {
    const prompt = buildMatrixExtractionPrompt(
      'Agreement between Alice and Bob.',
      DEFAULT_CONTRACT_COLUMNS,
    )
    expect(prompt.system).toContain('ReveLith Hebbia Matrix Extraction Agent')
    expect(prompt.user).toContain('Target Columns to Extract:')
    expect(prompt.user).toContain('Contract Parties')
    expect(prompt.user).toContain('Agreement between Alice and Bob.')
  })

  it('parses valid matrix JSON response with citations', () => {
    const mockJson = JSON.stringify({
      cells: {
        parties: {
          value: 'Acme Corp & Wayne Enterprises',
          citation: {
            pageNumber: 1,
            snippet: 'Entered into by Acme Corp and Wayne Enterprises.',
            confidence: 0.98,
          },
        },
        contractValue: {
          value: '$500,000',
          citation: {
            pageNumber: 3,
            snippet: 'Total remuneration shall be $500,000.',
            confidence: 0.95,
          },
        },
      },
    })

    const parsed = parseMatrixExtractionResponse(mockJson, DEFAULT_CONTRACT_COLUMNS)
    expect(parsed.parties?.value).toBe('Acme Corp & Wayne Enterprises')
    expect(parsed.parties?.citation?.pageNumber).toBe(1)
    expect(parsed.parties?.citation?.confidence).toBe(0.98)
    expect(parsed.contractValue?.value).toBe('$500,000')
    expect(parsed.governingLaw?.value).toBeNull()
  })

  it('creates a new matrix project structure cleanly', () => {
    const proj = createMatrixProject('Q3 Vendor Audits', DEFAULT_CONTRACT_COLUMNS, [
      { name: 'contract1.pdf', path: '/docs/contract1.pdf' },
      { name: 'contract2.pdf', path: '/docs/contract2.pdf' },
    ])

    expect(proj.name).toBe('Q3 Vendor Audits')
    expect(proj.rows.length).toBe(2)
    expect(proj.rows[0]?.documentName).toBe('contract1.pdf')
    expect(proj.rows[0]?.status).toBe('pending')
  })
})
