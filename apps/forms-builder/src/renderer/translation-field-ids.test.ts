import { describe, expect, it } from 'vitest'
import { resolveTranslationFieldId } from './translation-field-ids'

describe('translation field ID resolution', () => {
  it('keeps exact IDs and safely repairs model-normalized hyphens', () => {
    const ids = new Set(['field-name', 'field_delete', 'group-team'])
    expect(resolveTranslationFieldId('field-name', ids)).toBe('field-name')
    expect(resolveTranslationFieldId('group_team', ids)).toBe('group-team')
    expect(resolveTranslationFieldId('field_delete', ids)).toBe('field_delete')
  })

  it('rejects unknown field IDs rather than guessing', () => {
    expect(resolveTranslationFieldId('unknown_field', new Set(['field-name']))).toBeUndefined()
  })
})
