import { describe, expect, it } from 'vitest'
import type { FormSchema } from './types'
import { buildFormAgentContext, summarizeSelectedField } from './formAgentContext'

const schema = {
  id: 'form-1',
  title: 'Registration',
  description: 'Register here',
  fields: [
    {
      id: 'name',
      type: 'text',
      label: 'Name',
      required: true,
      helpText: 'Your full name',
      options: undefined,
    },
    {
      id: 'team',
      type: 'group',
      label: 'Team',
      required: false,
      children: [{ id: 'department', type: 'text', label: 'Department', required: false }],
    },
  ],
  settings: {
    submitButtonText: 'Submit',
    confirmationMessage: 'Thank you',
    confirmationTitle: 'Recorded',
    confirmationButtonText: 'Again',
    closedMessage: '',
  },
  variables: [{ id: 'score', name: 'Score', type: 'number', initialValue: 0 }],
  logicRules: [
    {
      id: 'route',
      name: 'Old route',
      match: 'all',
      conditions: [],
      action: { kind: 'navigate', fieldId: 'department' },
    },
  ],
} as unknown as FormSchema

describe('request-sized Forms Builder context', () => {
  it('summarizes only the selected field definition and excludes answer-like or scoring data', () => {
    const field = {
      id: 'email',
      type: 'email',
      label: 'Work email',
      required: true,
      placeholder: 'name@company.com',
      options: ['One', 'Two'],
      defaultValue: 'private@example.com',
      correctAnswers: ['private@example.com'],
    } as unknown as FormSchema['fields'][number]
    const summary = summarizeSelectedField(field)
    expect(summary).toMatchObject({
      id: 'email',
      type: 'email',
      label: 'Work email',
      required: true,
      options: ['One', 'Two'],
    })
    expect(JSON.stringify(summary)).not.toContain('private@example.com')
    expect(summary).not.toHaveProperty('correctAnswers')
    expect(summary).not.toHaveProperty('defaultValue')
  })

  it('sends no form payload for ordinary chat and audits', () => {
    expect(buildFormAgentContext(schema, 'What can you help me do?')).toBe('')
    expect(buildFormAgentContext(schema, 'Review this form for problems.')).toBe('')
  })

  it('does not pre-answer a live inspection request in the prompt', () => {
    const context = buildFormAgentContext(
      schema,
      'Inspect the current form and count its question fields.',
    )
    expect(context).toContain('Registration')
    expect(context).not.toContain('department')
    expect(context).not.toContain('Name')
  })

  it('gives a field edit only the field IDs and labels needed to identify its target', () => {
    const context = buildFormAgentContext(schema, 'Make the Name question required.')
    expect(context).toContain('"id":"name"')
    expect(context).toContain('"label":"Name"')
    expect(context).not.toContain('Your full name')
    expect(context).not.toContain('Old route')
    expect(context).not.toContain('"initialValue"')
  })

  it('sends existing copy only for the explicit AI polish action', () => {
    const context = buildFormAgentContext(
      schema,
      'Polish the wording of the form title and every question label.',
    )
    expect(context).toContain('Your full name')
    expect(context).toContain('"helpText":"Your full name"')
    expect(context).toContain('department')
  })

  it('gives a move request the existing target ID without sending the full schema', () => {
    const context = buildFormAgentContext(schema, 'Move the Name question to the first position.')
    expect(context).toContain('"id":"name"')
    expect(context).toContain('"label":"Name"')
    expect(context).not.toContain('Your full name')
    expect(context).not.toContain('Old route')
  })

  it('includes source respondent text only for a translation request', () => {
    const context = buildFormAgentContext(schema, 'Translate this form into German.')
    expect(context).toContain('Your full name')
    expect(context).toContain('Department')
    expect(context).toContain('Submit')
  })
})
