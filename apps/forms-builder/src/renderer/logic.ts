import type { FormField, FormLogicRule, FormVariable } from './types'

export type ConditionOperator = NonNullable<FormField['conditionalLogic']>['showWhen'][number]['operator']

export function conditionValueText(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(conditionValueText).join(', ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('firstName' in record || 'lastName' in record) return [record.firstName, record.lastName].filter(Boolean).map(String).join(' ')
    if ('start' in record || 'end' in record) return [record.start, record.end].filter(Boolean).map(String).join(' to ')
    return Object.values(record).map(conditionValueText).filter(Boolean).join(', ')
  }
  return String(value)
}

export function evaluateCondition(actual: unknown, operator: ConditionOperator, expected = ''): boolean {
  const text = conditionValueText(actual)
  const normalized = text.toLocaleLowerCase()
  const wanted = expected.toLocaleLowerCase()
  switch (operator) {
    case 'equals': return Array.isArray(actual) ? actual.some((item) => conditionValueText(item) === expected) : text === expected
    case 'not_equals': return Array.isArray(actual) ? actual.every((item) => conditionValueText(item) !== expected) : text !== expected
    case 'contains': return Array.isArray(actual) ? actual.some((item) => conditionValueText(item) === expected) : normalized.includes(wanted)
    case 'not_contains': return Array.isArray(actual) ? actual.every((item) => conditionValueText(item) !== expected) : !normalized.includes(wanted)
    case 'starts_with': return normalized.startsWith(wanted)
    case 'ends_with': return normalized.endsWith(wanted)
    case 'greater_than': return numericCompare(actual, expected, (a, b) => a > b)
    case 'greater_or_equal_than': return numericCompare(actual, expected, (a, b) => a >= b)
    case 'less_than': return numericCompare(actual, expected, (a, b) => a < b)
    case 'less_or_equal_than': return numericCompare(actual, expected, (a, b) => a <= b)
    case 'is_before': return dateCompare(text, expected, (a, b) => a < b)
    case 'is_after': return dateCompare(text, expected, (a, b) => a > b)
    case 'is_empty': return text.trim() === ''
    case 'is_not_empty': return text.trim() !== ''
  }
}

function numericCompare(actual: unknown, expected: string, compare: (actual: number, expected: number) => boolean): boolean {
  const left = typeof actual === 'number' ? actual : Number(conditionValueText(actual))
  const right = Number(expected)
  return Number.isFinite(left) && Number.isFinite(right) && compare(left, right)
}

function dateCompare(actual: string, expected: string, compare: (actual: number, expected: number) => boolean): boolean {
  const left = Date.parse(actual)
  const right = Date.parse(expected)
  return Number.isFinite(left) && Number.isFinite(right) && compare(left, right)
}

export function shouldShowField(field: FormField, answers: Record<string, unknown>): boolean {
  const conditions = field.conditionalLogic?.showWhen ?? []
  if (conditions.length === 0) return true
  const matches = conditions.map((condition) => evaluateCondition(answers[condition.fieldId], condition.operator, condition.value))
  return field.conditionalLogic?.match === 'any' ? matches.some(Boolean) : matches.every(Boolean)
}

export function calculateFormVariables(variables: FormVariable[], rules: FormLogicRule[], answers: Record<string, unknown>): Record<string, string | number> {
  const values: Record<string, string | number> = Object.fromEntries(variables.map((variable) => [variable.id, variable.initialValue]))
  for (const rule of rules) {
    const action = rule.action
    if (action.kind !== 'calculate' || !matchesRule(rule, { ...answers, ...values })) continue
    const variable = variables.find((item) => item.id === action.variableId)
    if (!variable) continue
    const source = action.sourceFieldId ? answers[action.sourceFieldId] : action.value
    if (variable.type === 'string') {
      if (action.operation === 'assign') values[variable.id] = conditionValueText(source)
      else if (action.operation === 'add') values[variable.id] = String(values[variable.id] ?? '') + conditionValueText(source)
      continue
    }
    const left = Number(values[variable.id])
    const right = typeof source === 'number' ? source : Number(conditionValueText(source))
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue
    let next: number
    switch (action.operation) {
      case 'assign': next = right; break
      case 'add': next = left + right; break
      case 'subtract': next = left - right; break
      case 'multiply': next = left * right; break
      case 'divide': if (right === 0) continue; next = left / right; break
    }
    if (Number.isFinite(next)) values[variable.id] = next
  }
  return values
}

export function matchingNavigationTarget(rules: FormLogicRule[], answers: Record<string, unknown>): string | undefined {
  for (const rule of rules) {
    const action = rule.action
    if (action.kind === 'navigate' && matchesRule(rule, answers)) return action.fieldId
  }
  return undefined
}

function matchesRule(rule: FormLogicRule, answers: Record<string, unknown>): boolean {
  if (!rule.conditions.length) return false
  const results = rule.conditions.map((condition) => evaluateCondition(answers[condition.fieldId], condition.operator, condition.value))
  return rule.match === 'any' ? results.some(Boolean) : results.every(Boolean)
}
