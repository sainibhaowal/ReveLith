import { explicitlyRequestsMermaid } from './board-tool-routing'

/**
 * Drawing craft guidance for the AI Draw agent.
 *
 * The board tools can already express far more than the model reliably
 * attempts: real filters, patterns and masks in SVG, native dimension and
 * leader annotations, hatching, and a projector for genuine axonometric and
 * perspective scenes. What was missing was craft knowledge - how a section
 * drawing is annotated, how an isometric camera is set up, how a palette is
 * kept coherent - so this module selects a short domain brief per request and
 * appends it to the user message (agent-core appends buildContext output to the
 * instruction).
 *
 * Selection is keyword-scored and deterministic. When nothing matches, no
 * guidance is added, so ordinary questions stay cheap.
 */

export interface DrawingSkill {
  id: string
  title: string
  /** Concise capability summary shown in the Draw skills directory. */
  description: string
  /** Lower-case terms matched against the instruction. */
  keywords: string[]
  guidance: string
}

/** Shared colour discipline so every brief produces a coherent board. */
const PALETTE =
  'Palette discipline: one dominant hue plus one accent and neutrals. Ink and labels #1e1b4b; structure #334155; ' +
  'surfaces #e2e8f0 / #f1f5f9; accent #2563eb; warm highlight #f59e0b; success #16a34a; warning #dc2626. ' +
  'Use 3-4 fills per drawing, not ten. Light comes from the upper left: brighter faces up, darker faces down and right.'

