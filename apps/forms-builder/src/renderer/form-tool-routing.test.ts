import { describe, expect, it } from 'vitest'
import { FORM_TOOL_NAMES, selectFormToolNames, selectFormTools } from './form-tool-routing'

describe('Forms Builder request tool selection', () => {
  it('sends only the field creation tool for a clear single-field request', () => {
    expect(selectFormToolNames('Add a required email field.')).toEqual(['add_form_field'])
  })

  it('selects only the matching edit tool for field settings', () => {
    expect(selectFormToolNames('Make the Email question required.')).toEqual(['update_form_field'])
  })

  it('includes the related tools for multi-step group and branching requests', () => {
    expect(selectFormToolNames('Add a child question to the group.')).toEqual(['manage_group_fields'])
    expect(selectFormToolNames('Create a group field for the form.')).toEqual(['add_form_field', 'manage_group_fields'])
    expect(selectFormToolNames('When attendance is yes, show the dietary question.')).toEqual(['set_field_condition'])
    expect(selectFormToolNames('Create a logic rule that skips to the next question.')).toEqual(['add_logic_rule'])
  })

  it('uses read-only tools for inspection and no editing tools for ordinary chat', () => {
    expect(selectFormToolNames('Summarize the current form.')).toEqual(['get_form'])
    expect(selectFormToolNames('What can you help me do?')).toEqual([])
  })

  it('keeps the full capability set for ambiguous actionable requests', () => {
    expect(selectFormToolNames('Please improve this form.')).toEqual([...FORM_TOOL_NAMES])
  })

  it('starts complete form builds with native planning and verification tools', () => {
    const names = selectFormToolNames('Create a complete event registration form with a polished theme.')
    expect(names).toContain('get_form')
    expect(names).toContain('update_form')
    expect(names).toContain('update_form_settings')
    expect(names).toContain('update_form_theme')
    expect(names).toContain('add_form_field')
    expect(names).toContain('audit_form')
  })

  it('filters the definitions as well as the names', () => {
    const definitions = FORM_TOOL_NAMES.map((name) => ({ name, description: name }))
    expect(selectFormTools('Add a required email field.', definitions)).toEqual([
      { name: 'add_form_field', description: 'add_form_field' },
    ])
  })

  it('keeps toolbar AI actions on only the form tools they need', () => {
    expect(selectFormToolNames('Polish the wording of the form title and every question label.')).toEqual(['update_form', 'update_form_field'])
    expect(selectFormToolNames('Format the visual design with a cohesive theme and readable spacing.')).toEqual(['update_form_theme'])
    expect(selectFormToolNames('Review this form for clarity and accessibility without changing it.')).toEqual(['audit_form'])
    expect(selectFormToolNames('Call the audit_form tool for the current form now. Then summarize any respondent experience or structure issues it finds.')).toEqual(['audit_form'])
    expect(selectFormToolNames('Audit the form and inspect how many fields it contains.')).toEqual(['get_form', 'audit_form'])
    expect(selectFormToolNames('Add useful questions that are missing from this form.')).toEqual(['add_form_field'])
    expect(selectFormToolNames('Add a small number of useful missing questions for this form purpose. Avoid duplicates and keep the form concise. Use the add-question tool to create them.')).toEqual(['add_form_field'])
  })

  it('selects one focused tool for a natural-language request for every capability', () => {
    const requests: Array<[string, typeof FORM_TOOL_NAMES[number]]> = [
      ['Summarize the current form.', 'get_form'],
      ['Rename the form to Customer Intake.', 'update_form'],
      ['Turn on the progress bar and change the submit button text.', 'update_form_settings'],
      ['Translate the current form title into German.', 'update_form_translation'],
      ['Set the form primary color to #1769aa.', 'update_form_theme'],
      ['Check this form for accessibility issues.', 'audit_form'],
      ['Add a short text question labelled Project code.', 'add_form_field'],
      ['Add a short text child question inside the Team group.', 'manage_group_fields'],
      ['Make the Name question required.', 'update_form_field'],
      ['Change the consent wording on the Terms question.', 'configure_special_field'],
      ['Delete the Disposable field.', 'delete_form_field'],
      ['Move the Move me field to the first position.', 'move_form_field'],
      ['Show Department only when Name is not empty.', 'set_field_condition'],
      ['Clear the visibility condition on Department.', 'clear_field_conditions'],
      ['Create a number variable named Session score initialized to 3.', 'manage_form_variable'],
      ['Add a routing rule: if Name is not empty, navigate to Department.', 'add_logic_rule'],
      ['Delete the legacy routing rule named Legacy route.', 'delete_logic_rule'],
    ]
    for (const [instruction, expected] of requests) {
      expect(selectFormToolNames(instruction), instruction).toEqual([expected])
    }
  })

  it('routes everyday count and old-rule phrasing without offering unrelated tools', () => {
    expect(selectFormToolNames('How many questions are in this form right now?')).toEqual(['get_form'])
    expect(selectFormToolNames('Remove the old Legacy routing rule.')).toEqual(['delete_logic_rule'])
  })

  it('does not mistake a field label containing “move” for a move command', () => {
    expect(selectFormToolNames('Only show the Move me question when Name has an answer.')).toEqual(['set_field_condition'])
    expect(selectFormToolNames('Move the Move me question to the first position.')).toEqual(['move_form_field'])
  })
})
