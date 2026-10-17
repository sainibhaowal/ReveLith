import type { FieldType, FormField, FormSchema, FormLogicRule, FormVariable } from './types'

export const FORM_SCHEMA_VERSION = 1

/** Author canvas color of a fresh form. A form still using it has no deliberate
 * canvas color, so the design surface may follow the app theme instead of
 * forcing a light frame around the paper. */
export const DEFAULT_CANVAS_BACKGROUND = '#f8fafc'

const FIELD_TYPES: readonly FieldType[] = [
  'group',
  'text',
  'textarea',
  'number',
  'email',
  'date',
  'select',
  'radio',
  'checkbox',
  'file',
  'signature',
  'rating',
  'address',
  'phone',
  'url',
  'time',
  'currency',
  'yesno',
  'nps',
  'section',
  'pagebreak',
  'fullname',
  'date_range',
  'picture_choice',
  'country',
  'legal_terms',
  'input_table',
  'statement',
  'welcome',
  'thankyou',
  'hidden',
]
const FIELD_ID_MAX = 160
const FIELD_COUNT_MAX = 500
const TEXT_MAX = 10_000

export class FormSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormSchemaError'
  }
}

/** Remove a field and every dependent rule/translation reference atomically. */
export function removeFormFieldReferences(schema: FormSchema, fieldId: string): FormSchema {
  const removedIds = new Set<string>()
  const removeTree = (fields: FormField[]): FormField[] =>
    fields.flatMap((field) => {
      if (field.id === fieldId) {
        const collect = (item: FormField) => {
          removedIds.add(item.id)
          item.children?.forEach(collect)
        }
        collect(field)
        return []
      }
      return [{ ...field, children: field.children ? removeTree(field.children) : undefined }]
    })
  const fields = removeTree(schema.fields)
  const pruneTree = (items: FormField[]): FormField[] =>
    items.map((field) => {
      const showWhen =
        field.conditionalLogic?.showWhen.filter(
          (condition) => !removedIds.has(condition.fieldId),
        ) ?? []
      return {
        ...field,
        conditionalLogic: showWhen.length ? { ...field.conditionalLogic, showWhen } : undefined,
        children: field.children ? pruneTree(field.children) : undefined,
      }
    })
  const logicRules = (schema.logicRules ?? []).filter((rule) => {
    if (rule.conditions.some((condition) => removedIds.has(condition.fieldId))) return false
    if (rule.action.kind === 'navigate' && removedIds.has(rule.action.fieldId)) return false
    if (
      rule.action.kind === 'calculate' &&
      rule.action.sourceFieldId &&
      removedIds.has(rule.action.sourceFieldId)
    )
      return false
    return true
  })
  const translations =
    schema.translations &&
    Object.fromEntries(
      Object.entries(schema.translations).map(([locale, translation]) => {
        const translatedFields =
          translation.fields &&
          Object.fromEntries(
            Object.entries(translation.fields).filter(([id]) => !removedIds.has(id)),
          )
        return [
          locale,
          { ...translation, ...(translatedFields ? { fields: translatedFields } : {}) },
        ]
      }),
    )
  return {
    ...schema,
    fields: pruneTree(fields),
    logicRules,
    ...(translations ? { translations } : {}),
  }
}

