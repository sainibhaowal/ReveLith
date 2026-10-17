import { useEffect, useMemo, useState } from 'react'
import type { FormField, FormSchema } from '../types'
import { FieldRenderer } from './FieldRenderer'
import { fieldIcon } from './Ribbon'
import { calculateFormVariables, matchingNavigationTarget, shouldShowField } from '../logic'
import { DEFAULT_CANVAS_BACKGROUND } from '../schema'
import { calculateQuizScore } from '../quiz'
import {
  BUILT_IN_LOCALES,
  formatLocaleDate,
  formatLocaleNumber,
  localizeFormSchema,
  respondentMessage,
  type RespondentMessage,
} from '../translations'
import { purgeUnreferencedAttachmentsFromLocalStores } from '../attachments'

const NON_RESPONSE_FIELDS = new Set<FormField['type']>([
  'section',
  'pagebreak',
  'statement',
  'welcome',
  'thankyou',
  'hidden',
])

function readLocalResponseDraft(formId: string): {
  answers: Record<string, unknown>
  email: string
} {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(`revelith-forms-builder/preview-draft/${formId}`) ?? 'null',
    ) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      return {
        answers:
          record.answers && typeof record.answers === 'object' && !Array.isArray(record.answers)
            ? (record.answers as Record<string, unknown>)
            : {},
        email: typeof record.email === 'string' ? record.email : '',
      }
    }
  } catch {
    /* corrupt preview data does not prevent opening the editor */
  }
  return { answers: {}, email: '' }
}

