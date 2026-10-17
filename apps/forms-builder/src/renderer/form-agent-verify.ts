import type { ExecutedToolCall } from '@revelith/agent-core'

const FORM_MUTATIONS = new Set([
  'update_form',
  'update_form_settings',
  'update_form_translation',
  'update_form_theme',
  'add_form_field',
  'manage_group_fields',
  'update_form_field',
  'configure_special_field',
  'delete_form_field',
  'move_form_field',
  'set_field_condition',
  'clear_field_conditions',
  'manage_form_variable',
  'add_logic_rule',
  'delete_logic_rule',
])

/** Ensure a changed form is structurally checked before the run can finish. */
export function verifyFormResponse(
  _finalText: string,
  executed: readonly ExecutedToolCall[],
): string | null {
  const successful = executed.map((call, index) => ({ ...call, index })).filter((call) => call.ok)
  const lastMutation = Math.max(
    -1,
    ...successful.filter((call) => FORM_MUTATIONS.has(call.name)).map((call) => call.index),
  )
  if (lastMutation < 0) return null
  const lastAudit = Math.max(
    -1,
    ...successful.filter((call) => call.name === 'audit_form').map((call) => call.index),
  )
  if (lastAudit > lastMutation) return null
  return 'The form changed but has not been verified. Call audit_form now. If it reports a structural or respondent-experience issue, repair it with the available native Forms tools and audit once more before replying.'
}
