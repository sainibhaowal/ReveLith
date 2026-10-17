import { describe, expect, it } from 'vitest'
import { normalizeFieldType, normalizeFieldTypeAndOptions } from './normalizeFieldType'

const supported = [
  'text',
  'textarea',
  'select',
  'radio',
  'checkbox',
  'yesno',
  'date_range',
  'fullname',
]

describe('normalizeFieldType', () => {
  it.each([
    ['short text', 'text'],
    ['long text', 'textarea'],
    ['Dropdown', 'select'],
    ['radio buttons', 'radio'],
    ['check boxes', 'checkbox'],
    ['date range', 'date_range'],
    ['full name', 'fullname'],
    ['yes/no', 'yesno'],
  ])('maps %s to schema type %s', (input, expected) => {
    expect(normalizeFieldType(input, supported)).toBe(expected)
  })

  it('keeps valid canonical types and rejects unsupported values', () => {
    expect(normalizeFieldType('text', supported)).toBe('text')
    expect(normalizeFieldType('invented question', supported)).toBeUndefined()
    expect(normalizeFieldType(null, supported)).toBeUndefined()
  })

  it('recovers when the model puts a field type in the options slot', () => {
    expect(normalizeFieldTypeAndOptions(undefined, ['short text'], supported)).toEqual({
      type: 'text',
    })
    expect(normalizeFieldTypeAndOptions('select', ['Short', 'Long'], supported)).toEqual({
      type: 'select',
      options: ['Short', 'Long'],
    })
  })
})
