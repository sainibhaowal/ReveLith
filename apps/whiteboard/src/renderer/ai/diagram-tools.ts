import type { AgentToolDef } from '@revelith/agent-core'

export const DIAGRAM_TOOL_NAMES = [
  'build_flow_diagram',
  'build_sequence_diagram',
  'build_use_case_diagram',
  'build_requirement_diagram',
  'build_uml_class_diagram',
  'build_er_diagram',
  'build_state_diagram',
  'build_mind_map',
  'build_chart_diagram',
  'build_gantt_diagram',
  'build_heatmap_chart',
  'build_text_diagram',
  'render_mermaid_diagram',
] as const

export type DiagramToolName = (typeof DIAGRAM_TOOL_NAMES)[number]
export type DiagramSceneItem = Record<string, unknown>

const stringField = { type: 'string', minLength: 1, maxLength: 160 }
const idField = { type: 'string', minLength: 1, maxLength: 48, pattern: '^[a-zA-Z0-9_-]+$' }
const point = {
  type: 'object',
  properties: { id: idField, label: stringField },
  required: ['id', 'label'],
  additionalProperties: false,
}
const relation = (extra: Record<string, unknown> = {}) => ({
  type: 'object',
  properties: { from: idField, to: idField, label: stringField, ...extra },
  required: ['from', 'to'],
  additionalProperties: false,
})
const position = {
  x: { type: 'number', minimum: -50000, maximum: 50000 },
  y: { type: 'number', minimum: -50000, maximum: 50000 },
}
const rootPosition = { type: 'object', properties: position, additionalProperties: false }
const tool = (
  name: DiagramToolName,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): AgentToolDef => ({
  name,
  description,
  inputSchema: {
    type: 'object',
    properties: { ...properties, position: rootPosition },
    required,
    additionalProperties: false,
  },
})

const boundedArray = (items: unknown, maxItems: number) => ({
  type: 'array',
  items,
  minItems: 1,
  maxItems,
})

export const DIAGRAM_TOOL_DEFS: AgentToolDef[] = [
  tool(
    'build_flow_diagram',
    'Build a validated, editable native flow/process/system architecture diagram. Nodes and edges use IDs; every edge endpoint must reference a declared node. Choose this for flowcharts, process maps, architecture/component, dependency, and decision diagrams.',
    {
      title: stringField,
      direction: { type: 'string', enum: ['LR', 'TB'] },
      nodes: boundedArray(
        {
          ...point,
          properties: {
            ...point.properties,
            shape: { type: 'string', enum: ['process', 'decision', 'start', 'end', 'data'] },
          },
        },
        28,
      ),
      edges: boundedArray(relation({ style: { type: 'string', enum: ['solid', 'dashed'] } }), 30),
    },
    ['nodes', 'edges'],
  ),
  tool(
    'build_sequence_diagram',
    'Build an editable UML sequence diagram with participant boxes, lifelines, ordered messages, return/dashed messages, and labels. Use this directly for sequence-diagram requests; no generic scene JSON.',
    {
      title: stringField,
      participants: boundedArray(point, 8),
      messages: boundedArray(
        {
          type: 'object',
          properties: {
            from: idField,
            to: idField,
            label: stringField,
            kind: { type: 'string', enum: ['call', 'return', 'async'] },
          },
          required: ['from', 'to', 'label'],
          additionalProperties: false,
        },
        32,
      ),
    },
    ['participants', 'messages'],
  ),
  tool(
    'build_use_case_diagram',
    'Build a native UML use-case diagram with a system boundary, external stick-figure actors, editable use-case ellipses, and validated associations. Actor side may be left or right.',
    {
      title: stringField,
      system: stringField,
      actors: boundedArray(
        {
          type: 'object',
          properties: {
            id: idField,
            label: stringField,
            side: { type: 'string', enum: ['left', 'right'] },
          },
          required: ['id', 'label'],
          additionalProperties: false,
        },
        4,
      ),
      useCases: boundedArray(point, 16),
      associations: boundedArray(
        {
          type: 'object',
          properties: { actor: idField, useCase: idField, label: stringField },
          required: ['actor', 'useCase'],
          additionalProperties: false,
        },
        24,
      ),
    },
    ['system', 'actors', 'useCases', 'associations'],
  ),
  tool(
    'build_requirement_diagram',
    'Build an editable requirements-engineering traceability view with typed requirements, stakeholders, a system boundary, and validated derives/satisfies/verifies/trace links.',
    {
      title: stringField,
      system: stringField,
      requirements: boundedArray(
        {
          type: 'object',
          properties: {
            id: idField,
            label: stringField,
            kind: { type: 'string', enum: ['functional', 'quality', 'constraint', 'goal'] },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['id', 'label'],
          additionalProperties: false,
        },
        20,
      ),
      stakeholders: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: idField,
            label: stringField,
            side: { type: 'string', enum: ['left', 'right'] },
          },
          required: ['id', 'label'],
          additionalProperties: false,
        },
        maxItems: 4,
      },
      relations: boundedArray(
        relation({
          kind: { type: 'string', enum: ['derives', 'satisfies', 'verifies', 'traces', 'refines'] },
        }),
        24,
      ),
    },
    ['system', 'requirements', 'relations'],
  ),
  tool(
    'build_uml_class_diagram',
    'Build an editable UML class diagram with class compartments, attributes, operations, and typed relationships. Every relationship endpoint must reference a declared class.',
    {
      title: stringField,
      classes: boundedArray(
        {
          type: 'object',
          properties: {
            id: idField,
            name: stringField,
            attributes: { type: 'array', items: stringField, maxItems: 8 },
            operations: { type: 'array', items: stringField, maxItems: 6 },
          },
          required: ['id', 'name'],
          additionalProperties: false,
        },
        10,
      ),
      relationships: boundedArray(
        relation({
          kind: {
            type: 'string',
            enum: ['association', 'inheritance', 'composition', 'aggregation', 'dependency'],
          },
        }),
        20,
      ),
    },
    ['classes', 'relationships'],
  ),
  tool(
    'build_er_diagram',
    'Build an editable entity-relationship/database diagram with entity attribute compartments, relationship diamonds, and validated foreign-key links.',
    {
      title: stringField,
      entities: boundedArray(
        {
          type: 'object',
          properties: {
            id: idField,
            name: stringField,
            attributes: { type: 'array', items: stringField, maxItems: 8 },
          },
          required: ['id', 'name'],
          additionalProperties: false,
        },
        12,
      ),
      relationships: boundedArray(
        relation({ cardinality: { type: 'string', enum: ['1:1', '1:N', 'N:1', 'M:N'] } }),
        12,
      ),
    },
    ['entities', 'relationships'],
  ),
  tool(
    'build_state_diagram',
    'Build a native UML state-machine diagram with initial/final pseudostates, state nodes, and labelled transitions.',
    {
      title: stringField,
      states: boundedArray(
        {
          type: 'object',
          properties: {
            ...point.properties,
            kind: { type: 'string', enum: ['state', 'initial', 'final'] },
          },
          required: ['id', 'label'],
          additionalProperties: false,
        },
        24,
      ),
      transitions: boundedArray(relation(), 24),
    },
    ['states', 'transitions'],
  ),
  tool(
    'build_mind_map',
    'Build an editable radial/hierarchical mind map. Each item has an ID and an optional parent ID; exactly one root is required and every parent must exist.',
    {
      title: stringField,
      direction: { type: 'string', enum: ['LR', 'TB'] },
      topics: boundedArray(
        {
          type: 'object',
          properties: { ...point.properties, parent: idField },
          required: ['id', 'label'],
          additionalProperties: false,
        },
        28,
      ),
    },
    ['topics'],
  ),
  tool(
    'build_chart_diagram',
    'Build an editable, axis-labelled chart from numeric values. Supports bar, line, area, scatter, pie, and donut charts with up to four series.',
    {
      title: stringField,
      chartType: {
        type: 'string',
        enum: [
          'bar',
          'stacked-bar',
          'histogram',
          'line',
          'area',
          'scatter',
          'radar',
          'waterfall',
          'pie',
          'donut',
        ],
      },
      categories: boundedArray(stringField, 10),
      series: boundedArray(
        {
          type: 'object',
          properties: {
            name: stringField,
            color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
            values: {
              type: 'array',
              items: { type: 'number', minimum: -1000000000, maximum: 1000000000 },
              minItems: 1,
              maxItems: 10,
            },
          },
          required: ['name', 'values'],
          additionalProperties: false,
        },
        3,
      ),
    },
    ['chartType', 'categories', 'series'],
  ),
  tool(
    'build_gantt_diagram',
    'Build an editable Gantt/timeline chart with tasks, tracks, date/unit grid, durations, and validated dependencies.',
    {
      title: stringField,
      unit: { type: 'string', maxLength: 24 },
      tasks: boundedArray(
        {
          type: 'object',
          properties: {
            id: idField,
            label: stringField,
            start: { type: 'number', minimum: 0, maximum: 1000000 },
            duration: { type: 'number', exclusiveMinimum: 0, maximum: 1000000 },
            lane: { type: 'string', maxLength: 48 },
          },
          required: ['id', 'label', 'start', 'duration'],
          additionalProperties: false,
        },
        28,
      ),
      dependencies: { type: 'array', items: relation(), maxItems: 20 },
    },
    ['tasks'],
  ),
  tool(
    'build_heatmap_chart',
    'Build an editable heatmap from a bounded numeric matrix with row/column labels and a continuous color legend.',
    {
      title: stringField,
      columns: boundedArray(stringField, 6),
      rows: boundedArray(
        {
          type: 'object',
          properties: {
            label: stringField,
            values: {
              type: 'array',
              items: { type: 'number', minimum: -1000000000, maximum: 1000000000 },
              minItems: 1,
              maxItems: 6,
            },
          },
          required: ['label', 'values'],
          additionalProperties: false,
        },
        6,
      ),
    },
    ['columns', 'rows'],
  ),
  tool(
    'build_text_diagram',
    'Place a bounded ASCII/text diagram in a clean monospace frame while preserving spaces and line breaks exactly.',
    {
      title: stringField,
      source: { type: 'string', minLength: 2, maxLength: 8000 },
    },
    ['source'],
  ),
  tool(
    'render_mermaid_diagram',
    'Render supplied Mermaid source locally using strict SVG security, then place it as crisp scalable artwork, decomposing into editable shapes when supported. Use only when the user requests Mermaid syntax/source or a Mermaid diagram.',
    {
      source: { type: 'string', minLength: 8, maxLength: 24000 },
      position: rootPosition,
    },
    ['source'],
  ),
]