export function isSafeFieldValidation(
  value: unknown,
): value is NonNullable<FormField['validation']> {
  if (!isRecord(value)) return false
  const stringKeys = ['customMessage', 'accept', 'expectedAnswer']
  const numberKeys = [
    'minLength',
    'maxLength',
    'min',
    'max',
    'minSelections',
    'maxSelections',
    'maxFileSizeMb',
    'maxFiles',
    'points',
  ]
  const booleanKeys = ['allowOther', 'matchExpected']
  const allowed = new Set([...stringKeys, ...numberKeys, ...booleanKeys, 'pattern'])
  if (Object.keys(value).some((key) => !allowed.has(key))) return false
  if (
    stringKeys.some(
      (key) =>
        value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > 2000),
    )
  )
    return false
  if (booleanKeys.some((key) => value[key] !== undefined && typeof value[key] !== 'boolean'))
    return false
  if (
    numberKeys.some(
      (key) =>
        value[key] !== undefined &&
        (typeof value[key] !== 'number' ||
          !Number.isFinite(value[key]) ||
          Number(value[key]) < 0 ||
          Number(value[key]) > 1_000_000),
    )
  )
    return false
  if (
    value.maxFiles !== undefined &&
    (!Number.isInteger(value.maxFiles) ||
      Number(value.maxFiles) < 1 ||
      Number(value.maxFiles) > 100)
  )
    return false
  if (value.pattern !== undefined) {
    if (
      typeof value.pattern !== 'string' ||
      value.pattern.length > 256 ||
      /\([^)]*[+*{][^)]*\)[+*{]/.test(value.pattern) ||
      /\([^)]*\|[^)]*\)[+*{]/.test(value.pattern) ||
      /\\[1-9]|\(\?/.test(value.pattern)
    )
      return false
    try {
      new RegExp(value.pattern)
    } catch {
      return false
    }
  }
  return true
}

/** Normalize legacy documents without discarding unknown extension properties. */
export function normalizeFormSchema(input: unknown, defaults: FormSchema): FormSchema {
  if (!isRecord(input) || !Array.isArray(input.fields))
    throw new FormSchemaError('The file does not contain a form field list.')
  if (input.fields.length > FIELD_COUNT_MAX)
    throw new FormSchemaError(`A form can contain at most ${FIELD_COUNT_MAX} fields.`)
  const fieldBudget = { count: 0 }
  const fields = input.fields.map((raw, index) => normalizeField(raw, index, 0, fieldBudget))
  const ids = new Set<string>()
  for (const field of fields.flatMap(flattenFieldTree)) {
    if (ids.has(field.id)) throw new FormSchemaError(`Duplicate field id: ${field.id}`)
    ids.add(field.id)
  }
  const variables = normalizeVariables(input.variables)
  for (const variable of variables) {
    if (ids.has(variable.id))
      throw new FormSchemaError(`Variable id collides with a field id: ${variable.id}`)
    ids.add(variable.id)
  }
  const logicRules = normalizeLogicRules(input.logicRules, fields, variables, ids)
  const translations = normalizeTranslations(input.translations, fields)
  return {
    ...defaults,
    ...input,
    id: boundedString(input.id, defaults.id, FIELD_ID_MAX),
    title: boundedString(input.title, defaults.title, TEXT_MAX),
    description: boundedString(input.description, defaults.description, TEXT_MAX),
    fields,
    variables,
    logicRules,
    translations,
    settings: normalizeSettings(input.settings, defaults.settings),
    theme: { ...defaults.theme, ...(isRecord(input.theme) ? input.theme : {}) },
    version: FORM_SCHEMA_VERSION,
  } as FormSchema
}

