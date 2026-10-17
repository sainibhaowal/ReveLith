import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FILTERS } from '../../domain/types'
import { FilterBar } from './FilterBar'

afterEach(cleanup)

describe('priority filters', () => {
  it('keeps distinct semantic colors and selection state for every priority', () => {
    render(
      <FilterBar
        filters={{ ...EMPTY_FILTERS, priorities: ['high'] }}
        sortMode="position"
        labels={[]}
        onFilters={vi.fn()}
        onSort={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const filters = screen.getByLabelText('Priority filters')
    const expected = [
      ['urgent', 'red', false],
      ['high', 'amber', true],
      ['medium', 'blue', false],
      ['low', 'green', false],
    ] as const

    for (const [priority, color, active] of expected) {
      const button = within(filters).getByRole('button', { name: priority })
      expect(button.getAttribute('data-priority-color')).toBe(color)
      expect(button.getAttribute('aria-pressed')).toBe(String(active))
    }
  })

  it('toggles the requested priority without applying the Tasks accent as its color', () => {
    const onFilters = vi.fn()
    render(
      <FilterBar
        filters={EMPTY_FILTERS}
        sortMode="position"
        labels={[]}
        onFilters={onFilters}
        onSort={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'medium' }))
    expect(onFilters).toHaveBeenCalledWith({ priorities: ['medium'] })
  })
})