export interface DiagramCompileResult {
  name: DiagramToolName
  title: string
  elements: DiagramSceneItem[]
  width: number
  height: number
  nodeCount: number
}

export interface DiagramPosition {
  x: number
  y: number
}

const colors = {
  ink: '#1e1b4b',
  line: '#64748b',
  blue: '#2563eb',
  paleBlue: '#eff6ff',
  paleViolet: '#f5f3ff',
  paleAmber: '#fffbeb',
  paleGreen: '#f0fdf4',
  white: '#ffffff',
  muted: '#475569',
  grid: '#cbd5e1',
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim().slice(0, 160) : fallback
}
function safeId(value: unknown): string {
  return text(value)
}
function checkedItems<T>(
  value: unknown,
  label: string,
  max: number,
  map: (entry: Record<string, unknown>, index: number) => T,
): T[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > max)
    throw new Error(`${label} must contain 1-${max} items.`)
  return value.map((entry, index) => map(record(entry), index))
}
function uniqueIds<T extends { id: string }>(items: T[], label: string): Map<string, T> {
  const result = new Map<string, T>()
  for (const item of items) {
    if (!/^[a-zA-Z0-9_-]{1,48}$/.test(item.id)) throw new Error(`${label} contains an invalid id.`)
    if (result.has(item.id)) throw new Error(`${label} contains duplicate id "${item.id}".`)
    result.set(item.id, item)
  }
  return result
}
function edgeRef(from: string, to: string, nodes: Map<string, unknown>, label: string): void {
  if (!nodes.has(from) || !nodes.has(to))
    throw new Error(`${label} references missing endpoint "${!nodes.has(from) ? from : to}".`)
}
function fmt(
  title: string,
  origin: DiagramPosition,
  contentW: number,
  contentH: number,
  nodeCount: number,
  elements: DiagramSceneItem[],
): DiagramCompileResult {
  if (!elements.length || elements.length > 120)
    throw new Error(`Diagram creates ${elements.length} scene items; the safe limit is 120.`)
  const shifted = elements.map((item) => {
    const next = { ...item }
    for (const key of ['x', 'x1', 'x2'] as const)
      if (typeof next[key] === 'number') next[key] = Number(next[key]) + origin.x
    for (const key of ['y', 'y1', 'y2'] as const)
      if (typeof next[key] === 'number') next[key] = Number(next[key]) + origin.y
    if (Array.isArray(next.points))
      next.points = next.points.map((point) =>
        Array.isArray(point) ? [Number(point[0]) + origin.x, Number(point[1]) + origin.y] : point,
      )
    return next
  })
  const all = shifted.flatMap((item) => [
    Number(item.x ?? item.x1 ?? 0),
    Number(item.y ?? item.y1 ?? 0),
    Number(item.x2 ?? item.x ?? 1),
    Number(item.y2 ?? item.y ?? 1),
    Number(item.width ?? 1),
    Number(item.height ?? 1),
    ...(Array.isArray(item.points)
      ? item.points.flatMap((point) =>
          Array.isArray(point) ? [Number(point[0]), Number(point[1])] : [],
        )
      : []),
  ])
  if (all.some((value) => !Number.isFinite(value) || Math.abs(value) > 50000))
    throw new Error('Diagram geometry is outside the supported canvas coordinate range.')
  const boxes = shifted
    .filter((item) => item.diagramNode === true)
    .map((item) => ({
      name: text(item.label ?? item.id ?? item.text, 'node'),
      x: Number(item.x),
      y: Number(item.y),
      width: Number(item.width),
      height: Number(item.height),
    }))
  for (let i = 0; i < boxes.length; i += 1)
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!
      const b = boxes[j]!
      if (
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 2 &&
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 2
      ) {
        throw new Error(
          `Auto-layout overlap between "${a.name}" and "${b.name}"; simplify or split the diagram.`,
        )
      }
    }
  return {
    name: '' as DiagramToolName,
    title,
    width: Math.ceil(contentW),
    height: Math.ceil(contentH),
    nodeCount,
    elements: shifted,
  }
}
function titleItem(title: string, width: number): DiagramSceneItem[] {
  return [
    {
      kind: 'text',
      text: title.toLocaleUpperCase(),
      x: 4,
      y: 4,
      width,
      height: 36,
      size: 24,
      color: colors.ink,
    },
    { kind: 'line', x1: 4, y1: 45, x2: width - 8, y2: 45, color: colors.grid, lineWidth: 1 },
  ]
}
function textShape(
  textValue: string,
  x: number,
  y: number,
  width: number,
  height: number,
  size = 15,
  color = colors.ink,
  align: 'left' | 'center' | 'right' = 'center',
): DiagramSceneItem {
  return { kind: 'text', text: textValue, x, y, width, height, size, color, textAlign: align }
}
function wrapLabel(value: string, maxChars = 24): string {
  return value
    .split('\n')
    .flatMap((sourceLine) => {
      const words = sourceLine.split(/\s+/).filter(Boolean)
      const lines: string[] = []
      let current = ''
      for (const word of words) {
        if (word.length > maxChars) {
          if (current) {
            lines.push(current)
            current = ''
          }
          for (let start = 0; start < word.length; start += maxChars)
            lines.push(word.slice(start, start + maxChars))
        } else if (!current) current = word
        else if (current.length + 1 + word.length <= maxChars) current += ` ${word}`
        else {
          lines.push(current)
          current = word
        }
      }
      if (current) lines.push(current)
      return lines.length ? lines : ['']
    })
    .join('\n')
}
function nodeShape(
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  shape: string,
  fill = colors.paleBlue,
): DiagramSceneItem {
  const kind =
    shape === 'decision' ? 'diamond' : shape === 'start' || shape === 'end' ? 'ellipse' : 'rect'
  return {
    kind,
    id,
    label: wrapLabel(label, 21),
    diagramNode: true,
    x,
    y,
    width,
    height,
    color: colors.blue,
    fillColor: fill,
    lineWidth: 2,
    size: 15,
  }
}
function arrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  label = '',
  dashed = false,
  color = colors.line,
): DiagramSceneItem[] {
  const result: DiagramSceneItem[] = [
    { kind: 'arrow', x1, y1, x2, y2, color, lineWidth: 1.6, dashed },
  ]
  if (label) {
    const wrapped = wrapLabel(label, 36)
    const lineCount = wrapped.split('\n').length
    const width = Math.max(
      76,
      Math.min(320, Math.max(...wrapped.split('\n').map((line) => line.length)) * 8),
    )
    result.push(
      textShape(
        wrapped,
        (x1 + x2) / 2 - width / 2,
        (y1 + y2) / 2 - 20 - lineCount * 8,
        width,
        lineCount * 18,
        12,
        colors.muted,
      ),
    )
  }
  return result
}
function getOrigin(input: Record<string, unknown>, position?: DiagramPosition): DiagramPosition {
  const p = record(input.position)
  return (
    position ?? {
      x: Number.isFinite(Number(p.x)) ? Number(p.x) : 80,
      y: Number.isFinite(Number(p.y)) ? Number(p.y) : 80,
    }
  )
}
function layoutByLayers<T extends { id: string }>(
  nodes: T[],
  edges: Array<{ from: string; to: string }>,
): Map<string, number> {
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const next = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of edges) {
    if (edge.from !== edge.to) {
      next.get(edge.from)!.push(edge.to)
      indegree.set(edge.to, indegree.get(edge.to)! + 1)
    }
  }
  const layers = new Map(nodes.map((node) => [node.id, 0]))
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id)
  const scheduled = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (scheduled.has(id)) continue
    scheduled.add(id)
    for (const to of next.get(id) ?? []) {
      layers.set(to, Math.max(layers.get(to) ?? 0, (layers.get(id) ?? 0) + 1))
      indegree.set(to, indegree.get(to)! - 1)
      if (indegree.get(to) === 0) queue.push(to)
    }
  }
  // Cyclic and disconnected nodes remain visible in a deterministic final layer.
  const maxLayer = Math.max(0, ...layers.values())
  for (const node of nodes) if (!scheduled.has(node.id)) layers.set(node.id, Math.max(maxLayer, 0))
  return layers
}
function compileFlow(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const nodes = checkedItems(input.nodes, 'nodes', 28, (item) => ({
    id: safeId(item.id),
    label: text(item.label),
    shape: ['process', 'decision', 'start', 'end', 'data'].includes(String(item.shape))
      ? String(item.shape)
      : 'process',
  }))
  const byId = uniqueIds(nodes, 'nodes')
  if (nodes.some((node) => !node.label)) throw new Error('Every node needs a non-empty label.')
  const edges = Array.isArray(input.edges)
    ? input.edges.map((entry) => ({
        from: safeId(record(entry).from),
        to: safeId(record(entry).to),
        label: text(record(entry).label),
        style: record(entry).style === 'dashed' ? 'dashed' : 'solid',
      }))
    : []
  if (edges.length > 30) throw new Error('edges may contain at most 30 items.')
  edges.forEach((edge) => edgeRef(edge.from, edge.to, byId, 'An edge'))
  const layers = layoutByLayers(nodes, edges)
  const horizontal = input.direction !== 'TB'
  const coords = new Map<string, { x: number; y: number }>()
  const layerGroups = new Map<number, typeof nodes>()
  for (const node of nodes) {
    const layer = layers.get(node.id) ?? 0
    layerGroups.set(layer, [...(layerGroups.get(layer) ?? []), node])
  }
  for (const [layer, group] of layerGroups)
    group.forEach((node, index) =>
      coords.set(
        node.id,
        horizontal
          ? { x: 38 + layer * 270, y: 82 + index * 142 }
          : { x: 38 + index * 252, y: 82 + layer * 152 },
      ),
    )
  const width = horizontal
    ? 76 + (Math.max(...layers.values()) + 1) * 270
    : 76 + Math.max(...nodes.map((node) => coords.get(node.id)!.x))
  const height = horizontal
    ? 100 + Math.max(...nodes.map((node) => coords.get(node.id)!.y))
    : 150 + (Math.max(...layers.values()) + 1) * 152
  const elements = titleItem(title, width)
  for (const edge of edges) {
    const from = coords.get(edge.from)!
    const to = coords.get(edge.to)!
    const [sx, sy, tx, ty] = horizontal
      ? [from.x + 184, from.y + 40, to.x, to.y + 40]
      : [from.x + 92, from.y + 82, to.x + 92, to.y]
    elements.push(...arrow(sx, sy, tx, ty, edge.label, edge.style === 'dashed'))
  }
  for (const node of nodes) {
    const at = coords.get(node.id)!
    elements.push(
      nodeShape(
        node.id,
        node.label,
        at.x,
        at.y,
        184,
        82,
        node.shape,
        node.shape === 'decision'
          ? colors.paleAmber
          : node.shape === 'start' || node.shape === 'end'
            ? colors.paleGreen
            : colors.paleBlue,
      ),
    )
  }
  return {
    ...fmt(title, origin, width, height, nodes.length, elements),
    name: 'build_flow_diagram',
  }
}

