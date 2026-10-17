/**
 * Locally select only the form tools relevant to one user turn. This runs
 * before a model request, costs no tokens, and deliberately falls back to the
 * complete tool set for ambiguous actionable requests.
 */
export const FORM_TOOL_NAMES = [
  'get_form', 'update_form', 'update_form_settings', 'update_form_translation',
  'update_form_theme', 'audit_form', 'add_form_field', 'manage_group_fields',
  'update_form_field', 'configure_special_field', 'delete_form_field',
  'move_form_field', 'set_field_condition', 'clear_field_conditions',
  'manage_form_variable', 'add_logic_rule', 'delete_logic_rule',
] as const

export type FormToolName = (typeof FORM_TOOL_NAMES)[number]

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text)
}

export function selectFormToolNames(instruction: string): FormToolName[] {
  const explicitTool = instruction.match(/(?:^|\b)RUN_FORM_TOOL:([a-z_]+)/)?.[1]
  if (explicitTool && FORM_TOOL_NAMES.includes(explicitTool as FormToolName)) return [explicitTool as FormToolName]

  // Do not classify example field labels, choice text, or JSON arguments as
  // agent intent (e.g. a field named "terms" is not a request to configure
  // consent wording). The schema itself is supplied separately as context.
  const text = instruction.toLocaleLowerCase()
    .replace(/(?:^|\n)\s*(?:arguments|parameters):\s*\{[^\n]*\}/g, ' ')
    .replace(/"[^"\n]*"|'[^'\n]*'/g, ' ')
  const selected = new Set<FormToolName>()
  // Building a complete respondent form is a coordinated workflow, not just a
  // sequence of add-question calls. Start with the native form, settings,
  // theme, creation, and audit tools so the agent can plan and verify it.
  const fullFormBuild =
    has(text, /\b(?:create|build|design|make|generate)\b(?:\s+[\w-]+){0,6}\s+\b(?:form|survey|questionnaire|registration|application|feedback|quiz)\b/) &&
    !has(text, /\b(?:create|build|design|make|generate)\s+(?:a\s+)?(?:group|single|one)\s+(?:field|question)\b/)

  // Canonical tool names are useful for explicit user instructions and keep
  // integration tests able to verify each capability without special hooks.
  for (const name of FORM_TOOL_NAMES) {
    const exactToolName = new RegExp(`(?<![a-z0-9_])${name}(?![a-z0-9_])`)
    if (exactToolName.test(text)) selected.add(name)
  }

  const auditRequest = selected.has('audit_form') || has(text, /\b(audit|review|check|validate|quality|accessib(?:le|ility)|find issues|find problems)\b/)
  const explicitReadRequest = has(text, /\b(read|inspect|list|what(?:'s| is) in|form schema)\b|\bhow many\b.{0,25}\b(question|field)s?\b|\bcount\b.{0,20}\b(question|field)s?\b|\bshow\s+(?:me\s+)?(?:the\s+)?(?:current\s+|whole\s+|entire\s+|complete\s+)?(?:form|form schema|all fields)\b/)
  // A request to audit and summarize findings is still one audit operation;
  // the summary is about the audit result, not a separate schema read. Keep
  // get_form only when the user explicitly asks to inspect/read/count as well.
  const summaryRequest = has(text, /\bsummari[sz]e\b/)
  if (explicitReadRequest || (summaryRequest && !auditRequest)) selected.add('get_form')
  if (auditRequest) selected.add('audit_form')
  if (fullFormBuild) {
    selected.add('get_form')
    selected.add('update_form')
    selected.add('update_form_settings')
    selected.add('update_form_theme')
    selected.add('add_form_field')
    selected.add('audit_form')
  }
  const translationRequest = has(text, /\b(translat|translation|language|locali[sz])\w*\b/)
  if (!translationRequest && has(text, /\b(title|description|rename|retitle|form name)\b/)) selected.add('update_form')
  if (has(text, /\b(setting|settings|submit button|confirmation|response limit|collect email|progress bar|question number|schedule|time limit|multiple responses|locale|date format|autosave)\b/)) selected.add('update_form_settings')
  if (translationRequest) selected.add('update_form_translation')
  if (has(text, /\b(theme|color|colour|font|style|spacing|content width|label position|appearance)\b/)) selected.add('update_form_theme')
  if (has(text, /\b(polish|proofread|rewrite|copy edit)\b/)) {
    selected.add('update_form')
    selected.add('update_form_field')
  }
  if (has(text, /\b(format|visual design|visual style)\b/)) selected.add('update_form_theme')

  const groupRequest = has(text, /\b(group|grouped|nested|child question|subquestion|repeatable)\b/)
  const specialFieldRequest = has(text, /\b(terms|consent|welcome screen|thank.?you screen|hidden field|picture choice|choice image|choice picture)\b/)
  const variableRequest = has(text, /\b(variable|calculation|calculate|formula)\b/)
  const createGroup = has(text, /\b(add|create|insert|build)\b.{0,35}\b(group)\b/) && !has(text, /\b(child|nested|subquestion|inside the group)\b/)
  if (groupRequest) selected.add('manage_group_fields')
  const createsLogicRule = has(text, /\b(create|add|make|write)\b.{0,35}\b(logic rule|routing rule)\b/)
  if (createGroup || (!groupRequest && !createsLogicRule && has(text, /\b(add|create|insert|include|build)\b.{0,55}\b(field|question|form|survey|registration|application|feedback|contact)\b|\b(field|question)\b.{0,35}\b(add|create|insert)\b/))) selected.add('add_form_field')
  if (!specialFieldRequest && !variableRequest && (has(text, /\b(choices|options|placeholder|help text|validation|quiz|score|media|image|layout|scale|randomize options)\b/)
    || has(text, /\b(update|edit|change|modify)\b.{0,35}\b(field|question)\b|\b(field|question)\b.{0,35}\b(update|edit|change|modify)\b/))) selected.add('update_form_field')
  if (has(text, /\b(make|mark|set|change)\b.{0,35}\b(required|optional|mandatory)\b/)) selected.add('update_form_field')
  if (specialFieldRequest) selected.add('configure_special_field')
  if (has(text, /\b(delete|remove)\b.{0,50}\b(field|question)\b|\b(field|question)\b.{0,35}\b(delete|remove)\b/)) selected.add('delete_form_field')
  if (has(text, /\b(move|reorder|rearrange|sort)\b.{0,45}\b(field|question)\b.{0,40}\b(to|into|position|first|last|before|after|up|down)\b|\b(position|order)\b.{0,30}\b(field|question)\b.{0,30}\b(first|last|before|after|up|down)\b/)) selected.add('move_form_field')
  const clearsCondition = has(text, /\b(clear|remove|delete)\b.{0,35}\b(condition|visibility rule)\b/)
  if (clearsCondition) selected.add('clear_field_conditions')
  else if (has(text, /\b(show|hide|visibility|visible|conditional|condition)\b/)) selected.add('set_field_condition')
  if (variableRequest) selected.add('manage_form_variable')
  const deletesLogic = has(text, /\b(delete|remove)\b.{0,45}\b(logic rule|branch|routing rule|route rule)\b/)
  if (deletesLogic) selected.add('delete_logic_rule')
  else if (has(text, /\b(logic rule|branch|branching|jump|navigate|skip to|routing rule)\b/)) selected.add('add_logic_rule')

  // A full form request legitimately needs multiple field operations. An
  // ambiguous action keeps every tool available rather than risking a partial
  // result because a local keyword rule guessed too narrowly.
  if (selected.size === 0 && has(text, /\b(create|build|design|edit|change|update|add|remove|delete|configure|set up|make|improve|refine|optimi[sz]e)\b/)) {
    return [...FORM_TOOL_NAMES]
  }
  return FORM_TOOL_NAMES.filter((name) => selected.has(name))
}

export function selectFormTools<T extends { name: string }>(instruction: string, tools: readonly T[]): T[] {
  const names = new Set<string>(selectFormToolNames(instruction))
  return tools.filter((tool) => names.has(tool.name as FormToolName))
}