export const DRAWING_SKILLS: DrawingSkill[] = [
  {
    id: 'architecture',
    title: 'Architectural concept boards',
    description:
      'Floor plans, elevations, sections, site layouts, and architectural concept presentations.',
    keywords: [
      'architecture',
      'architectural',
      'house',
      'building',
      'cliffside',
      'villa',
      'residence',
      'facade',
      'elevation',
      'section',
      'plan',
      'floor plan',
      'site',
      'concept board',
      'terrace',
      'cantilever',
      'roof',
      'storey',
      'story',
      'interior',
      'landscape design',
      'urban',
    ],
    guidance:
      'Architectural brief: first decide whether the user wants a finished architectural image or a technical/editable drawing. ' +
      'For a rendered house, cabin, or landscape scene, use generate_image when available; describe the camera, coherent perspective, ' +
      'building materials, window construction, roof geometry, terrain layers, atmosphere, and light direction. Do not substitute a ' +
      'few rectangles and triangles for architectural detail. Use build_drawboard_scene and scene3d for floor plans, elevations, ' +
      'sections, measured drawings, or when separate editable geometry is requested. Keep dimensions and leaders outside the main ' +
      'image unless the user asks for annotations. ' +
      PALETTE,
  },
  {
    id: 'engineering',
    title: 'Technical and engineering drawings',
    description:
      'Dimensioned parts, assemblies, sections, schematics, and annotated technical drawings.',
    keywords: [
      'engineering',
      'technical drawing',
      'drafting',
      'draughting',
      'tolerance',
      'detail',
      'assembly',
      'exploded',
      'p&id',
      'pid',
      'piping',
      'schematic',
      'mechanical',
      'part',
      'section drawing',
      'dimension',
      'annotate',
      'shop drawing',
      'ga drawing',
      'weld',
      'structural',
      'beam',
      'column',
      'slab',
      'foundation',
    ],
    guidance:
      'Technical drawing brief: accuracy over decoration. Use kind:"dimension" for every measured span - set scale to the ' +
      'drawing units per canvas pixel and units to the unit suffix (for example scale 0.01 with units "m"), let it draw its own ' +
      'witness lines and arrowheads, and add text only when you must override the computed value. Diminish dimensions from the ' +
      'smallest to the largest so extension lines never cross. Use kind:"leader" for numbered part callouts and notes. ' +
      'Cut and section faces take hatch:"cross-hatch"; adjacent parts must use different hatch directions or densities, never the ' +
      'same. Keep line work crisp and consistent: strokeWidth 1-2 for outlines, thinner for centre lines, and orthogonal geometry ' +
      'aligned to whole pixels. Label the drawing with a title block (drawing name, scale, units) in its own text element. ' +
      'Use kind:"scene3d" with projection:"isometric" for pictorial and exploded views instead of guessing coordinates. ' +
      PALETTE,
  },
  {
    id: 'isometric-3d',
    title: 'Isometric and perspective scenes',
    description:
      'Editable 3D-like scenes, axonometric views, exploded views, and perspective layouts.',
    keywords: [
      'isometric',
      'axon',
      'axonometric',
      'perspective',
      '3d',
      'three dimensional',
      'three-dimensional',
      'depth',
      'volume',
      'camera',
      'voxel',
      'massing',
      'exploded view',
      'scene3d',
    ],
    guidance:
      '3D brief: for a finished 3D-looking illustration, use generate_image when available and specify camera, perspective, materials, ' +
      'occlusion, contact shadows, and light direction. Reserve kind:"scene3d" for technical/massing drawings or when the user asks ' +
      'for editable geometry; never hand-compute projected coordinates in that case. ' +
      'Set projection:"isometric" for clean technical isometrics (the default camera is the true 35.264 degree elevation - leave ' +
      'yaw/pitch alone unless the brief asks for a specific view), projection:"dimetric" for a gentler angle, and ' +
      'projection:"perspective" with fov 25-45 for interior or hero views. Place primitives with at, sized in world units, and ' +
      'build complex forms from several boxes rather than one: box for walls and slabs, prism for columns, tubes and trees ' +
      '(radiusTop 0 makes a cone, radiusTop below radius makes a frustum, sides 4 makes a pyramid). Keep hidden:"dash" so hidden ' +
      'edges read as dashed construction lines, or hidden:"hide" for a clean illustration; leave edges:true so the linework stays ' +
      'crisp and editable. Shade with a single light direction and use one base colour per material, letting the projector derive ' +
      'the face values. Set scale so the whole model lands inside 0-1400 x 0-900. ' +
      PALETTE,
  },
  {
    id: 'illustration',
    title: 'Vector illustration craft',
    description:
      'Layered vector art, icons, posters, logos, landscapes, characters, and visual scenes.',
    keywords: [
      'illustration',
      'illustrate',
      'artwork',
      'art',
      'artist',
      'painterly',
      'poster',
      'scene',
      'landscape',
      'sunset',
      'sunrise',
      'mountain',
      'forest',
      'sky',
      'character',
      'creature',
      'portrait',
      'stylised',
      'stylized',
      'flat design',
      'mascot',
      'badge',
      'emblem',
    ],
    guidance:
      'Illustration brief: pick the medium first. For photorealistic, painterly or photographic-looking art use generate_image with one detailed English prompt covering subject, style, lighting and composition - it places the finished image on the board. For crisp vector art, diagrams, logos, icons and anything that must stay editable, use one add_vector_artwork call. ' +
      'For vector work, create at least four visual depth layers - background, distant shapes, mid subject, foreground detail - and use overlap, scale ' +
      'change and lighter distant colours for aerial perspective. Build depth with gradients (linearGradient sky washes, ' +
      'radialGradient for sun and glow) rather than flat blocks, and use feGaussianBlur for soft shadow and glow, ' +
      'feDropShadow for cast shadows, feTurbulence for texture, grain and cloud, and feColorMatrix or feBlend for tinting and ' +
      'atmosphere. Give every gradient and filter an id and reference it with url(#id). Hatched textures use pattern; hard edges ' +
      'inside a shape use clipPath; repeated detail (trees, windows, waves, tiles) belongs in symbol plus use. ' +
      'rgb()/rgba()/hsl() colours and inline style are allowed, so keep alpha work readable. Keep the silhouette readable at ' +
      'thumbnail size and put the highest contrast at the subject. Let the requested art direction determine the palette; do not impose a generic corporate palette.',
  },
  {
    id: 'diagram',
    title: 'System architecture and flow diagrams',
    description: 'System and process flows, networks, dependencies, decision trees, and mind maps.',
    keywords: [
      'diagram',
      'flowchart',
      'flow chart',
      'c4',
      'sequence',
      'erd',
      'entity relationship',
      'network',
      'topology',
      'system architecture',
      'architecture diagram',
      'mind map',
      'mindmap',
      'process',
      'pipeline',
      'uml',
      'state machine',
      'swimlane',
      'org chart',
      'decision tree',
    ],
    guidance:
      'Diagram brief: choose the dedicated native tool that matches the notation (sequence, use-case, class, ER, state, mind map, ' +
      'flow, Gantt, heatmap, chart, or ASCII layout) instead of hand-positioning generic shapes. Preserve explicit IDs and semantics, label every relationship, ' +
      'keep hierarchy and reading direction clear, and let deterministic layout and validation handle geometry. If several diagram ' +
      'types are requested, invoke every matching specialist. ' +
      PALETTE,
  },
  {
    id: 'requirements-model',
    title: 'Requirements engineering models',
    description:
      'Stakeholders, goals, constraints, requirement traceability, and verification views.',
    keywords: [
      'requirements engineering',
      'requirement engineering',
      'requirements model',
      'requirement diagram',
      'requirements diagram',
      'traceability diagram',
      'stakeholder requirement',
      'traceability',
      'functional requirement',
      'nonfunctional requirement',
    ],
    guidance:
      'Requirements-model brief: distinguish stakeholders, system boundary, goals, functional behavior, constraints, and verification evidence. Keep requirement labels atomic and traceable; never imply AI approval replaces human stakeholder review. For multiple requested views, build each as its own editable native diagram and keep names and actors consistent.',
  },
  {
    id: 'uml-sequence',
    title: 'UML sequence diagrams',
    description:
      'Participants, lifelines, ordered messages, return calls, and asynchronous interactions.',
    keywords: [
      'sequence diagram',
      'uml sequence',
      'lifeline',
      'participant',
      'return message',
      'asynchronous message',
    ],
    guidance:
      'Sequence brief: put participants in stable left-to-right order, retain the specified call order, number messages top-to-bottom, use dashed return arrows, and keep labels readable. Distinguish calls, returns, and asynchronous signals; do not invent actors or approval steps.',
  },
  {
    id: 'uml-use-case',
    title: 'UML use-case diagrams',
    description: 'Actors, system boundaries, use cases, and the relationships between them.',
    keywords: [
      'use case diagram',
      'use-case diagram',
      'uml use case',
      'system boundary',
      'actor association',
    ],
    guidance:
      'Use-case brief: actors stay outside the system boundary; use cases are verb phrases inside it. Connect only valid actor-to-use-case associations. Show include/extend semantics only when requested and keep the system name explicit.',
  },
  {
    id: 'uml-class-er',
    title: 'UML class and ER models',
    description:
      'Classes and entities with attributes, keys, relationship types, and multiplicities.',
    keywords: [
      'class diagram',
      'uml class',
      'entity relationship',
      'erd',
      'database schema diagram',
      'class model',
    ],
    guidance:
      'Model brief: keep class/entity names singular and compartments concise. Preserve attribute types, primary/foreign-key meaning, and supplied multiplicities. Use relationship kinds consistently and validate every endpoint before drawing.',
  },
  {
    id: 'data-charts',
    title: 'Data chart selection',
    description:
      'Bar, line, area, scatter, pie, donut, stacked-bar, histogram, radar, waterfall, Gantt, and heatmap charts.',
    keywords: [
      'bar chart',
      'line chart',
      'area chart',
      'scatter plot',
      'pie chart',
      'donut chart',
      'radar chart',
      'histogram',
      'waterfall chart',
      'stacked bar',
      'heatmap chart',
      'gantt chart',
      'chart of',
      'graph of',
    ],
    guidance:
      'Chart brief: select the requested chart type, preserve supplied categories and exact numeric values, and include a title, visible scale/grid cues, and a compact legend. Use the native Gantt or heatmap tool for those layouts. Never fabricate or silently aggregate data.',
  },
  {
    id: 'mermaid',
    title: 'Mermaid source diagrams',
    description: 'Diagrams generated from Mermaid syntax with local parsing and validation.',
    keywords: ['mermaid source', 'mermaid syntax', 'mermaid code', 'mermaid diagram'],
    guidance:
      'Mermaid brief: send source to render_mermaid_diagram for local strict-mode parsing; do not draw Mermaid syntax as labels. Correct renderer errors and retry. Prefer dedicated UML builders when individually editable elements are requested.',
  },
  {
    id: 'ascii-diagram',
    title: 'Monospaced ASCII diagrams',
    description:
      'Fixed-width text diagrams that preserve spacing, connectors, and label alignment.',
    keywords: ['ascii diagram', 'ascii flowchart', 'text diagram', 'monospaced diagram'],
    guidance:
      'ASCII brief: preserve every space, line break, connector, and label in build_text_diagram. Use a consistent monospace frame and validate alignment at the original text width; do not normalize indentation or replace ASCII connectors with images.',
  },
  {
    id: 'design',
    title: 'Product and UI design boards',
    description:
      'Wireframes, UI layouts, design systems, component boards, brand boards, and storyboards.',
    keywords: [
      'ui',
      'ux',
      'wireframe',
      'mockup',
      'mock-up',
      'design system',
      'moodboard',
      'mood board',
      'style guide',
      'app design',
      'screen',
      'dashboard layout',
      'component',
      'typography',
      'brand',
      'logo',
      'landing page',
      'user flow',
      'persona',
      'storyboard',
    ],
    guidance:
      'Design brief: show the work in a proper board arrangement - a title, a short intent line, then labelled sections with ' +
      'generous margins and a strict 8px spacing rhythm. Frames are rect with no fill and a 1-2px stroke; annotate each frame ' +
      'with a leader rather than floating text. Keep type scale explicit and small: 32 title, 20 section, 16 label, 13 note. ' +
      'Swatches are small rects laid on a single row with hex labels beneath. Components sit on a light panel (#f1f5f9) so they ' +
      'read against the canvas. Prefer several small, well-aligned groups over one busy diagram, and reserve the accent colour ' +
      'for the single most important element on the board. ' +
      PALETTE,
  },
]