function compileSequence(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const participants = checkedItems(input.participants, 'participants', 8, (item) => ({
    id: safeId(item.id),
    label: text(item.label),
  }))
  const byId = uniqueIds(participants, 'participants')
  if (participants.length < 2 || participants.some((item) => !item.label))
    throw new Error('A sequence diagram needs at least two labelled participants.')
  const messages = Array.isArray(input.messages)
    ? input.messages.map((entry) => {
        const item = record(entry)
        return {
          from: safeId(item.from),
          to: safeId(item.to),
          label: text(item.label),
          kind: item.kind === 'return' || item.kind === 'async' ? item.kind : 'call',
        }
      })
    : []
  if (messages.length < 1 || messages.length > 32)
    throw new Error('messages must contain 1-32 items.')
  messages.forEach((message) => {
    edgeRef(message.from, message.to, byId, 'A message')
    if (!message.label) throw new Error('Every sequence message needs a label.')
  })
  const width = Math.max(720, participants.length * 210 + 80)
  const top = 90
  const headerY = 68
  const lastY = top + messages.length * 54 + 20
  const elements = titleItem(title, width)
  const centers = new Map<string, number>()
  participants.forEach((participant, index) => {
    const centerX = 54 + index * ((width - 108) / (participants.length - 1))
    centers.set(participant.id, centerX)
    elements.push({
      kind: 'line',
      x1: centerX,
      y1: top + 4,
      x2: centerX,
      y2: lastY,
      color: colors.grid,
      lineWidth: 1,
      dashed: true,
    })
    elements.push({
      kind: 'rect',
      id: participant.id,
      label: wrapLabel(participant.label, 16),
      diagramNode: true,
      x: centerX - 78,
      y: headerY,
      width: 156,
      height: 48,
      color: colors.blue,
      fillColor: colors.white,
      lineWidth: 2,
      size: 15,
    })
  })
  messages.forEach((message, index) => {
    const y = top + index * 54 + 24
    const x1 = centers.get(message.from)!
    const x2 = centers.get(message.to)!
    const dy = x1 === x2 ? 36 : 0
    const color =
      message.kind === 'async' ? '#7c3aed' : message.kind === 'return' ? '#d97706' : colors.blue
    elements.push(
      ...arrow(
        x1,
        y,
        x2,
        y + dy,
        `${index + 1}. ${message.label}`,
        message.kind === 'return',
        color,
      ),
    )
  })
  return {
    ...fmt(title, origin, width, lastY + 30, participants.length, elements),
    name: 'build_sequence_diagram',
  }
}

function compileUseCase(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const actors = checkedItems(input.actors, 'actors', 4, (item) => ({
    id: safeId(item.id),
    label: text(item.label),
    side: item.side === 'right' ? 'right' : 'left',
  }))
  const cases = checkedItems(input.useCases, 'useCases', 16, (item) => ({
    id: safeId(item.id),
    label: text(item.label),
  }))
  const actorIds = uniqueIds(actors, 'actors')
  const caseIds = uniqueIds(cases, 'useCases')
  if (actors.some((item) => !item.label) || cases.some((item) => !item.label))
    throw new Error('Every actor and use case needs a label.')
  const associations = Array.isArray(input.associations)
    ? input.associations.map((entry) => ({
        actor: safeId(record(entry).actor),
        useCase: safeId(record(entry).useCase),
        label: text(record(entry).label),
      }))
    : []
  if (associations.length > 24) throw new Error('associations may contain at most 24 items.')
  associations.forEach((edge) => {
    edgeRef(edge.actor, edge.useCase, new Map([...actorIds, ...caseIds]), 'An association')
    if (!actorIds.has(edge.actor) || !caseIds.has(edge.useCase))
      throw new Error('Associations must connect an actor to a use case.')
  })
  const width = 1060
  const box = { x: 205, y: 88, w: 650, h: Math.max(500, Math.ceil(cases.length / 2) * 112 + 72) }
  const casePos = new Map(
    cases.map((item, index) => [
      item.id,
      { x: box.x + 32 + (index % 2) * 300, y: box.y + 58 + Math.floor(index / 2) * 112 },
    ]),
  )
  const actorPos = new Map(
    actors.map((item, index) => [
      item.id,
      { x: item.side === 'right' ? 930 : 65, y: box.y + 75 + index * 108 },
    ]),
  )
  const elements = titleItem(title, width)
  elements.push({
    kind: 'rect',
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    color: colors.muted,
    fillColor: 'transparent',
    lineWidth: 2,
  })
  elements.push(
    textShape(
      `SYSTEM BOUNDARY: ${text(input.system)}`,
      box.x + 12,
      box.y + 7,
      box.w - 24,
      28,
      14,
      colors.muted,
      'left',
    ),
  )
  for (const association of associations) {
    const actor = actorPos.get(association.actor)!
    const useCase = casePos.get(association.useCase)!
    const startX = actor.x < box.x ? actor.x + 18 : actor.x - 18
    const endX = actor.x < box.x ? useCase.x : useCase.x + 216
    elements.push({
      kind: 'line',
      x1: startX,
      y1: actor.y + 28,
      x2: endX,
      y2: useCase.y + 36,
      color: colors.line,
      lineWidth: 1.4,
      dashed: false,
    })
    if (association.label)
      elements.push(
        textShape(
          association.label,
          (startX + endX) / 2 - 30,
          (actor.y + useCase.y) / 2,
          110,
          18,
          11,
          colors.muted,
        ),
      )
  }
  for (const useCase of cases) {
    const at = casePos.get(useCase.id)!
    elements.push({
      kind: 'ellipse',
      id: useCase.id,
      label: wrapLabel(useCase.label, 25),
      diagramNode: true,
      x: at.x,
      y: at.y,
      width: 216,
      height: 72,
      color: colors.blue,
      fillColor: colors.white,
      lineWidth: 2,
      size: 13,
    })
  }
  for (const actor of actors) {
    const at = actorPos.get(actor.id)!
    const cx = at.x
    elements.push({
      kind: 'ellipse',
      x: cx - 9,
      y: at.y,
      width: 18,
      height: 18,
      color: colors.ink,
      fillColor: colors.white,
      lineWidth: 2,
    })
    elements.push({
      kind: 'line',
      x1: cx,
      y1: at.y + 18,
      x2: cx,
      y2: at.y + 48,
      color: colors.ink,
      lineWidth: 2,
    })
    elements.push({
      kind: 'line',
      x1: cx - 17,
      y1: at.y + 30,
      x2: cx + 17,
      y2: at.y + 30,
      color: colors.ink,
      lineWidth: 2,
    })
    elements.push({
      kind: 'line',
      x1: cx,
      y1: at.y + 48,
      x2: cx - 14,
      y2: at.y + 68,
      color: colors.ink,
      lineWidth: 2,
    })
    elements.push({
      kind: 'line',
      x1: cx,
      y1: at.y + 48,
      x2: cx + 14,
      y2: at.y + 68,
      color: colors.ink,
      lineWidth: 2,
    })
    elements.push(textShape(actor.label, cx - 66, at.y + 70, 132, 22, 13, colors.ink))
  }
  return {
    ...fmt(title, origin, width, box.y + box.h + 28, actors.length + cases.length, elements),
    name: 'build_use_case_diagram',
  }
}

