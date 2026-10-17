import { describe, expect, it } from 'vitest'
import { verifyFormResponse } from './form-agent-verify'

describe('form agent verification', () => {
  it('requires a native audit after form changes', () => {
    expect(verifyFormResponse('Done', [{ name: 'add_form_field', ok: true }])).toContain(
      'audit_form',
    )
  })

  it('accepts a form mutation after a successful audit', () => {
    expect(
      verifyFormResponse('Done', [
        { name: 'add_form_field', ok: true },
        { name: 'audit_form', ok: true },
      ]),
    ).toBeNull()
  })

  it('requires another audit when a repair happened after the first audit', () => {
    expect(
      verifyFormResponse('Done', [
        { name: 'add_form_field', ok: true },
        { name: 'audit_form', ok: true },
        { name: 'update_form_field', ok: true },
      ]),
    ).toContain('audit_form')
  })

  it('does not demand an audit for a read-only response', () => {
    expect(
      verifyFormResponse('There are two questions.', [{ name: 'get_form', ok: true }]),
    ).toBeNull()
  })
})
