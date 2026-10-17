import { useState } from 'react'
import type { Action } from '../../store/actions'
import type { ID, SavedView } from '../../domain/types'
import { btnGhost, btnPrimary, chip, input, label } from '../styles'
import { Dialog } from './Dialog'

/** Save, apply, rename and delete filter presets. */
export function SavedViewsBar({
  views,
  selectedViewId,
  canSave,
  dispatch,
}: {
  views: SavedView[]
  selectedViewId: ID | null
  canSave: boolean
  dispatch: (action: Action) => void
}) {
  const [managing, setManaging] = useState(false)

  return (
    <>
      <div style={bar}>
        <span style={labelInline}>Views</span>

        <button
          style={chipButton(selectedViewId === null)}
          onClick={() => dispatch({ kind: 'view/apply', id: null })}
          aria-pressed={selectedViewId === null}
        >
          Ad hoc
        </button>

        {views.map((view) => (
          <button
            key={view.id}
            style={chipButton(selectedViewId === view.id)}
            onClick={() => dispatch({ kind: 'view/apply', id: view.id })}
            aria-pressed={selectedViewId === view.id}
            title={`${view.filters.query || 'no text filter'} · sorted by ${view.sortMode}`}
          >
            {view.name}
          </button>
        ))}

        <button style={btnGhost} onClick={() => setManaging(true)}>
          Manage
        </button>
      </div>

      {managing ? (
        <ManageViewsDialog
          views={views}
          canSave={canSave}
          dispatch={dispatch}
          onClose={() => setManaging(false)}
        />
      ) : null}
    </>
  )
}

function ManageViewsDialog({
  views,
  canSave,
  dispatch,
  onClose,
}: {
  views: SavedView[]
  canSave: boolean
  dispatch: (action: Action) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')

  return (
    <Dialog
      title="Saved views"
      hint="A view stores the current search text, filters and sort order."
      onClose={onClose}
      actions={
        <button style={btnPrimary} onClick={onClose}>
          Done
        </button>
      }
    >
      {views.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No saved views yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {views.map((view) => (
            <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={chip}>{view.sortMode}</span>
              <input
                value={view.name}
                onChange={(event) =>
                  dispatch({ kind: 'view/rename', id: view.id, name: event.target.value })
                }
                style={{ ...input, flex: 1 }}
              />
              <button
                style={btnGhost}
                title="Delete view"
                onClick={() => dispatch({ kind: 'view/delete', id: view.id })}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <label htmlFor="new-view-name" style={label}>
          Save current filters as
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
          <input
            id="new-view-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim() && canSave) {
                dispatch({ kind: 'view/create', name })
                setName('')
              }
            }}
            placeholder={canSave ? 'Overdue and urgent' : 'Set a filter or search first'}
            style={{ ...input, flex: 1 }}
          />
          <button
            style={btnPrimary}
            disabled={!name.trim() || !canSave}
            onClick={() => {
              dispatch({ kind: 'view/create', name })
              setName('')
            }}
          >
            Save view
          </button>
        </div>
      </div>
    </Dialog>
  )
}

const bar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
}

const labelInline: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: 'var(--text-tertiary)',
  fontWeight: 600,
}

const chipButton = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  fontSize: 11,
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 600,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--surface)',
  color: active ? 'var(--accent)' : 'var(--text-secondary)',
})
