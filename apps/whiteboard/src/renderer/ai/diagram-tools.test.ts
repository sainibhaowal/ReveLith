import { describe, expect, it } from 'vitest'
import { compileDiagramTool, DIAGRAM_TOOL_DEFS } from './diagram-tools'

const samples: Array<[string, Record<string, unknown>]> = [
  [
    'build_flow_diagram',
    {
      title: 'Checkout flow',
      direction: 'LR',
      nodes: [
        { id: 'start', label: 'Start', shape: 'start' },
        { id: 'pay', label: 'Authorize payment', shape: 'process' },
        { id: 'done', label: 'Complete', shape: 'end' },
      ],
      edges: [
        { from: 'start', to: 'pay', label: 'begin' },
        { from: 'pay', to: 'done', label: 'approved' },
      ],
    },
  ],
  [
    'build_sequence_diagram',
    {
      participants: [
        { id: 'user', label: 'User' },
        { id: 'app', label: 'Application' },
        { id: 'db', label: 'Database' },
      ],
      messages: [
        { from: 'user', to: 'app', label: 'Submit request' },
        { from: 'app', to: 'db', label: 'Load record' },
        { from: 'db', to: 'app', label: 'Record returned', kind: 'return' },
      ],
    },
  ],
  [
    'build_use_case_diagram',
    {
      system: 'Requirements process',
      actors: [
        { id: 'stakeholder', label: 'Stakeholder' },
        { id: 'analyst', label: 'Analyst', side: 'right' },
      ],
      useCases: [
        { id: 'elicit', label: 'Elicit requirements' },
        { id: 'approve', label: 'Review and approve' },
      ],
      associations: [
        { actor: 'stakeholder', useCase: 'elicit' },
        { actor: 'analyst', useCase: 'approve' },
      ],
    },
  ],
  [
    'build_requirement_diagram',
    {
      system: 'Requirements lifecycle',
      requirements: [
        { id: 'FR-01', label: 'Record stakeholder goals', kind: 'functional', priority: 'high' },
        { id: 'NFR-02', label: 'Keep an audit history', kind: 'quality' },
      ],
      stakeholders: [{ id: 'business', label: 'Business owner' }],
      relations: [
        { from: 'business', to: 'FR-01', kind: 'satisfies' },
        { from: 'FR-01', to: 'NFR-02', kind: 'traces' },
      ],
    },
  ],
  [
    'build_uml_class_diagram',
    {
      classes: [
        {
          id: 'req',
          name: 'Requirement',
          attributes: ['id: UUID', 'status: Status'],
          operations: ['approve()'],
        },
        { id: 'stakeholder', name: 'Stakeholder', attributes: ['name: String'] },
      ],
      relationships: [{ from: 'stakeholder', to: 'req', kind: 'association', label: 'owns' }],
    },
  ],
  [
    'build_er_diagram',
    {
      entities: [
        { id: 'project', name: 'Project', attributes: ['id (PK)', 'title'] },
        { id: 'requirement', name: 'Requirement', attributes: ['id (PK)', 'project_id (FK)'] },
      ],
      relationships: [
        { from: 'project', to: 'requirement', label: 'contains', cardinality: '1:N' },
      ],
    },
  ],
  [
    'build_state_diagram',
    {
      states: [
        { id: 'initial', label: 'Start', kind: 'initial' },
        { id: 'draft', label: 'Draft' },
        { id: 'approved', label: 'Approved', kind: 'final' },
      ],
      transitions: [
        { from: 'initial', to: 'draft', label: 'create' },
        { from: 'draft', to: 'approved', label: 'accept' },
      ],
    },
  ],
  [
    'build_mind_map',
    {
      topics: [
        { id: 'root', label: 'Requirements' },
        { id: 'elicitation', label: 'Elicitation', parent: 'root' },
        { id: 'interview', label: 'Interviews', parent: 'elicitation' },
      ],
    },
  ],
  [
    'build_chart_diagram',
    {
      chartType: 'bar',
      categories: ['Discovery', 'Analysis', 'Validation'],
      series: [{ name: 'Requirements', color: '#2563eb', values: [12, 18, 9] }],
    },
  ],
  [
    'build_chart_diagram',
    {
      chartType: 'radar',
      categories: ['Clarity', 'Coverage', 'Risk', 'Cost'],
      series: [
        { name: 'Baseline', values: [8, 6, 3, 5] },
        { name: 'Target', color: '#16a34a', values: [9, 8, 4, 7] },
      ],
    },
  ],
  [
    'build_chart_diagram',
    {
      chartType: 'waterfall',
      categories: ['Initial', 'Added', 'Removed', 'Final'],
      series: [{ name: 'Change', values: [10, 4, -3, 2] }],
    },
  ],
  [
    'build_chart_diagram',
    {
      chartType: 'pie',
      categories: ['Functional', 'Quality', 'Constraints'],
      series: [{ name: 'Share', values: [5, 3, 2] }],
    },
  ],
  [
    'build_chart_diagram',
    {
      chartType: 'donut',
      categories: ['Open', 'In review', 'Approved'],
      series: [{ name: 'Requirements', values: [4, 3, 5] }],
    },
  ],
  [
    'build_gantt_diagram',
    {
      unit: 'weeks',
      tasks: [
        { id: 'discover', label: 'Discovery', start: 0, duration: 3 },
        { id: 'model', label: 'Model', start: 3, duration: 4, lane: 'Analysis' },
      ],
      dependencies: [{ from: 'discover', to: 'model', label: 'FS' }],
    },
  ],
  [
    'build_heatmap_chart',
    {
      columns: ['Clarity', 'Coverage', 'Risk'],
      rows: [
        { label: 'Stakeholder', values: [3, 5, 2] },
        { label: 'Analyst', values: [5, 4, 1] },
      ],
    },
  ],
  [
    'build_text_diagram',
    {
      title: 'Simple sequence',
      source: 'User      Service\n | --call-->|\n |<--reply--|',
    },
  ],
]

