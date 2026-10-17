import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormField, FormSchema } from '../types'
import { getCountryNames } from '../countries'
import { randomizeChoiceOrder } from '../quiz'
import { shouldShowField } from '../logic'
import {
  isAttachmentReference,
  matchesAcceptedFiles,
  storeLocalAttachment,
  type AttachmentReference,
} from '../attachments'
import { validateFileContent } from '../fileValidation'
import { respondentMessage } from '../translations'

interface FieldRendererProps {
  field: FormField
  schema: FormSchema | null
  value: unknown
  onChange: (value: unknown) => void
  errors?: Record<string, string>
}

/** Ink for canvas-drawn signatures: canvas cannot resolve CSS custom properties,
 * so it repeats the form document ink declared in styles.css. */
const FORM_INK = '#1f2937'

function inputStyle(schema: FormSchema | null): React.CSSProperties {
  return {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid var(--form-border)',
    borderRadius: schema?.theme?.borderRadius ?? 6,
    background: 'var(--form-input-bg)',
    color: 'var(--form-ink)',
    fontFamily: schema?.theme?.fontFamily ?? 'inherit',
    outline: undefined,
    boxSizing: 'border-box',
  }
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--form-ink)',
}

const helpStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: 'var(--form-muted-ink)',
}

function mediaFilter(brightness = 0): React.CSSProperties {
  const value = 1 + brightness / 100
  return value < 0
    ? { filter: `brightness(${value})` }
    : { filter: `contrast(${2 - value}) brightness(${value})` }
}

function renderFieldMedia(field: FormField, objectFit: 'cover' | 'contain' = 'cover') {
  const url = field.layout?.mediaUrl
  if (!url) return null
  const style: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    maxHeight: 300,
    objectFit,
    borderRadius: 6,
    ...mediaFilter(field.layout?.brightness),
  }
  return field.layout?.mediaType === 'video' ? (
    <video
      src={url}
      title={`${field.label || 'Question'} media`}
      controls
      preload="metadata"
      playsInline
      ref={(element) => element?.setAttribute('referrerpolicy', 'no-referrer')}
      style={style}
    />
  ) : (
    <img
      src={url}
      alt={`${field.label || 'Question'} media`}
      loading="lazy"
      referrerPolicy="no-referrer"
      style={style}
    />
  )
}

