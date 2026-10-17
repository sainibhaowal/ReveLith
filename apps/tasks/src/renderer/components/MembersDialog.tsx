import { useState } from 'react'
import { COLOR_NAMES } from '../../domain/types'
import type { BoardState, ID } from '../../domain/types'
import type { Action } from '../../store/actions'
import { memberWorkload } from '../../store/selectors'
import { Avatar, UnassignedAvatar } from './Avatar'
import { Dialog } from './Dialog'
import { btnDanger, btnGhost, btnPrimary, colorVar, input, label } from '../styles'
import { SelectMenu } from './SelectMenu'

/**
 * Owner control for a task, and the entry point to managing the roster.
 *
 * Stays a plain `<select>` on the card and in the detail so it is usable without
 * a popover, and escalates to a dialog only for roster management.
 */
export function AssigneePicker({
  state,
  taskId,
  assigneeId,
  dispatch,
  compact,
}: {
  state: BoardState
  taskId: ID
  assigneeId: ID | null
  dispatch: (action: Action) => void
  compact?: boolean
}) {
  const [managing, setManaging] = useState(false)
  const assignee = state.members.find((member) => member.id === assigneeId) ?? null

  return (
    <>
      {compact ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {assignee ? (
            <Avatar name={assignee.name} color={assignee.color} size={18} />
          ) : (
            <UnassignedAvatar size={18} />
          )}
          <SelectMenu
            label="Assignee"
            value={assigneeId ?? ''}
            placeholder="Unassigned"
            options={state.members.map((member) => ({ value: member.id, label: member.name, color: member.color }))}
            onChange={(value) => dispatch({ kind: 'task/setAssignee', id: taskId, assigneeId: value || null })}
            style={{ ...miniSelect, maxWidth: 120, padding: 0 }}
          />
        </span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {assignee ? (
            <Avatar name={assignee.name} color={assignee.color} size={24} />
          ) : (
            <UnassignedAvatar size={24} />
          )}
          <SelectMenu
            label="Assignee"
            value={assigneeId ?? ''}
            placeholder="Unassigned"
            options={state.members.map((member) => ({ value: member.id, label: member.name, color: member.color }))}
            onChange={(value) => dispatch({ kind: 'task/setAssignee', id: taskId, assigneeId: value || null })}
            style={{ ...input, maxWidth: 180, padding: 0 }}
          />
          <button style={btnGhost} type="button" onClick={() => setManaging(true)}>
            Manage people
          </button>
        </div>
      )}

      {managing ? <MembersDialog state={state} dispatch={dispatch} onClose={() => setManaging(false)} /> : null}
    </>
  )
}

/**
 * Roster management: add, recolour, rename and remove people, with a live
 * workload readout so it is obvious who is carrying what.
 */
export function MembersDialog({
  state,
  dispatch,
  onClose,
}: {
  state: BoardState
  dispatch: (action: Action) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const workload = memberWorkload(state)

  return (
    <Dialog
      title="People"
      hint="Local names only — nobody signs in, and nothing leaves this machine."
      onClose={onClose}
      actions={
        <button style={btnPrimary} type="button" onClick={onClose}>
          Done
        </button>
      }
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={draft}
          placeholder="Add a person…"
          aria-label="New person"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.trim()) {
              dispatch({ kind: 'member/create', name: draft })
              setDraft('')
            }
          }}
          style={{ ...input, flex: 1 }}
        />
        <button
          style={btnPrimary}
          type="button"
          disabled={!draft.trim()}
          onClick={() => {
            dispatch({ kind: 'member/create', name: draft })
            setDraft('')
          }}
        >
          Add
        </button>
      </div>

      {workload.length === 0 ? (
        <p style={{ ...label, fontWeight: 400 }}>No one on the board yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {workload.map(({ member, open, overdue, done }) => (
            <div key={member.id} style={row}>
              <Avatar name={member.name} color={member.color} size={26} />
              <input
                aria-label={`Name for ${member.name}`}
                value={member.name}
                onChange={(event) =>
                  dispatch({ kind: 'member/update', id: member.id, patch: { name: event.target.value } })
                }
                style={{ ...input, flex: 1, padding: '4px 8px', fontSize: 13 }}
              />
              <SelectMenu
                label={`Colour for ${member.name}`}
                value={member.color}
                options={COLOR_NAMES.map((name) => ({ value: name, label: name, color: name }))}
                onChange={(value) => dispatch({ kind: 'member/update', id: member.id, patch: { color: value } })}
                style={{ ...miniSelect, width: 54, padding: 0 }}
              />
              <span
                title={`${open} open · ${overdue} overdue · ${done} done`}
                style={{ fontSize: 11, color: overdue ? 'var(--col-red)' : 'var(--text-secondary)', minWidth: 58, textAlign: 'right' }}
              >
                {open} open{overdue ? ` · ${overdue} late` : ''}
              </span>
              <button
                style={{ ...btnDanger, padding: '3px 8px', fontSize: 11 }}
                type="button"
                title="Remove this person. Their tasks become unassigned."
                onClick={() => dispatch({ kind: 'member/delete', id: member.id })}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {state.members.length ? (
        <p style={{ ...label, fontWeight: 400, marginTop: 12, marginBottom: 0 }}>
          Removing someone keeps their tasks and unassigns them.
        </p>
      ) : null}
    </Dialog>
  )
}

const row = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  borderBottom: '1px solid var(--border)',
} as const

const miniSelect = {
  fontSize: 11,
  padding: '2px 4px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-primary)',
} as const

export { colorVar }
