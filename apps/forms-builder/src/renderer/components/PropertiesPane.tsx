import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  FieldType,
  FormField,
  FormSchema,
  FormSubmission,
  FormTranslation,
  FormVariable,
  FormLogicCondition,
  FormLogicRule,
  FormLogicAction,
} from '../types'
import { fieldIcon } from './Ribbon'
import { FormIcon, type FormIconName } from './FormIcon'
import { isAttachmentReference, type AttachmentReference } from '../attachments'
import { analyzeLocalResponses } from '../responseAnalytics'

interface PropertiesPaneProps {
  schema: FormSchema
  selectedField: FormField | null
  onUpdateSchema: (schema: FormSchema) => void
  onUpdateField: (id: string, updates: Partial<FormField>) => void
  onRemoveField: (id: string) => void
  onDuplicateField: (id: string) => void
  onAskAIField: (fieldId: string) => void
  focusSettingsToken?: number
  focusLogicToken?: number
  responses: FormSubmission[]
  onExportResponses: () => void
  onExportResponsesJson: () => void
  onImportResponses: (file: File) => Promise<void>
  onDeleteResponse: (id: string) => void
  onClearResponses: () => void
  onDownloadAttachment: (attachment: AttachmentReference) => void
  onTranslateForm: (locale: string) => Promise<void>
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  style?: React.CSSProperties
}

