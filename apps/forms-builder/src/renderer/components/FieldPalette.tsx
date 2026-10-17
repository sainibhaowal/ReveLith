import { useState } from 'react'
import type { FieldType } from '../types'
import { fieldIcon } from './Ribbon'
import type { FieldTypeDef } from './Ribbon'

interface FieldPaletteProps {
  fieldTypes: FieldTypeDef[]
  onAddField: (type: FieldType) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  style?: React.CSSProperties
}

const GROUPS: { label: string; types: FieldType[] }[] = [
  { label: 'Basic', types: ['text', 'textarea', 'email', 'phone', 'number', 'currency', 'date', 'date_range', 'time', 'url', 'fullname', 'country'] },
  { label: 'Choice and scales', types: ['select', 'radio', 'checkbox', 'picture_choice', 'yesno', 'rating', 'nps'] },
  { label: 'Advanced', types: ['group', 'file', 'signature', 'address', 'legal_terms', 'input_table', 'hidden', 'section', 'statement', 'welcome', 'thankyou', 'pagebreak'] },
]

export function FieldPalette({ fieldTypes, onAddField, collapsed, onToggleCollapsed, style }: FieldPaletteProps) {
  const [query, setQuery] = useState('')
  const byType = new Map(fieldTypes.map((f) => [f.type, f]))
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    types: group.types.filter((type) => {
      const definition = byType.get(type)
      return definition && (!normalizedQuery || definition.label.toLocaleLowerCase().includes(normalizedQuery) || type.replaceAll('_', ' ').includes(normalizedQuery))
    }),
  })).filter((group) => group.types.length > 0)

  return (
    <div className="forms-field-palette" data-collapsed={collapsed} style={style}>
      {collapsed ? (
        <>
          <button className="forms-field-drawer-toggle is-collapsed" type="button" onClick={onToggleCollapsed} aria-label="Expand field drawer" title="Expand field drawer">
            <DrawerChevron direction="right" />
          </button>
          <div className="forms-field-icon-rail" aria-label="Form fields">
            {fieldTypes.map((field) => (
              <button key={field.type} className="forms-field-icon-button" type="button" aria-label={`Add ${field.label}`} title={field.label} onClick={() => onAddField(field.type)}>
                {fieldIcon(field.type)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="forms-field-palette-header">
            <div className="forms-field-palette-heading">
              <div>
                <h3>Fields</h3>
                <p>All fields · click to add</p>
              </div>
              <button className="forms-field-drawer-toggle" type="button" onClick={onToggleCollapsed} aria-label="Collapse field drawer to icons" title="Collapse field drawer to icons">
                <DrawerChevron direction="left" />
              </button>
            </div>
            <input className="forms-field-search" type="search" aria-label="Search all form fields" placeholder="Search all fields" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="forms-field-list">
            {visibleGroups.map((g) => (
              <div key={g.label} className="forms-field-group">
                <div className="forms-field-group-label">{g.label}</div>
                {g.types.map((t) => {
                  const def = byType.get(t)
                  if (!def) return null
                  return (
                    <button key={t} className="forms-field-list-button" type="button" onClick={() => onAddField(t)}>
                      <span className="forms-field-list-icon">{fieldIcon(t)}</span>
                      <span>{def.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
            {normalizedQuery && visibleGroups.length === 0 ? <p className="forms-field-empty">No matching fields.</p> : null}
          </div>
        </>
      )}
    </div>
  )
}

function DrawerChevron({ direction }: { direction: 'left' | 'right' }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={direction === 'left' ? 'm9.5 3.5-4 4.5 4 4.5' : 'm6.5 3.5 4 4.5-4 4.5'} /></svg>
}