function compileRequirements(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const requirements = checkedItems(input.requirements, 'requirements', 20, (item) => ({
    id: safeId(item.id),
    label: text(item.label),
    kind: ['quality', 'constraint', 'goal'].includes(String(item.kind))
      ? String(item.kind)
      : 'functional',
    priority: text(item.priority, 'medium'),
  }))
  const stakeholders = Array.isArray(input.stakeholders)
    ? input.stakeholders.map((entry) => ({
        id: safeId(record(entry).id),
        label: text(record(entry).label),
        side: record(entry).side === 'right' ? 'right' : 'left',
      }))
    : []
  if (stakeholders.length > 4) throw new Error('stakeholders may contain at most 4 items.')
  const requirementIds = uniqueIds(requirements, 'requirements')
  const stakeholderIds = uniqueIds(stakeholders, 'stakeholders')
  if ([...requirementIds.keys()].some((id) => stakeholderIds.has(id)))
    throw new Error('Requirement and stakeholder IDs must be unique across the diagram.')
  if (requirements.some((item) => !item.label) || stakeholders.some((item) => !item.label))
    throw new Error('Every requirement and stakeholder needs a label.')
  const allIds = new Map<string, unknown>([...requirementIds, ...stakeholderIds])
  const relations = Array.isArray(input.relations)
    ? input.relations.map((entry) => ({
        from: safeId(record(entry).from),
        to: safeId(record(entry).to),
        label: text(record(entry).label),
        kind: text(record(entry).kind, 'traces'),
      }))
    : []
  if (relations.length > 24) throw new Error('relations may contain at most 24 items.')
  relations.forEach((relationItem) => {
    edgeRef(relationItem.from, relationItem.to, allIds, 'A requirements trace link')
    if (relationItem.from === relationItem.to)
      throw new Error('A trace link cannot reference the same node twice.')
    if (stakeholderIds.has(relationItem.from) && stakeholderIds.has(relationItem.to))
      throw new Error('A trace link must connect to at least one requirement.')
  })
  const width = 1180
  const reqW = 300
  const reqH = 76
  const rows = Math.ceil(requirements.length / 2)
  const reqPos = new Map(
    requirements.map((item, index) => [
      item.id,
      { x: 300 + (index % 2) * 370, y: 90 + Math.floor(index / 2) * 112 },
    ]),
  )
  const actorPos = new Map(
    stakeholders.map((item, index) => [
      item.id,
      { x: item.side === 'right' ? 1100 : 55, y: 102 + index * 120 },
    ]),
  )
  const elements = titleItem(title, width)
  elements.push({
    kind: 'rect',
    x: 265,
    y: 78,
    width: 675,
    height: Math.max(250, rows * 112 + 38),
    color: colors.muted,
    fillColor: 'transparent',
    lineWidth: 2,
  })
  elements.push(
    textShape(`SYSTEM: ${text(input.system)}`, 280, 82, 640, 24, 13, colors.muted, 'left'),
  )
  const nodeCenter = (id: string) => {
    const req = reqPos.get(id)
    if (req) return { x: req.x + reqW / 2, y: req.y + reqH / 2 }
    const actor = actorPos.get(id)!
    return { x: actor.x, y: actor.y + 28 }
  }
  for (const link of relations) {
    const from = nodeCenter(link.from)
    const to = nodeCenter(link.to)
    elements.push(
      ...arrow(
        from.x,
        from.y,
        to.x,
        to.y,
        wrapLabel(`${link.kind}${link.label ? `: ${link.label}` : ''}`, 44),
        link.kind === 'traces',
        '#475569',
      ),
    )
  }
  for (const requirement of requirements) {
    const at = reqPos.get(requirement.id)!
    const priorityColor =
      requirement.priority === 'high'
        ? '#dc2626'
        : requirement.priority === 'low'
          ? '#64748b'
          : colors.blue
    elements.push({
      kind: 'rect',
      id: requirement.id,
      label: `${wrapLabel(`${requirement.id}: ${requirement.label}`, 38)}\n${requirement.kind} · ${requirement.priority} priority`,
      diagramNode: true,
      x: at.x,
      y: at.y,
      width: reqW,
      height: reqH,
      color: priorityColor,
      fillColor: requirement.kind === 'constraint' ? colors.paleAmber : colors.paleBlue,
      lineWidth: 1.8,
      size: 12,
    })
  }
  for (const stakeholder of stakeholders) {
    const at = actorPos.get(stakeholder.id)!
    elements.push({
      kind: 'ellipse',
      x: at.x - 9,
      y: at.y,
      width: 18,
      height: 18,
      color: colors.ink,
      fillColor: colors.white,
      lineWidth: 2,
    })
    elements.push({
      kind: 'line',
      x1: at.x,
      y1: at.y + 18,
      x2: at.x,
      y2: at.y + 48,
      color: colors.ink,
      lineWidth: 2,
    })
    elements.push({
      kind: 'line',
      x1: at.x - 17,
      y1: at.y + 30,
      x2: at.x + 17,
      y2: at.y + 30,
      color: colors.ink,
      lineWidth: 2,
    })
    elements.push({
      kind: 'line',
      x1: at.x,
      y1: at.y + 48,
      x2: at.x - 14,
      y2: at.y + 68,
      color: colors.ink,
      lineWidth: 2,
    })
    elements.push({
      kind: 'line',
      x1: at.x,
      y1: at.y + 48,
      x2: at.x + 14,
      y2: at.y + 68,
      color: colors.ink,
      lineWidth: 2,
    })
    elements.push(textShape(stakeholder.label, at.x - 68, at.y + 70, 136, 20, 12, colors.ink))
  }
  return {
    ...fmt(
      title,
      origin,
      width,
      Math.max(340, rows * 112 + 140),
      requirements.length + stakeholders.length,
      elements,
    ),
    name: 'build_requirement_diagram',
  }
}