function isEmptyAnswer(field: FormField, value: unknown): boolean {
  if (value == null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (field.type === 'group') {
    const group =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {}
    return (field.children ?? []).every((child) => isEmptyAnswer(child, group[child.id]))
  }
  if (field.type === 'legal_terms') return value !== true
  if (field.type === 'fullname') {
    if (!value || typeof value !== 'object') return true
    const name = value as { firstName?: unknown; lastName?: unknown }
    return !String(name.firstName ?? '').trim() || !String(name.lastName ?? '').trim()
  }
  if (field.type === 'date_range') {
    if (!value || typeof value !== 'object') return true
    const range = value as { start?: unknown; end?: unknown }
    return !range.start || !range.end
  }
  if (field.type === 'input_table') {
    if (!value || typeof value !== 'object') return true
    const cells = Object.values(value as Record<string, unknown>)
    return cells.length === 0 || cells.some((cell) => !String(cell ?? '').trim())
  }
  if (field.type === 'address') {
    if (!value || typeof value !== 'object') return true
    return !Object.values(value as Record<string, unknown>).some((part) =>
      String(part ?? '').trim(),
    )
  }
  return false
}

function hasPartialAnswer(field: FormField, value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (field.type === 'fullname') {
    const name = value as { firstName?: unknown; lastName?: unknown }
    return (
      Boolean(String(name.firstName ?? '').trim()) !== Boolean(String(name.lastName ?? '').trim())
    )
  }
  if (field.type === 'date_range') {
    const range = value as { start?: unknown; end?: unknown }
    return Boolean(range.start) !== Boolean(range.end)
  }
  if (field.type === 'input_table')
    return (
      Object.values(value as Record<string, unknown>).some((part) => String(part ?? '').trim()) &&
      Object.values(value as Record<string, unknown>).some((part) => !String(part ?? '').trim())
    )
  if (field.type === 'address') {
    const address = value as Record<string, unknown>
    const requiredKeys = ['street', 'city', 'state', 'zip', 'country']
    return (
      requiredKeys.some((key) => String(address[key] ?? '').trim()) &&
      requiredKeys.some((key) => !String(address[key] ?? '').trim())
    )
  }
  return false
}

function flattenAnswerContainer(
  fields: FormField[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const flattened = { ...values }
  for (const field of fields) {
    if (field.type !== 'group') continue
    const childValues =
      values[field.id] && typeof values[field.id] === 'object' && !Array.isArray(values[field.id])
        ? (values[field.id] as Record<string, unknown>)
        : {}
    Object.assign(flattened, flattenAnswerContainer(field.children ?? [], childValues))
  }
  return flattened
}

function flattenFormFields(fields: FormField[]): FormField[] {
  return fields.flatMap((field) => [
    field,
    ...(field.type === 'group' ? flattenFormFields(field.children ?? []) : []),
  ])
}

function collectFieldAnswers(
  fields: FormField[],
  values: Record<string, unknown>,
): Array<{ field: FormField; value: unknown }> {
  const entries: Array<{ field: FormField; value: unknown }> = []
  for (const field of fields) {
    const value = values[field.id]
    entries.push({ field, value })
    if (field.type === 'group') {
      const childValues =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {}
      entries.push(...collectFieldAnswers(field.children ?? [], childValues))
    }
  }
  return entries
}

function isRespondentQuestion(field: FormField): boolean {
  return !NON_RESPONSE_FIELDS.has(field.type)
}

interface FormCanvasProps {
  schema: FormSchema
  selectedFieldId: string | null
  onSelect: (id: string | null) => void
  onUpdateField: (id: string, updates: Partial<FormField>) => void
  onRemoveField: (id: string) => void
  onMoveField: (fromIndex: number, toIndex: number) => void
  onDuplicateField: (id: string) => void
  onUpdateTitle: (title: string) => void
  onUpdateDescription: (description: string) => void
  preview: boolean
  zoom: number
  device: 'desktop' | 'tablet' | 'mobile'
  responseCount: number
  onSubmit: (answers: Record<string, unknown>) => void
  style?: React.CSSProperties
}

export function FormCanvas(props: FormCanvasProps) {
  const {
    schema: baseSchema,
    selectedFieldId,
    onSelect,
    onUpdateField,
    onRemoveField,
    onMoveField,
    onDuplicateField,
    onUpdateTitle,
    onUpdateDescription,
    preview,
    zoom,
    device,
    responseCount,
    onSubmit,
    style,
  } = props

  const [respondentLocale, setRespondentLocale] = useState(baseSchema.settings.locale ?? 'en')
  const schema = useMemo(() => {
    if (!preview) return baseSchema
    const localized = localizeFormSchema(baseSchema, respondentLocale)
    return { ...localized, settings: { ...localized.settings, locale: respondentLocale } }
  }, [baseSchema, preview, respondentLocale])
  const t = (key: RespondentMessage, values?: Record<string, string | number>) =>
    respondentMessage(respondentLocale, key, values)
  const radius = schema.theme.borderRadius ?? 8
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    () => readLocalResponseDraft(baseSchema.id).answers,
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [contactEmail, setContactEmail] = useState(
    () => readLocalResponseDraft(baseSchema.id).email,
  )
  const [draftFormId, setDraftFormId] = useState(baseSchema.id)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [timeExpired, setTimeExpired] = useState(false)
  const [scheduleNow, setScheduleNow] = useState(() => Date.now())

  useEffect(
    () => setRespondentLocale(baseSchema.settings.locale ?? 'en'),
    [baseSchema.id, baseSchema.settings.locale],
  )

  useEffect(() => {
    const draft = readLocalResponseDraft(schema.id)
    setDraftFormId(schema.id)
    setAnswers(draft.answers)
    setContactEmail(draft.email)
    setErrors({})
    setSubmitted(false)
    setPageIndex(0)
  }, [schema.id])

  useEffect(() => {
    if (draftFormId !== schema.id) return
    const key = `revelith-forms-builder/preview-draft/${schema.id}`
    if (submitted) {
      try {
        localStorage.removeItem(key)
      } catch {
        /* local storage may be unavailable */
      }
      const cleanup = window.setTimeout(() => {
        void purgeUnreferencedAttachmentsFromLocalStores().catch(() => {})
      }, 500)
      return () => window.clearTimeout(cleanup)
    }
    if (!preview) return
    const saveDraft = (cleanUnusedFiles = false) => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ answers, email: contactEmail, savedAt: new Date().toISOString() }),
        )
      } catch {
        /* local storage limits must not block answering */
      }
      if (cleanUnusedFiles) void purgeUnreferencedAttachmentsFromLocalStores().catch(() => {})
    }
    saveDraft(true)
    const interval = window.setInterval(
      saveDraft,
      Math.min(300, Math.max(5, schema.settings.autosaveIntervalSeconds ?? 10)) * 1000,
    )
    const saveOnPageHide = () => saveDraft()
    window.addEventListener('pagehide', saveOnPageHide)
    return () => {
      window.removeEventListener('pagehide', saveOnPageHide)
      window.clearInterval(interval)
      saveDraft()
    }
  }, [
    answers,
    contactEmail,
    draftFormId,
    preview,
    schema.id,
    schema.settings.autosaveIntervalSeconds,
    submitted,
  ])

  useEffect(() => {
    const limitSeconds = (schema.settings.timeLimitMinutes ?? 0) * 60
    if (!preview || submitted || limitSeconds <= 0) {
      setTimeRemaining(null)
      setTimeExpired(false)
      return
    }
    setTimeRemaining(limitSeconds)
    setTimeExpired(false)
    const startedAt = Date.now()
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, limitSeconds - Math.floor((Date.now() - startedAt) / 1000))
      setTimeRemaining(remaining)
      if (remaining === 0) {
        setTimeExpired(true)
        window.clearInterval(interval)
      }
    }, 250)
    return () => window.clearInterval(interval)
  }, [preview, schema.settings.timeLimitMinutes, submitted])
  useEffect(() => {
    if (!preview || (!schema.settings.scheduleOpenAt && !schema.settings.scheduleCloseAt)) return
    setScheduleNow(Date.now())
    const interval = window.setInterval(() => setScheduleNow(Date.now()), 15_000)
    return () => window.clearInterval(interval)
  }, [preview, schema.settings.scheduleOpenAt, schema.settings.scheduleCloseAt])
  const thankYouField = schema.fields.find((field) => field.type === 'thankyou')
  const welcomeFieldId = schema.fields.find((field) => field.type === 'welcome')?.id
  const flattenedAnswers = flattenAnswerContainer(schema.fields, answers)
  const variableValues = calculateFormVariables(
    schema.variables ?? [],
    schema.logicRules ?? [],
    flattenedAnswers,
  )
  const logicAnswers = { ...flattenedAnswers, ...variableValues }
  const visibleFields = schema.fields.filter((field) => {
    if (
      preview &&
      welcomeFieldId &&
      answers[welcomeFieldId] !== true &&
      field.id !== welcomeFieldId
    )
      return false
    if (preview && field.type === 'thankyou') return false
    if (preview && field.type === 'welcome' && answers[field.id] === true) return false
    if (field.type === 'pagebreak') return true
    return shouldShowField(field, logicAnswers)
  })
  const pages: FormField[][] = []
  if (schema.settings.navigationMode === 'all-at-once') {
    pages.push(visibleFields.filter((field) => field.type !== 'pagebreak'))
  } else if (schema.settings.navigationMode === 'one-at-a-time') {
    let intro: FormField[] = []
    for (const field of visibleFields) {
      if (field.type === 'pagebreak') continue
      if (isRespondentQuestion(field)) {
        pages.push([...intro, field])
        intro = []
      } else intro.push(field)
    }
    if (intro.length) {
      if (pages.length) pages[pages.length - 1]!.push(...intro)
      else pages.push(intro)
    }
    if (pages.length === 0) pages.push([])
  } else {
    pages.push([])
    for (const field of visibleFields) {
      if (field.type === 'pagebreak') {
        if (pages[pages.length - 1]!.length > 0) pages.push([])
      } else pages[pages.length - 1]!.push(field)
    }
  }
  if (!pages.length) pages.push([])
  const activePageIndex = Math.min(pageIndex, pages.length - 1)
  const activePageFields = pages[activePageIndex] ?? []
  const pageIndexByFlowTarget = new Map(
    pages.flatMap((page, index) => page.map((field) => [field.id, index] as const)),
  )
  const renderFields = preview ? activePageFields : visibleFields
  const pageIndexByFieldId = new Map(
    visibleFields.filter(isRespondentQuestion).map((field, index) => [field.id, index]),
  )
  const answeredCount = visibleFields.filter(
    (field) => isRespondentQuestion(field) && !isEmptyAnswer(field, answers[field.id]),
  ).length
  const questionCount = visibleFields.filter(isRespondentQuestion).length
  const progress =
    pages.length > 1
      ? (activePageIndex + 1) / pages.length
      : questionCount > 0
        ? answeredCount / questionCount
        : 0
  const submitPreview = (validateFields: FormField[]) => {
    if (timeExpired) return
    const nextErrors: Record<string, string> = {}
    if (schema.settings.collectEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
      nextErrors._email = t('email')
    for (const { field, value } of collectFieldAnswers(validateFields, answers)) {
      const empty = isEmptyAnswer(field, value)
      if (!isRespondentQuestion(field)) continue
      if (field.required && empty)
        nextErrors[field.id] = field.label ? `${field.label}: ${t('required')}` : t('required')
      else if (!empty && hasPartialAnswer(field, value)) nextErrors[field.id] = t('partial')
      if (!empty && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)))
        nextErrors[field.id] = t('email')
      if (!empty && (field.type === 'text' || field.type === 'textarea')) {
        const length = String(value).length
        if (field.validation?.minLength != null && length < field.validation.minLength)
          nextErrors[field.id] = t('atLeast', {
            count: formatLocaleNumber(field.validation.minLength, respondentLocale),
          })
        if (field.validation?.maxLength != null && length > field.validation.maxLength)
          nextErrors[field.id] = t('atMost', {
            count: formatLocaleNumber(field.validation.maxLength, respondentLocale),
          })
      }
      if (
        !empty &&
        (field.type === 'number' || field.type === 'currency') &&
        typeof value === 'number'
      ) {
        if (field.validation?.min != null && value < field.validation.min)
          nextErrors[field.id] = t('minNumber', {
            count: formatLocaleNumber(field.validation.min, respondentLocale),
          })
        if (field.validation?.max != null && value > field.validation.max)
          nextErrors[field.id] = t('maxNumber', {
            count: formatLocaleNumber(field.validation.max, respondentLocale),
          })
      }
      if (!empty && field.type === 'date_range' && value && typeof value === 'object') {
        const range = value as { start?: string; end?: string }
        if (
          (range.start && Number.isNaN(Date.parse(range.start))) ||
          (range.end && Number.isNaN(Date.parse(range.end)))
        )
          nextErrors[field.id] = t('startDate')
        else if (range.start && range.end && range.end < range.start)
          nextErrors[field.id] = t('endDate')
      }
      if (!empty && field.type === 'url') {
        try {
          const url = new URL(String(value))
          if (url.protocol !== 'http:' && url.protocol !== 'https:')
            nextErrors[field.id] = t('httpUrl')
        } catch {
          nextErrors[field.id] = t('validUrl')
        }
      }
      if (
        !empty &&
        (field.type === 'text' ||
          field.type === 'textarea' ||
          field.type === 'email' ||
          field.type === 'phone' ||
          field.type === 'url') &&
        field.validation?.pattern
      ) {
        try {
          if (!new RegExp(field.validation.pattern).test(String(value)))
            nextErrors[field.id] = field.validation.customMessage || t('invalidPattern')
        } catch {
          nextErrors[field.id] = t('badPattern')
        }
      }
      if (
        !empty &&
        Array.isArray(value) &&
        field.validation?.minSelections &&
        value.length < field.validation.minSelections
      )
        nextErrors[field.id] = t('minChoices', {
          count: formatLocaleNumber(field.validation.minSelections, respondentLocale),
        })
      if (
        !empty &&
        Array.isArray(value) &&
        field.validation?.maxSelections &&
        value.length > field.validation.maxSelections
      )
        nextErrors[field.id] = t('maxChoices', {
          count: formatLocaleNumber(field.validation.maxSelections, respondentLocale),
        })
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length !== 0) return
    if (activePageIndex < pages.length - 1) {
      const targetFieldId = matchingNavigationTarget(schema.logicRules ?? [], logicAnswers)
      const targetPage = targetFieldId ? pageIndexByFlowTarget.get(targetFieldId) : undefined
      setPageIndex(targetPage !== undefined ? targetPage : activePageIndex + 1)
      return
    }
    const hiddenValues = Object.fromEntries(
      schema.fields
        .filter((field) => field.type === 'hidden' && field.defaultValue != null)
        .map((field) => [field.id, field.defaultValue]),
    )
    const responseAnswers = Object.fromEntries(
      Object.entries(answers).filter(([id]) =>
        schema.fields.some((field) => field.id === id && isRespondentQuestion(field)),
      ),
    )
    const quizScore = calculateQuizScore(
      flattenFormFields(schema.fields),
      flattenAnswerContainer(schema.fields, responseAnswers),
    )
    onSubmit({
      ...hiddenValues,
      ...responseAnswers,
      ...(Object.keys(variableValues).length ? { _variables: variableValues } : {}),
      ...(quizScore ? { _quizScore: quizScore } : {}),
      ...(schema.settings.collectEmail ? { _email: contactEmail } : {}),
    })
    setSubmitted(true)
    try {
      localStorage.removeItem(`revelith-forms-builder/preview-draft/${schema.id}`)
    } catch {
      /* response has already been recorded */
    }
  }
  const maxWidth =
    device === 'mobile'
      ? 390
      : device === 'tablet'
        ? 740
        : schema.theme.contentWidth === 'compact'
          ? 520
          : schema.theme.contentWidth === 'narrow'
            ? 620
            : schema.theme.contentWidth === 'wide'
              ? 1120
              : schema.theme.contentWidth === 'full'
                ? 1240
                : 840
  const outlined = schema.theme.buttonStyle === 'outlined'
  const textButton = schema.theme.buttonStyle === 'text'
  const limitReached = Boolean(
    schema.settings.limitResponses &&
    schema.settings.limitResponses > 0 &&
    responseCount >= schema.settings.limitResponses,
  )
  const alreadyResponded = !schema.settings.allowMultipleResponses && responseCount > 0
  const scheduleNotOpen = Boolean(
    schema.settings.scheduleOpenAt && scheduleNow < Date.parse(schema.settings.scheduleOpenAt),
  )
  const scheduleEnded = Boolean(
    schema.settings.scheduleCloseAt && scheduleNow >= Date.parse(schema.settings.scheduleCloseAt),
  )
  const previewClosed =
    limitReached || alreadyResponded || timeExpired || scheduleNotOpen || scheduleEnded
  const closedReason = timeExpired
    ? t('timeEnded')
    : scheduleNotOpen
      ? t('opens', {
          date: formatLocaleDate(schema.settings.scheduleOpenAt!, respondentLocale, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'UTC',
          }),
        })
      : scheduleEnded
        ? schema.settings.closedMessage || t('closed')
        : limitReached
          ? t('limitReached')
          : t('oneResponse')
  // A form that still uses the default canvas color has not chosen one, so the
  // design surface follows the editor theme and leaves the paper as the only
  // light surface. A deliberate canvas color is document data and always wins,
  // and Preview shows exactly what a respondent sees.
  const customCanvas =
    Boolean(schema.theme.backgroundColor) &&
    schema.theme.backgroundColor !== DEFAULT_CANVAS_BACKGROUND
  const canvasBackground =
    customCanvas || preview ? schema.theme.backgroundColor : 'var(--form-design-surface)'

  return (
    <div
      className="forms-canvas"
      data-form-preview={preview ? 'true' : 'false'}
      lang={respondentLocale}
      dir={respondentLocale.startsWith('ar') ? 'rtl' : 'auto'}
      style={{
        ...style,
        background: canvasBackground,
        position: 'relative',
        transition: 'background .15s',
      }}
      onClick={() => {
        if (!preview) onSelect(null)
      }}
    >
      <div
        style={{
          maxWidth,
          margin: '0 auto',
          padding: '32px 24px 64px',
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'top center',
        }}
      >
        <div
          style={{
            background: 'var(--form-paper)',
            color: 'var(--form-ink)',
            borderRadius: radius,
            boxShadow: 'var(--form-paper-shadow)',
            padding: '32px 32px 40px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {preview && schema.settings.showProgressBar && !submitted ? (
            <div
              role="progressbar"
              aria-label={t('progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              style={{
                height: 5,
                background: 'var(--form-rule)',
                margin: '-32px -32px 24px',
                borderRadius: `${radius}px ${radius}px 0 0`,
                overflow: 'hidden',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  height: '100%',
                  width: `${Math.max(4, Math.round(progress * 100))}%`,
                  background: schema.theme.primaryColor,
                  transition: 'width .2s',
                }}
              />
            </div>
          ) : null}
          {preview && timeRemaining != null && !submitted ? (
            <div
              role="timer"
              aria-live="off"
              style={{
                margin: '0 0 12px',
                textAlign: 'right',
                color: timeRemaining < 60 ? 'var(--form-danger)' : 'var(--form-muted-ink)',
                fontSize: 12,
              }}
            >
              {t('remaining')}:{' '}
              {formatLocaleNumber(Math.floor(timeRemaining / 60), respondentLocale, {
                minimumIntegerDigits: 1,
              })}
              :
              {formatLocaleNumber(timeRemaining % 60, respondentLocale, {
                minimumIntegerDigits: 2,
                useGrouping: false,
              })}
            </div>
          ) : null}
          {preview && submitted ? (
            <div role="status" style={{ textAlign: 'center', padding: '44px 20px' }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  margin: '0 auto 14px',
                  borderRadius: '50%',
                  background: `${schema.theme.primaryColor}18`,
                  color: schema.theme.primaryColor,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 26,
                  fontWeight: 700,
                }}
              >
                ✓
              </div>
              <h1 tabIndex={-1} autoFocus style={{ margin: '0 0 10px', fontSize: 24 }}>
                {thankYouField?.label || schema.settings.confirmationTitle || t('recorded')}
              </h1>
              <p
                style={{
                  margin: '0 auto',
                  maxWidth: 480,
                  lineHeight: 1.6,
                  color: 'var(--form-muted-ink)',
                }}
              >
                {thankYouField?.sectionDescription ||
                  schema.settings.confirmationMessage ||
                  t('thanks')}
              </p>
              {schema.settings.showQuizScore
                ? (() => {
                    const score = calculateQuizScore(
                      flattenFormFields(schema.fields),
                      flattenAnswerContainer(schema.fields, answers),
                    )
                    return score ? (
                      <p role="status" style={{ margin: '14px auto 0', fontWeight: 600 }}>
                        {t('score', {
                          earned: formatLocaleNumber(score.earned, respondentLocale),
                          possible: formatLocaleNumber(score.possible, respondentLocale),
                          percentage: formatLocaleNumber(score.percentage, respondentLocale),
                        })}
                      </p>
                    ) : null
                  })()
                : null}
              {schema.settings.allowMultipleResponses && (
                <button
                  type="button"
                  onClick={() => {
                    setAnswers({})
                    setErrors({})
                    setSubmitted(false)
                    setPageIndex(0)
                  }}
                  style={{
                    marginTop: 20,
                    padding: '9px 15px',
                    borderRadius: radius,
                    border: `1px solid ${schema.theme.primaryColor}`,
                    background: 'var(--form-paper)',
                    color: schema.theme.primaryColor,
                    cursor: 'pointer',
                  }}
                >
                  {thankYouField?.buttonText ||
                    schema.settings.confirmationButtonText ||
                    t('another')}
                </button>
              )}
            </div>
          ) : (
            <>
              {preview && previewClosed ? (
                <div
                  role="status"
                  style={{
                    padding: '24px 12px',
                    textAlign: 'center',
                    borderRadius: radius,
                    background: 'var(--form-warn-bg)',
                    color: 'var(--form-warn-ink)',
                    lineHeight: 1.6,
                  }}
                >
                  {closedReason}
                </div>
              ) : null}
              {preview ? (
                <label
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: 7,
                    marginBottom: 14,
                    color: 'var(--form-muted-ink)',
                    fontSize: 12,
                  }}
                >
                  {t('language')}
                  <select
                    aria-label="Respondent language"
                    value={respondentLocale}
                    onChange={(event) => setRespondentLocale(event.target.value)}
                    style={{
                      width: 'auto',
                      padding: '6px 8px',
                      border: '1px solid var(--form-border)',
                      borderRadius: radius,
                      background: 'var(--form-input-bg)',
                      color: 'var(--form-ink)',
                      font: 'inherit',
                    }}
                  >
                    {[
                      ...new Set([
                        baseSchema.settings.locale ?? 'en',
                        ...Object.keys(BUILT_IN_LOCALES),
                        ...Object.keys(baseSchema.translations ?? {}),
                      ]),
                    ].map((locale) => (
                      <option key={locale} value={locale}>
                        {(BUILT_IN_LOCALES as Record<string, { name: string }>)[locale]?.name ??
                          locale}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {preview && !previewClosed && schema.settings.collectEmail ? (
                <div style={{ maxWidth: 520, margin: '0 auto 18px' }}>
                  <label
                    htmlFor="respondent-email"
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      color: 'var(--form-ink)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {t('emailAddress')} <span style={{ color: 'var(--form-danger)' }}>*</span>
                  </label>
                  <input
                    id="respondent-email"
                    type="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    autoComplete="email"
                    aria-invalid={Boolean(errors._email)}
                    aria-describedby={errors._email ? 'respondent-email-error' : undefined}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      border: errors._email
                        ? '1px solid var(--form-danger)'
                        : '1px solid var(--form-border)',
                      borderRadius: radius,
                      font: 'inherit',
                      color: 'var(--form-ink)',
                      backgroundColor: 'var(--form-input-bg)',
                    }}
                  />
                  {errors._email ? (
                    <span
                      id="respondent-email-error"
                      role="alert"
                      aria-live="assertive"
                      style={{ color: 'var(--form-danger)', fontSize: 12 }}
                    >
                      {errors._email}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div style={{ marginBottom: 24, textAlign: 'center' }}>
                {preview ? (
                  <>
                    <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700 }}>
                      {schema.title}
                    </h1>
                    {schema.description ? (
                      <p style={{ margin: 0, fontSize: 15, color: 'var(--form-muted-ink)' }}>
                        {schema.description}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <input
                      value={schema.title}
                      onChange={(e) => onUpdateTitle(e.target.value)}
                      placeholder="Form title"
                      style={{
                        width: '100%',
                        textAlign: 'center',
                        fontSize: 26,
                        fontWeight: 700,
                        color: 'var(--form-ink)',
                        background: 'transparent',
                        border: '1px dashed transparent',
                        borderRadius: 6,
                        padding: '4px 8px',
                        outline: 'none',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--form-accent)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                    <input
                      value={schema.description}
                      onChange={(e) => onUpdateDescription(e.target.value)}
                      placeholder="Form description (optional)"
                      style={{
                        width: '100%',
                        textAlign: 'center',
                        fontSize: 14,
                        color: 'var(--form-muted-ink)',
                        background: 'transparent',
                        border: '1px dashed transparent',
                        borderRadius: 6,
                        padding: '4px 8px',
                        outline: 'none',
                        marginTop: 4,
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--form-accent)')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                    />
                  </>
                )}
              </div>

              {preview && !previewClosed && schema.settings.showQuestionList && pages.length > 1 ? (
                <nav
                  aria-label="Form question navigation"
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 18px' }}
                >
                  {pages.map((page, index) => {
                    const question = page.find(isRespondentQuestion)
                    const label =
                      question?.label || (index === 0 ? 'Introduction' : `Page ${index + 1}`)
                    return (
                      <button
                        key={`${index}-${question?.id ?? 'intro'}`}
                        type="button"
                        aria-current={index === activePageIndex ? 'step' : undefined}
                        onClick={() => setPageIndex(index)}
                        style={{
                          padding: '6px 10px',
                          border: `1px solid ${index === activePageIndex ? schema.theme.primaryColor : 'var(--form-border)'}`,
                          borderRadius: 999,
                          color:
                            index === activePageIndex
                              ? schema.theme.primaryColor
                              : 'var(--form-muted-ink)',
                          background: 'var(--form-input-bg)',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        {index + 1}. {label}
                      </button>
                    )
                  })}
                </nav>
              ) : null}

              {!previewClosed && renderFields.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '48px 24px',
                    border: '2px dashed var(--form-border)',
                    borderRadius: radius,
                    color: 'var(--form-faint-ink)',
                  }}
                >
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                  <p
                    style={{
                      margin: '0 0 4px',
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'var(--form-ink)',
                    }}
                  >
                    {t('noFields')}
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--form-muted-ink)' }}>
                    {preview ? t('switchDesign') : t('addField')}
                  </p>
                </div>
              ) : !previewClosed ? (
                renderFields.map((field) => {
                  const index = pageIndexByFieldId.get(field.id) ?? 0
                  const selected = selectedFieldId === field.id
                  return (
                    <div
                      key={field.id}
                      data-form-field-id={field.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!preview) onSelect(field.id)
                      }}
                      style={{
                        border:
                          preview || field.type === 'pagebreak' || field.type === 'section'
                            ? 'none'
                            : selected
                              ? '2px solid var(--form-accent)'
                              : '1px solid var(--form-rule)',
                        borderRadius: radius,
                        marginBottom:
                          schema.theme.questionSpacing === 'tight'
                            ? 4
                            : schema.theme.questionSpacing === 'compact'
                              ? 8
                              : schema.theme.questionSpacing === 'relaxed'
                                ? 26
                                : schema.theme.questionSpacing === 'spacious'
                                  ? 40
                                  : 16,
                        background:
                          field.type === 'pagebreak' || field.type === 'section'
                            ? 'transparent'
                            : 'var(--form-paper)',
                        overflow: 'hidden',
                      }}
                    >
                      {!preview && field.type !== 'pagebreak' && field.type !== 'section' ? (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            background: selected
                              ? 'var(--form-accent-soft)'
                              : 'var(--form-field-bg)',
                            borderBottom: '1px solid var(--form-rule)',
                          }}
                        >
                          <span style={{ fontSize: 12, color: 'var(--form-muted-ink)' }}>
                            {fieldIcon(field.type)} {field.type}
                          </span>
                          <span style={{ flex: 1 }} />
                          <MiniBtn
                            title="Move up"
                            disabled={index === 0}
                            onClick={() => onMoveField(index, index - 1)}
                          >
                            ↑
                          </MiniBtn>
                          <MiniBtn
                            title="Move down"
                            disabled={index === schema.fields.length - 1}
                            onClick={() => onMoveField(index, index + 1)}
                          >
                            ↓
                          </MiniBtn>
                          <MiniBtn title="Duplicate" onClick={() => onDuplicateField(field.id)}>
                            ⧉
                          </MiniBtn>
                          <MiniBtn title="Delete" danger onClick={() => onRemoveField(field.id)}>
                            🗑
                          </MiniBtn>
                        </div>
                      ) : null}
                      <div style={{ padding: preview ? '12px 0' : 16 }}>
                        {preview &&
                        schema.settings.showQuestionNumbers &&
                        field.type !== 'section' ? (
                          <span
                            style={{
                              display: 'block',
                              marginBottom: 8,
                              fontSize: 11,
                              fontWeight: 700,
                              color: schema.theme.primaryColor,
                            }}
                          >
                            {t('questionNumber', {
                              count: formatLocaleNumber(index + 1, respondentLocale),
                            })}
                          </span>
                        ) : null}
                        <FieldRenderer
                          key={`${field.id}-${preview ? 'preview' : 'design'}`}
                          field={field}
                          schema={schema}
                          value={preview ? answers[field.id] : field.defaultValue}
                          errors={errors}
                          onChange={(v) =>
                            preview
                              ? setAnswers((current) => ({ ...current, [field.id]: v }))
                              : onUpdateField(field.id, { defaultValue: v })
                          }
                        />
                        {preview && errors[field.id] ? (
                          <p
                            role="alert"
                            style={{ margin: '6px 0 0', color: 'var(--form-danger)', fontSize: 12 }}
                          >
                            {errors[field.id]}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              ) : null}

              {!previewClosed ? (
                <div
                  style={{
                    marginTop: 24,
                    display: 'flex',
                    justifyContent: preview && activePageIndex > 0 ? 'space-between' : 'center',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  {preview &&
                  schema.settings.showNavigationArrows !== false &&
                  activePageIndex > 0 ? (
                    <button
                      type="button"
                      onClick={() => setPageIndex(activePageIndex - 1)}
                      style={{
                        padding: '10px 18px',
                        border: '1px solid var(--form-border)',
                        background: 'var(--form-input-bg)',
                        color: 'var(--form-ink)',
                        borderRadius: radius,
                        cursor: 'pointer',
                      }}
                    >
                      {t('back')}
                    </button>
                  ) : null}
                  {preview && schema.settings.showProgressBar && pages.length > 1 ? (
                    <span
                      aria-live="polite"
                      style={{ color: 'var(--form-faint-ink)', fontSize: 12 }}
                    >
                      {t('page', {
                        current: formatLocaleNumber(activePageIndex + 1, respondentLocale),
                        total: formatLocaleNumber(pages.length, respondentLocale),
                      })}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    style={{
                      padding: '12px 32px',
                      background:
                        outlined || textButton ? 'transparent' : schema.theme.primaryColor,
                      color: outlined || textButton ? schema.theme.primaryColor : '#ffffff',
                      border: outlined ? `2px solid ${schema.theme.primaryColor}` : 'none',
                      borderRadius: radius,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: preview ? 'pointer' : 'default',
                      fontFamily: schema.theme.fontFamily,
                    }}
                    onClick={() => {
                      if (preview) submitPreview(activePageFields)
                    }}
                  >
                    {preview && activePageIndex < pages.length - 1
                      ? t('next')
                      : schema.settings.submitButtonText || t('submit')}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MiniBtn({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={title}
      disabled={disabled}
      style={{
        minWidth: 26,
        height: 26,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--form-paper)',
        border: '1px solid var(--form-border)',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontSize: 13,
        color: danger ? 'var(--form-danger)' : 'var(--form-ink)',
        padding: '0 6px',
      }}
    >
      {children}
    </button>
  )
}