function normalizeTranslations(value: unknown, fields: FormField[]): FormSchema['translations'] {
  if (value === undefined) return {}
  if (!isRecord(value) || Object.keys(value).length > 25)
    throw new FormSchemaError('The form translations are malformed or exceed 25 languages.')
  const fieldIds = new Set(fields.flatMap(flattenFieldTree).map((field) => field.id))
  const fieldTextKeys = [
    'label',
    'placeholder',
    'helpText',
    'sectionDescription',
    'buttonText',
    'termsText',
  ] as const
  const settingTextKeys = [
    'submitButtonText',
    'confirmationTitle',
    'confirmationMessage',
    'confirmationButtonText',
    'closedMessage',
  ] as const
  const result: NonNullable<FormSchema['translations']> = {}
  for (const [locale, raw] of Object.entries(value)) {
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(locale) || !isRecord(raw))
      throw new FormSchemaError(`Translation locale ${locale} is malformed.`)
    if (
      (raw.title !== undefined && (typeof raw.title !== 'string' || raw.title.length > TEXT_MAX)) ||
      (raw.description !== undefined &&
        (typeof raw.description !== 'string' || raw.description.length > TEXT_MAX))
    )
      throw new FormSchemaError(`Translation ${locale} has invalid form text.`)
    if (raw.fields !== undefined && !isRecord(raw.fields))
      throw new FormSchemaError(`Translation ${locale} has malformed field translations.`)
    const translatedFields: NonNullable<NonNullable<FormSchema['translations']>[string]['fields']> =
      {}
    for (const [fieldId, properties] of Object.entries(
      (raw.fields ?? {}) as Record<string, unknown>,
    )) {
      if (
        !fieldIds.has(fieldId) ||
        !isRecord(properties) ||
        Object.keys(properties).some(
          (key) =>
            !fieldTextKeys.includes(key as (typeof fieldTextKeys)[number]) &&
            key !== 'optionLabels',
        ) ||
        Object.entries(properties).some(
          ([key, text]) =>
            key !== 'optionLabels' && (typeof text !== 'string' || text.length > TEXT_MAX),
        )
      )
        throw new FormSchemaError(
          `Translation ${locale} contains an invalid field entry: ${fieldId}.`,
        )
      if (properties.optionLabels !== undefined) {
        const source = fields.flatMap(flattenFieldTree).find((field) => field.id === fieldId)
        const labels = properties.optionLabels
        if (
          !source ||
          !['select', 'radio', 'checkbox', 'picture_choice', 'country'].includes(source.type) ||
          !isRecord(labels) ||
          Object.keys(labels).length > 500 ||
          Object.entries(labels).some(
            ([option, label]) =>
              !(source.options ?? []).includes(option) ||
              typeof label !== 'string' ||
              label.length > TEXT_MAX,
          )
        )
          throw new FormSchemaError(
            `Translation ${locale} has invalid choice labels for field ${fieldId}.`,
          )
      }
      translatedFields[fieldId] = properties as (typeof translatedFields)[string]
    }
    if (
      raw.settings !== undefined &&
      (!isRecord(raw.settings) ||
        Object.keys(raw.settings).some(
          (key) => !settingTextKeys.includes(key as (typeof settingTextKeys)[number]),
        ) ||
        Object.values(raw.settings).some(
          (text) => typeof text !== 'string' || text.length > TEXT_MAX,
        ))
    )
      throw new FormSchemaError(`Translation ${locale} has invalid respondent settings.`)
    result[locale] = {
      ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
      ...(raw.fields ? { fields: translatedFields } : {}),
      ...(raw.settings
        ? {
            settings: raw.settings as NonNullable<
              NonNullable<FormSchema['translations']>[string]['settings']
            >,
          }
        : {}),
    }
  }
  return result
}

function normalizeSettings(
  value: unknown,
  defaults: FormSchema['settings'],
): FormSchema['settings'] {
  if (value !== undefined && !isRecord(value))
    throw new FormSchemaError('The form settings are malformed.')
  const settings = { ...defaults, ...(isRecord(value) ? value : {}) } as FormSchema['settings']
  for (const key of [
    'showProgressBar',
    'allowMultipleResponses',
    'collectEmail',
    'showQuestionNumbers',
    'showQuestionList',
    'showNavigationArrows',
    'showQuizScore',
    'closeOnLimit',
  ] as const) {
    if (settings[key] !== undefined && typeof settings[key] !== 'boolean')
      throw new FormSchemaError(`Form setting ${key} must be boolean.`)
  }
  if (
    settings.navigationMode !== undefined &&
    !['all-at-once', 'one-at-a-time', 'paged'].includes(settings.navigationMode)
  )
    throw new FormSchemaError('The form navigation mode is unsupported.')
  if (
    settings.timeLimitMinutes !== undefined &&
    (!Number.isInteger(settings.timeLimitMinutes) ||
      settings.timeLimitMinutes < 1 ||
      settings.timeLimitMinutes > 1440)
  )
    throw new FormSchemaError('The form time limit must be between 1 and 1,440 minutes.')
  if (
    settings.autosaveIntervalSeconds !== undefined &&
    (!Number.isInteger(settings.autosaveIntervalSeconds) ||
      settings.autosaveIntervalSeconds < 5 ||
      settings.autosaveIntervalSeconds > 300)
  )
    throw new FormSchemaError('The form autosave interval must be between 5 and 300 seconds.')
  for (const key of ['scheduleOpenAt', 'scheduleCloseAt'] as const) {
    if (
      settings[key] !== undefined &&
      settings[key] !== '' &&
      (typeof settings[key] !== 'string' ||
        settings[key].length > 64 ||
        !Number.isFinite(Date.parse(settings[key])))
    )
      throw new FormSchemaError(`Form setting ${key} must be a valid date and time.`)
  }
  if (
    settings.scheduleOpenAt &&
    settings.scheduleCloseAt &&
    Date.parse(settings.scheduleCloseAt) <= Date.parse(settings.scheduleOpenAt)
  )
    throw new FormSchemaError('The form close time must be after its open time.')
  if (
    settings.closedMessage !== undefined &&
    (typeof settings.closedMessage !== 'string' || settings.closedMessage.length > TEXT_MAX)
  )
    throw new FormSchemaError('The form closed message is invalid.')
  return settings
}