function compileClass(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const classes = checkedItems(input.classes, 'classes', 10, (item) => ({
    id: safeId(item.id),
    name: text(item.name),
    attributes: Array.isArray(item.attributes)
      ? item.attributes
          .map((value) => text(value))
          .filter(Boolean)
          .slice(0, 8)
      : [],
    operations: Array.isArray(item.operations)
      ? item.operations
          .map((value) => text(value))
          .filter(Boolean)
          .slice(0, 6)
      : [],
  }))
  const byId = uniqueIds(classes, 'classes')
  if (classes.some((item) => !item.name)) throw new Error('Every class needs a name.')
  const relationships = Array.isArray(input.relationships)
    ? input.relationships.map((entry) => {
        const item = record(entry)
        return {
          from: safeId(item.from),
          to: safeId(item.to),
          label: text(item.label),
          kind: text(item.kind, 'association'),
        }
      })
    : []
  if (relationships.length > 20) throw new Error('relationships may contain at most 20 items.')
  relationships.forEach((edge) => edgeRef(edge.from, edge.to, byId, 'A class relationship'))
  const cols = Math.min(3, Math.ceil(Math.sqrt(classes.length)))
  const cardW = 260
  const h = (c: (typeof classes)[number]) =>
    92 +
    Math.max(c.attributes.length, 1) * 21 +
    (c.operations.length ? 14 + c.operations.length * 21 : 0)
  const rowY: number[] = []
  let nextY = 82
  for (let row = 0; row < Math.ceil(classes.length / cols); row += 1) {
    rowY.push(nextY)
    const rowClasses = classes.slice(row * cols, (row + 1) * cols)
    nextY += Math.max(...rowClasses.map(h)) + 64
  }
  const pos = new Map(
    classes.map((c, index) => [
      c.id,
      { x: 40 + (index % cols) * 340, y: rowY[Math.floor(index / cols)]! },
    ]),
  )
  const width = 80 + cols * 340
  const height = nextY + 24
  const elements = titleItem(title, width)
  for (const edge of relationships) {
    const a = pos.get(edge.from)!
    const b = pos.get(edge.to)!
    const relationLabel = `${edge.kind}${edge.label ? ` · ${edge.label}` : ''}`
    const head =
      edge.kind === 'inheritance' || edge.kind === 'composition' || edge.kind === 'aggregation'
        ? 'triangle'
        : 'arrow'
    elements.push({
      kind: edge.kind === 'dependency' ? 'arrow' : 'line',
      x1: a.x + cardW / 2,
      y1: a.y + h(byId.get(edge.from)!) / 2,
      x2: b.x + cardW / 2,
      y2: b.y + h(byId.get(edge.to)!) / 2,
      color: colors.line,
      lineWidth: 1.5,
      dashed: edge.kind === 'dependency',
      endArrowhead: head,
    })
    if (relationLabel)
      elements.push(
        textShape(
          relationLabel,
          (a.x + b.x) / 2 + 45,
          (a.y + b.y) / 2 + 16,
          180,
          20,
          11,
          colors.muted,
        ),
      )
  }
  for (const cls of classes) {
    const at = pos.get(cls.id)!
    const height = h(cls)
    elements.push({
      kind: 'rect',
      diagramNode: true,
      label: cls.name,
      x: at.x,
      y: at.y,
      width: cardW,
      height,
      color: colors.blue,
      fillColor: colors.white,
      lineWidth: 2,
    })
    elements.push(
      textShape(wrapLabel(cls.name, 26), at.x + 8, at.y + 10, cardW - 16, 26, 16, colors.ink),
    )
    elements.push({
      kind: 'line',
      x1: at.x,
      y1: at.y + 44,
      x2: at.x + cardW,
      y2: at.y + 44,
      color: colors.grid,
      lineWidth: 1,
    })
    const attrs = cls.attributes.length
      ? cls.attributes.map((value) => `− ${value}`).join('\n')
      : '—'
    elements.push(
      textShape(
        attrs,
        at.x + 12,
        at.y + 50,
        cardW - 24,
        Math.max(26, cls.attributes.length * 20),
        12,
        colors.muted,
        'left',
      ),
    )
    if (cls.operations.length) {
      const sepY = at.y + 54 + Math.max(cls.attributes.length, 1) * 21
      elements.push({
        kind: 'line',
        x1: at.x,
        y1: sepY,
        x2: at.x + cardW,
        y2: sepY,
        color: colors.grid,
        lineWidth: 1,
      })
      elements.push(
        textShape(
          cls.operations.map((value) => `+ ${value}`).join('\n'),
          at.x + 12,
          sepY + 5,
          cardW - 24,
          cls.operations.length * 20 + 4,
          12,
          colors.muted,
          'left',
        ),
      )
    }
  }
  return {
    ...fmt(title, origin, width, height, classes.length, elements),
    name: 'build_uml_class_diagram',
  }
}

function compileEr(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const entities = checkedItems(input.entities, 'entities', 12, (item) => ({
    id: safeId(item.id),
    name: text(item.name),
    attributes: Array.isArray(item.attributes)
      ? item.attributes
          .map((value) => text(value))
          .filter(Boolean)
          .slice(0, 8)
      : [],
  }))
  const byId = uniqueIds(entities, 'entities')
  if (entities.some((item) => !item.name)) throw new Error('Every entity needs a name.')
  const relationships = Array.isArray(input.relationships)
    ? input.relationships.map((entry) => {
        const item = record(entry)
        return {
          from: safeId(item.from),
          to: safeId(item.to),
          label: text(item.label),
          cardinality: text(item.cardinality),
        }
      })
    : []
  if (relationships.length > 12) throw new Error('relationships may contain at most 12 items.')
  relationships.forEach((edge) => edgeRef(edge.from, edge.to, byId, 'An ER relationship'))
  const cols = Math.min(3, Math.ceil(Math.sqrt(entities.length)))
  const cardW = 250
  const cardH = 145
  const pos = new Map(
    entities.map((entity, index) => [
      entity.id,
      { x: 45 + (index % cols) * 350, y: 86 + Math.floor(index / cols) * 230 },
    ]),
  )
  const width = 80 + cols * 350
  const height = 120 + Math.ceil(entities.length / cols) * 230
  const elements = titleItem(title, width)
  relationships.forEach((edge, _index) => {
    const a = pos.get(edge.from)!
    const b = pos.get(edge.to)!
    const midX = (a.x + b.x) / 2 + cardW / 2
    const midY = (a.y + b.y) / 2 + cardH / 2
    const dx = a.x + cardW / 2 < b.x + cardW / 2 ? 1 : -1
    elements.push({
      kind: 'line',
      x1: a.x + cardW / 2 + dx * (cardW / 2),
      y1: a.y + cardH / 2,
      x2: midX - dx * 30,
      y2: midY,
      color: colors.line,
      lineWidth: 1.5,
    })
    elements.push({
      kind: 'line',
      x1: midX + dx * 30,
      y1: midY,
      x2: b.x + cardW / 2 - dx * (cardW / 2),
      y2: b.y + cardH / 2,
      color: colors.line,
      lineWidth: 1.5,
    })
    elements.push({
      kind: 'diamond',
      label: edge.label || 'relates',
      diagramNode: true,
      x: midX - 30,
      y: midY - 20,
      width: 60,
      height: 40,
      color: colors.blue,
      fillColor: colors.white,
      lineWidth: 1.5,
      size: 10,
    })
    elements.push(
      textShape(edge.cardinality || '1:N', midX - 56, midY + 25, 44, 16, 10, colors.muted),
    )
    elements.push(
      textShape(edge.cardinality || '1:N', midX + 12, midY + 25, 44, 16, 10, colors.muted),
    )
  })
  for (const entity of entities) {
    const at = pos.get(entity.id)!
    elements.push({
      kind: 'rect',
      diagramNode: true,
      label: entity.name,
      x: at.x,
      y: at.y,
      width: cardW,
      height: cardH,
      color: colors.blue,
      fillColor: colors.white,
      lineWidth: 2,
    })
    elements.push(
      textShape(wrapLabel(entity.name, 28), at.x + 8, at.y + 8, cardW - 16, 26, 15, colors.ink),
    )
    elements.push({
      kind: 'line',
      x1: at.x,
      y1: at.y + 42,
      x2: at.x + cardW,
      y2: at.y + 42,
      color: colors.grid,
      lineWidth: 1,
    })
    elements.push(
      textShape(
        entity.attributes.length
          ? entity.attributes.map((value) => `• ${value}`).join('\n')
          : '• id: UUID (PK)',
        at.x + 12,
        at.y + 49,
        cardW - 24,
        cardH - 55,
        12,
        colors.muted,
        'left',
      ),
    )
  }
  return {
    ...fmt(title, origin, width, height, entities.length, elements),
    name: 'build_er_diagram',
  }
}

