import { describe, expect, it } from 'vitest'
import { csvCell, flattenFieldLabels, flattenResponseAnswers } from './responseExport'

describe('local response export helpers', () => {
  it('quotes CSV values and blocks spreadsheet formula execution', () => {
    expect(csvCell('plain, "quoted"')).toBe('"plain, ""quoted"""')
    expect(csvCell('=HYPERLINK("https://invalid")')).toBe('"\'=HYPERLINK(""https://invalid"")"')
    expect(csvCell('  +1+1')).toBe('"\'  +1+1"')
  })

  it('flattens nested response data while preserving readable field labels', () => {
    const fields = [
      {
        id: 'group',
        type: 'group',
        label: 'Contact',
        required: false,
        children: [{ id: 'email', type: 'email', label: 'Email', required: false }],
      },
    ] as const
    expect(flattenFieldLabels(fields as never)).toEqual([{ id: 'email', label: 'Contact / Email' }])
    expect(
      flattenResponseAnswers(fields as never, { group: { email: 'person@example.test' } }),
    ).toMatchObject({ email: 'person@example.test' })
  })
})
