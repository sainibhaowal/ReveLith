import type { CSSProperties } from 'react'
import { SHORTCUT_HELP } from '../useKeyboardShortcuts'
import { Dialog } from './Dialog'

/** Keyboard shortcut reference, opened with `?`. */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={`Keyboard shortcuts (${SHORTCUT_HELP.length})`} onClose={onClose}>
      <dl style={list}>
        {SHORTCUT_HELP.map((entry) => (
          <div key={entry.keys} style={row}>
            <dt style={keys}>{entry.keys}</dt>
            <dd style={description}>{entry.description}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}

const list: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 }

const keys: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  fontFamily: 'ui-monospace, monospace',
  background: 'var(--surface-subtle)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '2px 7px',
  minWidth: 110,
  textAlign: 'center',
  color: 'var(--text-primary)',
}

const description: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--text-secondary)' }
