import { useState } from 'react'
import type { Action } from '../../store/actions'
import { btnGhost, btnPrimary, colorVar, input } from '../styles'
import { ColorPicker } from './ProjectDialog'
import { Dialog } from './Dialog'

/** Create, recolour and delete labels for a project plus the global set. */
export function LabelsDialog({
  dispatch,
  labels,
  projectId,
  onClose,
}: {
  dispatch: (action: Action) => void
  labels: { id: string; name: string; color: string; projectId: string | null }[]
  projectId: string
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('slate')
  const [global, setGlobal] = useState(false)

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    dispatch({ kind: 'label/create', name: trimmed, color, projectId: global ? null : projectId })
    setName('')
  }

  return (
    <Dialog
      title="Labels"
      hint="Global labels appear in every project. Project labels are scoped to this board."
      onClose={onClose}
      actions={
        <button style={btnPrimary} onClick={onClose}>
          Done
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {labels.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No labels yet.</p> : null}
        {labels.map((label) => (
          <div key={label.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: colorVar(label.color),
                flexShrink: 0,
              }}
            />
            <input
              value={label.name}
              onChange={(event) =>
                dispatch({ kind: 'label/update', id: label.id, patch: { name: event.target.value } })
              }
              style={{ ...input, flex: 1 }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 52 }}>
              {label.projectId ? 'project' : 'global'}
            </span>
            <button
              style={btnGhost}
              title="Change colour"
              onClick={() =>
                dispatch({
                  kind: 'label/update',
                  id: label.id,
                  patch: { color: label.color === 'red' ? 'blue' : 'red' },
                })
              }
            >
              ⇄
            </button>
            <button
              style={btnGhost}
              title="Delete label"
              onClick={() => {
                if (window.confirm(`Delete label “${label.name}”? It is removed from every task.`)) {
                  dispatch({ kind: 'label/delete', id: label.id })
                }
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add()
            }}
            placeholder="New label name"
            style={{ ...input, flex: 1 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={global} onChange={(event) => setGlobal(event.target.checked)} />
            global
          </label>
          <button style={btnPrimary} onClick={add} disabled={!name.trim()}>
            Add
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>
    </Dialog>
  )
}