/** Tokenize once: whole words for single-term keywords, padded text for phrases. */
function tokenize(instruction: string): { words: Set<string>; padded: string } {
  const normalized = instruction
    .toLowerCase()
    .replace(/[^a-z0-9&+]+/g, ' ')
    .trim()
  return { words: new Set(normalized ? normalized.split(' ') : []), padded: ` ${normalized} ` }
}

/**
 * Score a skill against an instruction. Keyword matching is word-boundary
 * based, so "art" cannot match "start" and "plan" cannot match "plane".
 * Longer keywords and multi-word phrases weigh more.
 */
function scoreSkill(skill: DrawingSkill, words: Set<string>, padded: string): number {
  let score = 0
  for (const keyword of skill.keywords) {
    const matched = keyword.includes(' ') ? padded.includes(` ${keyword} `) : words.has(keyword)
    if (!matched) continue
    score += keyword.length + keyword.split(' ').length * 4
  }
  return score
}

/**
 * Pick the most relevant briefs for one instruction. Ties fall back to
 * declaration order, so the result is stable for the same input.
 */
export function selectDrawingSkills(instruction: string, limit = 3): DrawingSkill[] {
  const { words, padded } = tokenize(instruction)
  if (words.size === 0) return []
  const mermaidOptIn = explicitlyRequestsMermaid(instruction)
  const scored = DRAWING_SKILLS.map((skill, index) => ({
    skill,
    index,
    score: scoreSkill(skill, words, padded),
  }))
    .filter((entry) => entry.score > 0 && (entry.skill.id !== 'mermaid' || mermaidOptIn))
    .sort((left, right) => right.score - left.score || left.index - right.index)
  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.skill)
}

/** The guidance block appended to the user message, or '' when nothing matches. */
export function buildDrawingGuidance(instruction: string, limit = 3): string {
  const skills = selectDrawingSkills(instruction, limit)
  if (!skills.length) return ''
  return `Drawing guidance for this request (${skills.map((skill) => skill.title).join(' + ')}):\n${skills
    .map((skill) => `- ${skill.guidance}`)
    .join('\n')}`
}
