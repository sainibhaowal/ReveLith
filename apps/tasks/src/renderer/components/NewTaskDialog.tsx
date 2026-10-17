import { useState } from 'react'
import type { Action } from '../../store/actions'
import { PRIORITIES } from '../../domain/types'
import { btnGhost, btnPrimary, chip, colorVar, fieldGroup, input, label } from '../styles'
import { Dialog } from './Dialog'
import { SelectMenu } from './SelectMenu'

/** Create a task, pre-filled from the column it was launched from. */
export function NewTaskDialog({
  dispatch,
  projectId,
  columnId,
  columns,
  labels,
  onClose,
}: {
  dispatch: (action: Action) => void
  projectId: string
  columnId: string
  columns: { id: string; name: string; color: string }[]
  labels: { id: string; name: string; color: string }[]
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [column, setColumn] = useState(columnId)
  const [priority, setPriority] = useState<string>('medium')
  const [dueDate, setDueDate] = useState('')
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])

  const submit = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    dispatch({
      kind: 'task/create',
      projectId,
      columnId: column,
      title: trimmed,
      description,
      priority: priority as never,
      dueDate: dueDate || null,
      labelIds: selectedLabels,
    })
    onClose()
  }

  return (
    <Dialog
      title="New task"
      onClose={onClose}
      actions={
        <>
          <button style={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button style={btnPrimary} onClick={submit} disabled={!title.trim()}>
            Create task
          </button>
        </>
      }
    >
      <div style={fieldGroup}>
        <span style={label}>Title</span>
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          placeholder="What needs doing?"
          style={input}
        />
      </div>
      <div style={fieldGroup}>
        <span style={label}>Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          style={{ ...input, resize: 'vertical' }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <div>
          <span style={label}>Column</span>
          <SelectMenu
            label="Task column"
            value={column}
            options={columns.map((entry) => ({
              value: entry.id,
              label: entry.name,
              color: entry.color,
            }))}
            onChange={setColumn}
            style={{ ...input, padding: 0 }}
          />
        </div>
        <div>
          <span style={label}>Priority</span>
          <SelectMenu
            label="Task priority"
            value={priority}
            options={PRIORITIES.map((entry) => ({
              value: entry,
              label: entry,
              color:
                entry === 'urgent'
                  ? 'red'
                  : entry === 'high'
                    ? 'orange'
                    : entry === 'medium'
                      ? 'amber'
                      : 'slate',
            }))}
            onChange={setPriority}
            style={{ ...input, padding: 0 }}
          />
        </div>
      </div>
      <div style={fieldGroup}>
        <span style={label}>Due date</span>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          style={input}
        />
      </div>
      {labels.length ? (
        <div style={fieldGroup}>
          <span style={label}>Labels</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {labels.map((entry) => {
              const active = selectedLabels.includes(entry.id)
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="tasks-label-control"
                  data-active={active}
                  onClick={() =>
                    setSelectedLabels((prev) =>
                      prev.includes(entry.id)
                        ? prev.filter((id) => id !== entry.id)
                        : [...prev, entry.id],
                    )
                  }
                  style={{
                    ...chip,
                    cursor: 'pointer',
                    borderColor: colorVar(entry.color),
                    background: active
                      ? `color-mix(in srgb, ${colorVar(entry.color)} 14%, var(--surface))`
                      : 'var(--surface)',
                    color: colorVar(entry.color),
                  }}
                >
                  <span
                    className="tasks-label-dot"
                    style={{ background: colorVar(entry.color) }}
                    aria-hidden="true"
                  />
                  {entry.name}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
