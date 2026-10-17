import type { CSSProperties } from 'react'
import type { BoardState, ID, Priority } from '../../domain/types'
import { PRIORITIES, PRIORITY_LABEL } from '../../domain/types'
import type { Action } from '../../store/actions'
import { projectColumns } from '../../store/selectors'
import { Avatar, UnassignedAvatar } from './Avatar'
import { btnGhost, btnPrimary, PRIORITY_COLOR_NAME } from '../styles'
import { SelectMenu } from './SelectMenu'

/**
 * Floating bar for acting on a multi-task selection.
 *
 * Appears only while something is selected, and every control dispatches a bulk
 * action rather than looping the UI, so one undo reverts the whole batch.
 */
export function BulkBar({
  state,
  selectedIds,
  projectId,
  dispatch,
  onAskAI,
  onClear,
}: {
  state: BoardState
  selectedIds: ID[]
  projectId: ID | null
  dispatch: (action: Action) => void
  onAskAI: (ids: ID[]) => void
  onClear: () => void
}) {
  if (!selectedIds.length) return null
  const columns = projectId ? projectColumns(state, projectId) : []

  return (
    <div style={bar} role="toolbar" aria-label="Bulk actions">
      <span style={count}>{selectedIds.length} selected</span>
      <button
        style={btnGhost}
        type="button"
        title="Only the selected tasks (up to 12), including their titles, descriptions, metadata, and visible card bounds when available, are sent to your configured AI provider when you click. The provider may be remote. Other tasks and attachments are excluded."
        onClick={() => onAskAI(selectedIds)}
      >
        Ask AI about selected
      </button>

      {columns.length ? (
        <SelectMenu
          label="Move to column"
          value=""
          placeholder="Move to…"
          options={columns.map((column) => ({ value: column.id, label: column.name, color: column.color }))}
          onChange={(value) => { if (value) dispatch({ kind: 'bulk/move', ids: selectedIds, columnId: value }) }}
          className="tasks-bulk-select tasks-bulk-select-column"
        />
      ) : null}

      <SelectMenu
        label="Set priority"
        value=""
        placeholder="Priority…"
        options={PRIORITIES.map((priority) => ({
          value: priority,
          label: PRIORITY_LABEL[priority],
          color: PRIORITY_COLOR_NAME[priority],
        }))}
        onChange={(value) => { if (value) dispatch({ kind: 'bulk/update', ids: selectedIds, patch: { priority: value as Priority } }) }}
        className="tasks-bulk-select tasks-bulk-select-priority"
      />

      <SelectMenu
        label="Set assignee"
        value=""
        placeholder="Assign to…"
        options={[...state.members.map((member) => ({ value: member.id, label: member.name, color: member.color })), { value: '__none__', label: 'Unassign' }]}
        onChange={(value) => dispatch({ kind: 'bulk/update', ids: selectedIds, patch: { assigneeId: value === '__none__' || !value ? null : value } })}
        className="tasks-bulk-select tasks-bulk-select-assignee"
      />

      <input
        type="date"
        aria-label="Set due date"
        style={{ ...miniSelect, padding: '3px 6px' }}
        onChange={(event) => {
          if (event.target.value) {
            dispatch({ kind: 'bulk/update', ids: selectedIds, patch: { dueDate: event.target.value } })
          }
        }}
      />

      <button
        style={btnGhost}
        type="button"
        onClick={() => dispatch({ kind: 'bulk/update', ids: selectedIds, patch: { archived: true } })}
      >
        Archive
      </button>
      <button
        style={{ ...btnGhost, color: 'var(--col-red)' }}
        type="button"
        onClick={() => {
          if (window.confirm(`Delete ${selectedIds.length} task(s)? This cannot be undone.`)) {
            dispatch({ kind: 'bulk/delete', ids: selectedIds })
          }
        }}
      >
        Delete
      </button>
      <button style={btnPrimary} type="button" onClick={onClear}>
        Clear
      </button>
    </div>
  )
}

/** Row of avatars for a selection, used in the bar's summary. */
export function SelectionAvatars({ state, assigneeIds }: { state: BoardState; assigneeIds: ID[] }) {
  const unique = Array.from(new Set(assigneeIds))
  if (!unique.length) return <UnassignedAvatar size={18} />
  return (
    <>
      {unique.slice(0, 4).map((id) => {
        const member = state.members.find((entry) => entry.id === id)
        return member ? <Avatar key={id} name={member.name} color={member.color} size={18} /> : null
      })}
    </>
  )
}

const bar: CSSProperties = {
  position: 'absolute',
  bottom: 58,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  borderRadius: 10,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
  zIndex: 20,
  flexWrap: 'wrap',
  maxWidth: '90%',
}

const count: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginRight: 2,
}

const miniSelect: CSSProperties = {
  fontSize: 11,
  padding: '3px 6px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-primary)',
}
