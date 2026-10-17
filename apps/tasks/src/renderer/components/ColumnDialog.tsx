import { useState } from 'react'
import type { Action } from '../../store/actions'
import { btnGhost, btnPrimary, colorVar, fieldGroup, input, label } from '../styles'
import { ColorPicker } from './ProjectDialog'
import { Dialog } from './Dialog'

/** Create, rename, recolour, reorder or delete a single board column. */
export function ColumnDialog({
  dispatch,
  projectId,
  columns,
  column,
  onClose,
}: {
  dispatch: (action: Action) => void
  projectId: string
  columns: { id: string; name: string; color: string; isDone: boolean; wipLimit: number | null; position: number }[]
  column?: { id: string; name: string; color: string; isDone: boolean; wipLimit: number | null; position: number }
  onClose: () => void
}) {
  const editing = column !== undefined
  const [name, setName] = useState(column?.name ?? '')
  const [color, setColor] = useState(column?.color ?? 'slate')
  const [isDone, setIsDone] = useState(column?.isDone ?? false)
  const [wipLimit, setWipLimit] = useState(column?.wipLimit === null || column?.wipLimit === undefined ? '' : String(column.wipLimit))

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const limit = wipLimit.trim() === '' ? null : Math.max(0, Number(wipLimit) || 0)
    if (column) {
      dispatch({ kind: 'column/update', id: column.id, patch: { name: trimmed, color, isDone, wipLimit: limit } })
    } else {
      dispatch({ kind: 'column/create', projectId, name: trimmed, color, isDone, wipLimit: limit })
    }
    onClose()
  }

  const move = (id: string, direction: -1 | 1) => {
    const index = columns.findIndex((entry) => entry.id === id)
    const target = columns[index + direction]
    if (!target) return
    dispatch({ kind: 'column/update', id, patch: { position: target.position } })
    dispatch({ kind: 'column/update', id: target.id, patch: { position: columns[index].position } })
  }

  const remove = (id: string, name: string) => {
    if (!window.confirm(`Delete column “${name}”? Its tasks move to the first remaining column.`)) return
    dispatch({ kind: 'column/delete', id })
    onClose()
  }

  return (
    <Dialog
      title={editing ? 'Edit column' : 'New column'}
      hint={
        editing
          ? 'A done column stamps a completion date on tasks that enter it.'
          : 'Columns define your workflow. Mark one as done to complete tasks automatically.'
      }
      onClose={onClose}
      actions={
        <>
          {editing && column && columns.length > 1 ? (
            <button style={{ ...btnGhost, marginRight: 'auto' }} onClick={() => remove(column.id, column.name)}>
              Delete column
            </button>
          ) : null}
          <button style={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button style={btnPrimary} onClick={submit} disabled={!name.trim()}>
            {editing ? 'Save' : 'Add column'}
          </button>
        </>
      }
    >
      <div style={fieldGroup}>
        <span style={label}>Name</span>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} style={input} placeholder="In Review" />
      </div>
      <div style={fieldGroup}>
        <span style={label}>WIP limit</span>
        <input
          type="number"
          min={0}
          value={wipLimit}
          onChange={(event) => setWipLimit(event.target.value)}
          style={input}
          placeholder="No limit"
        />
      </div>
      <div style={fieldGroup}>
        <span style={label}>Colour</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div style={fieldGroup}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={isDone} onChange={(event) => setIsDone(event.target.checked)} />
          This column means the work is done
        </label>
      </div>

      {editing && column ? (
        <div style={fieldGroup}>
          <span style={label}>Reorder</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {columns.map((entry, index) => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: colorVar(entry.color) }} />
                <span style={{ flex: 1, color: entry.id === column.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {entry.name}
                  {entry.id === column.id ? ' •' : ''}
                </span>
                <button style={btnGhost} disabled={index === 0} onClick={() => move(entry.id, -1)} aria-label="Move left">
                  ↑
                </button>
                <button style={btnGhost} disabled={index === columns.length - 1} onClick={() => move(entry.id, 1)} aria-label="Move right">
                  ↓
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
