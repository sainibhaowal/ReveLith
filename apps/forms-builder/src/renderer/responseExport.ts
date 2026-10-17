import type { FormField } from './types'

function scalar(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return '[unserializable value]'
  }
}

/** Always quote cells and neutralize spreadsheet formulas before CSV export. */
export function csvCell(value: unknown): string {
  let text = scalar(value)
  // Spreadsheet apps may ignore leading ASCII control characters before parsing a formula.
  // eslint-disable-next-line no-control-regex -- the control range is intentionally part of this formula-injection guard.
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function flattenResponseAnswers(
  fields: FormField[],
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...answers }
  for (const field of fields) {
    if (field.type !== 'group') continue
    const nested =
      answers[field.id] &&
      typeof answers[field.id] === 'object' &&
      !Array.isArray(answers[field.id])
        ? (answers[field.id] as Record<string, unknown>)
        : {}
    Object.assign(result, flattenResponseAnswers(field.children ?? [], nested))
  }
  return result
}

export function flattenFieldLabels(
  fields: FormField[],
  prefix = '',
): Array<{ id: string; label: string }> {
  return fields.flatMap((field) => {
    const label = prefix ? `${prefix} / ${field.label}` : field.label
    return field.type === 'group'
      ? flattenFieldLabels(field.children ?? [], label)
      : [{ id: field.id, label }]
  })
}