function flattenFieldTree(field: FormField): FormField[] {
  return [field, ...(field.children ?? []).flatMap(flattenFieldTree)]
}

function normalizeVariables(value: unknown): FormVariable[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 200)
    throw new FormSchemaError('The form has an invalid or excessive variable list.')
  return value.map((raw, index) => {
    if (
      !isRecord(raw) ||
      typeof raw.id !== 'string' ||
      !raw.id ||
      raw.id.length > FIELD_ID_MAX ||
      typeof raw.name !== 'string' ||
      !raw.name.trim() ||
      raw.name.length > 200 ||
      (raw.type !== 'string' && raw.type !== 'number')
    )
      throw new FormSchemaError(`Variable ${index + 1} is malformed.`)
    if (
      raw.type === 'number' &&
      (typeof raw.initialValue !== 'number' || !Number.isFinite(raw.initialValue))
    )
      throw new FormSchemaError(`Variable ${raw.name} needs a finite numeric starting value.`)
    if (
      raw.type === 'string' &&
      (typeof raw.initialValue !== 'string' || raw.initialValue.length > TEXT_MAX)
    )
      throw new FormSchemaError(`Variable ${raw.name} needs a bounded text starting value.`)
    return raw as FormVariable
  })
}

function normalizeLogicRules(
  value: unknown,
  fields: FormField[],
  variables: FormVariable[],
  ids: Set<string>,
): FormLogicRule[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 500)
    throw new FormSchemaError('The form has an invalid or excessive logic rule list.')
  const ruleIds = new Set<string>()
  return value.map((raw, index) => {
    if (
      !isRecord(raw) ||
      typeof raw.id !== 'string' ||
      !raw.id ||
      raw.id.length > FIELD_ID_MAX ||
      ruleIds.has(raw.id) ||
      typeof raw.name !== 'string' ||
      !raw.name.trim() ||
      raw.name.length > 200 ||
      !Array.isArray(raw.conditions) ||
      raw.conditions.length < 1 ||
      raw.conditions.length > 50 ||
      (raw.match !== 'all' && raw.match !== 'any') ||
      !isRecord(raw.action)
    )
      throw new FormSchemaError(`Logic rule ${index + 1} is malformed.`)
    ruleIds.add(raw.id)
    for (const condition of raw.conditions) {
      if (
        !isRecord(condition) ||
        typeof condition.fieldId !== 'string' ||
        !ids.has(condition.fieldId) ||
        typeof condition.operator !== 'string' ||
        typeof condition.value !== 'string' ||
        condition.value.length > TEXT_MAX ||
        ![
          'equals',
          'not_equals',
          'contains',
          'not_contains',
          'starts_with',
          'ends_with',
          'greater_than',
          'greater_or_equal_than',
          'less_than',
          'less_or_equal_than',
          'is_before',
          'is_after',
          'is_empty',
          'is_not_empty',
        ].includes(condition.operator)
      )
        throw new FormSchemaError(`Logic rule ${raw.name} has an invalid condition.`)
    }
    if (raw.action.kind === 'navigate') {
      if (
        typeof raw.action.fieldId !== 'string' ||
        !fields.some(
          (field) =>
            field.id === raw.action.fieldId &&
            !['section', 'pagebreak', 'statement', 'welcome', 'thankyou', 'hidden'].includes(
              field.type,
            ),
        )
      )
        throw new FormSchemaError(`Logic rule ${raw.name} targets a missing or non-question field.`)
    } else if (raw.action.kind === 'calculate') {
      const variable = variables.find((item) => item.id === raw.action.variableId)
      const operation = raw.action.operation
      if (
        !variable ||
        !['assign', 'add', 'subtract', 'multiply', 'divide'].includes(String(operation)) ||
        (raw.action.sourceFieldId !== undefined &&
          (typeof raw.action.sourceFieldId !== 'string' || !ids.has(raw.action.sourceFieldId))) ||
        (raw.action.value !== undefined &&
          typeof raw.action.value !== 'string' &&
          typeof raw.action.value !== 'number') ||
        (typeof raw.action.value === 'number' && !Number.isFinite(raw.action.value)) ||
        (typeof raw.action.value === 'string' && raw.action.value.length > TEXT_MAX) ||
        (variable.type === 'string' && operation !== 'assign' && operation !== 'add') ||
        (variable.type === 'number' && typeof raw.action.value === 'string')
      )
        throw new FormSchemaError(`Logic rule ${raw.name} has an invalid calculation.`)
    } else throw new FormSchemaError(`Logic rule ${raw.name} has an unsupported action.`)
    return raw as FormLogicRule
  })
}