function compileState(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const states = checkedItems(input.states, 'states', 24, (item) => ({
    id: safeId(item.id),
    label: text(item.label),
    kind: item.kind === 'initial' || item.kind === 'final' ? item.kind : 'state',
  }))
  const byId = uniqueIds(states, 'states')
  if (states.some((item) => !item.label)) throw new Error('Every state needs a label.')
  if (states.filter((item) => item.kind === 'initial').length !== 1)
    throw new Error('State diagrams require exactly one initial state.')
  const transitions = Array.isArray(input.transitions)
    ? input.transitions.map((entry) => ({
        from: safeId(record(entry).from),
        to: safeId(record(entry).to),
        label: text(record(entry).label),
      }))
    : []
  if (transitions.length > 24) throw new Error('transitions may contain at most 24 items.')
  transitions.forEach((edge) => edgeRef(edge.from, edge.to, byId, 'A transition'))
  const layers = layoutByLayers(states, transitions)
  const layerGroups = new Map<number, typeof states>()
  for (const state of states) {
    const layer = layers.get(state.id) ?? 0
    layerGroups.set(layer, [...(layerGroups.get(layer) ?? []), state])
  }
  const pos = new Map<string, { x: number; y: number }>()
  for (const [layer, group] of layerGroups)
    group.forEach((state, index) => pos.set(state.id, { x: 46 + layer * 250, y: 82 + index * 120 }))
  const width = 100 + (Math.max(...layers.values()) + 1) * 250
  const height = 130 + Math.max(...states.map((state) => pos.get(state.id)!.y)) + 120
  const elements = titleItem(title, width)
  for (const edge of transitions) {
    const a = pos.get(edge.from)!
    const b = pos.get(edge.to)!
    elements.push(...arrow(a.x + 85, a.y + 42, b.x + 85, b.y + 42, edge.label))
  }
  for (const state of states) {
    const at = pos.get(state.id)!
    if (state.kind === 'initial') {
      elements.push({
        kind: 'ellipse',
        diagramNode: true,
        label: state.label,
        x: at.x + 70,
        y: at.y + 20,
        width: 28,
        height: 28,
        color: colors.ink,
        fillColor: colors.ink,
        lineWidth: 1,
      })
    } else if (state.kind === 'final') {
      elements.push({
        kind: 'ellipse',
        diagramNode: true,
        label: state.label,
        x: at.x + 70,
        y: at.y + 14,
        width: 40,
        height: 40,
        color: colors.ink,
        fillColor: colors.white,
        lineWidth: 3,
      })
      elements.push({
        kind: 'ellipse',
        x: at.x + 79,
        y: at.y + 23,
        width: 22,
        height: 22,
        color: colors.ink,
        fillColor: colors.ink,
        lineWidth: 1,
      })
    } else {
      elements.push({
        kind: 'rect',
        id: state.id,
        label: wrapLabel(state.label, 18),
        diagramNode: true,
        x: at.x,
        y: at.y,
        width: 170,
        height: 84,
        color: colors.blue,
        fillColor: colors.paleViolet,
        lineWidth: 2,
        size: 14,
      })
    }
    if (state.kind !== 'state')
      elements.push(textShape(state.label, at.x + 18, at.y + 55, 150, 22, 12, colors.ink))
  }
  return {
    ...fmt(title, origin, width, height, states.length, elements),
    name: 'build_state_diagram',
  }
}

function compileMindMap(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const topics = checkedItems(input.topics, 'topics', 28, (item) => ({
    id: safeId(item.id),
    label: text(item.label),
    parent: safeId(item.parent),
  }))
  const byId = uniqueIds(topics, 'topics')
  if (topics.some((topic) => !topic.label)) throw new Error('Every topic needs a label.')
  const roots = topics.filter((topic) => !topic.parent)
  if (roots.length !== 1) throw new Error('A mind map must have exactly one root topic.')
  topics
    .filter((topic) => topic.parent)
    .forEach((topic) => {
      if (!byId.has(topic.parent))
        throw new Error(`Topic "${topic.id}" references missing parent "${topic.parent}".`)
      if (topic.id === topic.parent) throw new Error('A topic cannot be its own parent.')
    })
  const depth = new Map<string, number>([[roots[0]!.id, 0]])
  for (let pass = 0; pass < topics.length; pass += 1) {
    for (const topic of topics)
      if (topic.parent && depth.has(topic.parent)) depth.set(topic.id, depth.get(topic.parent)! + 1)
  }
  if (depth.size !== topics.length)
    throw new Error('Mind map parent links contain a cycle or disconnected topic.')
  const children = new Map(topics.map((topic) => [topic.id, [] as typeof topics]))
  for (const topic of topics) if (topic.parent) children.get(topic.parent)!.push(topic)
  const order: Array<{ topic: (typeof topics)[number]; row: number }> = []
  const place = (topic: (typeof topics)[number]) => {
    const kids = children.get(topic.id) ?? []
    if (!kids.length) {
      order.push({ topic, row: order.length })
      return
    }
    kids.forEach(place)
    const first = order.findIndex((entry) => entry.topic.id === kids[0]!.id)
    const last = order.findIndex((entry) => entry.topic.id === kids[kids.length - 1]!.id)
    order.splice(first < 0 ? order.length : first, 0, {
      topic,
      row: Math.round((Math.max(0, first) + Math.max(0, last)) / 2),
    })
  }
  place(roots[0]!)
  const pos = new Map(
    order.map(({ topic, row }) => [
      topic.id,
      { x: 42 + (depth.get(topic.id) ?? 0) * 260, y: 78 + row * 94 },
    ]),
  )
  const width = 110 + (Math.max(...depth.values()) + 1) * 260
  const height = 120 + Math.max(1, order.length) * 94
  const elements = titleItem(title, width)
  for (const topic of topics) {
    if (!topic.parent) continue
    const a = pos.get(topic.parent)!
    const b = pos.get(topic.id)!
    elements.push({
      kind: 'line',
      x1: a.x + 190,
      y1: a.y + 32,
      x2: b.x,
      y2: b.y + 32,
      color: colors.grid,
      lineWidth: 2,
    })
  }
  for (const topic of topics) {
    const at = pos.get(topic.id)!
    elements.push({
      kind: 'rect',
      id: topic.id,
      label: wrapLabel(topic.label, 20),
      diagramNode: true,
      x: at.x,
      y: at.y,
      width: 190,
      height: 64,
      color: topic.parent ? '#8b5cf6' : colors.blue,
      fillColor: topic.parent ? colors.paleViolet : colors.paleBlue,
      lineWidth: topic.parent ? 1.5 : 2,
      size: topic.parent ? 13 : 15,
    })
  }
  return { ...fmt(title, origin, width, height, topics.length, elements), name: 'build_mind_map' }
}

