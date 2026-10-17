import type { FormField, FormSchema } from './types'
import { selectFormToolNames } from './form-tool-routing'

type ToolName = ReturnType<typeof selectFormToolNames>[number]

/** Small allow-listed definition for explicit selected-field analysis. */
export function summarizeSelectedField(field: FormField, depth = 0): Record<string, unknown> {
  const clip = (value: unknown, limit = 240) =>
    typeof value === 'string' ? value.slice(0, limit) : undefined
  return {
    id: field.id,
    type: field.type,
    label: clip(field.label),
    required: field.required,
    ...(clip(field.placeholder) !== undefined ? { placeholder: clip(field.placeholder) } : {}),
    ...(clip(field.helpText) !== undefined ? { helpText: clip(field.helpText) } : {}),
    ...(clip(field.sectionDescription) !== undefined
      ? { sectionDescription: clip(field.sectionDescription) }
      : {}),
    ...(field.options?.length
      ? { options: field.options.slice(0, 16).map((item) => item.slice(0, 120)) }
      : {}),
    ...(field.rows?.length
      ? { rows: field.rows.slice(0, 12).map((item) => item.slice(0, 100)) }
      : {}),
    ...(field.columns?.length
      ? { columns: field.columns.slice(0, 12).map((item) => item.slice(0, 100)) }
      : {}),
    ...(field.children?.length && depth < 2
      ? {
          children: field.children
            .slice(0, 12)
            .map((child) => summarizeSelectedField(child, depth + 1)),
        }
      : {}),
  }
}

function fieldRefs(fields: FormField[], includeOptions: boolean, includeCopy = false): unknown[] {
  return fields.map((field) => ({
    id: field.id,
    type: field.type,
    label: field.label,
    ...(field.required ? { required: true } : {}),
    ...(includeOptions && field.options?.length ? { options: field.options } : {}),
    ...(includeCopy && field.placeholder !== undefined ? { placeholder: field.placeholder } : {}),
    ...(includeCopy && field.helpText !== undefined ? { helpText: field.helpText } : {}),
    ...(field.children?.length
      ? { children: fieldRefs(field.children, includeOptions, includeCopy) }
      : {}),
  }))
}

function translationSources(schema: FormSchema): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  const visit = (items: FormField[]) =>
    items.forEach((field) => {
      fields[field.id] = {
        type: field.type,
        label: field.label,
        ...(field.placeholder !== undefined ? { placeholder: field.placeholder } : {}),
        ...(field.helpText !== undefined ? { helpText: field.helpText } : {}),
        ...(field.sectionDescription !== undefined
          ? { sectionDescription: field.sectionDescription }
          : {}),
        ...(field.buttonText !== undefined ? { buttonText: field.buttonText } : {}),
        ...(field.termsText !== undefined ? { termsText: field.termsText } : {}),
        ...(field.options?.length
          ? { optionLabels: Object.fromEntries(field.options.map((option) => [option, option])) }
          : {}),
      }
      if (field.children) visit(field.children)
    })
  visit(schema.fields)
  return {
    title: schema.title,
    description: schema.description,
    fields,
    settings: {
      submitButtonText: schema.settings.submitButtonText,
      confirmationTitle: schema.settings.confirmationTitle,
      confirmationMessage: schema.settings.confirmationMessage,
      confirmationButtonText: schema.settings.confirmationButtonText,
      closedMessage: schema.settings.closedMessage,
    },
  }
}

/**
 * Keep the model request proportional to the user action. The full schema is
 * available through get_form; ordinary edits receive only the labels and IDs
 * needed to address targets, while translation receives source text.
 */
export function buildFormAgentContext(schema: FormSchema, instruction: string): string {
  const selected = new Set<ToolName>(selectFormToolNames(instruction))
  if (selected.size === 0 || selected.has('audit_form')) return ''
  if (selected.has('get_form')) {
    return `Live form reference: ${JSON.stringify({ id: schema.id, title: schema.title })}`
  }
  if (selected.has('update_form_translation')) {
    return `Source form text for translation: ${JSON.stringify(translationSources(schema))}`
  }

  const context: Record<string, unknown> = { id: schema.id, title: schema.title }
  if (selected.has('update_form')) context.description = schema.description
  const needsFields =
    selected.has('update_form_field') ||
    selected.has('configure_special_field') ||
    selected.has('delete_form_field') ||
    selected.has('move_form_field') ||
    selected.has('set_field_condition') ||
    selected.has('clear_field_conditions') ||
    selected.has('add_logic_rule')
  if (needsFields)
    context.fields = fieldRefs(
      schema.fields,
      selected.has('update_form_field'),
      selected.has('update_form') && selected.has('update_form_field'),
    )
  if (selected.has('manage_group_fields')) {
    context.groups = schema.fields
      .filter((field) => field.type === 'group')
      .map((field) => ({
        id: field.id,
        label: field.label,
        children: fieldRefs(field.children ?? [], true),
      }))
  }
  if (selected.has('manage_form_variable') || selected.has('add_logic_rule'))
    context.variables = schema.variables ?? []
  if (selected.has('delete_logic_rule'))
    context.logicRules = (schema.logicRules ?? []).map(({ id, name }) => ({ id, name }))
  return `Relevant form references: ${JSON.stringify(context)}`
}