function normalizeField(
  raw: unknown,
  index: number,
  depth: number,
  budget: { count: number },
): FormField {
  if (depth > 4) throw new FormSchemaError('Nested form fields cannot exceed four levels.')
  budget.count++
  if (budget.count > FIELD_COUNT_MAX)
    throw new FormSchemaError(
      `A form can contain at most ${FIELD_COUNT_MAX} fields including nested fields.`,
    )
  if (!isRecord(raw)) throw new FormSchemaError(`Field ${index + 1} is malformed.`)
  if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > FIELD_ID_MAX)
    throw new FormSchemaError(`Field ${index + 1} has an invalid id.`)
  if (!FIELD_TYPES.includes(raw.type as FieldType))
    throw new FormSchemaError(`Field ${raw.id} uses an unsupported type.`)
  if (typeof raw.label !== 'string' || raw.label.length > TEXT_MAX)
    throw new FormSchemaError(`Field ${raw.id} has an invalid label.`)
  if (
    raw.options !== undefined &&
    (!Array.isArray(raw.options) ||
      raw.options.length > 500 ||
      raw.options.some((option) => typeof option !== 'string' || option.length > 1000))
  ) {
    throw new FormSchemaError(`Field ${raw.id} has invalid or excessive choices.`)
  }
  if (raw.choiceImages !== undefined) {
    if (
      !isRecord(raw.choiceImages) ||
      Object.keys(raw.choiceImages).length > 100 ||
      Object.entries(raw.choiceImages).some(
        ([label, url]) =>
          label.length > 1000 ||
          typeof url !== 'string' ||
          url.length > 2048 ||
          !/^https:\/\//i.test(url),
      )
    ) {
      throw new FormSchemaError(`Field ${raw.id} has invalid choice images; use HTTPS image URLs.`)
    }
  }
  if (
    raw.choiceColors !== undefined &&
    (!isRecord(raw.choiceColors) ||
      Object.keys(raw.choiceColors).length > 100 ||
      Object.entries(raw.choiceColors).some(
        ([label, color]) =>
          label.length > 1000 ||
          typeof color !== 'string' ||
          !/^#[\da-f]{6}$/i.test(color) ||
          !Array.isArray(raw.options) ||
          !(raw.options as unknown[]).includes(label),
      ))
  )
    throw new FormSchemaError(`Field ${raw.id} has invalid choice colors.`)
  if (
    raw.choiceIcons !== undefined &&
    (!isRecord(raw.choiceIcons) ||
      Object.keys(raw.choiceIcons).length > 100 ||
      Object.entries(raw.choiceIcons).some(
        ([label, icon]) =>
          label.length > 1000 ||
          typeof icon !== 'string' ||
          icon.length > 24 ||
          !Array.isArray(raw.options) ||
          !(raw.options as unknown[]).includes(label),
      ))
  )
    throw new FormSchemaError(`Field ${raw.id} has invalid choice icons.`)
  if (
    raw.optionLabels !== undefined &&
    (!isRecord(raw.optionLabels) ||
      Object.keys(raw.optionLabels).length > 500 ||
      !['select', 'radio', 'checkbox', 'picture_choice', 'country'].includes(String(raw.type)) ||
      Object.entries(raw.optionLabels).some(
        ([option, label]) =>
          !Array.isArray(raw.options) ||
          !(raw.options as unknown[]).includes(option) ||
          typeof label !== 'string' ||
          label.length > TEXT_MAX,
      ))
  )
    throw new FormSchemaError(`Field ${raw.id} has invalid translated choice labels.`)
  if (
    raw.choiceLayout !== undefined &&
    !['vertical', 'horizontal', 'cards'].includes(String(raw.choiceLayout))
  )
    throw new FormSchemaError(`Field ${raw.id} has an invalid choice layout.`)
  if (
    (raw.choiceColors !== undefined ||
      raw.choiceIcons !== undefined ||
      raw.choiceLayout !== undefined) &&
    !['radio', 'checkbox', 'picture_choice'].includes(String(raw.type))
  )
    throw new FormSchemaError(`Field ${raw.id} cannot use custom choice presentation.`)
  if (raw.layout !== undefined) {
    if (
      !isRecord(raw.layout) ||
      Object.keys(raw.layout).some(
        (key) =>
          !['width', 'mediaType', 'mediaUrl', 'backgroundColor', 'brightness', 'align'].includes(
            key,
          ),
      )
    )
      throw new FormSchemaError(`Field ${raw.id} has an invalid layout.`)
    if (
      raw.layout.width !== undefined &&
      !['25%', '50%', '75%', '100%'].includes(String(raw.layout.width))
    )
      throw new FormSchemaError(`Field ${raw.id} has an invalid width.`)
    if (
      raw.layout.mediaType !== undefined &&
      raw.layout.mediaType !== 'image' &&
      raw.layout.mediaType !== 'video'
    )
      throw new FormSchemaError(`Field ${raw.id} has an invalid media type.`)
    if (
      raw.layout.mediaUrl !== undefined &&
      (typeof raw.layout.mediaUrl !== 'string' || !isSafeRemoteMediaURL(raw.layout.mediaUrl))
    )
      throw new FormSchemaError(`Field ${raw.id} media must use a credential-free HTTPS URL.`)
    if (
      raw.layout.backgroundColor !== undefined &&
      (typeof raw.layout.backgroundColor !== 'string' ||
        !/^#[\da-f]{6}$/i.test(raw.layout.backgroundColor))
    )
      throw new FormSchemaError(`Field ${raw.id} background color must be a six-digit hex color.`)
    if (
      raw.layout.brightness !== undefined &&
      (typeof raw.layout.brightness !== 'number' ||
        !Number.isFinite(raw.layout.brightness) ||
        raw.layout.brightness < -100 ||
        raw.layout.brightness > 100)
    )
      throw new FormSchemaError(`Field ${raw.id} brightness must be between -100 and 100.`)
    if (
      raw.layout.align !== undefined &&
      !['inline', 'float_left', 'float_right', 'split_left', 'split_right', 'cover'].includes(
        String(raw.layout.align),
      )
    )
      throw new FormSchemaError(`Field ${raw.id} has an invalid media placement.`)
    raw.layout = { ...raw.layout, width: raw.layout.width ?? '100%' }
  }
  if (raw.randomizeOptions !== undefined && typeof raw.randomizeOptions !== 'boolean')
    throw new FormSchemaError(`Field ${raw.id} has an invalid option randomization setting.`)
  if (
    raw.correctAnswers !== undefined &&
    (!Array.isArray(raw.correctAnswers) ||
      raw.correctAnswers.length > 100 ||
      raw.correctAnswers.some((item) => typeof item !== 'string' || item.length > 1000) ||
      new Set(raw.correctAnswers).size !== raw.correctAnswers.length ||
      !Array.isArray(raw.options) ||
      raw.correctAnswers.some((item) => !(raw.options as unknown[]).includes(item)))
  )
    throw new FormSchemaError(`Field ${raw.id} has invalid expected answers.`)
  if (
    raw.correctAnswers !== undefined &&
    !['select', 'radio', 'checkbox', 'picture_choice'].includes(String(raw.type))
  )
    throw new FormSchemaError(`Field ${raw.id} cannot score choice answers.`)
  if (
    raw.randomizeOptions !== undefined &&
    !['select', 'radio', 'checkbox', 'picture_choice'].includes(String(raw.type))
  )
    throw new FormSchemaError(`Field ${raw.id} cannot randomize choices.`)
  if (
    isRecord(raw.validation) &&
    raw.validation.expectedAnswer !== undefined &&
    !['text', 'textarea', 'number'].includes(String(raw.type))
  )
    throw new FormSchemaError(`Field ${raw.id} cannot use a typed expected answer.`)
  if (raw.validation !== undefined && !isSafeFieldValidation(raw.validation))
    throw new FormSchemaError(`Field ${raw.id} has invalid validation rules.`)
  if (raw.children !== undefined) {
    if (raw.type !== 'group')
      throw new FormSchemaError(`Only question groups can contain nested fields (${raw.id}).`)
    if (!Array.isArray(raw.children) || raw.children.length > 50)
      throw new FormSchemaError(`Field ${raw.id} has invalid nested fields.`)
    raw.children = raw.children.map((child, childIndex) =>
      normalizeField(child, childIndex, depth + 1, budget),
    )
  }
  for (const key of [
    'termsText',
    'buttonText',
    'sectionDescription',
    'helpText',
    'placeholder',
  ] as const) {
    if (raw[key] !== undefined && (typeof raw[key] !== 'string' || raw[key].length > TEXT_MAX))
      throw new FormSchemaError(`Field ${raw.id} has invalid ${key}.`)
  }
  if (raw.conditionalLogic !== undefined) {
    const conditions = isRecord(raw.conditionalLogic) ? raw.conditionalLogic.showWhen : undefined
    if (
      !Array.isArray(conditions) ||
      conditions.length > 50 ||
      conditions.some(
        (condition) =>
          !isRecord(condition) ||
          typeof condition.fieldId !== 'string' ||
          ![
            'equals',
            'not_equals',
            'contains',
            'not_contains',
            'starts_with',
            'ends_with',
            'greater_than',
            'greater_or_equal_than',
            'less_than',
            'less_or_equal_than',
            'is_before',
            'is_after',
            'is_empty',
            'is_not_empty',
          ].includes(String(condition.operator)) ||
          typeof condition.value !== 'string',
      ) ||
      ((raw.conditionalLogic as Record<string, unknown>).match !== undefined &&
        !['all', 'any'].includes(String((raw.conditionalLogic as Record<string, unknown>).match)))
    ) {
      throw new FormSchemaError(`Field ${raw.id} has invalid visibility conditions.`)
    }
    if (conditions.some((condition) => condition.fieldId === raw.id))
      throw new FormSchemaError(`Field ${raw.id} cannot depend on itself.`)
  }
  return { ...raw, required: raw.required === true } as FormField
}

function boundedString(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback
  return value.slice(0, max)
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeRemoteMediaURL(value: string): boolean {
  if (!value || value.length > 2048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}
