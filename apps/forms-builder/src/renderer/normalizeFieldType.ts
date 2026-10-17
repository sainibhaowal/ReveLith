const FIELD_TYPE_ALIASES: Record<string, string> = {
  'short text': 'text', short_text: 'text', 'single line text': 'text',
  'long text': 'textarea', long_text: 'textarea', 'paragraph text': 'textarea', 'multi line text': 'textarea', multiline: 'textarea',
  dropdown: 'select', 'drop down': 'select', 'radio buttons': 'radio', 'multiple choice': 'radio',
  'check boxes': 'checkbox', 'yes/no': 'yesno', 'yes no': 'yesno', 'date range': 'date_range',
  'full name': 'fullname', 'picture choice': 'picture_choice', 'legal terms': 'legal_terms', 'input table': 'input_table',
}

/** Convert common human names into the canonical type the form schema stores. */
export function normalizeFieldType(value: unknown, supportedTypes: readonly string[]): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim().toLocaleLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  const alias = FIELD_TYPE_ALIASES[cleaned]
  const canonical = alias ?? cleaned.replace(/ /g, '_')
  return supportedTypes.includes(canonical) ? canonical : undefined
}

/** Recover when a model puts a field label in `options` instead of `type`. */
export function normalizeFieldTypeAndOptions(typeValue: unknown, optionsValue: unknown, supportedTypes: readonly string[]): { type?: string; options?: unknown } {
  const optionType = typeValue === undefined && Array.isArray(optionsValue) && optionsValue.length === 1
    ? normalizeFieldType(optionsValue[0], supportedTypes)
    : undefined
  const type = normalizeFieldType(typeValue ?? optionType, supportedTypes)
  return {
    ...(type ? { type } : {}),
    ...(!optionType && optionsValue !== undefined ? { options: optionsValue } : {}),
  }
}
