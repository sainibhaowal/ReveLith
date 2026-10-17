import { useState } from 'react'
import { EXTERNAL_LINK_TYPES } from '../../domain/types'
import type { BoardState, ExternalLinkType, ID } from '../../domain/types'
import type { Action } from '../../store/actions'
import { externalLinksOf } from '../../store/selectors'
import { btnGhost, input } from '../styles'
import { SelectMenu } from './SelectMenu'

const LINK_LABEL: Record<ExternalLinkType, string> = {
  issue: 'Issue',
  pull_request: 'Pull request',
  branch: 'Branch',
  url: 'Link',
}

/**
 * Links from a task to something outside the board — a forge issue, a PR, a
 * branch, or any URL. Stored locally and rendered as plain anchors, so clicking
 * one hands off to the browser rather than the app trying to resolve it.
 */
export function ExternalLinksSection({
  state,
  taskId,
  dispatch,
}: {
  state: BoardState
  taskId: ID
  dispatch: (a: Action) => void
}) {
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [type, setType] = useState<ExternalLinkType>('url')
  const [externalId, setExternalId] = useState('')

  const links = externalLinksOf(state, taskId)

  const submit = () => {
    if (!url.trim()) return
    dispatch({
      kind: 'externalLink/add',
      taskId,
      type,
      url: url.trim(),
      ...(externalId.trim() ? { externalId: externalId.trim() } : {}),
    })
    setUrl('')
    setExternalId('')
    setAdding(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {links.length === 0 && !adding ? <span style={muted}>No links yet.</span> : null}

      {links.map((link) => (
        <div key={link.id} style={linkRow}>
          <span style={linkKind}>{LINK_LABEL[link.type]}</span>
          <a href={link.url} target="_blank" rel="noreferrer" style={linkUrl} title={link.url}>
            {link.externalId || link.title || link.url}
          </a>
          <button
            style={{ ...btnGhost, padding: '1px 6px', fontSize: 11 }}
            type="button"
            onClick={() => dispatch({ kind: 'externalLink/remove', id: link.id })}
            title="Remove link"
            aria-label={`Remove link to ${link.externalId || link.url}`}
          >
            ×
          </button>
        </div>
      ))}

      {adding ? (
        <div style={formRow}>
          <SelectMenu
            label="Link type"
            value={type}
            options={EXTERNAL_LINK_TYPES.map((entry) => ({
              value: entry,
              label: LINK_LABEL[entry],
            }))}
            onChange={(value) => setType(value as ExternalLinkType)}
            style={{ ...mini, padding: 0 }}
          />
          <input
            aria-label="External id"
            placeholder="#123"
            value={externalId}
            onChange={(event) => setExternalId(event.target.value)}
            style={{ ...input, width: 76 }}
          />
          <input
            aria-label="Link url"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
            style={{ ...input, flex: 1, minWidth: 140 }}
          />
          <button style={btnGhost} type="button" onClick={submit} disabled={!url.trim()}>
            Add
          </button>
          <button style={btnGhost} type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          style={{ ...btnGhost, alignSelf: 'flex-start' }}
          type="button"
          onClick={() => setAdding(true)}
        >
          Add link
        </button>
      )}
    </div>
  )
}

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)' }

const formRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const mini = {
  fontSize: 11,
  padding: '3px 5px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-primary)',
} as const

const linkRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }

const linkKind: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-secondary)',
  minWidth: 64,
}

const linkUrl: React.CSSProperties = {
  color: 'var(--accent-strong)',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