type Tab = 'field' | 'form' | 'logic' | 'settings' | 'theme' | 'responses' | 'analytics'
const PROPERTY_TABS: Array<{ id: Tab; label: string; icon: FormIconName }> = [
  { id: 'field', label: 'Field', icon: 'fields' },
  { id: 'form', label: 'Form', icon: 'page' },
  { id: 'logic', label: 'Logic', icon: 'branch' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'theme', label: 'Theme', icon: 'sliders' },
  { id: 'responses', label: 'Responses', icon: 'inbox-check' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
]

function flattenFieldTree(fields: FormField[]): FormField[] {
  return fields.flatMap((field) => [
    field,
    ...(field.children ? flattenFieldTree(field.children) : []),
  ])
}

function responseFieldValues(
  fields: FormField[],
  answers: Record<string, unknown>,
  prefix = '',
): Array<{ id: string; label: string; value: unknown }> {
  return fields.flatMap((field) => {
    const value = answers[field.id]
    const label = prefix ? `${prefix} / ${field.label}` : field.label
    if (field.type === 'group') {
      const nested =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {}
      return responseFieldValues(field.children ?? [], nested, label)
    }
    return value == null || value === '' ? [] : [{ id: field.id, label, value }]
  })
}

export function PropertiesPane(props: PropertiesPaneProps) {
  const {
    schema,
    selectedField,
    onUpdateSchema,
    onUpdateField,
    onRemoveField,
    onDuplicateField,
    onAskAIField,
    style,
    focusSettingsToken,
    focusLogicToken,
    responses,
    onExportResponses,
    onExportResponsesJson,
    onImportResponses,
    onDeleteResponse,
    onClearResponses,
    onDownloadAttachment,
    onTranslateForm,
    expanded,
    onExpandedChange,
  } = props
  const [tab, setTab] = useState<Tab>('field')
  const [responseQuery, setResponseQuery] = useState('')
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null)
  const [translationLocale, setTranslationLocale] = useState('de')
  const [translationBusy, setTranslationBusy] = useState(false)
  const responseImportRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focusSettingsToken) {
      setTab('settings')
      onExpandedChange(true)
    }
  }, [focusSettingsToken, onExpandedChange])

  useEffect(() => {
    if (focusLogicToken) {
      setTab('logic')
      onExpandedChange(true)
    }
  }, [focusLogicToken, onExpandedChange])

  const effectiveTab: Tab = tab === 'field' && !selectedField ? 'form' : tab
  const selectTab = (next: Tab) => {
    if (!expanded) {
      setTab(next)
      onExpandedChange(true)
    } else if (effectiveTab === next) {
      onExpandedChange(false)
    } else {
      setTab(next)
    }
  }
  const matchingResponses = responses.filter((response) =>
    `${response.submittedAt} ${JSON.stringify(response.answers)}`
      .toLocaleLowerCase()
      .includes(responseQuery.trim().toLocaleLowerCase()),
  )
  const analytics = useMemo(
    () => analyzeLocalResponses(schema.fields, responses),
    [schema.fields, responses],
  )

  return (
    <div className="forms-properties-pane" data-expanded={expanded} style={style}>
      <div className="forms-properties-main" aria-hidden={!expanded} inert={!expanded}>
        <div
          id="forms-properties-content"
          className="forms-properties-content"
          role="tabpanel"
          tabIndex={0}
        >
          {effectiveTab === 'field' && selectedField ? (
            <FieldEditor
              schema={schema}
              field={selectedField}
              onUpdate={(u) => onUpdateField(selectedField.id, u)}
              onRemoveNestedField={onRemoveField}
              onRemove={() => onRemoveField(selectedField.id)}
              onDuplicate={() => onDuplicateField(selectedField.id)}
              onAskAI={() => onAskAIField(selectedField.id)}
            />
          ) : null}
          {effectiveTab === 'form' ? (
            <div>
              <TextProp
                label="Form title"
                value={schema.title}
                onChange={(v) => onUpdateSchema({ ...schema, title: v })}
              />
              <AreaProp
                label="Description"
                value={schema.description}
                onChange={(v) => onUpdateSchema({ ...schema, description: v })}
              />
            </div>
          ) : null}
          {effectiveTab === 'logic' ? (
            <LogicEditor schema={schema} onUpdateSchema={onUpdateSchema} />
          ) : null}
          {effectiveTab === 'responses' ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <strong style={{ fontSize: 14 }}>
                  {responses.length} local response{responses.length === 1 ? '' : 's'}
                </strong>
                <div
                  style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5 }}
                >
                  <input
                    ref={responseImportRef}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    aria-label="Choose a response JSON file"
                    onChange={(event) => {
                      const input = event.currentTarget
                      const file = input.files?.[0]
                      if (file)
                        void onImportResponses(file)
                          .catch((error: unknown) =>
                            window.alert(
                              error instanceof Error
                                ? error.message
                                : 'Could not import this response file.',
                            ),
                          )
                          .finally(() => {
                            input.value = ''
                          })
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => responseImportRef.current?.click()}
                    style={{ ...actionBtn, flex: '0 0 auto' }}
                  >
                    Import JSON
                  </button>
                  <button
                    type="button"
                    disabled={responses.length === 0}
                    onClick={onExportResponses}
                    style={{
                      ...actionBtn,
                      flex: '0 0 auto',
                      opacity: responses.length === 0 ? 0.5 : 1,
                    }}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    disabled={responses.length === 0}
                    onClick={onExportResponsesJson}
                    style={{
                      ...actionBtn,
                      flex: '0 0 auto',
                      opacity: responses.length === 0 ? 0.5 : 1,
                    }}
                  >
                    JSON
                  </button>
                  <button
                    type="button"
                    disabled={responses.length === 0}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete all ${responses.length} local responses for this form?`,
                        )
                      )
                        onClearResponses()
                    }}
                    style={{
                      ...actionBtn,
                      flex: '0 0 auto',
                      opacity: responses.length === 0 ? 0.5 : 1,
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <p
                style={{
                  margin: '0 0 12px',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  lineHeight: 1.5,
                }}
              >
                Preview responses stay on this device. For offline collection, share the exported
                HTML form and import each returned response JSON here.
              </p>
              {responses.length ? (
                <TextProp
                  label="Search responses"
                  value={responseQuery}
                  onChange={setResponseQuery}
                />
              ) : null}
              {responses.length === 0 ? (
                <div
                  style={{
                    padding: 18,
                    textAlign: 'center',
                    border: '1px dashed var(--border)',
                    borderRadius: 8,
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                  }}
                >
                  Submit the form in Preview, or import a response JSON returned by someone who
                  filled in the offline form.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {matchingResponses.slice(0, 100).map((response) => (
                    <article
                      key={response.id}
                      style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}
                    >
                      {(() => {
                        const answerRows = responseFieldValues(schema.fields, response.answers)
                        return (
                          <>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 6,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedResponse(
                                    expandedResponse === response.id ? null : response.id,
                                  )
                                }
                                aria-expanded={expandedResponse === response.id}
                                style={{
                                  border: 0,
                                  background: 'transparent',
                                  padding: 0,
                                  color: 'var(--text-secondary)',
                                  fontSize: 10,
                                  cursor: 'pointer',
                                }}
                              >
                                <time>{new Date(response.submittedAt).toLocaleString()}</time> ·{' '}
                                {expandedResponse === response.id ? 'Hide details' : 'View details'}
                              </button>
                              <button
                                type="button"
                                aria-label="Delete response"
                                onClick={() => {
                                  if (window.confirm('Delete this local response?'))
                                    onDeleteResponse(response.id)
                                }}
                                style={{ ...actionBtn, padding: '3px 7px', fontSize: 10 }}
                              >
                                Delete
                              </button>
                            </div>
                            {schema.settings.collectEmail && response.answers._email ? (
                              <div style={{ marginBottom: 5, fontSize: 12, fontWeight: 600 }}>
                                {String(response.answers._email)}
                              </div>
                            ) : null}
                            {response.answers._quizScore &&
                            typeof response.answers._quizScore === 'object' ? (
                              <div style={{ marginBottom: 5, fontSize: 11, fontWeight: 600 }}>
                                Quiz score:{' '}
                                {String(
                                  (response.answers._quizScore as { earned?: unknown }).earned,
                                )}{' '}
                                /{' '}
                                {String(
                                  (response.answers._quizScore as { possible?: unknown }).possible,
                                )}
                              </div>
                            ) : null}
                            {answerRows
                              .filter(
                                (row) =>
                                  expandedResponse === response.id || answerRows.indexOf(row) < 5,
                              )
                              .map((row) => (
                                <div
                                  key={row.id}
                                  style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4 }}
                                >
                                  <strong>{row.label}: </strong>
                                  {Array.isArray(row.value) &&
                                  row.value.some(isAttachmentReference) ? (
                                    <span
                                      style={{
                                        display: 'inline-grid',
                                        gap: 4,
                                        verticalAlign: 'middle',
                                      }}
                                    >
                                      {row.value.filter(isAttachmentReference).map((attachment) => (
                                        <button
                                          type="button"
                                          key={attachment.attachmentId}
                                          onClick={() => onDownloadAttachment(attachment)}
                                          style={{ ...actionBtn, fontSize: 10, textAlign: 'left' }}
                                        >
                                          Download {attachment.name} (
                                          {(attachment.size / 1024).toFixed(1)} KB)
                                        </button>
                                      ))}
                                    </span>
                                  ) : Array.isArray(row.value) ? (
                                    row.value.join(', ')
                                  ) : typeof row.value === 'object' ? (
                                    JSON.stringify(row.value)
                                  ) : (
                                    String(row.value)
                                  )}
                                </div>
                              ))}
                            {expandedResponse !== response.id && answerRows.length > 5 ? (
                              <button
                                type="button"
                                onClick={() => setExpandedResponse(response.id)}
                                style={{ ...actionBtn, marginTop: 6, fontSize: 10 }}
                              >
                                Show all answers
                              </button>
                            ) : null}
                          </>
                        )
                      })()}
                    </article>
                  ))}
                  {matchingResponses.length === 0 ? (
                    <div
                      role="status"
                      style={{
                        padding: 12,
                        textAlign: 'center',
                        color: 'var(--text-secondary)',
                        fontSize: 12,
                      }}
                    >
                      No responses match this search.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
          {effectiveTab === 'analytics' ? (
            <section aria-label="Local response analytics" style={{ display: 'grid', gap: 12 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5 }}>
                Calculated only from preview submissions saved on this device. This view does not
                count published visits, starts, or drop-offs.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Metric label="Responses" value={analytics.totalResponses} />
                <Metric label="Last 30 days" value={analytics.responsesLast30Days} />
                {analytics.quizAveragePercentage !== undefined ? (
                  <Metric
                    label="Average quiz score"
                    value={`${analytics.quizAveragePercentage.toFixed(1)}%`}
                  />
                ) : null}
              </div>
              {analytics.questions.length === 0 ? (
                <div
                  style={{
                    padding: 16,
                    border: '1px dashed var(--border)',
                    borderRadius: 8,
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                  }}
                >
                  Add respondent questions to see per-question results.
                </div>
              ) : (
                analytics.questions.map((question) => (
                  <article
                    key={question.id}
                    style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}
                  >
                    <strong style={{ display: 'block', fontSize: 12, overflowWrap: 'anywhere' }}>
                      {question.label}
                    </strong>
                    <p
                      style={{ margin: '4px 0 8px', fontSize: 10, color: 'var(--text-secondary)' }}
                    >
                      {question.answered} answered · {question.unanswered} blank
                      {question.average !== undefined
                        ? ` · mean ${question.average.toFixed(2)}`
                        : ''}
                    </p>
                    {question.choices?.map((choice) => (
                      <div
                        key={choice.label}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0,1fr) auto',
                          gap: 6,
                          alignItems: 'center',
                          marginTop: 5,
                          fontSize: 11,
                        }}
                      >
                        <span style={{ overflowWrap: 'anywhere' }}>{choice.label}</span>
                        <span>{choice.count}</span>
                        <div
                          role="img"
                          aria-label={`${choice.label}: ${choice.count} responses`}
                          style={{
                            gridColumn: '1 / -1',
                            height: 5,
                            background: 'var(--border)',
                            borderRadius: 4,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${question.answered ? (choice.count / question.answered) * 100 : 0}%`,
                              height: '100%',
                              background: 'var(--accent, #2563eb)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </article>
                ))
              )}
            </section>
          ) : null}
          {effectiveTab === 'settings' ? (
            <div>
              <TextProp
                label="Form title"
                value={schema.title}
                onChange={(title) => onUpdateSchema({ ...schema, title })}
              />
              <AreaProp
                label="Form description"
                value={schema.description}
                onChange={(description) => onUpdateSchema({ ...schema, description })}
              />
              <TextProp
                label="Submit button text"
                value={schema.settings.submitButtonText}
                onChange={(v) =>
                  onUpdateSchema({
                    ...schema,
                    settings: { ...schema.settings, submitButtonText: v },
                  })
                }
              />
              <AreaProp
                label="Confirmation message"
                value={schema.settings.confirmationMessage}
                onChange={(v) =>
                  onUpdateSchema({
                    ...schema,
                    settings: { ...schema.settings, confirmationMessage: v },
                  })
                }
              />
              <TextProp
                label="Confirmation title"
                value={schema.settings.confirmationTitle ?? ''}
                onChange={(v) =>
                  onUpdateSchema({
                    ...schema,
                    settings: { ...schema.settings, confirmationTitle: v },
                  })
                }
              />
              <TextProp
                label="Confirmation button text"
                value={schema.settings.confirmationButtonText ?? ''}
                onChange={(v) =>
                  onUpdateSchema({
                    ...schema,
                    settings: { ...schema.settings, confirmationButtonText: v },
                  })
                }
              />
              <CheckProp
                label="Show progress bar"
                checked={schema.settings.showProgressBar}
                onChange={(v) =>
                  onUpdateSchema({
                    ...schema,
                    settings: { ...schema.settings, showProgressBar: v },
                  })
                }
              />
              <CheckProp
                label="Allow multiple responses"
                checked={schema.settings.allowMultipleResponses}
                onChange={(v) =>
                  onUpdateSchema({
                    ...schema,
                    settings: { ...schema.settings, allowMultipleResponses: v },
                  })
                }
              />
              <CheckProp
                label="Collect email addresses"
                checked={schema.settings.collectEmail}
                onChange={(v) =>
                  onUpdateSchema({ ...schema, settings: { ...schema.settings, collectEmail: v } })
                }
              />
              <CheckProp
                label="Show question numbers"
                checked={schema.settings.showQuestionNumbers ?? false}
                onChange={(v) =>
                  onUpdateSchema({
                    ...schema,
                    settings: { ...schema.settings, showQuestionNumbers: v },
                  })
                }
              />
              <CheckProp
                label="Show quiz score after submission"
                checked={schema.settings.showQuizScore ?? false}
                onChange={(v) =>
                  onUpdateSchema({ ...schema, settings: { ...schema.settings, showQuizScore: v } })
                }
              />
              <CheckProp
                label="Disable multiple responses at limit"
                checked={schema.settings.closeOnLimit ?? false}
                onChange={(v) =>
                  onUpdateSchema({ ...schema, settings: { ...schema.settings, closeOnLimit: v } })
                }
              />
              <NumberProp
                label="Response limit (blank = unlimited)"
                value={schema.settings.limitResponses}
                onChange={(v) =>
                  onUpdateSchema({ ...schema, settings: { ...schema.settings, limitResponses: v } })
                }
              />
              <DateTimeProp
                label="Open at (UTC)"
                value={schema.settings.scheduleOpenAt ?? ''}
                onChange={(v) =>
                  onUpdateSchema({ ...schema, settings: { ...schema.settings, scheduleOpenAt: v } })
                }
              />
              <DateTimeProp
                label="Close at (UTC)"
                value={schema.settings.scheduleCloseAt ?? ''}
                onChange={(v) =>
                  onUpdateSchema({
                    ...schema,
                    settings: { ...schema.settings, scheduleCloseAt: v },
                  })
                }
              />
              <AreaProp
                label="Closed form message"
                value={schema.settings.closedMessage ?? ''}
                onChange={(closedMessage) =>
                  onUpdateSchema({ ...schema, settings: { ...schema.settings, closedMessage } })
                }
                rows={2}
              />
              <TextProp
                label="After-submit redirect URL"
                value={schema.settings.redirectUrl ?? ''}
                onChange={(v) =>
                  onUpdateSchema({ ...schema, settings: { ...schema.settings, redirectUrl: v } })
                }
              />
              <SelectProp
                label="Form language"
                value={schema.settings.locale ?? 'en'}
                options={['en', 'de', 'fr', 'es', 'hi', 'ja', 'zh']}
                onChange={(locale) =>
                  onUpdateSchema({ ...schema, settings: { ...schema.settings, locale } })
                }
              />
              <SelectProp
                label="Respondent flow"
                value={schema.settings.navigationMode ?? 'paged'}
                options={[
                  { value: 'all-at-once', label: 'All questions on one page' },
                  { value: 'one-at-a-time', label: 'One question at a time' },
                  { value: 'paged', label: 'Use page breaks' },
                ]}
                onChange={(navigationMode) =>
                  onUpdateSchema({
                    ...schema,
                    settings: {
                      ...schema.settings,
                      navigationMode: navigationMode as NonNullable<
                        FormSchema['settings']['navigationMode']
                      >,
                    },
                  })
                }
              />
              <CheckProp
                label="Show question navigation list"
                checked={schema.settings.showQuestionList ?? false}
                onChange={(showQuestionList) =>
                  onUpdateSchema({ ...schema, settings: { ...schema.settings, showQuestionList } })
                }
              />
              <CheckProp
                label="Show back navigation"
                checked={schema.settings.showNavigationArrows ?? true}
                onChange={(showNavigationArrows) =>
                  onUpdateSchema({
                    ...schema,
                    settings: { ...schema.settings, showNavigationArrows },
                  })
                }
              />
              <NumberProp
                label="Respondent time limit in minutes (blank = none)"
                value={schema.settings.timeLimitMinutes}
                onChange={(timeLimitMinutes) =>
                  onUpdateSchema({ ...schema, settings: { ...schema.settings, timeLimitMinutes } })
                }
              />
              <NumberProp
                label="Preview draft autosave interval in seconds"
                value={schema.settings.autosaveIntervalSeconds ?? 10}
                onChange={(autosaveIntervalSeconds) =>
                  onUpdateSchema({
                    ...schema,
                    settings: { ...schema.settings, autosaveIntervalSeconds },
                  })
                }
              />
              <Section title="Translations">
                <p
                  style={{
                    margin: '0 0 10px',
                    color: 'var(--text-secondary)',
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                >
                  Author respondent-facing translations here. Preview gets a language selector when
                  at least one translation exists; missing strings fall back to the source language.
                </p>
                <SelectProp
                  label="Language to edit"
                  value={translationLocale}
                  options={[
                    ...new Set([
                      'de',
                      'es',
                      'fr',
                      'hi',
                      'ja',
                      'pt',
                      'zh',
                      ...Object.keys(schema.translations ?? {}),
                    ]),
                  ]}
                  onChange={setTranslationLocale}
                />
                <TextProp
                  label="Custom language tag (BCP 47)"
                  value={translationLocale}
                  onChange={(value) => setTranslationLocale(value.trim().toLowerCase())}
                />
                {(() => {
                  const translation = schema.translations?.[translationLocale] ?? {}
                  const update = (patch: Partial<FormTranslation>) =>
                    onUpdateSchema({
                      ...schema,
                      translations: {
                        ...schema.translations,
                        [translationLocale]: { ...translation, ...patch },
                      },
                    })
                  const updateFieldTranslation = (
                    fieldId: string,
                    key:
                      | 'label'
                      | 'placeholder'
                      | 'helpText'
                      | 'sectionDescription'
                      | 'buttonText'
                      | 'termsText',
                    value: string,
                  ) =>
                    update({
                      fields: {
                        ...translation.fields,
                        [fieldId]: { ...translation.fields?.[fieldId], [key]: value },
                      },
                    })
                  return (
                    <>
                      <button
                        type="button"
                        disabled={translationBusy}
                        onClick={async () => {
                          setTranslationBusy(true)
                          try {
                            await onTranslateForm(translationLocale)
                          } catch (error) {
                            window.alert(
                              error instanceof Error ? error.message : 'Translation failed.',
                            )
                          } finally {
                            setTranslationBusy(false)
                          }
                        }}
                        style={{ ...actionBtn, width: '100%', marginBottom: 10 }}
                      >
                        {translationBusy
                          ? 'Translating with local model…'
                          : 'Translate all form text with local AI'}
                      </button>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        Uses the configured on-device LM Studio or Ollama model. Review the
                        generated translation before use.
                      </p>
                      <TextProp
                        label="Translated form title"
                        value={translation.title ?? ''}
                        onChange={(title) => update({ title })}
                      />
                      <AreaProp
                        label="Translated form description"
                        value={translation.description ?? ''}
                        onChange={(description) => update({ description })}
                        rows={2}
                      />
                      <TextProp
                        label="Translated submit button"
                        value={translation.settings?.submitButtonText ?? ''}
                        onChange={(submitButtonText) =>
                          update({ settings: { ...translation.settings, submitButtonText } })
                        }
                      />
                      <TextProp
                        label="Translated confirmation title"
                        value={translation.settings?.confirmationTitle ?? ''}
                        onChange={(confirmationTitle) =>
                          update({ settings: { ...translation.settings, confirmationTitle } })
                        }
                      />
                      <AreaProp
                        label="Translated confirmation message"
                        value={translation.settings?.confirmationMessage ?? ''}
                        onChange={(confirmationMessage) =>
                          update({ settings: { ...translation.settings, confirmationMessage } })
                        }
                        rows={2}
                      />
                      <TextProp
                        label="Translated confirmation button"
                        value={translation.settings?.confirmationButtonText ?? ''}
                        onChange={(confirmationButtonText) =>
                          update({ settings: { ...translation.settings, confirmationButtonText } })
                        }
                      />
                      <AreaProp
                        label="Translated closed-form message"
                        value={translation.settings?.closedMessage ?? ''}
                        onChange={(closedMessage) =>
                          update({ settings: { ...translation.settings, closedMessage } })
                        }
                        rows={2}
                      />
                      {flattenFieldTree(schema.fields).map((field) => (
                        <details
                          key={field.id}
                          style={{
                            margin: '8px 0',
                            padding: 8,
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                          }}
                        >
                          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            {field.label || field.type}
                          </summary>
                          <TextProp
                            label="Translated label"
                            value={translation.fields?.[field.id]?.label ?? ''}
                            onChange={(value) => updateFieldTranslation(field.id, 'label', value)}
                          />
                          {field.placeholder !== undefined ? (
                            <TextProp
                              label="Translated placeholder"
                              value={translation.fields?.[field.id]?.placeholder ?? ''}
                              onChange={(value) =>
                                updateFieldTranslation(field.id, 'placeholder', value)
                              }
                            />
                          ) : null}
                          {field.helpText !== undefined ? (
                            <AreaProp
                              label="Translated help text"
                              value={translation.fields?.[field.id]?.helpText ?? ''}
                              onChange={(value) =>
                                updateFieldTranslation(field.id, 'helpText', value)
                              }
                              rows={2}
                            />
                          ) : null}
                          {field.sectionDescription !== undefined ? (
                            <AreaProp
                              label="Translated description"
                              value={translation.fields?.[field.id]?.sectionDescription ?? ''}
                              onChange={(value) =>
                                updateFieldTranslation(field.id, 'sectionDescription', value)
                              }
                              rows={2}
                            />
                          ) : null}
                          {field.buttonText !== undefined ? (
                            <TextProp
                              label="Translated button"
                              value={translation.fields?.[field.id]?.buttonText ?? ''}
                              onChange={(value) =>
                                updateFieldTranslation(field.id, 'buttonText', value)
                              }
                            />
                          ) : null}
                          {field.termsText !== undefined ? (
                            <AreaProp
                              label="Translated terms"
                              value={translation.fields?.[field.id]?.termsText ?? ''}
                              onChange={(value) =>
                                updateFieldTranslation(field.id, 'termsText', value)
                              }
                              rows={3}
                            />
                          ) : null}
                          {field.options?.length ? (
                            <AreaProp
                              label="Translated choices (keep one line per choice)"
                              value={field.options
                                .map(
                                  (option) =>
                                    translation.fields?.[field.id]?.optionLabels?.[option] ?? '',
                                )
                                .join('\n')}
                              rows={Math.min(6, Math.max(2, field.options.length))}
                              onChange={(value) => {
                                const lines = value.split('\n')
                                const optionLabels = Object.fromEntries(
                                  field.options!.map((option, index) => [
                                    option,
                                    lines[index]?.trim() ?? '',
                                  ]),
                                )
                                update({
                                  fields: {
                                    ...translation.fields,
                                    [field.id]: { ...translation.fields?.[field.id], optionLabels },
                                  },
                                })
                              }}
                            />
                          ) : null}
                        </details>
                      ))}
                    </>
                  )
                })()}
              </Section>
            </div>
          ) : null}
          {effectiveTab === 'theme' ? (
            <div>
              <ColorProp
                label="Primary color"
                value={schema.theme.primaryColor}
                onChange={(v) =>
                  onUpdateSchema({ ...schema, theme: { ...schema.theme, primaryColor: v } })
                }
              />
              <ColorProp
                label="Background color"
                value={schema.theme.backgroundColor}
                onChange={(v) =>
                  onUpdateSchema({ ...schema, theme: { ...schema.theme, backgroundColor: v } })
                }
              />
              <SelectProp
                label="Font"
                value={schema.theme.fontFamily}
                options={[
                  'Inter, system-ui, sans-serif',
                  'system-ui, sans-serif',
                  'Arial, sans-serif',
                  'Verdana, sans-serif',
                  'Georgia, serif',
                  'Trebuchet MS, sans-serif',
                  'Courier New, monospace',
                ]}
                onChange={(v) =>
                  onUpdateSchema({ ...schema, theme: { ...schema.theme, fontFamily: v } })
                }
              />
              <SelectProp
                label="Button style"
                value={schema.theme.buttonStyle ?? 'filled'}
                options={['filled', 'outlined', 'text']}
                onChange={(value) =>
                  onUpdateSchema({
                    ...schema,
                    theme: {
                      ...schema.theme,
                      buttonStyle: value as FormSchema['theme']['buttonStyle'],
                    },
                  })
                }
              />
              <SelectProp
                label="Form width"
                value={schema.theme.contentWidth ?? 'standard'}
                options={['compact', 'narrow', 'standard', 'wide', 'full']}
                onChange={(value) =>
                  onUpdateSchema({
                    ...schema,
                    theme: {
                      ...schema.theme,
                      contentWidth: value as FormSchema['theme']['contentWidth'],
                    },
                  })
                }
              />
              <SelectProp
                label="Question spacing"
                value={schema.theme.questionSpacing ?? 'comfortable'}
                options={['tight', 'compact', 'comfortable', 'relaxed', 'spacious']}
                onChange={(value) =>
                  onUpdateSchema({
                    ...schema,
                    theme: {
                      ...schema.theme,
                      questionSpacing: value as FormSchema['theme']['questionSpacing'],
                    },
                  })
                }
              />
              <SelectProp
                label="Corner radius"
                value={String(schema.theme.borderRadius ?? 8)}
                options={['0', '4', '8', '12', '16', '20', '24']}
                onChange={(v) =>
                  onUpdateSchema({ ...schema, theme: { ...schema.theme, borderRadius: Number(v) } })
                }
              />
            </div>
          ) : null}
        </div>
      </div>
      <div
        className="forms-properties-tabs"
        role="tablist"
        aria-label="Form properties"
        aria-orientation="vertical"
      >
        {PROPERTY_TABS.map(({ id: t, label, icon }) => (
          <button
            key={t}
            type="button"
            onClick={() => selectTab(t)}
            disabled={t === 'field' && !selectedField}
            className={`forms-properties-tab${effectiveTab === t ? ' is-active' : ''}`}
            role="tab"
            aria-selected={effectiveTab === t}
            aria-controls="forms-properties-content"
            aria-label={label}
            title={label}
            tabIndex={effectiveTab === t ? 0 : -1}
            onKeyDown={(event) => {
              const available = PROPERTY_TABS.map((item) => item.id).filter(
                (item) => item !== 'field' || selectedField,
              )
              const currentIndex = available.indexOf(t)
              const nextIndex =
                event.key === 'ArrowDown'
                  ? (currentIndex + 1) % available.length
                  : event.key === 'ArrowUp'
                    ? (currentIndex - 1 + available.length) % available.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? available.length - 1
                        : -1
              if (nextIndex >= 0) {
                event.preventDefault()
                const next = available[nextIndex]
                selectTab(next)
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(`.forms-properties-tab[data-tab="${next}"]`)
                    ?.focus(),
                )
              }
            }}
            data-tab={t}
          >
            <FormIcon name={icon} size={19} />
          </button>
        ))}
      </div>
    </div>
  )
}

