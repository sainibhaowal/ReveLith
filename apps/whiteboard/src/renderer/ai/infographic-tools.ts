import type { AgentToolDef } from '@revelith/agent-core'

/**
 * A content-first native poster builder.  It deliberately has no sample
 * subject matter: every visible word must come from the tool call.
 */
export const INFOGRAPHIC_TOOL_NAME = 'build_infographic' as const

export const INFOGRAPHIC_TOOL_DEF: AgentToolDef = {
  name: INFOGRAPHIC_TOOL_NAME,
  description:
    'Build one polished, editable native infographic or multi-section poster from the CURRENT user brief. Supply only content explicitly provided or confirmed in this conversation; never invent example facts, roadmaps, or data. Use this instead of chaining several diagram builders for a single poster. Every section is laid out as editable shapes, labels, and connectors.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 140 },
      subtitle: { type: 'string', maxLength: 220 },
      orientation: { type: 'string', enum: ['portrait', 'landscape'] },
      position: {
        type: 'object',
        properties: {
          x: { type: 'number', minimum: -50000, maximum: 50000 },
          y: { type: 'number', minimum: -50000, maximum: 50000 },
        },
        additionalProperties: false,
      },
      sections: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string', minLength: 1, maxLength: 120 },
            summary: { type: 'string', maxLength: 260 },
            layout: {
              type: 'string',
              enum: ['flow', 'cards', 'timeline', 'comparison', 'notes'],
            },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 12,
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', minLength: 1, maxLength: 180 },
                  detail: { type: 'string', maxLength: 280 },
                  tone: { type: 'string', enum: ['primary', 'accent', 'muted'] },
                },
                required: ['label'],
                additionalProperties: false,
              },
            },
          },
          required: ['heading', 'items'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'sections'],
    additionalProperties: false,
  },
}

export type InfographicSceneItem = Record<string, unknown>

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

const palette = {
  ink: '#172554',
  line: '#94a3b8',
  primary: '#2563eb',
  primaryFill: '#eff6ff',
  accent: '#d97706',
  accentFill: '#fffbeb',
  muted: '#64748b',
  mutedFill: '#f8fafc',
}

/** Compile supplied content into a bounded portrait/landscape native scene. */
export function compileInfographic(
  input: Record<string, unknown>,
  origin: { x: number; y: number },
): { title: string; width: number; height: number; elements: InfographicSceneItem[] } {
  const title = clean(input.title, 140)
  const rawSections = Array.isArray(input.sections) ? input.sections : []
  if (!title || rawSections.length < 1 || rawSections.length > 8)
    throw new Error('An infographic needs a title and 1-8 content sections.')
  const portrait = input.orientation !== 'landscape'
  const width = portrait ? 1120 : 1440
  const margin = 48
  const inner = width - margin * 2
  const elements: InfographicSceneItem[] = [
    {
      kind: 'text',
      x: origin.x + margin,
      y: origin.y + 34,
      text: title,
      size: 34,
      color: palette.ink,
    },
  ]
  const subtitle = clean(input.subtitle, 220)
  if (subtitle)
    elements.push({
      kind: 'text',
      x: origin.x + margin,
      y: origin.y + 82,
      text: subtitle,
      size: 18,
      color: palette.muted,
    })
  let cursorY = origin.y + (subtitle ? 128 : 108)

  for (const raw of rawSections) {
    const section = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const heading = clean(section.heading, 120)
    const items = Array.isArray(section.items) ? section.items : []
    if (!heading || items.length < 1 || items.length > 12)
      throw new Error('Every infographic section needs a heading and 1-12 items.')
    const layout = ['flow', 'cards', 'timeline', 'comparison', 'notes'].includes(
      String(section.layout),
    )
      ? String(section.layout)
      : 'cards'
    const cols =
      layout === 'flow' || layout === 'timeline'
        ? Math.min(4, items.length)
        : Math.min(3, items.length)
    const rows = Math.ceil(items.length / cols)
    const cardGap = 22
    const cardW = Math.floor((inner - cardGap * (cols - 1)) / cols)
    const cardH = 82
    const summary = clean(section.summary, 260)
    const headerH = summary ? 66 : 42
    const sectionH = headerH + rows * cardH + Math.max(0, rows - 1) * cardGap + 34
    elements.push({
      kind: 'line',
      x1: origin.x + margin,
      y1: cursorY,
      x2: origin.x + width - margin,
      y2: cursorY,
      color: palette.line,
      strokeWidth: 1,
    })
    elements.push({
      kind: 'text',
      x: origin.x + margin,
      y: cursorY + 14,
      text: heading,
      size: 22,
      color: palette.ink,
    })
    if (summary)
      elements.push({
        kind: 'text',
        x: origin.x + margin,
        y: cursorY + 42,
        text: summary,
        size: 15,
        color: palette.muted,
      })
    const cardY = cursorY + headerH
    items.forEach((rawItem, index) => {
      const item =
        rawItem && typeof rawItem === 'object' ? (rawItem as Record<string, unknown>) : {}
      const label = clean(item.label, 180)
      if (!label) throw new Error('Every infographic item needs a visible label.')
      const detail = clean(item.detail, 280)
      const tone = clean(item.tone, 16)
      const accent = tone === 'accent'
      const muted = tone === 'muted'
      const col = index % cols
      const row = Math.floor(index / cols)
      const x = origin.x + margin + col * (cardW + cardGap)
      const y = cardY + row * (cardH + cardGap)
      const color = accent ? palette.accent : muted ? palette.muted : palette.primary
      const fill = accent ? palette.accentFill : muted ? palette.mutedFill : palette.primaryFill
      elements.push({
        kind: 'rect',
        x,
        y,
        width: cardW,
        height: cardH,
        label: detail ? `${label}\n${detail}` : label,
        color,
        fill,
        size: detail ? 15 : 17,
        strokeWidth: 2,
        diagramNode: true,
      })
      if ((layout === 'flow' || layout === 'timeline') && col > 0) {
        const previousX = x - cardGap
        elements.push({
          kind: 'arrow',
          x1: previousX,
          y1: y + cardH / 2,
          x2: x - 4,
          y2: y + cardH / 2,
          color,
          strokeWidth: 2,
        })
      }
    })
    cursorY += sectionH
  }
  const height = Math.ceil(cursorY - origin.y + 28)
  if (elements.length > 120)
    throw new Error('Infographic exceeds the 120-element native board safety limit.')
  return { title, width, height, elements }
}
