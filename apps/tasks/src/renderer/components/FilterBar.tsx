import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { PRIORITIES } from '../../domain/types'
import type { SortMode, TaskFilters } from '../../domain/types'
import { SORT_MODES } from '../../store/selectors'
import { btnGhost, chip, colorVar, input, PRIORITY_COLOR_NAME } from '../styles'

/** Search, filters and sort order for the board. */
export function FilterBar({
  filters,
  sortMode,
  labels,
  searchRef,
  onFilters,
  onSort,
  onClear,
}: {
  filters: TaskFilters
  sortMode: SortMode
  labels: { id: string; name: string; color: string }[]
  /** So the `/` shortcut can focus the search box. */
  searchRef?: RefObject<HTMLInputElement | null>
  onFilters: (patch: Partial<TaskFilters>) => void
  onSort: (mode: SortMode) => void
  onClear: () => void
}) {
  const toggleLabel = (id: string) => {
    onFilters({
      labelIds: filters.labelIds.includes(id)
        ? filters.labelIds.filter((entry) => entry !== id)
        : [...filters.labelIds, id],
    })
  }

  const togglePriority = (priority: string) => {
    onFilters({
      priorities: filters.priorities.includes(priority)
        ? filters.priorities.filter((entry) => entry !== priority)
        : [...filters.priorities, priority],
    })
  }

  return (
    <div className="tasks-filter-bar" style={bar}>
      <div className="tasks-filter-search">
        <span className="tasks-filter-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          ref={searchRef}
          value={filters.query}
          onChange={(event) => onFilters({ query: event.target.value })}
          placeholder="Search tasks, descriptions, labels or ticket IDs…"
          style={{ ...input, flex: 1, minWidth: 220 }}
          aria-label="Search tasks"
        />
        {filters.query ? (
          <button
            type="button"
            className="tasks-filter-search-clear"
            aria-label="Clear search"
            title="Clear search"
            onClick={() => onFilters({ query: '' })}
          >
            ×
          </button>
        ) : null}
      </div>

      <SortDropdown value={sortMode} onChange={onSort} />

      <span className="tasks-filter-divider" aria-hidden="true" />

      <div className="tasks-filter-group" style={group} aria-label="Priority filters">
        {PRIORITIES.map((priority) => {
          const active = filters.priorities.includes(priority)
          return (
            <button
              key={priority}
              type="button"
              className="tasks-filter-chip tasks-priority-chip"
              data-priority={priority}
              data-priority-color={PRIORITY_COLOR_NAME[priority]}
              data-active={active}
              onClick={() => togglePriority(priority)}
              aria-pressed={active}
              style={{ ...chip, cursor: 'pointer' }}
            >
              {priority}
            </button>
          )
        })}
      </div>

      {labels.length ? (
        <>
          <span className="tasks-filter-divider" aria-hidden="true" />
          <div className="tasks-filter-group" style={group} aria-label="Label filters">
            {labels.map((label) => {
              const active = filters.labelIds.includes(label.id)
              return (
                <button
                  key={label.id}
                  type="button"
                  className="tasks-filter-chip tasks-label-chip"
                  data-active={active}
                  onClick={() => toggleLabel(label.id)}
                  aria-pressed={active}
                  style={{
                    ...chip,
                    cursor: 'pointer',
                    borderColor: colorVar(label.color),
                    background: active
                      ? `color-mix(in srgb, ${colorVar(label.color)} 14%, var(--surface))`
                      : 'var(--surface)',
                    color: colorVar(label.color),
                  }}
                >
                  <span
                    className="tasks-label-dot"
                    style={{ background: colorVar(label.color) }}
                    aria-hidden="true"
                  />
                  {label.name}
                </button>
              )
            })}
          </div>
        </>
      ) : null}

      <span className="tasks-filter-divider" aria-hidden="true" />

      <button
        className="tasks-filter-toggle"
        style={btnGhost}
        onClick={() => onFilters({ overdueOnly: !filters.overdueOnly })}
        aria-pressed={filters.overdueOnly}
        data-active={filters.overdueOnly}
      >
        Overdue
      </button>

      <button
        className="tasks-filter-toggle"
        style={btnGhost}
        onClick={() => onFilters({ showArchived: !filters.showArchived })}
        aria-pressed={filters.showArchived}
        data-active={filters.showArchived}
      >
        Archived
      </button>

      <button className="tasks-filter-toggle tasks-filter-clear" style={btnGhost} onClick={onClear}>
        Clear
      </button>
    </div>
  )
}

function SortDropdown({
  value,
  onChange,
}: {
  value: SortMode
  onChange: (mode: SortMode) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selected = SORT_MODES.find((mode) => mode.id === value) ?? SORT_MODES[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="tasks-sort-dropdown" ref={rootRef}>
      <button
        type="button"
        className="tasks-sort-trigger"
        aria-label="Sort tasks"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="tasks-sort-prefix">Sort</span>
        <span>{selected.label}</span>
        <span className="tasks-sort-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open ? (
        <div className="tasks-sort-menu" role="listbox" aria-label="Sort tasks options">
          {SORT_MODES.map((mode) => (
            <button
              type="button"
              role="option"
              aria-selected={mode.id === value}
              className="tasks-sort-option"
              key={mode.id}
              onClick={() => {
                onChange(mode.id)
                setOpen(false)
              }}
            >
              <span>{mode.label}</span>
              {mode.id === value ? <span aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const bar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--chrome-bg)',
  flexWrap: 'wrap',
  flexShrink: 0,
}

const group: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' }