function compileChart(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const categories = Array.isArray(input.categories)
    ? input.categories.map((item) => text(item)).slice(0, 12)
    : []
  if (categories.length < 2 || categories.length > 10 || categories.some((item) => !item))
    throw new Error('A chart requires 2-10 non-empty categories.')
  const supportedTypes = [
    'bar',
    'stacked-bar',
    'histogram',
    'line',
    'area',
    'scatter',
    'radar',
    'waterfall',
    'pie',
    'donut',
  ]
  const resolvedType = supportedTypes.includes(String(input.chartType))
    ? String(input.chartType)
    : 'bar'
  const series = checkedItems(input.series, 'series', 3, (item) => ({
    name: text(item.name),
    color: /^#[\da-f]{6}$/i.test(text(item.color)) ? text(item.color) : colors.blue,
    values: Array.isArray(item.values) ? item.values.map(Number) : [],
  }))
  if (
    series.some(
      (item) =>
        item.values.length !== categories.length ||
        item.values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e9),
    )
  )
    throw new Error(
      'Each series needs one finite value per category; values must be between -1e9 and 1e9.',
    )
  if (
    ['pie', 'donut', 'radar', 'stacked-bar'].includes(resolvedType) &&
    series.some((item) => item.values.some((value) => value < 0))
  )
    throw new Error(`${resolvedType} charts require non-negative values.`)
  if ((resolvedType === 'pie' || resolvedType === 'donut') && series.length !== 1)
    throw new Error('Pie and donut charts require exactly one series.')
  if (resolvedType === 'waterfall' && series.length !== 1)
    throw new Error('Waterfall charts require exactly one series.')
  const width = Math.max(720, 130 + categories.length * 74)
  const height = 510
  const elements = titleItem(title, width)
  const x0 = 86
  const y0 = 410
  const plotW = width - 138
  const plotH = 300
  const waterfallTotals =
    resolvedType === 'waterfall'
      ? series[0]!.values.reduce<number[]>(
          (totals, value) => [...totals, (totals.at(-1) ?? 0) + value],
          [],
        )
      : []
  const stackedTotals =
    resolvedType === 'stacked-bar'
      ? categories.map((_, index) => series.reduce((sum, row) => sum + row.values[index]!, 0))
      : []
  const minValue =
    resolvedType === 'waterfall'
      ? Math.min(
          0,
          ...waterfallTotals,
          ...waterfallTotals.map((total, index) => total - series[0]!.values[index]!),
        )
      : Math.min(0, ...series.flatMap((item) => item.values))
  const maxValue = Math.max(
    1,
    ...(resolvedType === 'waterfall'
      ? waterfallTotals
      : resolvedType === 'stacked-bar'
        ? stackedTotals
        : series.flatMap((item) => item.values)),
  )
  const valueRange = Math.max(1, maxValue - minValue)
  const valueY = (value: number) => y0 - ((value - minValue) / valueRange) * plotH
  const zeroY = valueY(0)
  if (resolvedType === 'pie' || resolvedType === 'donut') {
    const values = series[0]!.values
    const total = values.reduce((sum, value) => sum + value, 0)
    if (total <= 0) throw new Error('Pie and donut charts need a positive total.')
    let angle = -Math.PI / 2
    const cx = width / 2
    const cy = 255
    const radius = 150
    values.forEach((value, index) => {
      const next = angle + (value / total) * Math.PI * 2
      const points: number[][] = [[cx, cy]]
      const steps = Math.max(3, Math.ceil((next - angle) * 20))
      for (let step = 0; step <= steps; step += 1) {
        const a = angle + ((next - angle) * step) / steps
        points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius])
      }
      elements.push({
        kind: 'polygon',
        points,
        x: 0,
        y: 0,
        color: colors.white,
        fillColor:
          series[0]!.color === colors.blue
            ? [
                '#2563eb',
                '#f59e0b',
                '#16a34a',
                '#8b5cf6',
                '#ef4444',
                '#0891b2',
                '#ec4899',
                '#64748b',
                '#84cc16',
                '#f97316',
                '#0f766e',
                '#a855f7',
              ][index]
            : series[0]!.color,
        lineWidth: 1,
      })
      const mid = (angle + next) / 2
      elements.push(
        textShape(
          categories[index]!,
          cx + Math.cos(mid) * 185 - 40,
          cy + Math.sin(mid) * 185 - 10,
          100,
          20,
          11,
          colors.muted,
        ),
      )
      angle = next
    })
    if (resolvedType === 'donut')
      elements.push({
        kind: 'ellipse',
        x: cx - 65,
        y: cy - 65,
        width: 130,
        height: 130,
        color: colors.white,
        fillColor: colors.white,
        lineWidth: 1,
      })
    return {
      ...fmt(title, origin, width, height, categories.length, elements),
      name: 'build_chart_diagram',
    }
  }
  if (resolvedType === 'radar') {
    if (categories.length < 3 || series.some((row) => row.values.some((value) => value < 0)))
      throw new Error('Radar charts need 3-10 categories and non-negative values.')
    const cx = width / 2
    const cy = 255
    const radius = 142
    for (let ring = 1; ring <= 4; ring += 1) {
      const points = Array.from({ length: 48 }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / 48
        return [
          cx + (Math.cos(angle) * radius * ring) / 4,
          cy + (Math.sin(angle) * radius * ring) / 4,
        ]
      })
      elements.push({
        kind: 'polygon',
        points,
        x: 0,
        y: 0,
        color: colors.grid,
        fillColor: colors.white,
        opacity: 10,
        lineWidth: 1,
      })
    }
    const vertices = categories.map((_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / categories.length
      return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]
    })
    vertices.forEach(([x, y], index) => {
      elements.push({
        kind: 'line',
        x1: cx,
        y1: cy,
        x2: x,
        y2: y,
        color: colors.grid,
        lineWidth: 1,
      })
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / categories.length
      elements.push(
        textShape(
          categories[index]!,
          x + Math.cos(angle) * 30 - 48,
          y + Math.sin(angle) * 24 - 10,
          96,
          20,
          11,
          colors.muted,
        ),
      )
    })
    series.forEach((row, rowIndex) => {
      const points = row.values.map((value, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / categories.length
        const distance = (radius * value) / maxValue
        return [cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance]
      })
      for (let index = 0; index < points.length; index += 1) {
        const a = points[index]!
        const b = points[(index + 1) % points.length]!
        elements.push({
          kind: 'line',
          x1: a[0],
          y1: a[1],
          x2: b[0],
          y2: b[1],
          color: row.color,
          lineWidth: 2.5,
        })
        elements.push({
          kind: 'ellipse',
          x: a[0] - 4,
          y: a[1] - 4,
          width: 8,
          height: 8,
          color: colors.white,
          fillColor: row.color,
          lineWidth: 1.5,
        })
      }
      elements.push({
        kind: 'rect',
        x: 50 + rowIndex * 180,
        y: 62,
        width: 14,
        height: 14,
        color: row.color,
        fillColor: row.color,
        lineWidth: 1,
      })
      elements.push(textShape(row.name, 70 + rowIndex * 180, 58, 150, 22, 11, colors.muted, 'left'))
    })
    return {
      ...fmt(title, origin, width, height, categories.length * series.length, elements),
      name: 'build_chart_diagram',
    }
  }
  for (let grid = 0; grid <= 4; grid += 1) {
    const y = valueY(minValue + (valueRange * grid) / 4)
    elements.push({
      kind: 'line',
      x1: x0,
      y1: y,
      x2: x0 + plotW,
      y2: y,
      color: colors.grid,
      lineWidth: grid === 0 ? 2 : 1,
      dashed: grid > 0,
    })
    elements.push(
      textShape(
        String(Number((minValue + (valueRange * grid) / 4).toPrecision(3))),
        x0 - 55,
        y - 9,
        44,
        18,
        10,
        colors.muted,
        'right',
      ),
    )
  }
  if (minValue < 0)
    elements.push({
      kind: 'line',
      x1: x0,
      y1: zeroY,
      x2: x0 + plotW,
      y2: zeroY,
      color: colors.muted,
      lineWidth: 1.5,
    })
  elements.push({
    kind: 'line',
    x1: x0,
    y1: y0 - plotH,
    x2: x0,
    y2: y0,
    color: colors.muted,
    lineWidth: 1.5,
  })
  const slotW = plotW / categories.length
  categories.forEach((category, index) =>
    elements.push(
      textShape(category, x0 + index * slotW + 2, y0 + 10, slotW - 4, 30, 10, colors.muted),
    ),
  )
  series.forEach((entry, s) => {
    const points = entry.values.map((value, index) => [x0 + slotW * (index + 0.5), valueY(value)])
    if (
      resolvedType === 'bar' ||
      resolvedType === 'histogram' ||
      resolvedType === 'stacked-bar' ||
      resolvedType === 'waterfall'
    ) {
      if (resolvedType === 'stacked-bar') {
        entry.values.forEach((value, index) => {
          const groupW = slotW * 0.72
          const x = x0 + index * slotW + slotW * 0.14
          const lower = series.slice(0, s).reduce((sum, row) => sum + row.values[index]!, 0)
          const upper = lower + value
          elements.push({
            kind: 'rect',
            x,
            y: valueY(upper),
            width: Math.max(3, groupW - 4),
            height: Math.max(1, (value / valueRange) * plotH),
            color: entry.color,
            fillColor: entry.color,
            lineWidth: 1,
          })
        })
      } else if (resolvedType === 'waterfall') {
        entry.values.forEach((value, index) => {
          const previous = index === 0 ? 0 : waterfallTotals[index - 1]!
          const current = waterfallTotals[index]!
          const groupW = slotW * 0.62
          elements.push({
            kind: 'rect',
            x: x0 + index * slotW + slotW * 0.19,
            y: valueY(Math.max(previous, current)),
            width: groupW,
            height: Math.max(1, (Math.abs(value) / valueRange) * plotH),
            color: value >= 0 ? entry.color : '#dc2626',
            fillColor: value >= 0 ? entry.color : '#dc2626',
            lineWidth: 1,
          })
        })
      } else {
        entry.values.forEach((value, index) => {
          const gap = resolvedType === 'histogram' ? 2 : slotW * 0.14
          const groupW = (slotW - gap * 2) / series.length
          const x = x0 + index * slotW + gap + s * groupW
          const barY = value >= 0 ? valueY(value) : zeroY
          const barH = (Math.abs(value) / valueRange) * plotH
          elements.push({
            kind: 'rect',
            x,
            y: barY,
            width: Math.max(3, groupW - (resolvedType === 'histogram' ? 1 : 4)),
            height: Math.max(1, barH),
            color: entry.color,
            fillColor: entry.color,
            lineWidth: 1,
          })
        })
      }
    } else {
      if (resolvedType === 'area') {
        const areaPoints = [
          [points[0]![0], zeroY],
          ...points,
          [points[points.length - 1]![0], zeroY],
        ]
        elements.push({
          kind: 'polygon',
          points: areaPoints,
          x: 0,
          y: 0,
          color: entry.color,
          fillColor: entry.color,
          opacity: 24,
          lineWidth: 1,
        })
      }
      for (let index = 0; index < points.length - 1 && resolvedType !== 'scatter'; index += 1) {
        const a = points[index]!
        const b = points[index + 1]!
        elements.push({
          kind: 'line',
          x1: a[0],
          y1: a[1],
          x2: b[0],
          y2: b[1],
          color: entry.color,
          lineWidth: 3,
        })
      }
      points.forEach(([x, y]) =>
        elements.push({
          kind: 'ellipse',
          x: x - 5,
          y: y - 5,
          width: 10,
          height: 10,
          color: colors.white,
          fillColor: entry.color,
          lineWidth: 2,
        }),
      )
    }
    elements.push({
      kind: 'rect',
      x: x0 + 4 + s * 150,
      y: 62,
      width: 14,
      height: 14,
      color: entry.color,
      fillColor: entry.color,
      lineWidth: 1,
    })
    elements.push(textShape(entry.name, x0 + 24 + s * 150, 58, 120, 22, 11, colors.muted, 'left'))
  })
  return {
    ...fmt(title, origin, width, height, categories.length * series.length, elements),
    name: 'build_chart_diagram',
  }
}