function LogicEditor({
  schema,
  onUpdateSchema,
}: {
  schema: FormSchema
  onUpdateSchema: (schema: FormSchema) => void
}) {
  const variables = schema.variables ?? []
  const rules = schema.logicRules ?? []
  const allFields = flattenFieldTree(schema.fields)
  const sources = [
    ...allFields
      .filter(
        (field) =>
          !['group', 'section', 'pagebreak', 'statement', 'welcome', 'thankyou'].includes(
            field.type,
          ),
      )
      .map((field) => ({ value: field.id, label: field.label || field.id })),
    ...variables.map((variable) => ({ value: variable.id, label: `Variable: ${variable.name}` })),
  ]
  const targetFields = schema.fields.filter(
    (field) =>
      !['section', 'pagebreak', 'statement', 'welcome', 'thankyou', 'hidden'].includes(field.type),
  )
  const updateVariable = (id: string, patch: Partial<FormVariable>) =>
    onUpdateSchema({
      ...schema,
      variables: variables.map((variable) =>
        variable.id === id ? { ...variable, ...patch } : variable,
      ),
    })
  const updateRule = (id: string, patch: Partial<FormLogicRule>) =>
    onUpdateSchema({
      ...schema,
      logicRules: rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    })
  const addVariable = (type: FormVariable['type']) => {
    const index = variables.length + 1
    const variable: FormVariable = {
      id: `variable-${Date.now()}-${index}`,
      name: `${type === 'number' ? 'Number' : 'Text'} ${index}`,
      type,
      initialValue: type === 'number' ? 0 : '',
    }
    onUpdateSchema({ ...schema, variables: [...variables, variable] })
  }
  const addRule = () => {
    const source = sources[0]
    const target = targetFields[0]
    if (!source || !target) return
    const rule: FormLogicRule = {
      id: `rule-${Date.now()}`,
      name: `Rule ${rules.length + 1}`,
      conditions: [{ fieldId: source.value, operator: 'equals', value: '' }],
      match: 'all',
      action: { kind: 'navigate', fieldId: target.id },
    }
    onUpdateSchema({ ...schema, logicRules: [...rules, rule] })
  }
  return (
    <div>
      <Section title="Variables">
        <p
          style={{
            margin: '0 0 10px',
            color: 'var(--text-secondary)',
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          Variables start with a value and can be changed by matching logic rules. Calculated
          results are saved with local preview responses.
        </p>
        {variables.map((variable) => (
          <div
            key={variable.id}
            style={{
              padding: 9,
              marginBottom: 9,
              border: '1px solid var(--border)',
              borderRadius: 7,
            }}
          >
            <TextProp
              label="Variable name"
              value={variable.name}
              onChange={(name) => updateVariable(variable.id, { name })}
            />
            <SelectProp
              label="Value type"
              value={variable.type}
              options={['string', 'number']}
              onChange={(type) =>
                updateVariable(variable.id, {
                  type: type as FormVariable['type'],
                  initialValue:
                    type === 'number'
                      ? Number(variable.initialValue) || 0
                      : String(variable.initialValue),
                })
              }
            />
            {variable.type === 'number' ? (
              <NumberProp
                label="Starting value"
                value={Number(variable.initialValue)}
                onChange={(initialValue) =>
                  updateVariable(variable.id, { initialValue: initialValue ?? 0 })
                }
              />
            ) : (
              <TextProp
                label="Starting value"
                value={String(variable.initialValue)}
                onChange={(initialValue) => updateVariable(variable.id, { initialValue })}
              />
            )}
            <button
              type="button"
              style={actionBtn}
              onClick={() =>
                onUpdateSchema({
                  ...schema,
                  variables: variables.filter((item) => item.id !== variable.id),
                  logicRules: rules
                    .filter(
                      (rule) =>
                        rule.action.kind !== 'calculate' || rule.action.variableId !== variable.id,
                    )
                    .filter(
                      (rule) =>
                        !rule.conditions.some((condition) => condition.fieldId === variable.id),
                    ),
                })
              }
            >
              Delete variable
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={actionBtn} onClick={() => addVariable('string')}>
            + Text variable
          </button>
          <button type="button" style={actionBtn} onClick={() => addVariable('number')}>
            + Number variable
          </button>
        </div>
      </Section>
      <Section title="Rules">
        {rules.map((rule) => {
          const action = rule.action
          return (
            <div
              key={rule.id}
              style={{
                padding: 9,
                marginBottom: 10,
                border: '1px solid var(--border)',
                borderRadius: 7,
              }}
            >
              <TextProp
                label="Rule name"
                value={rule.name}
                onChange={(name) => updateRule(rule.id, { name })}
              />
              <SelectProp
                label="Match conditions"
                value={rule.match}
                options={[
                  { value: 'all', label: 'All conditions (AND)' },
                  { value: 'any', label: 'Any condition (OR)' },
                ]}
                onChange={(match) => updateRule(rule.id, { match: match as 'all' | 'any' })}
              />
              {rule.conditions.map((condition, index) => (
                <div
                  key={`${rule.id}-${index}`}
                  style={{
                    padding: 7,
                    marginBottom: 8,
                    background: 'var(--surface-subtle)',
                    borderRadius: 6,
                  }}
                >
                  <SelectProp
                    label="Answer or variable"
                    value={condition.fieldId}
                    options={sources}
                    onChange={(fieldId) => {
                      const conditions = [...rule.conditions]
                      conditions[index] = { ...condition, fieldId }
                      updateRule(rule.id, { conditions })
                    }}
                  />
                  <SelectProp
                    label="Comparison"
                    value={condition.operator}
                    options={[
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
                    ]}
                    onChange={(value) => {
                      const conditions = [...rule.conditions]
                      conditions[index] = {
                        ...condition,
                        operator: value as FormLogicCondition['operator'],
                      }
                      updateRule(rule.id, { conditions })
                    }}
                  />
                  {!['is_empty', 'is_not_empty'].includes(condition.operator) ? (
                    <TextProp
                      label="Expected value"
                      value={condition.value}
                      onChange={(value) => {
                        const conditions = [...rule.conditions]
                        conditions[index] = { ...condition, value }
                        updateRule(rule.id, { conditions })
                      }}
                    />
                  ) : null}
                  <button
                    type="button"
                    disabled={rule.conditions.length <= 1}
                    style={{ ...actionBtn, opacity: rule.conditions.length <= 1 ? 0.5 : 1 }}
                    onClick={() =>
                      updateRule(rule.id, {
                        conditions: rule.conditions.filter((_, itemIndex) => itemIndex !== index),
                      })
                    }
                  >
                    Remove condition
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={!sources.length}
                style={{ ...actionBtn, opacity: sources.length ? 1 : 0.5 }}
                onClick={() => {
                  const source = sources[0]
                  if (source)
                    updateRule(rule.id, {
                      conditions: [
                        ...rule.conditions,
                        { fieldId: source.value, operator: 'equals', value: '' },
                      ],
                    })
                }}
              >
                + Add condition
              </button>
              <SelectProp
                label="Action"
                value={action.kind}
                options={[
                  { value: 'navigate', label: 'Navigate to a question' },
                  ...(variables.length
                    ? [{ value: 'calculate', label: 'Calculate a variable' }]
                    : []),
                ]}
                onChange={(kind) => {
                  const nextAction: FormLogicAction =
                    kind === 'navigate'
                      ? { kind: 'navigate', fieldId: targetFields[0]?.id ?? '' }
                      : {
                          kind: 'calculate',
                          variableId: variables[0]?.id ?? '',
                          operation: 'assign',
                          value: '',
                        }
                  updateRule(rule.id, { action: nextAction })
                }}
              />
              {action.kind === 'navigate' ? (
                <SelectProp
                  label="Go to question"
                  value={action.fieldId}
                  options={targetFields.map((field) => ({
                    value: field.id,
                    label: field.label || field.id,
                  }))}
                  onChange={(fieldId) => updateRule(rule.id, { action: { ...action, fieldId } })}
                />
              ) : (
                <>
                  <SelectProp
                    label="Variable"
                    value={action.variableId}
                    options={variables.map((variable) => ({
                      value: variable.id,
                      label: variable.name,
                    }))}
                    onChange={(variableId) =>
                      updateRule(rule.id, { action: { ...action, variableId } })
                    }
                  />
                  <SelectProp
                    label="Operation"
                    value={action.operation}
                    options={['assign', 'add', 'subtract', 'multiply', 'divide']}
                    onChange={(operation) =>
                      updateRule(rule.id, {
                        action: {
                          ...action,
                          operation: operation as Extract<
                            FormLogicAction,
                            { kind: 'calculate' }
                          >['operation'],
                        },
                      })
                    }
                  />
                  <SelectProp
                    label="Use value from"
                    value={action.sourceFieldId ?? ''}
                    options={[{ value: '', label: 'Constant value' }, ...sources]}
                    onChange={(sourceFieldId) =>
                      updateRule(rule.id, {
                        action: { ...action, sourceFieldId: sourceFieldId || undefined },
                      })
                    }
                  />
                  {!action.sourceFieldId ? (
                    variables.find((variable) => variable.id === action.variableId)?.type ===
                    'number' ? (
                      <NumberProp
                        label="Constant"
                        value={typeof action.value === 'number' ? action.value : undefined}
                        onChange={(value) => updateRule(rule.id, { action: { ...action, value } })}
                      />
                    ) : (
                      <TextProp
                        label="Constant"
                        value={String(action.value ?? '')}
                        onChange={(value) => updateRule(rule.id, { action: { ...action, value } })}
                      />
                    )
                  ) : null}
                </>
              )}
              <button
                type="button"
                style={{ ...actionBtn, marginTop: 8 }}
                onClick={() =>
                  onUpdateSchema({
                    ...schema,
                    logicRules: rules.filter((item) => item.id !== rule.id),
                  })
                }
              >
                Delete rule
              </button>
            </div>
          )
        })}
        <button
          type="button"
          disabled={!sources.length || !targetFields.length}
          style={{ ...actionBtn, opacity: sources.length && targetFields.length ? 1 : 0.5 }}
          onClick={addRule}
        >
          + Add branching rule
        </button>
        {variables.length === 0 ? (
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
            Create a variable to use calculation actions.
          </p>
        ) : null}
      </Section>
    </div>
  )
}

function FieldEditor({
  schema,
  field,
  onUpdate,
  onRemoveNestedField,
  onRemove,
  onDuplicate,
  onAskAI,
}: {
  schema: FormSchema
  field: FormField
  onUpdate: (u: Partial<FormField>) => void
  onRemoveNestedField: (id: string) => void
  onRemove: () => void
  onDuplicate: () => void
  onAskAI: () => void
}) {
  const isChoice =
    field.type === 'select' ||
    field.type === 'radio' ||
    field.type === 'checkbox' ||
    field.type === 'picture_choice' ||
    field.type === 'country'
  const [groupChildType, setGroupChildType] = useState<FieldType>('text')
  const groupChildTypes: FieldType[] = [
    'text',
    'textarea',
    'number',
    'email',
    'phone',
    'url',
    'date',
    'date_range',
    'time',
    'currency',
    'select',
    'radio',
    'checkbox',
    'yesno',
    'rating',
    'nps',
    'fullname',
    'address',
    'country',
    'picture_choice',
    'legal_terms',
    'input_table',
    'signature',
  ]
  const addGroupChild = () => {
    if (field.type !== 'group' || (field.children?.length ?? 0) >= 50) return
    const id = `child-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const isChoices = ['select', 'radio', 'checkbox', 'picture_choice'].includes(groupChildType)
    const child: FormField = {
      id,
      type: groupChildType,
      label: `Question ${(field.children?.length ?? 0) + 1}`,
      required: false,
      ...(isChoices ? { options: ['Option 1', 'Option 2'] } : {}),
      ...(groupChildType === 'input_table' ? { rows: ['Row 1'], columns: ['Column 1'] } : {}),
      ...(groupChildType === 'legal_terms'
        ? { termsText: 'I agree to the terms and conditions.' }
        : {}),
      validation: {},
      layout: { width: '100%' },
    }
    onUpdate({ children: [...(field.children ?? []), child] })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>{fieldIcon(field.type)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{field.label || 'Untitled field'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            {field.type}
          </div>
        </div>
        <button
          type="button"
          title="Analyze only this field with a local AI endpoint. The field definition is sent to localhost only after you click; response data is excluded."
          onClick={onAskAI}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '6px 8px',
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            font: 'inherit',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Ask AI
        </button>
      </div>

      <Section title="General">
        <TextProp label="Label" value={field.label} onChange={(v) => onUpdate({ label: v })} />
        <TextProp
          label="Placeholder"
          value={field.placeholder ?? ''}
          onChange={(v) => onUpdate({ placeholder: v })}
        />
        <AreaProp
          label="Help text"
          value={field.helpText ?? ''}
          onChange={(v) => onUpdate({ helpText: v })}
        />
        <CheckProp
          label="Required"
          checked={field.required}
          onChange={(v) => onUpdate({ required: v })}
        />
      </Section>

      {isChoice ? (
        <Section title="Options">
          <AreaProp
            label="Choices (one per line)"
            value={(field.options ?? []).join('\n')}
            rows={5}
            mono
            onChange={(v) => {
              const options = v
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
              onUpdate({
                options,
                correctAnswers: (field.correctAnswers ?? []).filter((item) =>
                  options.includes(item),
                ),
                choiceImages: Object.fromEntries(
                  Object.entries(field.choiceImages ?? {}).filter(([item]) =>
                    options.includes(item),
                  ),
                ),
                choiceColors: Object.fromEntries(
                  Object.entries(field.choiceColors ?? {}).filter(([item]) =>
                    options.includes(item),
                  ),
                ),
                choiceIcons: Object.fromEntries(
                  Object.entries(field.choiceIcons ?? {}).filter(([item]) =>
                    options.includes(item),
                  ),
                ),
              })
            }}
          />
          {field.type === 'picture_choice' ? (
            <AreaProp
              label="Images (one per line: choice | HTTPS image URL)"
              value={Object.entries(field.choiceImages ?? {})
                .map(([label, url]) => `${label} | ${url}`)
                .join('\n')}
              rows={5}
              mono
              onChange={(value) => {
                const choiceImages: Record<string, string> = {}
                for (const line of value.split('\n')) {
                  const [label, ...urlParts] = line.split('|')
                  const url = urlParts.join('|').trim()
                  if (label?.trim() && /^https:\/\//i.test(url)) choiceImages[label.trim()] = url
                }
                onUpdate({ choiceImages })
              }}
            />
          ) : null}
          {['radio', 'checkbox', 'picture_choice'].includes(field.type) ? (
            <>
              <SelectProp
                label="Choice layout"
                value={field.choiceLayout ?? 'vertical'}
                options={[
                  { value: 'vertical', label: 'Vertical list' },
                  { value: 'horizontal', label: 'Horizontal wrap' },
                  { value: 'cards', label: 'Choice cards' },
                ]}
                onChange={(choiceLayout) =>
                  onUpdate({ choiceLayout: choiceLayout as NonNullable<FormField['choiceLayout']> })
                }
              />
              <AreaProp
                label="Choice icons (choice | symbol)"
                value={Object.entries(field.choiceIcons ?? {})
                  .map(([label, icon]) => `${label} | ${icon}`)
                  .join('\n')}
                rows={3}
                mono
                onChange={(value) => {
                  const choiceIcons: Record<string, string> = {}
                  for (const line of value.split('\n')) {
                    const [label, ...parts] = line.split('|')
                    const icon = parts.join('|').trim()
                    if (
                      label?.trim() &&
                      icon.length <= 24 &&
                      (field.options ?? []).includes(label.trim())
                    )
                      choiceIcons[label.trim()] = icon
                  }
                  onUpdate({ choiceIcons })
                }}
              />
              <AreaProp
                label="Choice colors (choice | #RRGGBB)"
                value={Object.entries(field.choiceColors ?? {})
                  .map(([label, color]) => `${label} | ${color}`)
                  .join('\n')}
                rows={3}
                mono
                onChange={(value) => {
                  const choiceColors: Record<string, string> = {}
                  for (const line of value.split('\n')) {
                    const [label, ...parts] = line.split('|')
                    const color = parts.join('|').trim()
                    if (
                      label?.trim() &&
                      /^#[\da-f]{6}$/i.test(color) &&
                      (field.options ?? []).includes(label.trim())
                    )
                      choiceColors[label.trim()] = color
                  }
                  onUpdate({ choiceColors })
                }}
              />
            </>
          ) : null}
          {['select', 'radio', 'checkbox', 'picture_choice'].includes(field.type) ? (
            <CheckProp
              label="Randomize choice order"
              checked={field.randomizeOptions ?? false}
              onChange={(randomizeOptions) => onUpdate({ randomizeOptions })}
            />
          ) : null}
        </Section>
      ) : null}
      {['select', 'radio', 'checkbox', 'picture_choice'].includes(field.type) ? (
        <Section title="Quiz scoring">
          <AreaProp
            label="Correct choice(s), one per line"
            value={(field.correctAnswers ?? []).join('\n')}
            rows={3}
            onChange={(value) =>
              onUpdate({
                correctAnswers: value
                  .split('\n')
                  .map((item) => item.trim())
                  .filter((item) => (field.options ?? []).includes(item)),
              })
            }
          />
          <NumberProp
            label="Points per correct choice"
            value={
              field.correctAnswers?.length
                ? (field.validation?.points ?? 1)
                : field.validation?.points
            }
            onChange={(points) => onUpdate({ validation: { ...field.validation, points } })}
          />
        </Section>
      ) : null}
      {['text', 'textarea', 'number'].includes(field.type) ? (
        <Section title="Quiz scoring">
          <TextProp
            label="Expected answer"
            value={field.validation?.expectedAnswer ?? ''}
            onChange={(expectedAnswer) =>
              onUpdate({ validation: { ...field.validation, expectedAnswer } })
            }
          />
          <NumberProp
            label="Points"
            value={
              field.validation?.expectedAnswer
                ? (field.validation?.points ?? 1)
                : field.validation?.points
            }
            onChange={(points) => onUpdate({ validation: { ...field.validation, points } })}
          />
        </Section>
      ) : null}

      {field.type === 'legal_terms' ? (
        <Section title="Consent text">
          <AreaProp
            label="Terms shown to respondents"
            value={field.termsText ?? ''}
            rows={8}
            onChange={(termsText) => onUpdate({ termsText })}
          />
        </Section>
      ) : null}
      {field.type === 'input_table' ? (
        <Section title="Table structure">
          <AreaProp
            label="Rows (one per line)"
            value={(field.rows ?? []).join('\n')}
            rows={4}
            onChange={(value) =>
              onUpdate({
                rows: value
                  .split('\n')
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 50),
              })
            }
          />
          <AreaProp
            label="Columns (one per line)"
            value={(field.columns ?? []).join('\n')}
            rows={4}
            onChange={(value) =>
              onUpdate({
                columns: value
                  .split('\n')
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 20),
              })
            }
          />
        </Section>
      ) : null}
      {field.type === 'hidden' ? (
        <Section title="Hidden value">
          <TextProp
            label="Value included with the response"
            value={String(field.defaultValue ?? '')}
            onChange={(defaultValue) => onUpdate({ defaultValue })}
          />
        </Section>
      ) : null}
      {['statement', 'welcome', 'thankyou'].includes(field.type) ? (
        <Section title="Content">
          <AreaProp
            label="Description"
            value={field.sectionDescription ?? ''}
            rows={6}
            onChange={(sectionDescription) => onUpdate({ sectionDescription })}
          />
          {field.type !== 'statement' ? (
            <TextProp
              label="Button label"
              value={field.buttonText ?? ''}
              onChange={(buttonText) => onUpdate({ buttonText })}
            />
          ) : null}
        </Section>
      ) : null}

      {field.type === 'group' ? (
        <Section title="Grouped questions">
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
            }}
          >
            Keep related questions together. Each child keeps its own answer, required state, and
            validation in the response.
          </p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <SelectProp
                label="Question type"
                value={groupChildType}
                options={groupChildTypes}
                onChange={(value) => setGroupChildType(value as FieldType)}
              />
            </div>
            <button
              type="button"
              disabled={(field.children?.length ?? 0) >= 50}
              style={{ ...actionBtn, flex: '0 0 auto', marginBottom: 12 }}
              onClick={addGroupChild}
            >
              Add
            </button>
          </div>
          {(field.children ?? []).map((child, index) => (
            <div
              key={child.id}
              style={{
                padding: 9,
                marginBottom: 9,
                border: '1px solid var(--border)',
                borderRadius: 7,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 7,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                }}
              >
                <span>{child.type}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    aria-label="Move question up"
                    disabled={index === 0}
                    style={{ ...actionBtn, flex: 'none', padding: '3px 7px' }}
                    onClick={() => {
                      const children = [...(field.children ?? [])]
                      ;[children[index - 1], children[index]] = [
                        children[index]!,
                        children[index - 1]!,
                      ]
                      onUpdate({ children })
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move question down"
                    disabled={index === (field.children?.length ?? 0) - 1}
                    style={{ ...actionBtn, flex: 'none', padding: '3px 7px' }}
                    onClick={() => {
                      const children = [...(field.children ?? [])]
                      ;[children[index], children[index + 1]] = [
                        children[index + 1]!,
                        children[index]!,
                      ]
                      onUpdate({ children })
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    style={{
                      ...actionBtn,
                      flex: 'none',
                      padding: '3px 7px',
                      color: 'var(--danger)',
                    }}
                    onClick={() => onRemoveNestedField(child.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <TextProp
                label="Question label"
                value={child.label}
                onChange={(label) =>
                  onUpdate({
                    children: (field.children ?? []).map((item) =>
                      item.id === child.id ? { ...item, label } : item,
                    ),
                  })
                }
              />
              <TextProp
                label="Help text"
                value={child.helpText ?? ''}
                onChange={(helpText) =>
                  onUpdate({
                    children: (field.children ?? []).map((item) =>
                      item.id === child.id ? { ...item, helpText } : item,
                    ),
                  })
                }
              />
              <CheckProp
                label="Required"
                checked={child.required}
                onChange={(required) =>
                  onUpdate({
                    children: (field.children ?? []).map((item) =>
                      item.id === child.id ? { ...item, required } : item,
                    ),
                  })
                }
              />
              {child.options ? (
                <AreaProp
                  label="Choices (one per line)"
                  value={child.options.join('\n')}
                  rows={3}
                  onChange={(value) => {
                    const options = value
                      .split('\n')
                      .map((item) => item.trim())
                      .filter(Boolean)
                    onUpdate({
                      children: (field.children ?? []).map((item) =>
                        item.id === child.id
                          ? {
                              ...item,
                              options,
                              correctAnswers: (item.correctAnswers ?? []).filter((answer) =>
                                options.includes(answer),
                              ),
                            }
                          : item,
                      ),
                    })
                  }}
                />
              ) : null}
            </div>
          ))}
        </Section>
      ) : null}

      <Section title="Conditional visibility">
        {(field.conditionalLogic?.showWhen.length ?? 0) > 1 ? (
          <SelectProp
            label="When conditions match"
            value={field.conditionalLogic?.match ?? 'all'}
            options={[
              { value: 'all', label: 'All (AND)' },
              { value: 'any', label: 'Any (OR)' },
            ]}
            onChange={(match) =>
              onUpdate({
                conditionalLogic: { ...field.conditionalLogic!, match: match as 'all' | 'any' },
              })
            }
          />
        ) : null}
        {(field.conditionalLogic?.showWhen ?? []).map((condition, index) => {
          const sourceFields = flattenFieldTree(schema.fields).filter(
            (candidate) => candidate.id !== field.id && candidate.type !== 'group',
          )
          return (
            <div
              key={`${condition.fieldId}-${index}`}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 7,
                padding: 8,
                marginBottom: 8,
              }}
            >
              <SelectProp
                label="Answer field"
                value={condition.fieldId}
                options={sourceFields.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.label || candidate.id,
                }))}
                onChange={(fieldId) => {
                  const showWhen = [...(field.conditionalLogic?.showWhen ?? [])]
                  showWhen[index] = { ...condition, fieldId }
                  onUpdate({ conditionalLogic: { showWhen } })
                }}
              />
              <SelectProp
                label="Operator"
                value={condition.operator}
                options={[
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
                ]}
                onChange={(value) => {
                  const showWhen = [...(field.conditionalLogic?.showWhen ?? [])]
                  showWhen[index] = { ...condition, operator: value as typeof condition.operator }
                  onUpdate({ conditionalLogic: { ...field.conditionalLogic!, showWhen } })
                }}
              />
              {!['is_empty', 'is_not_empty'].includes(condition.operator) ? (
                <TextProp
                  label="Answer"
                  value={condition.value}
                  onChange={(value) => {
                    const showWhen = [...(field.conditionalLogic?.showWhen ?? [])]
                    showWhen[index] = { ...condition, value }
                    onUpdate({ conditionalLogic: { showWhen } })
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    conditionalLogic: {
                      showWhen: (field.conditionalLogic?.showWhen ?? []).filter(
                        (_, i) => i !== index,
                      ),
                    },
                  })
                }
                style={actionBtn}
              >
                Remove condition
              </button>
            </div>
          )
        })}
        <button
          type="button"
          disabled={schema.fields.length < 2}
          onClick={() => {
            const source = schema.fields.find((candidate) => candidate.id !== field.id)
            if (!source) return
            onUpdate({
              conditionalLogic: {
                showWhen: [
                  ...(field.conditionalLogic?.showWhen ?? []),
                  { fieldId: source.id, operator: 'equals', value: '' },
                ],
              },
            })
          }}
          style={{ ...actionBtn, opacity: schema.fields.length < 2 ? 0.5 : 1 }}
        >
          + Add condition
        </button>
        <p
          style={{
            margin: '7px 0 0',
            fontSize: 11,
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
          }}
        >
          Use text, numeric, date, or empty-answer comparisons. Test the rule in Preview.
        </p>
      </Section>

      {(field.type === 'text' || field.type === 'textarea') && (
        <Section title="Validation">
          <NumberProp
            label="Min length"
            value={field.validation?.minLength}
            onChange={(v) => onUpdate({ validation: { ...field.validation, minLength: v } })}
          />
          <NumberProp
            label="Max length"
            value={field.validation?.maxLength}
            onChange={(v) => onUpdate({ validation: { ...field.validation, maxLength: v } })}
          />
        </Section>
      )}

      {field.type === 'number' && (
        <Section title="Validation">
          <NumberProp
            label="Minimum"
            value={field.validation?.min}
            onChange={(v) => onUpdate({ validation: { ...field.validation, min: v } })}
          />
          <NumberProp
            label="Maximum"
            value={field.validation?.max}
            onChange={(v) => onUpdate({ validation: { ...field.validation, max: v } })}
          />
        </Section>
      )}

      {field.type === 'nps' || field.type === 'rating' ? (
        <Section title="Scale">
          <NumberProp
            label="Minimum"
            value={field.scaleMin ?? (field.type === 'nps' ? 0 : 1)}
            onChange={(scaleMin) => onUpdate({ scaleMin })}
          />
          <NumberProp
            label="Maximum"
            value={field.scaleMax ?? (field.type === 'nps' ? 10 : 5)}
            onChange={(scaleMax) => onUpdate({ scaleMax })}
          />
        </Section>
      ) : null}

      {field.type === 'text' ||
      field.type === 'textarea' ||
      field.type === 'email' ||
      field.type === 'phone' ||
      field.type === 'url' ? (
        <Section title="Validation">
          <TextProp
            label="Pattern (regular expression)"
            value={field.validation?.pattern ?? ''}
            onChange={(pattern) => onUpdate({ validation: { ...field.validation, pattern } })}
          />
          <TextProp
            label="Validation message"
            value={field.validation?.customMessage ?? ''}
            onChange={(customMessage) =>
              onUpdate({ validation: { ...field.validation, customMessage } })
            }
          />
        </Section>
      ) : null}

      {field.type === 'checkbox' || field.type === 'select' || field.type === 'picture_choice' ? (
        <Section title="Selection rules">
          <NumberProp
            label="Minimum selections"
            value={field.validation?.minSelections}
            onChange={(v) => onUpdate({ validation: { ...field.validation, minSelections: v } })}
          />
          <NumberProp
            label="Maximum selections"
            value={field.validation?.maxSelections}
            onChange={(v) => onUpdate({ validation: { ...field.validation, maxSelections: v } })}
          />
          {['checkbox', 'select', 'radio', 'picture_choice'].includes(field.type) ? (
            <CheckProp
              label="Allow an Other answer"
              checked={field.validation?.allowOther ?? false}
              onChange={(v) => onUpdate({ validation: { ...field.validation, allowOther: v } })}
            />
          ) : null}
        </Section>
      ) : null}

      {field.type === 'file' ? (
        <Section title="Upload restrictions">
          <TextProp
            label="Accepted types (e.g. .pdf,.png)"
            value={field.validation?.accept ?? ''}
            onChange={(accept) => onUpdate({ validation: { ...field.validation, accept } })}
          />
          <NumberProp
            label="Maximum size per file (MB)"
            value={field.validation?.maxFileSizeMb}
            onChange={(maxFileSizeMb) =>
              onUpdate({ validation: { ...field.validation, maxFileSizeMb } })
            }
          />
          <NumberProp
            label="Maximum number of files"
            value={field.validation?.maxFiles ?? 10}
            onChange={(value) =>
              onUpdate({
                validation: {
                  ...field.validation,
                  maxFiles:
                    value === undefined ? undefined : Math.min(100, Math.max(1, Math.floor(value))),
                },
              })
            }
          />
        </Section>
      ) : null}

      {field.type === 'section' ? (
        <Section title="Section intro">
          <AreaProp
            label="Description"
            value={field.sectionDescription ?? ''}
            onChange={(sectionDescription) => onUpdate({ sectionDescription })}
          />
        </Section>
      ) : null}

      <Section title="Layout">
        <SelectProp
          label="Width"
          value={field.layout?.width ?? '100%'}
          options={['25%', '50%', '75%', '100%']}
          onChange={(v) =>
            onUpdate({ layout: { ...field.layout, width: v as '25%' | '50%' | '75%' | '100%' } })
          }
        />
        <TextProp
          label="Field media URL (HTTPS)"
          value={field.layout?.mediaUrl ?? ''}
          onChange={(mediaUrl) =>
            onUpdate({
              layout: {
                ...field.layout,
                width: field.layout?.width ?? '100%',
                mediaType: mediaUrl ? (field.layout?.mediaType ?? 'image') : undefined,
                mediaUrl: mediaUrl || undefined,
              },
            })
          }
        />
        {field.layout?.mediaUrl ? (
          <>
            <SelectProp
              label="Media type"
              value={field.layout.mediaType ?? 'image'}
              options={['image', 'video']}
              onChange={(mediaType) =>
                onUpdate({
                  layout: { ...field.layout!, mediaType: mediaType as 'image' | 'video' },
                })
              }
            />
            <SelectProp
              label="Media placement"
              value={field.layout.align ?? 'inline'}
              options={[
                { value: 'inline', label: 'Above question' },
                { value: 'float_left', label: 'Float left' },
                { value: 'float_right', label: 'Float right' },
                { value: 'split_left', label: 'Split left' },
                { value: 'split_right', label: 'Split right' },
                { value: 'cover', label: 'Cover' },
              ]}
              onChange={(align) =>
                onUpdate({
                  layout: {
                    ...field.layout!,
                    align: align as NonNullable<FormField['layout']>['align'],
                  },
                })
              }
            />
            <NumberProp
              label="Media brightness (-100 to 100)"
              value={field.layout.brightness ?? 0}
              onChange={(brightness) =>
                onUpdate({
                  layout: {
                    ...field.layout!,
                    brightness: Math.max(-100, Math.min(100, brightness ?? 0)),
                  },
                })
              }
            />
          </>
        ) : null}
        <ColorProp
          label="Field background"
          value={field.layout?.backgroundColor ?? ''}
          onChange={(backgroundColor) =>
            onUpdate({
              layout: {
                ...field.layout,
                width: field.layout?.width ?? '100%',
                backgroundColor: backgroundColor || undefined,
              },
            })
          }
        />
        <p
          style={{
            margin: '0 0 8px',
            color: 'var(--text-secondary)',
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          Media is loaded from the HTTPS address you provide. Videos require respondent interaction
          and do not autoplay.
        </p>
      </Section>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onDuplicate} style={actionBtn}>
          ⧉ Duplicate
        </button>
        <button
          onClick={onRemove}
          style={{
            ...actionBtn,
            color: 'var(--danger)',
            borderColor: 'var(--danger-border)',
            background: 'var(--danger-bg)',
          }}
        >
          🗑 Delete
        </button>
      </div>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: 10,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--surface-subtle)',
      }}
    >
      <span style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <strong style={{ display: 'block', marginTop: 3, fontSize: 17 }}>{value}</strong>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

const labelCss: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  marginBottom: 6,
  color: 'var(--text-secondary)',
}

const fieldCss: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 13,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
}

function TextProp({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelCss}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={fieldCss}
      />
    </div>
  )
}

function DateTimeProp({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const localInputValue =
    value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0, 16) : ''
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelCss}>{label}</label>
      <input
        type="datetime-local"
        value={localInputValue}
        onChange={(event) =>
          onChange(
            event.target.value ? new Date(`${event.target.value}:00.000Z`).toISOString() : '',
          )
        }
        style={fieldCss}
      />
      <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 11 }}>
        Stored and evaluated in UTC.
      </div>
    </div>
  )
}

function AreaProp({
  label,
  value,
  onChange,
  rows = 3,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  mono?: boolean
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelCss}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        style={{ ...fieldCss, resize: 'vertical', fontFamily: mono ? 'monospace' : 'inherit' }}
      />
    </div>
  )
}

function NumberProp({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelCss}>{label}</label>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        style={fieldCss}
      />
    </div>
  )
}

function CheckProp({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16 }}
      />
      {label}
    </label>
  )
}

function SelectProp({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<string | { value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelCss}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={fieldCss}>
        {options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value
          const optionLabel = typeof option === 'string' ? option : option.label
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          )
        })}
      </select>
    </div>
  )
}

function ColorProp({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  // A native color input only accepts #rgb/#rrggbb; an unset or shorthand value
  // would silently render black, so normalize what the swatch shows.
  const swatch = /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : /^#[0-9a-f]{3}$/i.test(value)
      ? `#${value
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')}`
      : '#ffffff'
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelCss}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 44,
            height: 32,
            padding: 2,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--surface)',
          }}
        />
        <input
          type="text"
          value={value}
          placeholder={swatch}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...fieldCss, fontFamily: 'monospace' }}
        />
        {value ? (
          <button
            type="button"
            title={`Clear ${label.toLowerCase()}`}
            onClick={() => onChange('')}
            style={{ ...actionBtn, flex: '0 0 auto', padding: '8px 10px' }}
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  )
}
