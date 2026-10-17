import { describe, expect, it } from 'vitest'
import {
  formatLocaleDate,
  formatLocaleNumber,
  localizeFormSchema,
  respondentMessage,
} from './translations'
import type { FormSchema } from './types'

const form: FormSchema = {
  id: 'form-1',
  title: 'Feedback',
  description: 'Tell us what you think.',
  fields: [
    {
      id: 'group',
      type: 'group',
      label: 'Contact',
      required: false,
      children: [
        {
          id: 'email',
          type: 'email',
          label: 'Email',
          placeholder: 'you@example.com',
          required: true,
        },
        { id: 'choice', type: 'radio', label: 'Choice', required: false, options: ['Yes', 'No'] },
      ],
    },
  ],
  settings: {
    submitButtonText: 'Submit',
    showProgressBar: false,
    allowMultipleResponses: true,
    collectEmail: false,
    confirmationMessage: 'Thank you.',
  },
  translations: {
    de: {
      title: 'Rückmeldung',
      fields: {
        group: { label: 'Kontakt' },
        email: { label: 'E-Mail', placeholder: 'sie@beispiel.de' },
        choice: { optionLabels: { Yes: 'Ja', No: 'Nein' } },
      },
      settings: { submitButtonText: 'Senden' },
    },
  },
  theme: { primaryColor: '#2563eb', backgroundColor: '#fff', fontFamily: 'system-ui' },
}

describe('localizeFormSchema', () => {
  it('localizes form, nested fields, and respondent settings while keeping the source intact', () => {
    const localized = localizeFormSchema(form, 'de')
    expect(localized.title).toBe('Rückmeldung')
    expect(localized.fields[0]?.children?.[0]).toMatchObject({
      label: 'E-Mail',
      placeholder: 'sie@beispiel.de',
    })
    expect(localized.settings.submitButtonText).toBe('Senden')
    expect(localized.fields[0]?.children?.[1]).toMatchObject({
      options: ['Yes', 'No'],
      optionLabels: { Yes: 'Ja', No: 'Nein' },
    })
    expect(form.fields[0]?.children?.[0]?.label).toBe('Email')
  })

  it('falls back to source text for missing locales and untranslated labels', () => {
    expect(localizeFormSchema(form, 'fr')).toBe(form)
    const partial = { ...form, translations: { de: { title: 'Rückmeldung' } } }
    expect(localizeFormSchema(partial, 'de').fields[0]?.children?.[0]?.label).toBe('Email')
  })
})

describe('offline respondent locale support', () => {
  it('provides bundled built-in messages with regional fallback and formatted values', () => {
    expect(respondentMessage('de-AT', 'required')).toContain('erforderlich')
    expect(respondentMessage('fr-CA', 'next')).toBe('Suivant')
    expect(formatLocaleNumber(1234.5, 'de-DE')).toBe('1.234,5')
    expect(
      formatLocaleDate('2026-04-03T00:00:00Z', 'de-DE', { timeZone: 'UTC', dateStyle: 'short' }),
    ).toContain('03.04.26')
  })
})