function compileGantt(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const tasks = checkedItems(input.tasks, 'tasks', 28, (item) => ({
    id: safeId(item.id),
    label: text(item.label),
    start: Number(item.start),
    duration: Number(item.duration),
    lane: text(item.lane),
  }))
  const byId = uniqueIds(tasks, 'tasks')
  if (
    tasks.some(
      (task) =>
        !task.label ||
        !Number.isFinite(task.start) ||
        !Number.isFinite(task.duration) ||
        task.start < 0 ||
        task.duration <= 0,
    )
  ) {
    throw new Error('Every task needs a label, non-negative start, and positive finite duration.')
  }
  const dependencies = Array.isArray(input.dependencies)
    ? input.dependencies.map((entry) => ({
        from: safeId(record(entry).from),
        to: safeId(record(entry).to),
        label: text(record(entry).label),
      }))
    : []
  if (dependencies.length > 20) throw new Error('dependencies may contain at most 20 items.')
  dependencies.forEach((dependency) =>
    edgeRef(dependency.from, dependency.to, byId, 'A Gantt dependency'),
  )
  const unit = text(input.unit, 'units').slice(0, 24)
  const maxTime = Math.max(...tasks.map((task) => task.start + task.duration))
  const width = 1020
  const left = 252
  const plotWidth = width - left - 32
  const scale = plotWidth / maxTime
  const rowHeight = 40
  const top = 100
  const height = top + tasks.length * rowHeight + 40
  const row = new Map(tasks.map((task, index) => [task.id, top + index * rowHeight]))
  const elements = titleItem(title, width)
  for (let tick = 0; tick <= 5; tick += 1) {
    const value = (maxTime * tick) / 5
    const x = left + value * scale
    elements.push({
      kind: 'line',
      x1: x,
      y1: top - 18,
      x2: x,
      y2: height - 28,
      color: colors.grid,
      lineWidth: 1,
      dashed: tick > 0,
    })
    elements.push(
      textShape(
        `${Number(value.toPrecision(3))} ${unit}`,
        x - 42,
        top - 44,
        84,
        20,
        10,
        colors.muted,
      ),
    )
  }
  for (const task of tasks) {
    const y = row.get(task.id)!
    const label = task.lane ? `${task.lane} · ${task.label}` : task.label
    elements.push(textShape(label, 10, y + 4, left - 26, 28, 12, colors.ink, 'left'))
    elements.push({
      kind: 'rect',
      id: task.id,
      label: '',
      x: left + task.start * scale,
      y: y + 5,
      width: Math.max(2, task.duration * scale),
      height: 24,
      color: colors.blue,
      fillColor: colors.paleBlue,
      lineWidth: 1.5,
    })
  }
  for (const dependency of dependencies) {
    const from = byId.get(dependency.from)!
    const to = byId.get(dependency.to)!
    const y1 = row.get(from.id)! + 17
    const y2 = row.get(to.id)! + 17
    const x1 = left + (from.start + from.duration) * scale
    const x2 = left + to.start * scale
    elements.push(...arrow(x1, y1, x2, y2, dependency.label))
  }
  return {
    ...fmt(title, origin, width, height, tasks.length, elements),
    name: 'build_gantt_diagram',
  }
}

function compileHeatmap(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const columns = Array.isArray(input.columns)
    ? input.columns.map((value) => text(value)).slice(0, 6)
    : []
  if (columns.length < 1 || columns.length > 6 || columns.some((column) => !column))
    throw new Error('Heatmap columns must contain 1-6 labels.')
  const rows = checkedItems(input.rows, 'rows', 6, (item) => ({
    label: text(item.label),
    values: Array.isArray(item.values) ? item.values.map(Number) : [],
  }))
  if (
    rows.some(
      (row) =>
        !row.label ||
        row.values.length !== columns.length ||
        row.values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e9),
    )
  ) {
    throw new Error('Each heatmap row needs a label and one finite value per column.')
  }
  const values = rows.flatMap((row) => row.values)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const spread = high - low || 1
  const width = 230 + columns.length * 94
  const height = 122 + rows.length * 56
  const elements = titleItem(title, width)
  const mix = (value: number) => {
    const t = (value - low) / spread
    const from = [239, 246, 255]
    const to = [29, 78, 216]
    return `#${from
      .map((channel, index) =>
        Math.round(channel + (to[index]! - channel) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`
  }
  columns.forEach((column, index) =>
    elements.push(textShape(column, 194 + index * 94, 58, 86, 24, 11, colors.muted)),
  )
  rows.forEach((row, rowIndex) => {
    const y = 88 + rowIndex * 56
    elements.push(textShape(row.label, 24, y + 7, 160, 26, 12, colors.ink, 'left'))
    row.values.forEach((value, columnIndex) => {
      elements.push({
        kind: 'rect',
        label: String(value),
        x: 194 + columnIndex * 94,
        y,
        width: 86,
        height: 42,
        color: '#bfdbfe',
        fillColor: mix(value),
        lineWidth: 1.2,
        size: 11,
      })
    })
  })
  elements.push(
    textShape(
      `Scale: ${low} (light)  →  ${high} (dark)`,
      24,
      height - 24,
      width - 48,
      18,
      10,
      colors.muted,
      'left',
    ),
  )
  return {
    ...fmt(title, origin, width, height, rows.length * columns.length, elements),
    name: 'build_heatmap_chart',
  }
}

function compileTextDiagram(
  input: Record<string, unknown>,
  origin: DiagramPosition,
  title: string,
): DiagramCompileResult {
  const raw =
    typeof input.source === 'string'
      ? input.source.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
      : ''
  if (raw.length < 2 || raw.length > 8000)
    throw new Error('ASCII diagram source must contain 2-8000 characters.')
  if (
    [...raw].some((character) => {
      const code = character.charCodeAt(0)
      return code !== 0x09 && code !== 0x0a && (code < 0x20 || code > 0x7e)
    })
  )
    throw new Error(
      'ASCII diagram source may use printable ASCII characters, spaces, tabs, and line breaks only.',
    )
  const lines = raw.replace(/\n+$/, '').split('\n')
  if (lines.length > 48 || lines.some((line) => line.length > 120))
    throw new Error('ASCII diagrams are limited to 48 lines and 120 columns.')
  const maxColumns = Math.max(...lines.map((line) => line.length))
  const contentWidth = Math.max(320, maxColumns * 9 + 40)
  const contentHeight = lines.length * 22 + 24
  const width = Math.min(1160, Math.max(contentWidth + 24, title.length * 14))
  const elements: DiagramSceneItem[] = [
    ...titleItem(title, width),
    {
      kind: 'rect',
      x: 4,
      y: 62,
      width: contentWidth,
      height: contentHeight,
      color: colors.grid,
      fillColor: '#f8fafc',
      lineWidth: 1.5,
    },
    {
      kind: 'text',
      text: lines.join('\n'),
      preserveWhitespace: true,
      fontFamily: 3,
      textAlign: 'left',
      x: 22,
      y: 74,
      width: contentWidth - 36,
      height: contentHeight - 16,
      size: 14,
      color: colors.ink,
    },
  ]
  return {
    ...fmt(title, origin, width, contentHeight + 76, 1, elements),
    name: 'build_text_diagram',
  }
}

export function compileDiagramTool(
  name: string,
  rawInput: unknown,
  position?: DiagramPosition,
): DiagramCompileResult {
  if (
    !(DIAGRAM_TOOL_NAMES as readonly string[]).includes(name) ||
    name === 'render_mermaid_diagram'
  )
    throw new Error(`"${name}" is not a native diagram compiler.`)
  const input = record(rawInput)
  const title = text(input.title, name.replace(/^build_/, '').replaceAll('_', ' ')).slice(0, 100)
  const origin = getOrigin(input, position)
  switch (name as DiagramToolName) {
    case 'build_flow_diagram':
      return compileFlow(input, origin, title)
    case 'build_sequence_diagram':
      return compileSequence(input, origin, title)
    case 'build_use_case_diagram':
      return compileUseCase(input, origin, title)
    case 'build_requirement_diagram':
      return compileRequirements(input, origin, title)
    case 'build_uml_class_diagram':
      return compileClass(input, origin, title)
    case 'build_er_diagram':
      return compileEr(input, origin, title)
    case 'build_state_diagram':
      return compileState(input, origin, title)
    case 'build_mind_map':
      return compileMindMap(input, origin, title)
    case 'build_chart_diagram':
      return compileChart(input, origin, title)
    case 'build_gantt_diagram':
      return compileGantt(input, origin, title)
    case 'build_heatmap_chart':
      return compileHeatmap(input, origin, title)
    case 'build_text_diagram':
      return compileTextDiagram(input, origin, title)
    default:
      throw new Error(`Unsupported diagram tool "${name}".`)
  }
}
