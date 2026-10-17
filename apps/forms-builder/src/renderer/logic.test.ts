import { describe, expect, it } from 'vitest'
import {
  calculateFormVariables,
  evaluateCondition,
  matchingNavigationTarget,
  shouldShowField,
} from './logic'
import type { FormField, FormLogicRule, FormVariable } from './types'

describe('typed form logic', () => {
  it('evaluates text, array, number, date, and empty comparisons', () => {
    expect(evaluateCondition('North Europe', 'contains', 'EUROPE')).toBe(true)
    expect(evaluateCondition(['Design', 'Research'], 'contains', 'Research')).toBe(true)
    expect(evaluateCondition(42, 'greater_or_equal_than', '42')).toBe(true)
    expect(evaluateCondition('2026-10-01', 'is_before', '2026-10-02')).toBe(true)
    expect(
      evaluateCondition({ firstName: 'Ari', lastName: 'Example' }, 'ends_with', 'example'),
    ).toBe(true)
    expect(evaluateCondition([], 'is_empty')).toBe(true)
    expect(evaluateCondition('filled', 'is_not_empty')).toBe(true)
    expect(evaluateCondition('not numeric', 'greater_than', '1')).toBe(false)
  })

  it('supports all and any condition groups for visibility', () => {
    const field: FormField = {
      id: 'follow-up',
      type: 'text',
      label: 'Follow up',
      required: false,
      conditionalLogic: {
        match: 'any',
        showWhen: [
          { fieldId: 'region', operator: 'equals', value: 'EU' },
          { fieldId: 'score', operator: 'greater_than', value: '8' },
        ],
      },
    }
    expect(shouldShowField(field, { region: 'US', score: 9 })).toBe(true)
    expect(
      shouldShowField(
        { ...field, conditionalLogic: { ...field.conditionalLogic!, match: 'all' } },
        { region: 'US', score: 9 },
      ),
    ).toBe(false)
    expect(shouldShowField(field, {})).toBe(false)
  })

  it('calculates variables in rule order and resolves matching navigation actions', () => {
    const variables: FormVariable[] = [
      { id: 'score', name: 'Score', type: 'number', initialValue: 2 },
      { id: 'note', name: 'Note', type: 'string', initialValue: 'start' },
    ]
    const rules: FormLogicRule[] = [
      {
        id: 'r1',
        name: 'Add points',
        match: 'all',
        conditions: [{ fieldId: 'rating', operator: 'greater_or_equal_than', value: '4' }],
        action: { kind: 'calculate', variableId: 'score', operation: 'add', value: 3 },
      },
      {
        id: 'r2',
        name: 'Append name',
        match: 'all',
        conditions: [{ fieldId: 'score', operator: 'greater_than', value: '4' }],
        action: {
          kind: 'calculate',
          variableId: 'note',
          operation: 'add',
          sourceFieldId: 'person',
        },
      },
      {
        id: 'r3',
        name: 'Skip to finish',
        match: 'all',
        conditions: [{ fieldId: 'score', operator: 'greater_than', value: '4' }],
        action: { kind: 'navigate', fieldId: 'finish' },
      },
    ]
    const answers = { rating: 5, person: 'Ari' }
    expect(calculateFormVariables(variables, rules, answers)).toEqual({
      score: 5,
      note: 'startAri',
    })
    expect(matchingNavigationTarget(rules, { ...answers, score: 5 })).toBe('finish')
    expect(
      calculateFormVariables(
        variables,
        [
          {
            ...rules[0]!,
            action: { kind: 'calculate', variableId: 'score', operation: 'divide', value: 0 },
          },
        ],
        answers,
      ).score,
    ).toBe(2)
  })
})