export function FieldRenderer({ field, schema, value, onChange, errors = {} }: FieldRendererProps) {
  const [draft, setDraft] = useState<unknown>(value)
  const [localError, setLocalError] = useState('')
  const width = field.layout?.width ?? '100%'
  useEffect(() => setDraft(value), [value])

  const commit = (next: unknown) => {
    setDraft(next)
    onChange(next)
  }

  const required = field.required ? (
    <span style={{ color: 'var(--form-danger)', marginLeft: 2 }}>*</span>
  ) : null
  const ui = (key: Parameters<typeof respondentMessage>[1]) =>
    respondentMessage(schema?.settings.locale, key)
  const choices = useMemo(() => {
    const values = field.options ?? []
    return field.randomizeOptions ? randomizeChoiceOrder(values) : [...values]
  }, [field.id, field.randomizeOptions, (field.options ?? []).join('\u0000')])
  const wrap = (children: React.ReactNode) => {
    const media = renderFieldMedia(field)
    const align = field.layout?.align ?? 'inline'
    const helpId = `field-${field.id}-help`
    const errorId = `field-${field.id}-error`
    const accessibleControls = (node: React.ReactNode, insideLabel = false): React.ReactNode =>
      React.Children.map(node, (child) => {
        if (!React.isValidElement<Record<string, unknown>>(child)) return child
        if (child.type === React.Fragment)
          return React.cloneElement(
            child,
            {},
            accessibleControls(child.props.children as React.ReactNode, insideLabel),
          )
        const nativeControl =
          typeof child.type === 'string' &&
          ['input', 'select', 'textarea', 'button'].includes(child.type)
        const props = nativeControl
          ? {
              ...(!insideLabel
                ? {
                    'aria-label':
                      child.props['aria-label'] ??
                      child.props.placeholder ??
                      field.label ??
                      respondentMessage(schema?.settings.locale, 'question'),
                  }
                : {}),
              'aria-describedby':
                [
                  child.props['aria-describedby'],
                  field.helpText ? helpId : '',
                  errors[field.id] ? errorId : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined,
              'aria-invalid': errors[field.id] ? true : undefined,
            }
          : {}
        const nestedLabel = insideLabel || child.type === 'label'
        return React.cloneElement(
          child,
          props,
          child.props.children
            ? accessibleControls(child.props.children as React.ReactNode, nestedLabel)
            : undefined,
        )
      })
    const content = (
      <div style={{ minWidth: 0 }}>
        <label style={labelStyle}>
          {field.label || 'Untitled field'} {required}
        </label>
        {accessibleControls(children)}
        {field.helpText ? (
          <p id={helpId} style={helpStyle}>
            {field.helpText}
          </p>
        ) : null}
        {errors[field.id] ? (
          <p
            id={errorId}
            role="alert"
            aria-live="assertive"
            style={{ margin: '6px 0 0', color: 'var(--form-danger)', fontSize: 12 }}
          >
            {errors[field.id]}
          </p>
        ) : null}
      </div>
    )
    const rootStyle: React.CSSProperties = {
      width,
      minWidth: 0,
      backgroundColor: field.layout?.backgroundColor,
      borderRadius: schema?.theme?.borderRadius ?? 6,
      padding: field.layout?.backgroundColor ? 10 : undefined,
    }
    if (media && align === 'cover' && field.layout?.mediaType !== 'video')
      return (
        <div
          className="field-renderer"
          style={{ ...rootStyle, position: 'relative', overflow: 'hidden', minHeight: 220 }}
        >
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, opacity: 0.42 }}>
            {renderFieldMedia(field)}
          </div>
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              padding: 14,
              borderRadius: 6,
              background: 'rgba(255,255,255,.9)',
            }}
          >
            {content}
          </div>
        </div>
      )
    if (media && ['split_left', 'split_right'].includes(align))
      return (
        <div
          className="field-renderer"
          style={{
            ...rootStyle,
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {align === 'split_left' ? media : content}
          {align === 'split_left' ? content : media}
        </div>
      )
    if (media && ['float_left', 'float_right'].includes(align))
      return (
        <div
          className="field-renderer"
          style={{ ...rootStyle, display: 'flex', alignItems: 'flex-start', gap: 14 }}
        >
          {align === 'float_left' ? (
            <div style={{ width: '36%', flex: '0 0 36%' }}>{media}</div>
          ) : (
            content
          )}
          {align === 'float_left' ? (
            content
          ) : (
            <div style={{ width: '36%', flex: '0 0 36%' }}>{media}</div>
          )}
        </div>
      )
    return (
      <div className="field-renderer" style={rootStyle}>
        {media ? <div style={{ marginBottom: 10 }}>{media}</div> : null}
        {content}
      </div>
    )
  }

  const str = typeof draft === 'string' || typeof draft === 'number' ? String(draft) : ''

  switch (field.type) {
    case 'group': {
      const groupAnswers =
        draft && typeof draft === 'object' && !Array.isArray(draft)
          ? (draft as Record<string, unknown>)
          : {}
      const children = field.children ?? []
      return (
        <fieldset
          className="field-renderer"
          style={{
            width,
            minWidth: 0,
            margin: 0,
            padding: '12px 14px',
            border: '1px solid var(--form-border)',
            backgroundColor: field.layout?.backgroundColor,
            borderRadius: schema?.theme.borderRadius ?? 8,
          }}
        >
          <legend
            style={{ padding: '0 5px', fontSize: 14, fontWeight: 600, color: 'var(--form-ink)' }}
          >
            {field.label || 'Question group'}
          </legend>
          {renderFieldMedia(field) ? (
            <div style={{ margin: '4px 0 12px' }}>{renderFieldMedia(field)}</div>
          ) : null}
          {field.helpText ? (
            <p style={{ margin: '0 0 12px', ...helpStyle }}>{field.helpText}</p>
          ) : null}
          <div style={{ display: 'grid', gap: 14 }}>
            {children
              .filter((child) => shouldShowField(child, groupAnswers))
              .map((child) => (
                <FieldRenderer
                  key={child.id}
                  field={child}
                  schema={schema}
                  value={groupAnswers[child.id]}
                  errors={errors}
                  onChange={(childValue) => commit({ ...groupAnswers, [child.id]: childValue })}
                />
              ))}
          </div>
          {errors[field.id] ? (
            <p
              role="alert"
              style={{ margin: '6px 0 0', color: 'var(--form-danger)', fontSize: 12 }}
            >
              {errors[field.id]}
            </p>
          ) : null}
        </fieldset>
      )
    }
    case 'section':
      return (
        <div className="form-section-heading">
          <h2>{field.label || 'Section'}</h2>
          {field.sectionDescription || field.helpText ? (
            <p>{field.sectionDescription || field.helpText}</p>
          ) : null}
        </div>
      )
    case 'pagebreak':
      return (
        <div className="form-page-break">
          <span>New respondent page</span>
        </div>
      )
    case 'statement':
      return (
        <section className="form-section-heading">
          <h2>{field.label || 'Statement'}</h2>
          {field.sectionDescription || field.helpText ? (
            <p>{field.sectionDescription || field.helpText}</p>
          ) : null}
        </section>
      )
    case 'welcome':
      return (
        <section className="form-section-heading">
          <h2>{field.label || 'Welcome'}</h2>
          {field.sectionDescription || field.helpText ? (
            <p>{field.sectionDescription || field.helpText}</p>
          ) : null}
          <button type="button" onClick={() => commit(true)} style={smallBtn}>
            {field.buttonText || ui('start')}
          </button>
        </section>
      )
    case 'thankyou':
      return (
        <section className="form-section-heading">
          <h2>{field.label || 'Thank you'}</h2>
          {field.sectionDescription || field.helpText ? (
            <p>{field.sectionDescription || field.helpText}</p>
          ) : null}
        </section>
      )
    case 'hidden':
      return <input type="hidden" aria-label={field.label || 'Hidden value'} value={str} readOnly />
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
      return wrap(
        <input
          type={field.type === 'phone' ? 'tel' : field.type === 'url' ? 'url' : field.type}
          value={str}
          onChange={(e) => commit(e.target.value)}
          placeholder={field.placeholder}
          style={inputStyle(schema)}
          maxLength={field.validation?.maxLength}
        />,
      )
    case 'number':
    case 'currency':
      return wrap(
        <input
          type="number"
          value={str}
          onChange={(e) => commit(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder={field.placeholder}
          style={inputStyle(schema)}
          min={field.validation?.min}
          max={field.validation?.max}
          step={field.type === 'currency' ? '0.01' : undefined}
        />,
      )
    case 'textarea':
      return wrap(
        <textarea
          value={str}
          onChange={(e) => commit(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          style={{ ...inputStyle(schema), resize: 'vertical', minHeight: 96 }}
          maxLength={field.validation?.maxLength}
        />,
      )
    case 'date':
      return wrap(
        <input
          type="date"
          value={str}
          onChange={(e) => commit(e.target.value)}
          style={inputStyle(schema)}
        />,
      )
    case 'date_range': {
      const range =
        draft && typeof draft === 'object' ? (draft as { start?: string; end?: string }) : {}
      return wrap(
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ fontSize: 12, color: 'var(--form-muted-ink)' }}>
            Start date
            <input
              aria-label={`${field.label} start date`}
              type="date"
              value={range.start ?? ''}
              onChange={(event) => commit({ ...range, start: event.target.value })}
              style={inputStyle(schema)}
            />
          </label>
          <label style={{ fontSize: 12, color: 'var(--form-muted-ink)' }}>
            End date
            <input
              aria-label={`${field.label} end date`}
              type="date"
              min={range.start}
              value={range.end ?? ''}
              onChange={(event) => commit({ ...range, end: event.target.value })}
              style={inputStyle(schema)}
            />
          </label>
        </div>,
      )
    }
    case 'fullname': {
      const name =
        draft && typeof draft === 'object'
          ? (draft as { firstName?: string; lastName?: string })
          : {}
      return wrap(
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input
            aria-label="First name"
            autoComplete="given-name"
            value={name.firstName ?? ''}
            onChange={(event) => commit({ ...name, firstName: event.target.value })}
            placeholder="First name"
            style={inputStyle(schema)}
          />
          <input
            aria-label="Last name"
            autoComplete="family-name"
            value={name.lastName ?? ''}
            onChange={(event) => commit({ ...name, lastName: event.target.value })}
            placeholder="Last name"
            style={inputStyle(schema)}
          />
        </div>,
      )
    }
    case 'time':
      return wrap(
        <input
          type="time"
          value={str}
          onChange={(e) => commit(e.target.value)}
          style={inputStyle(schema)}
        />,
      )
    case 'select': {
      return wrap(
        <>
          <select
            value={field.validation?.allowOther && str.startsWith('Other:') ? 'Other' : str}
            onChange={(e) => commit(e.target.value === 'Other' ? 'Other: ' : e.target.value)}
            style={inputStyle(schema)}
          >
            <option value="">{field.placeholder || 'Select an option'}</option>
            {choices.map((opt, i) => (
              <option key={i} value={opt}>
                {field.optionLabels?.[opt] || opt}
              </option>
            ))}
            {field.validation?.allowOther ? <option value="Other">{ui('other')}</option> : null}
          </select>
          {field.validation?.allowOther && str.startsWith('Other:') ? (
            <input
              aria-label={ui('otherAnswer')}
              value={str.slice(6)}
              onChange={(event) => commit(`Other: ${event.target.value}`)}
              placeholder={ui('otherAnswer')}
              style={{ ...inputStyle(schema), marginTop: 8 }}
            />
          ) : null}
        </>,
      )
    }
    case 'radio':
    case 'picture_choice': {
      return wrap(
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              field.choiceLayout === 'vertical' ? '1fr' : 'repeat(auto-fit,minmax(140px,1fr))',
            gap: 8,
          }}
        >
          {[...choices, ...(field.validation?.allowOther ? ['Other'] : [])].map((opt, i) => (
            <label
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                border: `1px solid ${field.choiceColors?.[opt] ?? 'var(--form-border)'}`,
                borderLeft: field.choiceColors?.[opt]
                  ? `4px solid ${field.choiceColors[opt]}`
                  : undefined,
                borderRadius: 6,
                cursor: 'pointer',
                background:
                  draft === opt || (opt === 'Other' && str.startsWith('Other:'))
                    ? 'var(--form-accent-soft)'
                    : field.choiceColors?.[opt]
                      ? `${field.choiceColors[opt]}18`
                      : 'transparent',
              }}
            >
              <input
                type="radio"
                name={field.id}
                checked={draft === opt || (opt === 'Other' && str.startsWith('Other:'))}
                onChange={() => commit(opt === 'Other' ? 'Other: ' : opt)}
              />
              <span style={{ display: 'grid', gap: 6, fontSize: 14, color: 'var(--form-ink)' }}>
                {field.type === 'picture_choice' && field.choiceImages?.[opt] ? (
                  <img
                    src={field.choiceImages[opt]}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 4 }}
                  />
                ) : null}
                <span>
                  {field.choiceIcons?.[opt] ? (
                    <span aria-hidden="true" style={{ marginRight: 7 }}>
                      {field.choiceIcons[opt]}
                    </span>
                  ) : null}
                  {opt === 'Other'
                    ? field.optionLabels?.[opt] || ui('other')
                    : field.optionLabels?.[opt] || opt}
                </span>
              </span>
            </label>
          ))}
          {field.validation?.allowOther && str.startsWith('Other:') ? (
            <input
              aria-label={ui('otherAnswer')}
              value={str.slice(6)}
              onChange={(event) => commit(`Other: ${event.target.value}`)}
              placeholder={ui('otherAnswer')}
              style={{ ...inputStyle(schema), gridColumn: '1 / -1' }}
            />
          ) : null}
        </div>,
      )
    }
    case 'yesno':
      return wrap(
        <div style={{ display: 'flex', gap: 10 }}>
          {['Yes', 'No'].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => commit(option)}
              style={{
                padding: '10px 22px',
                border: `1px solid ${draft === option ? (schema?.theme.primaryColor ?? '#2563eb') : 'var(--form-border)'}`,
                borderRadius: schema?.theme.borderRadius ?? 8,
                background:
                  draft === option
                    ? `${schema?.theme.primaryColor ?? '#2563eb'}14`
                    : 'var(--form-input-bg)',
                color: 'var(--form-ink)',
                cursor: 'pointer',
              }}
            >
              {option}
            </button>
          ))}
        </div>,
      )
    case 'nps': {
      const current = typeof draft === 'number' ? draft : -1
      const min = field.scaleMin ?? 0
      const max = field.scaleMax ?? 10
      return wrap(
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((score) => (
              <button
                type="button"
                key={score}
                onClick={() => commit(score)}
                aria-pressed={current === score}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 7,
                  border: `1px solid ${current === score ? (schema?.theme.primaryColor ?? '#2563eb') : 'var(--form-border)'}`,
                  background:
                    current === score
                      ? (schema?.theme.primaryColor ?? '#2563eb')
                      : 'var(--form-input-bg)',
                  color: current === score ? '#fff' : 'var(--form-ink)',
                  cursor: 'pointer',
                }}
              >
                {score}
              </button>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: 'var(--form-faint-ink)',
              fontSize: 11,
              marginTop: 6,
            }}
          >
            <span>Not at all likely</span>
            <span>Extremely likely</span>
          </div>
        </div>,
      )
    }
    case 'checkbox': {
      const arr = Array.isArray(draft) ? (draft as unknown[]) : []
      return wrap(
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              field.choiceLayout && field.choiceLayout !== 'vertical'
                ? 'repeat(auto-fit,minmax(140px,1fr))'
                : '1fr',
            gap: 8,
          }}
        >
          {[...choices, ...(field.validation?.allowOther ? ['Other'] : [])].map((opt, i) => (
            <label
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                border: `1px solid ${field.choiceColors?.[opt] ?? 'var(--form-border)'}`,
                borderLeft: field.choiceColors?.[opt]
                  ? `4px solid ${field.choiceColors[opt]}`
                  : undefined,
                borderRadius: 6,
                cursor: 'pointer',
                background: arr.some(
                  (item) => item === opt || (opt === 'Other' && String(item).startsWith('Other:')),
                )
                  ? 'var(--form-accent-soft)'
                  : field.choiceColors?.[opt]
                    ? `${field.choiceColors[opt]}18`
                    : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={
                  arr.includes(opt) ||
                  (opt === 'Other' && arr.some((item) => String(item).startsWith('Other:')))
                }
                onChange={(e) => {
                  const next = [...arr]
                  if (e.target.checked) next.push(opt === 'Other' ? 'Other: ' : opt)
                  else {
                    const index =
                      opt === 'Other'
                        ? next.findIndex((item) => String(item).startsWith('Other:'))
                        : next.indexOf(opt)
                    if (index >= 0) next.splice(index, 1)
                  }
                  commit(next)
                }}
              />
              <span style={{ fontSize: 14, color: 'var(--form-ink)' }}>
                {field.choiceIcons?.[opt] ? (
                  <span aria-hidden="true" style={{ marginRight: 7 }}>
                    {field.choiceIcons[opt]}
                  </span>
                ) : null}
                {opt === 'Other'
                  ? field.optionLabels?.[opt] || ui('other')
                  : field.optionLabels?.[opt] || opt}
              </span>
            </label>
          ))}
          {field.validation?.allowOther && arr.some((item) => String(item).startsWith('Other:')) ? (
            <input
              aria-label={ui('otherAnswer')}
              value={String(arr.find((item) => String(item).startsWith('Other:'))).slice(6)}
              onChange={(event) =>
                commit([
                  ...arr.filter((item) => !String(item).startsWith('Other:')),
                  `Other: ${event.target.value}`,
                ])
              }
              placeholder={ui('otherAnswer')}
              style={inputStyle(schema)}
            />
          ) : null}
        </div>,
      )
    }
    case 'legal_terms': {
      const accepted = draft === true
      return wrap(
        <div style={{ display: 'grid', gap: 10 }}>
          <details style={{ border: '1px solid var(--form-border)', borderRadius: 6, padding: 10 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--form-ink)' }}>
              Read the terms
            </summary>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, color: 'var(--form-ink)' }}>
              {field.termsText || 'Terms have not been provided.'}
            </p>
          </details>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => commit(event.target.checked)}
            />
            <span>{ui('agree')}</span>
          </label>
        </div>,
      )
    }
    case 'input_table': {
      const table =
        draft && typeof draft === 'object' && !Array.isArray(draft)
          ? (draft as Record<string, string>)
          : {}
      const rows = field.rows?.length ? field.rows : ['Row 1']
      const columns = field.columns?.length ? field.columns : ['Column 1']
      return wrap(
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th />
                {columns.map((column) => (
                  <th key={column} style={{ textAlign: 'left', padding: 6 }}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row}>
                  <th scope="row" style={{ textAlign: 'left', padding: 6 }}>
                    {row}
                  </th>
                  {columns.map((column) => {
                    const key = `${row}::${column}`
                    return (
                      <td key={key} style={{ padding: 4 }}>
                        <input
                          aria-label={`${row} ${column}`}
                          value={table[key] ?? ''}
                          onChange={(event) => commit({ ...table, [key]: event.target.value })}
                          style={inputStyle(schema)}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
    }
    case 'country': {
      const countries = field.options?.length
        ? field.options
        : getCountryNames(schema?.settings.locale)
      return wrap(
        <select
          autoComplete="country-name"
          value={str}
          onChange={(event) => commit(event.target.value)}
          style={inputStyle(schema)}
        >
          <option value="">{field.placeholder || ui('selectCountry')}</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>,
      )
    }
    case 'file': {
      const attachments = Array.isArray(draft) ? draft.filter(isAttachmentReference) : []
      return wrap(
        <div>
          <label
            style={{
              display: 'block',
              border: '2px dashed var(--form-border)',
              borderRadius: 8,
              padding: '24px',
              textAlign: 'center',
              background: 'var(--form-field-bg)',
              cursor: 'pointer',
            }}
          >
            <input
              type="file"
              multiple
              accept={field.validation?.accept}
              aria-label={`${field.label || 'Upload'} files`}
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: 'hidden',
                clip: 'rect(0,0,0,0)',
                whiteSpace: 'nowrap',
                border: 0,
              }}
              onChange={async (e) => {
                const input = e.currentTarget
                const files = Array.from(input.files ?? [])
                if (!files.length) return
                const maxFileSizeMb = field.validation?.maxFileSizeMb ?? 20
                const maxBytes = maxFileSizeMb * 1024 * 1024
                const oversized = files.filter((file) => file.size > maxBytes)
                if (oversized.length) {
                  setLocalError(
                    `${oversized.map((file) => file.name).join(', ')} exceed${oversized.length === 1 ? 's' : ''} the ${field.validation?.maxFileSizeMb} MB limit.`,
                  )
                  input.value = ''
                  return
                }
                const rejected = files.filter(
                  (file) => !matchesAcceptedFiles(file, field.validation?.accept),
                )
                if (rejected.length) {
                  setLocalError(
                    `${rejected.map((file) => file.name).join(', ')} do not match the accepted file types.`,
                  )
                  input.value = ''
                  return
                }
                const inspections = await Promise.allSettled(
                  files.map((file) => validateFileContent(file, field.validation?.accept)),
                )
                const contentErrors = inspections.flatMap((inspection, index) =>
                  inspection.status === 'rejected'
                    ? [
                        `${files[index]!.name}: ${inspection.reason instanceof Error ? inspection.reason.message : 'file content type could not be verified'}`,
                      ]
                    : [],
                )
                if (contentErrors.length) {
                  setLocalError(contentErrors.join(' '))
                  input.value = ''
                  return
                }
                const maxFiles = field.validation?.maxFiles ?? 10
                if (attachments.length + files.length > maxFiles) {
                  setLocalError(`Choose no more than ${maxFiles} files for this question.`)
                  input.value = ''
                  return
                }
                try {
                  setLocalError('')
                  const saved = await Promise.all(files.map(storeLocalAttachment))
                  commit([...attachments, ...saved])
                } catch (error) {
                  setLocalError(
                    error instanceof Error
                      ? error.message
                      : 'Could not save the selected file on this device.',
                  )
                } finally {
                  input.value = ''
                }
              }}
            />
            <div style={{ fontSize: 24, marginBottom: 8 }}>📎</div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--form-ink)' }}>
              {attachments.length > 0 ? 'Add more files' : 'Click to choose files'}
            </p>
            <span
              style={{
                display: 'block',
                marginTop: 5,
                fontSize: 11,
                color: 'var(--form-muted-ink)',
              }}
            >
              {field.validation?.accept
                ? `Accepted: ${field.validation.accept} · Up to ${field.validation?.maxFileSizeMb ?? 20} MB each`
                : `Up to ${field.validation?.maxFileSizeMb ?? 20} MB each · Stored locally on this device`}
            </span>
          </label>
          {attachments.length > 0 ? (
            <ul
              aria-label="Selected files"
              style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}
            >
              {attachments.map((attachment: AttachmentReference) => (
                <li
                  key={attachment.attachmentId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '5px 8px',
                    border: '1px solid var(--form-border)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <span style={{ flex: 1, overflowWrap: 'anywhere', color: 'var(--form-ink)' }}>
                    {attachment.name} · {(attachment.size / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.name}`}
                    onClick={() =>
                      commit(
                        attachments.filter((item) => item.attachmentId !== attachment.attachmentId),
                      )
                    }
                    style={{
                      border: 0,
                      background: 'transparent',
                      color: 'var(--form-danger)',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {localError ? (
            <p
              role="alert"
              style={{ color: 'var(--form-danger)', fontSize: 12, margin: '7px 0 0' }}
            >
              {localError}
            </p>
          ) : null}
        </div>,
      )
    }
    case 'signature': {
      const signed = typeof draft === 'string' && draft.length > 0 ? draft : ''
      return wrap(<SignatureInput value={signed} onChange={commit} />)
    }
    case 'rating': {
      const current = typeof draft === 'number' ? draft : 0
      const min = field.scaleMin ?? 1
      const max = field.scaleMax ?? 5
      return wrap(
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => commit(star)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 28,
                lineHeight: 1,
                cursor: 'pointer',
                color: current >= star ? 'var(--form-star-on)' : 'var(--form-star-off)',
                padding: 0,
              }}
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
            >
              ★
            </button>
          ))}
        </div>,
      )
    }
    case 'address': {
      const addr = (typeof draft === 'object' && draft !== null ? draft : {}) as Record<
        string,
        string
      >
      const set = (key: string, val: string) => commit({ ...addr, [key]: val })
      return wrap(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            autoComplete="address-line1"
            value={addr.street ?? ''}
            onChange={(e) => set('street', e.target.value)}
            placeholder="Street address"
            style={inputStyle(schema)}
          />
          <input
            type="text"
            autoComplete="address-line2"
            value={addr.address2 ?? ''}
            onChange={(e) => set('address2', e.target.value)}
            placeholder="Apartment, suite, etc. (optional)"
            style={inputStyle(schema)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <input
              type="text"
              autoComplete="address-level2"
              value={addr.city ?? ''}
              onChange={(e) => set('city', e.target.value)}
              placeholder="City"
              style={inputStyle(schema)}
            />
            <input
              type="text"
              autoComplete="address-level1"
              value={addr.state ?? ''}
              onChange={(e) => set('state', e.target.value)}
              placeholder="State / region"
              style={inputStyle(schema)}
            />
            <input
              type="text"
              autoComplete="postal-code"
              value={addr.zip ?? ''}
              onChange={(e) => set('zip', e.target.value)}
              placeholder="Postal code"
              style={inputStyle(schema)}
            />
          </div>
          <input
            type="text"
            autoComplete="country-name"
            value={addr.country ?? ''}
            onChange={(e) => set('country', e.target.value)}
            placeholder="Country"
            style={inputStyle(schema)}
          />
        </div>,
      )
    }
    default:
      return (
        <div
          style={{
            padding: 12,
            background: 'var(--form-danger-bg)',
            border: '1px solid var(--form-danger-border)',
            borderRadius: 6,
            color: 'var(--form-danger)',
            fontSize: 13,
          }}
        >
          Unknown field type: {field.type}
        </div>
      )
  }
}

function SignatureInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const changedRef = useRef(false)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (value.startsWith('data:image/png;base64,')) {
      const image = new Image()
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height)
      image.src = value
    }
  }, [value])
  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    }
  }
  const finish = () => {
    const canvas = canvasRef.current
    if (canvas && changedRef.current) onChange(canvas.toDataURL('image/png'))
    drawingRef.current = false
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <canvas
        ref={canvasRef}
        width={720}
        height={180}
        aria-label="Draw signature"
        role="application"
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          const point = position(event)
          const context = event.currentTarget.getContext('2d')
          if (!context) return
          drawingRef.current = true
          changedRef.current = true
          context.beginPath()
          context.moveTo(point.x, point.y)
          context.lineTo(point.x + 0.1, point.y + 0.1)
          context.strokeStyle = FORM_INK
          context.lineWidth = 3
          context.lineCap = 'round'
          context.stroke()
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return
          const point = position(event)
          const context = event.currentTarget.getContext('2d')
          if (!context) return
          context.lineTo(point.x, point.y)
          context.stroke()
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        style={{
          display: 'block',
          width: '100%',
          height: 110,
          border: '1px solid var(--form-border)',
          borderRadius: 6,
          background: 'var(--form-input-bg)',
          touchAction: 'none',
          cursor: 'crosshair',
        }}
      />
      <label style={{ fontSize: 12, color: 'var(--form-muted-ink)' }}>
        Or type your name
        <input
          aria-label="Typed signature"
          value={value.startsWith('data:image/') ? '' : value}
          onChange={(event) => {
            changedRef.current = false
            onChange(event.target.value)
          }}
          placeholder="Full name"
          style={inputStyle(null)}
        />
      </label>
      {value ? (
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current
            canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
            changedRef.current = false
            onChange('')
          }}
          style={{
            ...smallBtn,
            justifySelf: 'start',
            background: 'var(--form-input-bg)',
            color: 'var(--form-ink)',
            border: '1px solid var(--form-border)',
          }}
        >
          Clear signature
        </button>
      ) : null}
    </div>
  )
}

const smallBtn: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--form-accent)',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}
