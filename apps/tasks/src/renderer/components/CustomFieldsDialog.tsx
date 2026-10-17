import { useState } from 'react'
import type { Action } from '../../store/actions'
import { CUSTOM_FIELD_TYPES } from '../../domain/types'
import { btnGhost, btnPrimary, chip, fieldGroup, input, label } from '../styles'
import { Dialog } from './Dialog'
import { SelectMenu } from './SelectMenu'

/** Define and remove per-project custom fields. */
export function CustomFieldsDialog({
  dispatch,
  projectId,
  fields,
  onClose,
}: {
  dispatch: (action: Action) => void
  projectId: string
  fields: { id: string; name: string; type: string; options: string[] }[]
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('text')
  const [options, setOptions] = useState('')

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const parsed = options
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    dispatch({
      kind: 'customField/define',
      projectId,
      name: trimmed,
      type: type as never,
      options: parsed,
    })
    setName('')
    setOptions('')
  }

  return (
    <Dialog
      title="Custom fields"
      hint="Custom fields add structured data to every task in this project."
      onClose={onClose}
      actions={
        <button style={btnPrimary} onClick={onClose}>
          Done
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {fields.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No custom fields yet.</p>
        ) : null}
        {fields.map((field) => (
          <div key={field.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={chip}>{field.type}</span>
            <input
              value={field.name}
              onChange={(event) =>
                dispatch({
                  kind: 'customField/update',
                  id: field.id,
                  patch: { name: event.target.value },
                })
              }
              style={{ ...input, flex: 1 }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              {field.options.length ? field.options.join(' / ') : '—'}
            </span>
            <button
              style={btnGhost}
              title="Delete field"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete field “${field.name}”? Values are cleared from every task.`,
                  )
                ) {
                  dispatch({ kind: 'customField/delete', id: field.id })
                }
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={fieldGroup}>
          <span style={label}>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Story points"
            style={input}
          />
        </div>
        <div style={fieldGroup}>
          <span style={label}>Type</span>
          <SelectMenu
            label="Custom field type"
            value={type}
            options={CUSTOM_FIELD_TYPES.map((entry) => ({ value: entry, label: entry }))}
            onChange={setType}
            style={{ ...input, padding: 0 }}
          />
        </div>
        {type === 'select' ? (
          <div style={fieldGroup}>
            <span style={label}>Options (comma separated)</span>
            <input
              value={options}
              onChange={(event) => setOptions(event.target.value)}
              placeholder="Design, Build, QA"
              style={input}
            />
          </div>
        ) : null}
        <button style={{ ...btnPrimary, marginTop: 12 }} onClick={add} disabled={!name.trim()}>
          Add field
        </button>
      </div>
    </Dialog>
  )
}