describe('dedicated native diagram builders', () => {
  it.each(samples)('%s compiles into bounded native scene geometry', (name, input) => {
    const result = compileDiagramTool(name, input, { x: 120, y: 160 })
    expect(result.name).toBe(name)
    expect(result.elements.length).toBeGreaterThan(2)
    expect(result.elements.length).toBeLessThanOrEqual(120)
    expect(result.elements.every((element) => typeof element.kind === 'string')).toBe(true)
    expect(result.elements[0]).toMatchObject({ x: 124, y: 164 })
    for (const element of result.elements) {
      for (const key of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height']) {
        if (key in element) expect(Number.isFinite(Number(element[key]))).toBe(true)
      }
      if (Array.isArray(element.points)) {
        expect(
          element.points.every(
            (point) =>
              Array.isArray(point) && point.every((value) => Number.isFinite(Number(value))),
          ),
        ).toBe(true)
      }
    }
  })

  it('rejects missing or duplicate IDs, bad references, cycles, and mismatched chart data before drawing', () => {
    expect(() =>
      compileDiagramTool('build_flow_diagram', {
        nodes: [{ id: 'a', label: 'A' }],
        edges: [{ from: 'a', to: 'missing' }],
      }),
    ).toThrow(/missing endpoint/)
    expect(() =>
      compileDiagramTool('build_sequence_diagram', {
        participants: [
          { id: 'same', label: 'A' },
          { id: 'same', label: 'B' },
        ],
        messages: [{ from: 'same', to: 'same', label: 'loop' }],
      }),
    ).toThrow(/duplicate id/)
    expect(() =>
      compileDiagramTool('build_mind_map', {
        topics: [
          { id: 'a', label: 'A', parent: 'b' },
          { id: 'b', label: 'B', parent: 'a' },
        ],
      }),
    ).toThrow(/exactly one root/)
    expect(() =>
      compileDiagramTool('build_chart_diagram', {
        chartType: 'line',
        categories: ['A', 'B'],
        series: [{ name: 'S', values: [3] }],
      }),
    ).toThrow(/one finite value per category/)
  })

  it('publishes strict schemas per diagram type instead of exposing free-form scene JSON', () => {
    expect(DIAGRAM_TOOL_DEFS.map((definition) => definition.name)).toContain(
      'build_sequence_diagram',
    )
    expect(
      DIAGRAM_TOOL_DEFS.every(
        (definition) => definition.inputSchema.additionalProperties === false,
      ),
    ).toBe(true)
    expect(
      DIAGRAM_TOOL_DEFS.find((definition) => definition.name === 'build_sequence_diagram')!
        .inputSchema.properties,
    ).toHaveProperty('participants')
    expect(
      DIAGRAM_TOOL_DEFS.find((definition) => definition.name === 'build_chart_diagram')!.inputSchema
        .properties,
    ).toHaveProperty('chartType')
  })

  it('preserves fixed-width source in an editable monospace text box', () => {
    const result = compileDiagramTool('build_text_diagram', { source: 'A    B\n|--->|\n|<---|' })
    expect(result.elements.find((item) => item.preserveWhitespace)).toMatchObject({
      fontFamily: 3,
      text: 'A    B\n|--->|\n|<---|',
    })
  })
})
