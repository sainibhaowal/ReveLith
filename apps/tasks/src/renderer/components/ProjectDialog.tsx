import { useState } from 'react'
import type { Action } from '../../store/actions'
import { btnGhost, btnPrimary, colorVar, fieldGroup, input, label } from '../styles'
import { Dialog } from './Dialog'

const COLORS = ['slate', 'blue', 'violet', 'magenta', 'rose', 'red', 'orange', 'amber', 'lime', 'green', 'teal', 'cyan']

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className="tasks-color-choice"
          onClick={() => onChange(color)}
          aria-label={color}
          aria-pressed={value === color}
          style={{
            minWidth: 78,
            height: 32,
            borderRadius: 8,
            background: 'var(--surface)',
            border: value === color ? '2px solid var(--text-primary)' : '1px solid var(--border)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 7,
            padding: '4px 8px',
          }}
        >
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, background: colorVar(color), border: '1px solid rgb(15 23 42 / 22%)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{color}</span>
        </button>
      ))}
    </div>
  )
}

/** Create a project, or edit an existing one when `projectId` is supplied. */
export function ProjectDialog({
  dispatch,
  project,
  onClose,
}: {
  dispatch: (action: Action) => void
  project?: { id: string; name: string; key: string; description: string; color: string }
  onClose: () => void
}) {
  const editing = project !== undefined
  const [name, setName] = useState(project?.name ?? '')
  const [key, setKey] = useState(project?.key ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [color, setColor] = useState(project?.color ?? 'blue')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (project) {
      dispatch({
        kind: 'project/update',
        id: project.id,
        patch: { name: trimmed, ...(key.trim() ? { key: key.trim() } : {}), description, color },
      })
    } else {
      dispatch({ kind: 'project/create', name: trimmed, key: key.trim() || undefined, description, color })
    }
    onClose()
  }

  return (
    <Dialog
      title={editing ? 'Project settings' : 'New project'}
      hint={
        editing
          ? 'Renaming the key changes future ticket ids. Existing task numbers are untouched.'
          : 'A project owns its columns, labels, custom fields and ticket numbering.'
      }
      onClose={onClose}
      actions={
        <>
          <button style={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button style={btnPrimary} onClick={submit} disabled={!name.trim()}>
            {editing ? 'Save changes' : 'Create project'}
          </button>
        </>
      }
    >
      <div style={fieldGroup}>
        <span style={label}>Name</span>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} style={input} placeholder="Website Redesign" />
      </div>
      <div style={fieldGroup}>
        <span style={label}>Ticket key</span>
        <input
          value={key}
          onChange={(event) => setKey(event.target.value.toUpperCase())}
          style={input}
          placeholder={editing ? 'WEB' : 'WEB'}
          maxLength={6}
        />
      </div>
      <div style={fieldGroup}>
        <span style={label}>Description</span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />
      </div>
      <div style={fieldGroup}>
        <span style={label}>Colour</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
    </Dialog>
  )
}
