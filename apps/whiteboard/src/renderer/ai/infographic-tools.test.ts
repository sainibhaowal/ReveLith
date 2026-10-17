import { describe, expect, it } from 'vitest'
import { compileInfographic } from './infographic-tools'

describe('native infographic compiler', () => {
  it('uses only supplied content in a bounded editable composition', () => {
    const result = compileInfographic(
      {
        title: 'Renewable Energy Basics',
        subtitle: 'A concise learning guide',
        sections: [
          {
            heading: 'Energy sources',
            layout: 'flow',
            items: [
              { label: 'Solar', detail: 'Sunlight becomes electricity' },
              { label: 'Wind', detail: 'Turbines capture moving air', tone: 'accent' },
            ],
          },
          { heading: 'Next step', items: [{ label: 'Compare local options', tone: 'muted' }] },
        ],
      },
      { x: 80, y: 80 },
    )
    const text = JSON.stringify(result.elements)
    expect(result.elements.length).toBeLessThanOrEqual(120)
    expect(result.width).toBeGreaterThan(500)
    expect(result.height).toBeGreaterThan(200)
    expect(text).toContain('Renewable Energy Basics')
    expect(text).toContain('Turbines capture moving air')
    expect(text).not.toContain('DSA')
    expect(text).not.toContain('Requirements Engineering')
  })

  it('refuses missing visible content instead of filling it with sample data', () => {
    expect(() => compileInfographic({ title: 'Only title', sections: [] }, { x: 0, y: 0 })).toThrow(
      'title and 1-8 content sections',
    )
  })
})
