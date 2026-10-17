import { describe, expect, it } from 'vitest'
import { normalizeFormSchema, FormSchemaError, removeFormFieldReferences } from './schema'
import type { FormSchema } from './types'

const defaults: FormSchema = {
  id: 'new-form',
  title: 'Untitled Form',
  description: '',
  fields: [],
  settings: {
    submitButtonText: 'Submit',
    showProgressBar: false,
    allowMultipleResponses: true,
    collectEmail: false,
    confirmationMessage: 'Thanks',
  },
  theme: { primaryColor: '#2563eb', backgroundColor: '#fff', fontFamily: 'system-ui' },
}

describe('normalizeFormSchema', () => {
  it('migrates a legacy schema by filling defaults and preserving extension data', () => {
    const result = normalizeFormSchema(
      {
        id: 'old',
        title: 'Legacy',
        fields: [{ id: 'q1', type: 'text', label: 'Name' }],
        customMeta: { key: 1 },
      },
      defaults,
    )
    expect(result.version).toBe(1)
    expect(result.settings.allowMultipleResponses).toBe(true)
    expect(result.fields[0]?.required).toBe(false)
    expect((result as FormSchema & { customMeta?: unknown }).customMeta).toEqual({ key: 1 })
  })

  it('rejects duplicate ids and unsupported field types instead of opening ambiguous forms', () => {
    expect(() =>
      normalizeFormSchema(
        {
          fields: [
            { id: 'q1', type: 'text', label: 'One' },
            { id: 'q1', type: 'text', label: 'Two' },
          ],
        },
        defaults,
      ),
    ).toThrow(FormSchemaError)
    expect(() =>
      normalizeFormSchema({ fields: [{ id: 'q1', type: 'unknown', label: 'One' }] }, defaults),
    ).toThrow(/unsupported type/)
  })

  it('rejects self-referencing or malformed visibility conditions and oversized choice lists', () => {
    expect(() =>
      normalizeFormSchema(
        {
          fields: [
            {
              id: 'q1',
              type: 'text',
              label: 'One',
              conditionalLogic: { showWhen: [{ fieldId: 'q1', operator: 'equals', value: 'x' }] },
            },
          ],
        },
        defaults,
      ),
    ).toThrow(/cannot depend on itself/)
    expect(() =>
      normalizeFormSchema(
        {
          fields: [
            {
              id: 'q1',
              type: 'select',
              label: 'Pick',
              options: Array.from({ length: 501 }, (_, i) => String(i)),
            },
          ],
        },
        defaults,
      ),
    ).toThrow(/invalid or excessive choices/)
  })

  it('accepts the added respondent field types and rejects unsafe validation patterns', () => {
    const normalized = normalizeFormSchema(
      {
        fields: [
          { id: 'name', type: 'fullname', label: 'Full name' },
          { id: 'dates', type: 'date_range', label: 'Travel dates' },
          { id: 'consent', type: 'legal_terms', label: 'Consent', termsText: 'Terms' },
        ],
      },
      defaults,
    )
    expect(normalized.fields.map((field) => field.type)).toEqual([
      'fullname',
      'date_range',
      'legal_terms',
    ])
    expect(() =>
      normalizeFormSchema(
        { fields: [{ id: 'q1', type: 'text', label: 'Input', validation: { pattern: '(a+)+$' } }] },
        defaults,
      ),
    ).toThrow(/invalid validation rules/)
  })

  it('normalizes variables and branching/calculation rules and rejects missing references', () => {
    const normalized = normalizeFormSchema(
      {
        fields: [
          { id: 'rating', type: 'rating', label: 'Rating' },
          { id: 'finish', type: 'statement', label: 'Finish' },
        ],
        variables: [{ id: 'score', name: 'Score', type: 'number', initialValue: 0 }],
        logicRules: [
          {
            id: 'rule1',
            name: 'High score',
            match: 'all',
            conditions: [{ fieldId: 'rating', operator: 'greater_than', value: '4' }],
            action: { kind: 'calculate', variableId: 'score', operation: 'add', value: 2 },
          },
        ],
      },
      defaults,
    )
    expect(normalized.logicRules).toHaveLength(1)
    expect(() =>
      normalizeFormSchema(
        {
          fields: [{ id: 'q1', type: 'text', label: 'Question' }],
          logicRules: [
            {
              id: 'r1',
              name: 'Bad target',
              match: 'all',
              conditions: [{ fieldId: 'missing', operator: 'equals', value: 'x' }],
              action: { kind: 'navigate', fieldId: 'q1' },
            },
          ],
        },
        defaults,
      ),
    ).toThrow(/invalid condition/)
  })

  it('rejects malformed calculation targets and navigation to non-question content', () => {
    const field = [{ id: 'note', type: 'statement', label: 'Read this' }]
    const rule = {
      id: 'route',
      name: 'Route',
      match: 'all',
      conditions: [{ fieldId: 'score', operator: 'greater_than', value: '1' }],
      action: { kind: 'navigate', fieldId: 'note' },
    }
    expect(() =>
      normalizeFormSchema(
        {
          fields: field,
          variables: [{ id: 'score', name: 'Score', type: 'number', initialValue: 0 }],
          logicRules: [rule],
        },
        defaults,
      ),
    ).toThrow(/non-question field/)
    expect(() =>
      normalizeFormSchema(
        {
          fields: [{ id: 'q', type: 'text', label: 'Question' }],
          variables: [{ id: 'score', name: 'Score', type: 'number', initialValue: 0 }],
          logicRules: [
            {
              ...rule,
              conditions: [{ fieldId: 'q', operator: 'equals', value: 'yes' }],
              action: {
                kind: 'calculate',
                variableId: 'score',
                operation: 'add',
                value: 'not a number',
              },
            },
          ],
        },
        defaults,
      ),
    ).toThrow(/invalid calculation/)
    const duplicateRule = {
      ...rule,
      id: 'dup',
      conditions: [{ fieldId: 'q', operator: 'equals', value: 'yes' }],
      action: { kind: 'navigate', fieldId: 'q' },
    }
    expect(() =>
      normalizeFormSchema(
        {
          fields: [{ id: 'q', type: 'text', label: 'Question' }],
          logicRules: [duplicateRule, duplicateRule],
        },
        defaults,
      ),
    ).toThrow(/malformed/)
  })

  it('validates quiz answers against actual choice options and field types', () => {
    const normalized = normalizeFormSchema(
      {
        fields: [
          {
            id: 'pick',
            type: 'checkbox',
            label: 'Pick',
            options: ['A', 'B'],
            correctAnswers: ['B'],
            randomizeOptions: true,
            validation: { points: 2 },
          },
        ],
      },
      defaults,
    )
    expect(normalized.fields[0]).toMatchObject({
      correctAnswers: ['B'],
      randomizeOptions: true,
      validation: { points: 2 },
    })
    expect(() =>
      normalizeFormSchema(
        { fields: [{ id: 'pick', type: 'text', label: 'Text', correctAnswers: ['A'] }] },
        defaults,
      ),
    ).toThrow(/invalid expected answers/)
    expect(() =>
      normalizeFormSchema(
        { fields: [{ id: 'pick', type: 'text', label: 'Text', randomizeOptions: true }] },
        defaults,
      ),
    ).toThrow(/cannot randomize choices/)
  })

  it('validates saved respondent-flow and quiz display settings', () => {
    expect(
      normalizeFormSchema(
        { fields: [], settings: { ...defaults.settings, showQuizScore: true } },
        defaults,
      ).settings.showQuizScore,
    ).toBe(true)
    expect(() =>
      normalizeFormSchema(
        { fields: [], settings: { ...defaults.settings, showQuizScore: 'yes' } },
        defaults,
      ),
    ).toThrow(/showQuizScore must be boolean/)
    expect(() =>
      normalizeFormSchema(
        { fields: [], settings: { ...defaults.settings, timeLimitMinutes: 2000 } },
        defaults,
      ),
    ).toThrow(/time limit/)
  })

  it('validates UTC schedule windows and custom closed messages', () => {
    const scheduled = normalizeFormSchema(
      {
        fields: [],
        settings: {
          ...defaults.settings,
          scheduleOpenAt: '2026-10-01T09:00:00.000Z',
          scheduleCloseAt: '2026-10-01T17:00:00.000Z',
          closedMessage: 'Registration has ended.',
        },
      },
      defaults,
    )
    expect(scheduled.settings.closedMessage).toBe('Registration has ended.')
    expect(() =>
      normalizeFormSchema(
        { fields: [], settings: { ...defaults.settings, scheduleOpenAt: 'tomorrow' } },
        defaults,
      ),
    ).toThrow(/valid date and time/)
    expect(() =>
      normalizeFormSchema(
        {
          fields: [],
          settings: {
            ...defaults.settings,
            scheduleOpenAt: '2026-10-01T17:00:00Z',
            scheduleCloseAt: '2026-10-01T09:00:00Z',
          },
        },
        defaults,
      ),
    ).toThrow(/close time must be after/)
  })

  it('normalizes nested grouped questions with unique child identifiers and enforces the total field bound', () => {
    const grouped = normalizeFormSchema(
      {
        fields: [
          {
            id: 'group',
            type: 'group',
            label: 'Contact details',
            children: [
              { id: 'first', type: 'text', label: 'First name' },
              { id: 'email', type: 'email', label: 'Email', required: true },
            ],
          },
        ],
      },
      defaults,
    )
    expect(grouped.fields[0]?.children?.map((field) => field.id)).toEqual(['first', 'email'])
    expect(() =>
      normalizeFormSchema(
        {
          fields: [
            {
              id: 'not-a-group',
              type: 'text',
              label: 'Text',
              children: [{ id: 'child', type: 'text', label: 'Child' }],
            },
          ],
        },
        defaults,
      ),
    ).toThrow(/Only question groups/)
    expect(() =>
      normalizeFormSchema(
        {
          fields: [
            {
              id: 'group',
              type: 'group',
              label: 'Group',
              children: [{ id: 'group', type: 'text', label: 'Duplicate' }],
            },
          ],
        },
        defaults,
      ),
    ).toThrow(/Duplicate field id/)
  })

  it('accepts choice presentation and rejects unsafe or orphaned presentation data', () => {
    const schema = normalizeFormSchema(
      {
        fields: [
          {
            id: 'choice',
            type: 'radio',
            label: 'Pick one',
            options: ['A', 'B'],
            choiceColors: { A: '#1D4ED8' },
            choiceIcons: { B: '★' },
            choiceLayout: 'cards',
          },
        ],
      },
      defaults,
    )
    expect(schema.fields[0]).toMatchObject({
      choiceColors: { A: '#1D4ED8' },
      choiceIcons: { B: '★' },
      choiceLayout: 'cards',
    })
    expect(() =>
      normalizeFormSchema(
        {
          fields: [
            {
              id: 'choice',
              type: 'radio',
              label: 'Pick one',
              options: ['A'],
              choiceColors: { A: 'red' },
            },
          ],
        },
        defaults,
      ),
    ).toThrow(/invalid choice colors/)
    expect(() =>
      normalizeFormSchema(
        {
          fields: [
            { id: 'choice', type: 'text', label: 'Text', options: ['A'], choiceLayout: 'cards' },
          ],
        },
        defaults,
      ),
    ).toThrow(/cannot use custom choice presentation/)
  })

  it('normalizes field media layout and rejects unsafe URLs or invalid presentation bounds', () => {
    const media = normalizeFormSchema(
      {
        fields: [
          {
            id: 'image',
            type: 'text',
            label: 'Describe the picture',
            layout: {
              mediaUrl: 'https://images.example.test/prompt.jpg',
              mediaType: 'image',
              align: 'split_left',
              brightness: -25,
              backgroundColor: '#F1F5F9',
            },
          },
        ],
      },
      defaults,
    )
    expect(media.fields[0]?.layout).toMatchObject({
      width: '100%',
      mediaUrl: 'https://images.example.test/prompt.jpg',
      align: 'split_left',
      brightness: -25,
    })
    expect(() =>
      normalizeFormSchema(
        {
          fields: [
            {
              id: 'bad-media',
              type: 'text',
              label: 'Bad media',
              layout: { width: '100%', mediaUrl: 'javascript:alert(1)' },
            },
          ],
        },
        defaults,
      ),
    ).toThrow(/credential-free HTTPS/)
    expect(() =>
      normalizeFormSchema(
        {
          fields: [
            {
              id: 'bad-brightness',
              type: 'text',
              label: 'Bad brightness',
              layout: { width: '100%', brightness: 101 },
            },
          ],
        },
        defaults,
      ),
    ).toThrow(/brightness must be between/)
  })

  it('validates translated choice labels against stable source choices', () => {
    const translated = normalizeFormSchema(
      {
        fields: [{ id: 'choice', type: 'radio', label: 'Answer', options: ['Yes', 'No'] }],
        translations: { de: { fields: { choice: { optionLabels: { Yes: 'Ja', No: 'Nein' } } } } },
      },
      defaults,
    )
    expect(translated.translations?.de?.fields?.choice?.optionLabels).toEqual({
      Yes: 'Ja',
      No: 'Nein',
    })
    expect(() =>
      normalizeFormSchema(
        {
          fields: [{ id: 'choice', type: 'radio', label: 'Answer', options: ['Yes'] }],
          translations: { de: { fields: { choice: { optionLabels: { Missing: 'Fehlt' } } } } },
        },
        defaults,
      ),
    ).toThrow(/choice labels/)
  })

  it('prunes translated text when a source field is deleted so the draft remains loadable', () => {
    const schema = normalizeFormSchema(
      {
        fields: [
          { id: 'remove-me', type: 'text', label: 'Old question' },
          { id: 'keep-me', type: 'text', label: 'Keep this' },
        ],
        translations: {
          de: {
            fields: { 'remove-me': { label: 'Alte Frage' }, 'keep-me': { label: 'Behalten' } },
          },
        },
      },
      defaults,
    )
    const removed = removeFormFieldReferences(schema, 'remove-me')
    expect(removed.fields.map((field) => field.id)).toEqual(['keep-me'])
    expect(removed.translations?.de?.fields).toEqual({ 'keep-me': { label: 'Behalten' } })
    expect(normalizeFormSchema(removed, defaults).fields.map((field) => field.id)).toEqual([
      'keep-me',
    ])
  })
})
