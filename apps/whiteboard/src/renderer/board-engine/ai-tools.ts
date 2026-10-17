// ReveLith Drawboard — complete board tool schema + executor.
// The model chooses dynamically every turn from the list exposed for the
// request (see board-tool-routing); tools fire only when the task needs them.
import type { AgentToolCall, AgentToolDef } from '@revelith/agent-core'
import { restore } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI as BoardApi } from '@excalidraw/excalidraw/types'
import type { StagedBoardImage } from './images'
import { BOARD_TOOL_NAMES, resolveBoardToolName } from '../ai/board-tool-routing'
import { compileDiagramTool, DIAGRAM_TOOL_DEFS, DIAGRAM_TOOL_NAMES } from '../ai/diagram-tools'
import {
  compileInfographic,
  INFOGRAPHIC_TOOL_DEF,
  INFOGRAPHIC_TOOL_NAME,
} from '../ai/infographic-tools'
import { placeImagesOnBoard, readBoardImageDimensions } from './images'
import { parseScene3dSpec, projectScene3d } from './scene3d'
import { decomposeVectorSvg, explainVectorFallback, type Primitive } from './svg-decompose'
import {
  solveSketch,
  solveWithMovedPoint,
  type Constraint,
  type Sketch,
  type SketchPoint,
} from './constraint-solver'
import { withSketchModel, type LiveElement, type SketchModel } from './sketch-live'
import { normalizeBoardElementPoints } from './element-geometry'
import {
  alignElements,
  arrangeElements,
  deleteElements,
  distributeElements,
  duplicateElements,
  flipElements,
  groupElements,
  getBounds,
  selectAllIds,
  setLocked,
  setOpacity,
  scaleElements,
  setStrokeWidth,
  setTextSize,
  styleElements,
  ungroupElements,
  type Alignment,
  type ArrangeOp,
  type BoardEl,
} from '../ribbon/board-actions'

export interface BoardHistoryLike {
  undo(): readonly unknown[] | null
  redo(): readonly unknown[] | null
}

/**
 * Natural-language synonyms for the scene discriminators. A model that says
 * "rectangle" means `rect`; refusing it left the user with no drawing at all.
 */
const SCENE_KIND_ALIASES: Record<string, string> = {
  rectangle: 'rect',
  rect: 'rect',
  square: 'rect',
  box: 'rect',
  roundedrect: 'rect',
  roundrect: 'rect',
  bar: 'rect',
  oval: 'ellipse',
  // NOTE: circle is deliberately NOT aliased: it has its own radius-based
  // geometry handling further down, and rewriting the spelling broke it.
  dot: 'ellipse',
  triangle: 'polygon',
  polygone: 'polygon',
  shape: 'polygon',
  label: 'text',
  caption: 'text',
  title: 'text',
  heading: 'text',
  note: 'text',
  free: 'freedraw',
  draw: 'freedraw',
  drawing: 'freedraw',
  scribble: 'freedraw',
  stroke: 'freedraw',
  connector: 'arrow',
  edge: 'arrow',
  link: 'arrow',
  leader: 'leader',
  measure: 'dimension',
  measurement: 'dimension',
  iso: 'scene3d',
  '3d': 'scene3d',
  model: 'scene3d',
  box3d: 'scene3d',
}

/** Every discriminator the scene builder accepts, for a self-correcting error. */
export const SCENE_KINDS = [
  'rect',
  'ellipse',
  'circle',
  'diamond',
  'line',
  'arrow',
  'text',
  'polygon',
  'path',
  'freedraw',
  'sticky',
  'dimension',
  'leader',
  'scene3d',
  'sketch',
] as const

function inspectNativeLayout(elements: readonly BoardEl[]): Record<string, unknown> {
  const visible = elements.filter((element) => !element.isDeleted && getBounds(element))
  const bounds = visible.map((element) => ({ element, bounds: getBounds(element)! }))
  if (!bounds.length) return { elementCount: 0, status: 'empty', issues: [] }
  const content = bounds.reduce(
    (box, item) => ({
      minX: Math.min(box.minX, item.bounds.minX),
      minY: Math.min(box.minY, item.bounds.minY),
      maxX: Math.max(box.maxX, item.bounds.maxX),
      maxY: Math.max(box.maxY, item.bounds.maxY),
    }),
    { ...bounds[0]!.bounds },
  )
  const issues: string[] = []
  const tinyText = bounds.filter(
    (item) => item.element.type === 'text' && Number(item.element.fontSize ?? 20) < 12,
  )
  if (tinyText.length)
    issues.push(`${tinyText.length} text element(s) are below 12px and may be unreadable.`)
  let overlaps = 0
  for (let i = 0; i < bounds.length; i += 1)
    for (let j = i + 1; j < bounds.length; j += 1) {
      const a = bounds[i]!,
        b = bounds[j]!
      if (
        a.element.type === 'arrow' ||
        a.element.type === 'line' ||
        b.element.type === 'arrow' ||
        b.element.type === 'line'
      )
        continue
      if (a.element.containerId || b.element.containerId) continue
      const width = Math.min(a.bounds.maxX, b.bounds.maxX) - Math.max(a.bounds.minX, b.bounds.minX)
      const height = Math.min(a.bounds.maxY, b.bounds.maxY) - Math.max(a.bounds.minY, b.bounds.minY)
      if (width > 8 && height > 8) overlaps += 1
    }
  if (overlaps) issues.push(`${overlaps} overlapping unbound object pair(s) detected.`)
  const width = Math.round(content.maxX - content.minX),
    height = Math.round(content.maxY - content.minY)
  if (width > 5000 || height > 5000)
    issues.push('Content bounds are extremely large; inspect for duplicated or distant elements.')
  return {
    elementCount: visible.length,
    bounds: { ...content, width, height },
    status: issues.length ? 'needs-repair' : 'healthy',
    issues,
  }
}
export const BOARD_TOOL_DEFS: AgentToolDef[] = [
  ...DIAGRAM_TOOL_DEFS,
  INFOGRAPHIC_TOOL_DEF,
  {
    name: 'read_drawboard',
    description:
      'Read the full board inventory (ids, types, text, positions). Call this first before editing, moving, or deleting anything.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'inspect_board_visual',
    description:
      'Render the current board to a temporary image and ask the configured vision provider to inspect composition, legibility, overlaps, alignment, visual hierarchy, and drawing quality. Use before or after visual repairs when this tool is available. It does not change the board.',
    inputSchema: {
      type: 'object',
      properties: {
        requirements: {
          type: 'string',
          description: 'What to inspect, including the user goal and any visible defects to check.',
        },
      },
      required: ['requirements'],
    },
  },
  {
    name: 'inspect_board_layout',
    description:
      'Inspect native board geometry locally without sending the drawing anywhere. Reports content bounds, tiny text, overlapping unbound objects, and distant outliers. Call after every substantial diagram/infographic build and after repairs.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_board_element',
    description:
      'Get the full detail of one board element by id (exact fields, text, geometry). Use after read_drawboard when you need precision.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'add_board_text',
    description:
      'Add a text label at canvas coordinates in CSS pixels (visible area is roughly 0-1200 x 0-800).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        color: { type: 'string' },
        size: { type: 'integer', minimum: 8, maximum: 240 },
      },
      required: ['text'],
    },
  },
  {
    name: 'add_sticky_note',
    description: 'Add a sticky note (colored rectangle with bound text) at canvas coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        color: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'add_board_shape',
    description:
      'Add a line, rectangle, ellipse, diamond, or arrow between two canvas points. Arrows get an arrowhead at (x2, y2).',
    inputSchema: {
      type: 'object',
      properties: {
        shape: { type: 'string', enum: ['line', 'rect', 'ellipse', 'diamond', 'arrow'] },
        x1: { type: 'number' },
        y1: { type: 'number' },
        x2: { type: 'number' },
        y2: { type: 'number' },
        color: { type: 'string' },
        width: { type: 'number', minimum: 1, maximum: 32 },
      },
      required: ['shape', 'x1', 'y1', 'x2', 'y2'],
    },
  },
  {
    name: 'add_freedraw',
    description:
      'Draw a freehand pen stroke through 2-200 canvas points in order (signatures, underlines, doodles, curves).',
    inputSchema: {
      type: 'object',
      properties: {
        points: {
          type: 'array',
          minItems: 2,
          maxItems: 200,
          items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
        },
        color: { type: 'string' },
        width: { type: 'number', minimum: 1, maximum: 32 },
      },
      required: ['points'],
    },
  },
  {
    name: 'build_drawboard_scene',
    description:
      'Create a composed visual in one board update (maximum 120 items). Use for diagrams, flowcharts, mind maps, architecture, engineering drawings, landscapes, illustrations, and requests with 5 or more visual items. Every item must include kind (for example {kind:"text",text:"Title"}). Supported kinds: text, rect, ellipse/circle, diamond, line, arrow, polygon, path, sticky, freedraw, dimension, leader, scene3d, sketch. Polygon/path/freedraw points must be coordinate pairs such as [[0,800],[1400,800],[1000,600]]; never flatten them into [0,800,1400,800,...]. A circle uses center x/y plus radius. Closed path loops become filled polygons; open paths become freehand strokes. dimension draws a measured span between (x1,y1) and (x2,y2) with witness lines, arrowheads and an auto-computed value label; pass offset for how far the line sits from the span, scale (drawing units per canvas pixel) and units to label it, or text to override the label. leader points a labelled callout at (x,y) from a text anchor at labelX/labelY. rect/ellipse/diamond accept hatch: hachure, cross-hatch, zigzag or dots for section hatching. Use fillColor and color (or strokeStyle) for colors and lineWidth (or strokeWidth) for outlines. Coordinates are canvas CSS pixels; use layered fills and spacing for depth. One call creates the whole scene and is one undo step.',
    inputSchema: {
      type: 'object',
      properties: {
        elements: {
          type: 'array',
          minItems: 1,
          maxItems: 120,
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: [
                  'text',
                  'rect',
                  'ellipse',
                  'circle',
                  'diamond',
                  'line',
                  'arrow',
                  'polygon',
                  'path',
                  'sticky',
                  'freedraw',
                  'dimension',
                  'leader',
                  'scene3d',
                  'sketch',
                ],
              },
              text: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              radius: { type: 'number', minimum: 1, maximum: 2500 },
              size: { type: 'integer', minimum: 8, maximum: 240 },
              color: { type: 'string' },
              strokeStyle: { type: 'string' },
              fillColor: { type: 'string' },
              lineWidth: { type: 'number', minimum: 1, maximum: 32 },
              strokeWidth: { type: 'number', minimum: 1, maximum: 32 },
              opacity: { type: 'integer', minimum: 0, maximum: 100 },
              points: {
                type: 'array',
                minItems: 2,
                maxItems: 1000,
                items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
              },
              x1: { type: 'number', description: 'dimension: first measured point' },
              y1: { type: 'number' },
              x2: { type: 'number', description: 'dimension: second measured point' },
              y2: { type: 'number' },
              offset: {
                type: 'number',
                description: 'dimension: perpendicular offset of the dimension line',
              },
              overshoot: {
                type: 'number',
                description: 'dimension: how far witness lines pass the dimension line',
              },
              arrowSize: { type: 'number', description: 'dimension: arrowhead barb length' },
              labelGap: {
                type: 'number',
                description: 'dimension: gap between the line and its value label',
              },
              scale: { type: 'number', description: 'dimension: drawing units per canvas pixel' },
              units: {
                type: 'string',
                description: 'dimension: unit suffix for the auto label, e.g. mm or m',
              },
              labelColor: { type: 'string' },
              labelX: { type: 'number', description: 'leader: text anchor position' },
              labelY: { type: 'number' },
              dotSize: { type: 'number', description: 'leader: target dot diameter' },
              hatch: {
                type: 'string',
                enum: ['hachure', 'cross-hatch', 'zigzag', 'dots', 'solid'],
                description: 'fill pattern for rect/ellipse/diamond',
              },
              projection: {
                type: 'string',
                enum: ['isometric', 'dimetric', 'perspective'],
                description: 'scene3d: camera projection',
              },
              yaw: {
                type: 'number',
                description: 'scene3d: camera rotation about the vertical axis, degrees',
              },
              pitch: {
                type: 'number',
                description: 'scene3d: camera elevation above the horizon, degrees',
              },
              distance: { type: 'number', description: 'scene3d: camera distance from the target' },
              fov: {
                type: 'number',
                description: 'scene3d: perspective field of view in degrees (overrides distance)',
              },
              target: {
                type: 'array',
                items: { type: 'number' },
                description: 'scene3d: world point the camera looks at',
              },
              light: {
                type: 'array',
                items: { type: 'number' },
                description: 'scene3d: light direction for face shading',
              },
              ambient: { type: 'number', description: 'scene3d: ambient light 0-1 (default 0.38)' },
              hidden: {
                type: 'string',
                enum: ['hide', 'dash', 'show'],
                description: 'scene3d: how to treat hidden edges and faces',
              },
              edges: {
                type: 'boolean',
                description: 'scene3d: draw crisp editable edge lines over the shaded faces',
              },
              edgeColor: { type: 'string' },
              objects: {
                type: 'array',
                description: 'scene3d: world-space primitives',
                items: { type: 'object' },
              },
              sketchPoints: {
                type: 'array',
                description: 'sketch: [{id, x, y, fixed?}] - the solver variables',
                items: { type: 'object' },
              },
              constraints: {
                type: 'array',
                description:
                  'sketch: [{kind, ...pointIds, value?}] - fixed, coincident, horizontal, vertical, distance, pointOnLine, parallel, perpendicular, equalLength, angle, midpoint, radius',
                items: { type: 'object' },
              },
              segments: {
                type: 'array',
                description: 'sketch: [{a, b}] segments drawn between solved points',
                items: { type: 'object' },
              },
              circles: {
                type: 'array',
                description: 'sketch: [{center, rim}] circles from solved points',
                items: { type: 'object' },
              },
              dimensions: {
                type: 'array',
                description:
                  'sketch: [{a, b, offset?, scale?, units?}] associative dimension annotations',
                items: { type: 'object' },
              },
              move: {
                type: 'object',
                description:
                  'sketch: {point, to:[x,y]} to drag a point and re-solve, keeping every dimension',
              },
            },
            required: ['kind'],
          },
        },
      },
      required: ['elements'],
    },
  },
  {
    name: 'add_vector_artwork',
    description:
      'Create detailed original 2D vector artwork as one scalable board object. Use for illustrations, architectural scenes, landscapes, organic curves, layered lighting, gradients, and 3D-looking perspective. Supply complete SVG with viewBox, paths/shapes/text, and gradients; use only SVG vector elements (no scripts, external links, images, or embedded HTML). The renderer sanitizes and validates the SVG before placing it.',
    inputSchema: {
      type: 'object',
      properties: {
        svg: { type: 'string', minLength: 40, maxLength: 100000 },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['svg'],
    },
  },
  {
    name: 'add_board_image',
    description:
      'Place an image the user attached to this message onto the board. Match `name` against the attached filename (substring is fine). Only call when the user attached images.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        maxWidth: { type: 'number', minimum: 64, maximum: 1200 },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_board_image_from_url',
    description:
      'Fetch and place a real image URL, usually selected from image_search results. Use only http(s) image URLs returned by search; user attachments belong in add_board_image.',
    inputSchema: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'imageUrl from image_search' },
        title: {
          type: 'string',
          description: 'Optional short image title for accessibility and history',
        },
        x: { type: 'number' },
        y: { type: 'number' },
        maxWidth: { type: 'number', minimum: 64, maximum: 1200 },
      },
      required: ['imageUrl'],
    },
  },
  {
    name: 'generate_image',
    description:
      'Generate an image with AI from a text prompt and place it on the board. Use for illustration/diagram-style art that image_search cannot find, or when the user asks to generate/draw a picture. Requires an image provider configured in Settings.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed English description of the image (subject, style, composition, lighting)',
        },
        aspectRatio: {
          type: 'string',
          description:
            'Aspect ratio like "1:1", "16:9", "4:3", "9:16"; omit for the provider default',
        },
        title: { type: 'string', description: 'Short title for accessibility and history' },
        x: { type: 'number', description: 'Canvas x for the placed image, default 120' },
        y: { type: 'number', description: 'Canvas y for the placed image, default 120' },
        maxWidth: {
          type: 'number',
          minimum: 64,
          maximum: 1200,
          description: 'Maximum placed width in canvas pixels, default 480',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'update_board_text',
    description:
      'Replace the text of an existing text element by id. Read the board first to get the id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, text: { type: 'string' } },
      required: ['id', 'text'],
    },
  },
  {
    name: 'move_board_elements',
    description:
      'Move up to 50 elements by id with a delta in canvas pixels. Bound labels travel with their shapes automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', minLength: 1 } },
        dx: { type: 'number', minimum: -5000, maximum: 5000 },
        dy: { type: 'number', minimum: -5000, maximum: 5000 },
      },
      required: ['ids', 'dx', 'dy'],
    },
  },
  {
    name: 'scale_board_elements',
    description:
      'Scale 1-50 identified native board elements together around their shared top-left corner. Use after read_drawboard to make a poster/section larger or smaller without manually rebuilding it. Bound labels must be included in ids.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', minLength: 1 } },
        scale: { type: 'number', minimum: 0.1, maximum: 4 },
      },
      required: ['ids', 'scale'],
    },
  },
  {
    name: 'style_board_elements',
    description:
      'Apply a safe shared native style to 1-50 identified elements. Use after read_drawboard to improve a coherent section; it never adds content or deletes anything.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', minLength: 1 } },
        strokeColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        backgroundColor: { type: 'string', pattern: '^(transparent|#[0-9a-fA-F]{6})$' },
        strokeWidth: { type: 'number', minimum: 1, maximum: 12 },
      },
      required: ['ids'],
    },
  },
  {
    name: 'erase_board_elements',
    description:
      'Erase 1-50 identified whole board elements by id, including a complete freehand stroke or attached label. Read the board first and erase only the specific unwanted elements. This removes whole elements; it does not partially scrub pixels or clear the whole board.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', minLength: 1 } },
      },
      required: ['ids'],
    },
  },
  {
    name: 'delete_board_elements',
    description:
      'Delete up to 50 elements by id. Bound labels are removed with their shapes. Read first so you delete the right ones.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', minLength: 1 } },
      },
      required: ['ids'],
    },
  },
  {
    name: 'clear_drawboard',
    description:
      'Remove EVERYTHING from the board. Only call when the user explicitly asked to clear/start over, and pass confirm=true.',
    inputSchema: {
      type: 'object',
      properties: { confirm: { type: 'boolean' } },
      required: ['confirm'],
    },
  },
  {
    name: 'undo_drawboard',
    description: 'Undo the last board change (true history: additions, moves, deletes, style).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'redo_drawboard',
    description: 'Redo an undone board change.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'export_drawboard',
    description:
      'Download the board as a file: png image, svg vector, or board-file (.draw). Call only when the user asked to export/download/save a copy.',
    inputSchema: {
      type: 'object',
      properties: { format: { type: 'string', enum: ['png', 'svg', 'board-file'] } },
      required: ['format'],
    },
  },
  {
    name: 'arrange_elements',
    description:
      'Change stacking order: front (top), forward (one step up), backward (one step down), back (bottom). Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', maxItems: 500, items: { type: 'string' } },
        operation: { type: 'string', enum: ['front', 'forward', 'backward', 'back'] },
      },
      required: ['operation'],
    },
  },
  {
    name: 'align_elements',
    description:
      'Align elements to their shared bounding box: left, centerX, right, top, middle, bottom. Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', maxItems: 500, items: { type: 'string' } },
        alignment: {
          type: 'string',
          enum: ['left', 'centerX', 'right', 'top', 'middle', 'bottom'],
        },
      },
      required: ['alignment'],
    },
  },
  {
    name: 'distribute_elements',
    description: 'Space 3+ elements evenly along an axis. Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', maxItems: 500, items: { type: 'string' } },
        axis: { type: 'string', enum: ['horizontal', 'vertical'] },
      },
      required: ['axis'],
    },
  },
  {
    name: 'group_elements',
    description: 'Group 2+ elements so they move together. Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', maxItems: 500, items: { type: 'string' } } },
    },
  },
  {
    name: 'ungroup_elements',
    description: 'Remove group membership from elements. Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', maxItems: 500, items: { type: 'string' } } },
    },
  },
  {
    name: 'set_element_lock',
    description:
      'Lock (or unlock) elements so they cannot be moved or edited. Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', maxItems: 500, items: { type: 'string' } },
        locked: { type: 'boolean' },
      },
      required: ['locked'],
    },
  },
  {
    name: 'flip_elements',
    description:
      'Mirror elements across the selection bounding box, horizontally or vertically. Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', maxItems: 500, items: { type: 'string' } },
        direction: { type: 'string', enum: ['horizontal', 'vertical'] },
      },
      required: ['direction'],
    },
  },
  {
    name: 'duplicate_elements',
    description:
      'Clone elements with fresh ids (bound labels follow), offset down-right. Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', maxItems: 500, items: { type: 'string' } },
        dx: { type: 'number' },
        dy: { type: 'number' },
      },
    },
  },
  {
    name: 'select_all',
    description: 'Select every element on the board (for a following arrange/style/delete step).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'clear_selection',
    description: 'Clear the current selection without changing the board.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_stroke_width',
    description:
      'Set stroke width (1 thin, 2 bold, 4 heavy) on elements. Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', maxItems: 500, items: { type: 'string' } },
        width: { type: 'number', enum: [1, 2, 4] },
      },
      required: ['width'],
    },
  },
  {
    name: 'set_opacity',
    description: 'Set opacity 0-100 on elements. Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', maxItems: 500, items: { type: 'string' } },
        opacity: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['opacity'],
    },
  },
  {
    name: 'set_text_size',
    description:
      'Set font size 8-96 on text elements (other types are skipped). Defaults to the current selection.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', maxItems: 500, items: { type: 'string' } },
        size: { type: 'number', minimum: 8, maximum: 96 },
      },
      required: ['size'],
    },
  },
  {
    name: 'zoom_to_fit',
    description:
      'Zoom and scroll so the whole board content fits on screen. Call after building content or when the user wants an overview.',
    inputSchema: { type: 'object', properties: {} },
  },
]

type ApiRef = { current: BoardApi | null }
type ExecResult = { output: string; summary: string; mutated?: boolean; isError?: boolean }

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function summarizeScene(api: BoardApi | null): string {
  if (!api) return 'Drawing not ready yet.'
  try {
    const elements = api.getSceneElements()
    const lines = elements.slice(0, 200).map((el) => {
      const e = el as unknown as Record<string, unknown>
      return `- ${String(e.type)} id=${String(e.id)} x=${String(e.x)} y=${String(e.y)} w=${String(e.width)} h=${String(e.height)} stroke=${String(e.strokeColor ?? 'default')} fill=${String(e.backgroundColor ?? 'transparent')} opacity=${String(e.opacity ?? 100)} text=${JSON.stringify(e.text ?? '').slice(0, 180)}`
    })
    const selected = Object.keys(
      (api.getAppState() as { selectedElementIds?: Record<string, unknown> }).selectedElementIds ??
        {},
    )
    return `Drawing has ${elements.length} element(s).${selected.length ? ` Selected ids: ${selected.join(', ')}.` : ''}\n${lines.join('\n')}${elements.length > 200 ? `\n... ${elements.length - 200} additional elements omitted; use get_board_element with an id for details.` : ''}`
  } catch {
    return 'Could not read the drawing.'
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'text',
  'tspan',
  // Filters: blur/glow/soft shadow/texture/grain.
  'filter',
  'feGaussianBlur',
  'feOffset',
  'feDropShadow',
  'feMerge',
  'feMergeNode',
  'feColorMatrix',
  'feBlend',
  'feComposite',
  'feFlood',
  'feTurbulence',
  'feDisplacementMap',
  'feMorphology',
  'feTile',
  'feComponentTransfer',
  'feFuncR',
  'feFuncG',
  'feFuncB',
  'feFuncA',
  // Hatching, soft masks, reusable symbols, arrowheads, embedded raster.
  'pattern',
  'mask',
  'use',
  'symbol',
  'marker',
  'image',
])
const SVG_TAGS_CANONICAL = new Map(Array.from(SVG_TAGS, (tag) => [tag.toLocaleLowerCase(), tag]))
const SVG_GLOBAL_ATTRS = new Set([
  'id',
  'opacity',
  'fill',
  'stroke',
  'stroke-width',
  'fill-opacity',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'clip-path',
  'mask',
  'filter',
  'transform',
  'style',
  'fill-rule',
  'clip-rule',
  'paint-order',
  'vector-effect',
  'color',
  'marker-start',
  'marker-mid',
  'marker-end',
])
const SVG_TAG_ATTRS: Record<string, ReadonlySet<string>> = {
  svg: new Set(['xmlns', 'xlink', 'viewBox', 'width', 'height', 'preserveAspectRatio']),
  path: new Set(['d', 'pathLength']),
  rect: new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'pathLength']),
  circle: new Set(['cx', 'cy', 'r', 'pathLength']),
  ellipse: new Set(['cx', 'cy', 'rx', 'ry', 'pathLength']),
  line: new Set(['x1', 'y1', 'x2', 'y2', 'pathLength']),
  polyline: new Set(['points', 'pathLength']),
  polygon: new Set(['points', 'pathLength']),
  linearGradient: new Set([
    'x1',
    'y1',
    'x2',
    'y2',
    'gradientUnits',
    'gradientTransform',
    'spreadMethod',
    'href',
    'xlink:href',
  ]),
  radialGradient: new Set([
    'cx',
    'cy',
    'r',
    'fx',
    'fy',
    'fr',
    'gradientUnits',
    'gradientTransform',
    'spreadMethod',
    'href',
    'xlink:href',
  ]),
  stop: new Set(['offset', 'stop-color', 'stop-opacity']),
  clipPath: new Set(['clipPathUnits']),
  text: new Set([
    'x',
    'y',
    'dx',
    'dy',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'text-anchor',
    'dominant-baseline',
    'letter-spacing',
    'textLength',
    'lengthAdjust',
  ]),
  tspan: new Set([
    'x',
    'y',
    'dx',
    'dy',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'text-anchor',
    'dominant-baseline',
    'letter-spacing',
  ]),
  filter: new Set([
    'x',
    'y',
    'width',
    'height',
    'filterUnits',
    'primitiveUnits',
    'color-interpolation-filters',
    'href',
    'xlink:href',
  ]),
  feGaussianBlur: new Set(['in', 'stdDeviation', 'edgeMode', 'result']),
  feOffset: new Set(['in', 'dx', 'dy', 'result']),
  feDropShadow: new Set([
    'in',
    'dx',
    'dy',
    'stdDeviation',
    'flood-color',
    'flood-opacity',
    'result',
  ]),
  feMerge: new Set(['result']),
  feMergeNode: new Set(['in']),
  feColorMatrix: new Set(['in', 'type', 'values', 'result']),
  feBlend: new Set(['in', 'in2', 'mode', 'result']),
  feComposite: new Set(['in', 'in2', 'operator', 'k1', 'k2', 'k3', 'k4', 'result']),
  feFlood: new Set(['flood-color', 'flood-opacity', 'result']),
  feTurbulence: new Set(['type', 'baseFrequency', 'numOctaves', 'seed', 'stitchTiles', 'result']),
  feDisplacementMap: new Set([
    'in',
    'in2',
    'scale',
    'xChannelSelector',
    'yChannelSelector',
    'result',
  ]),
  feMorphology: new Set(['in', 'operator', 'radius', 'result']),
  feTile: new Set(['in', 'result']),
  feComponentTransfer: new Set(['in', 'result']),
  feFuncR: new Set([
    'type',
    'tableValues',
    'slope',
    'intercept',
    'amplitude',
    'exponent',
    'offset',
  ]),
  feFuncG: new Set([
    'type',
    'tableValues',
    'slope',
    'intercept',
    'amplitude',
    'exponent',
    'offset',
  ]),
  feFuncB: new Set([
    'type',
    'tableValues',
    'slope',
    'intercept',
    'amplitude',
    'exponent',
    'offset',
  ]),
  feFuncA: new Set([
    'type',
    'tableValues',
    'slope',
    'intercept',
    'amplitude',
    'exponent',
    'offset',
  ]),
  pattern: new Set([
    'x',
    'y',
    'width',
    'height',
    'patternUnits',
    'patternContentUnits',
    'patternTransform',
    'viewBox',
    'preserveAspectRatio',
    'href',
    'xlink:href',
  ]),
  mask: new Set(['x', 'y', 'width', 'height', 'maskUnits', 'maskContentUnits', 'mask-type']),
  use: new Set(['href', 'xlink:href', 'x', 'y', 'width', 'height']),
  symbol: new Set(['viewBox', 'preserveAspectRatio', 'refX', 'refY']),
  marker: new Set([
    'markerWidth',
    'markerHeight',
    'refX',
    'refY',
    'orient',
    'markerUnits',
    'viewBox',
    'preserveAspectRatio',
  ]),
  image: new Set([
    'href',
    'xlink:href',
    'x',
    'y',
    'width',
    'height',
    'preserveAspectRatio',
    'image-rendering',
  ]),
}

/** Budget ceilings for imported artwork. Raised from the original conservative
 *  set so illustration and technical drawing have real headroom, while every
 *  limit stays far below what can stall the renderer. */
const SVG_LIMITS = {
  source: 400_000,
  nodes: 4000,
  depth: 48,
  pathData: 120_000,
  pointData: 60_000,
  transform: 2_000,
  textLength: 50_000,
  viewBox: 20_000,
  uses: 300,
  filterPrimitives: 200,
  turbulences: 20,
  maxOctaves: 6,
  imageDataUrl: 300_000,
  styleLength: 2_000,
}

const SVG_STYLE_PROPS = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'opacity',
  'color',
  'stop-color',
  'stop-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'paint-order',
  'vector-effect',
  'clip-rule',
  'display',
  'visibility',
])

const SVG_UNIT_VALUES = new Set(['userSpaceOnUse', 'objectBoundingBox'])
const SVG_MARKER_UNITS = new Set(['userSpaceOnUse', 'strokeWidth'])
const SVG_FE_TYPES: Record<string, ReadonlySet<string>> = {
  feColorMatrix: new Set(['matrix', 'saturate', 'hueRotate', 'luminanceToAlpha']),
  feTurbulence: new Set(['fractalNoise', 'turbulence']),
  feMorphology: new Set(['erode', 'dilate']),
  feFuncR: new Set(['identity', 'table', 'discrete', 'linear', 'gamma']),
  feFuncG: new Set(['identity', 'table', 'discrete', 'linear', 'gamma']),
  feFuncB: new Set(['identity', 'table', 'discrete', 'linear', 'gamma']),
  feFuncA: new Set(['identity', 'table', 'discrete', 'linear', 'gamma']),
}
const SVG_BLEND_MODES = new Set([
  'normal',
  'multiply',
  'screen',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
  'overlay',
])
const SVG_COMPOSITE_OPS = new Set(['over', 'in', 'out', 'atop', 'xor', 'arithmetic'])
const SVG_RASTER_DATA_URL = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,[A-Za-z0-9+/]+=*$/i

/** Allowlist-only SVG importer: no scripts, styles, external URLs, or foreign content. */
export function sanitizeVectorSvg(source: string): { svg: string; width: number; height: number } {
  if (typeof source !== 'string' || source.length < 40 || source.length > SVG_LIMITS.source) {
    throw new Error(`SVG must be between 40 and ${SVG_LIMITS.source} characters.`)
  }
  const parser = new DOMParser()
  const parsed = parser.parseFromString(source, 'image/svg+xml')
  if (parsed.doctype || parsed.querySelector('parsererror'))
    throw new Error('SVG is not valid XML.')
  const sourceRoot = parsed.documentElement
  if (sourceRoot.localName !== 'svg' || sourceRoot.namespaceURI !== SVG_NS)
    throw new Error('SVG needs a standard <svg> root element.')
  const viewBox = (sourceRoot.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (
    viewBox.length !== 4 ||
    viewBox.some((value) => !Number.isFinite(value)) ||
    viewBox[2]! <= 0 ||
    viewBox[3]! <= 0 ||
    viewBox[2]! > SVG_LIMITS.viewBox ||
    viewBox[3]! > SVG_LIMITS.viewBox
  ) {
    throw new Error(
      `SVG viewBox must have four finite numbers and a width and height from 1 to ${SVG_LIMITS.viewBox}.`,
    )
  }
  const ids = new Set<string>()
  const references: string[] = []
  /** id -> ids it pulls in via href, used for cycle detection after the copy. */
  const pendingHref: Array<{ ownerId: string | null; target: string }> = []
  let nodeCount = 0
  let useCount = 0
  let filterPrimitiveCount = 0
  let turbulenceCount = 0
  const out = parsed.createElementNS(SVG_NS, 'svg')
  // The serializer emits the namespace declaration for an element created with
  // createElementNS, so setting xmlns here as well produced a duplicate
  // attribute and therefore malformed XML that could never be re-parsed.
  out.setAttribute('viewBox', viewBox.join(' '))
  out.setAttribute('width', String(viewBox[2]))
  out.setAttribute('height', String(viewBox[3]))
  const numberValue = (value: string) =>
    /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?%?$/i.test(value)
  const numberList = (value: string) => {
    const parts = value.split(/[\s,]+/).filter(Boolean)
    return parts.length > 0 && parts.length <= 400 && parts.every((part) => numberValue(part))
  }
  const safeIdent = (value: string) => /^[A-Za-z][\w-]{0,40}$/.test(value)
  const unitValue = (value: string, allowed: ReadonlySet<string>) => allowed.has(value)
  const localRef = (value: string) => /^url\(#[\w.-]{1,80}\)$/.test(value)
  const colorFunction = (value: string) => {
    const match = /^(rgba?|hsla?)\(\s*([^()]*?)\s*\)$/i.exec(value)
    if (!match) return false
    const args = match[2]!.split(/[\s,/]+/).filter(Boolean)
    if (args.length < 3 || args.length > 4) return false
    return args.every((arg) => /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(arg))
  }
  const allowedColor = (value: string) =>
    /^(?:#[0-9a-f]{3,8}|[a-z]{1,24}|none|currentColor|transparent)$/i.test(value) ||
    localRef(value) ||
    colorFunction(value)
  // Inline `style` is far more compact than presentation attributes on
  // detailed artwork, but it must never carry a URL, an at-rule, or a legacy
  // script-bearing expression. Allow only known properties with inert values.
  const safeStyle = (value: string) => {
    if (value.length > SVG_LIMITS.styleLength) return false
    if (/url\(|@|expression|javascript|behavior|\\|<\s*\/?[a-z]/i.test(value)) return false
    return value.split(';').every((declaration) => {
      const trimmed = declaration.trim()
      if (!trimmed) return true
      const colon = trimmed.indexOf(':')
      if (colon < 1) return false
      const property = trimmed.slice(0, colon).trim().toLowerCase()
      const raw = trimmed.slice(colon + 1).trim()
      if (!SVG_STYLE_PROPS.has(property)) return false
      if (!raw || !/^[A-Za-z0-9#%.,()\s+\-/]+$/.test(raw)) return false
      if (['fill', 'stroke', 'stop-color', 'color'].includes(property) && !allowedColor(raw))
        return false
      return true
    })
  }
  const copy = (sourceNode: Node, targetParent: Element, depth: number, scopeId: string | null) => {
    if (++nodeCount > SVG_LIMITS.nodes || depth > SVG_LIMITS.depth)
      throw new Error(
        `SVG is too complex; keep it under ${SVG_LIMITS.nodes} nodes and ${SVG_LIMITS.depth} levels deep.`,
      )
    // SVG authoring tools and model-generated markup commonly add XML comments.
    // They carry no rendering behavior, so omit them instead of rejecting the
    // entire otherwise-safe drawing.
    if (sourceNode.nodeType === Node.COMMENT_NODE) return
    if (sourceNode.nodeType === Node.TEXT_NODE) {
      const text = sourceNode.textContent ?? ''
      if (text.trim()) {
        if (
          !['text', 'tspan'].includes(targetParent.localName) ||
          text.length > SVG_LIMITS.textLength
        )
          throw new Error(
            `Text is only allowed inside SVG text elements and must be under ${SVG_LIMITS.textLength} characters.`,
          )
        targetParent.appendChild(parsed.createTextNode(text))
      }
      return
    }
    if (sourceNode.nodeType !== Node.ELEMENT_NODE)
      throw new Error('SVG processing instructions and other XML nodes are not supported.')
    const sourceElement = sourceNode as Element
    const sourceTag = sourceElement.localName
    const tag = SVG_TAGS.has(sourceTag)
      ? sourceTag
      : (SVG_TAGS_CANONICAL.get(sourceTag.toLocaleLowerCase()) ?? sourceTag)
    if (!SVG_TAGS.has(tag) || sourceElement.namespaceURI !== SVG_NS) {
      // A <style> block is a very common model habit. Naming what IS supported
      // lets the retry succeed instead of repeating the same rejected markup.
      if (tag === 'style') {
        throw new Error(
          'SVG <style> blocks are not supported. Put fill and stroke on each element, or use a style="fill:...;stroke:..." attribute.',
        )
      }
      throw new Error(`SVG element <${tag}> is not allowed.`)
    }
    if (tag === 'use') {
      useCount += 1
      if (useCount > SVG_LIMITS.uses)
        throw new Error(`SVG uses more than ${SVG_LIMITS.uses} <use> references.`)
    }
    if (
      tag.startsWith('fe') &&
      !['feFuncR', 'feFuncG', 'feFuncB', 'feFuncA', 'feMergeNode'].includes(tag)
    ) {
      filterPrimitiveCount += 1
      if (filterPrimitiveCount > SVG_LIMITS.filterPrimitives)
        throw new Error('SVG filter chain is too large.')
    }
    if (tag === 'feTurbulence') {
      turbulenceCount += 1
      if (turbulenceCount > SVG_LIMITS.turbulences)
        throw new Error('SVG uses too many turbulence filters.')
    }
    const targetElement = parsed.createElementNS(SVG_NS, tag)
    const tagAttrs = SVG_TAG_ATTRS[tag] ?? new Set<string>()
    const hrefs: string[] = []
    for (const attribute of Array.from(sourceElement.attributes)) {
      const name = attribute.name
      const value = attribute.value.trim()
      // Namespace declarations are re-emitted by the serializer as needed.
      if (name === 'xmlns' || name.startsWith('xmlns:')) continue
      if (tag === 'svg' && (name === 'viewBox' || name === 'width' || name === 'height')) continue
      if (!SVG_GLOBAL_ATTRS.has(name) && !tagAttrs.has(name))
        throw new Error(`SVG attribute "${name}" is not allowed.`)
      if (name === 'id') {
        if (!/^[\w.-]{1,80}$/.test(value) || ids.has(value))
          throw new Error('SVG ids must be unique simple names.')
        ids.add(value)
      } else if (['fill', 'stroke', 'stop-color', 'flood-color', 'color'].includes(name)) {
        if (!allowedColor(value)) throw new Error(`Unsafe SVG color "${value}".`)
        if (localRef(value)) references.push(value.slice(5, -1))
      } else if (
        ['clip-path', 'filter', 'mask', 'marker-start', 'marker-mid', 'marker-end'].includes(name)
      ) {
        if (value === 'none') continue
        if (!localRef(value)) throw new Error(`SVG ${name} must reference a local id.`)
        references.push(value.slice(5, -1))
      } else if (name === 'style') {
        if (!safeStyle(value))
          throw new Error('SVG style declarations are limited to safe inert properties.')
      } else if (name === 'href' || name === 'xlink:href') {
        if (tag === 'image') {
          if (!SVG_RASTER_DATA_URL.test(value) || value.length > SVG_LIMITS.imageDataUrl)
            throw new Error('SVG <image> may only embed a base64 raster data URL.')
        } else {
          const match = /^#([\w.-]{1,80})$/.exec(value)
          if (!match) throw new Error('SVG href must reference a local id such as "#shape".')
          hrefs.push(match[1]!)
          references.push(match[1]!)
        }
      } else if (['in', 'in2', 'result', 'xChannelSelector', 'yChannelSelector'].includes(name)) {
        if (!safeIdent(value)) throw new Error(`SVG ${name} must be a filter result name.`)
      } else if (name === 'type') {
        const allowed = SVG_FE_TYPES[tag]
        if (allowed && !allowed.has(value))
          throw new Error(`SVG <${tag}> type "${value}" is not supported.`)
      } else if (name === 'mode') {
        if (!SVG_BLEND_MODES.has(value))
          throw new Error(`SVG blend mode "${value}" is not supported.`)
      } else if (name === 'operator') {
        if (tag === 'feComposite' && !SVG_COMPOSITE_OPS.has(value))
          throw new Error(`SVG composite operator "${value}" is not supported.`)
        if (tag === 'feMorphology' && !SVG_FE_TYPES.feMorphology!.has(value))
          throw new Error(`SVG morphology operator "${value}" is not supported.`)
      } else if (
        [
          'filterUnits',
          'primitiveUnits',
          'patternUnits',
          'patternContentUnits',
          'maskUnits',
          'maskContentUnits',
          'clipPathUnits',
          'gradientUnits',
        ].includes(name)
      ) {
        if (!unitValue(value, SVG_UNIT_VALUES))
          throw new Error(`SVG ${name} must be userSpaceOnUse or objectBoundingBox.`)
      } else if (name === 'markerUnits') {
        if (!unitValue(value, SVG_MARKER_UNITS))
          throw new Error('SVG markerUnits must be userSpaceOnUse or strokeWidth.')
      } else if (name === 'orient') {
        if (!/^(?:auto|auto-start-reverse|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:deg)?)$/.test(value))
          throw new Error('SVG marker orient is not supported.')
      } else if (name === 'spreadMethod') {
        if (!['pad', 'reflect', 'repeat'].includes(value))
          throw new Error('SVG spreadMethod is not supported.')
      } else if (name === 'edgeMode') {
        if (!['duplicate', 'wrap', 'none'].includes(value))
          throw new Error('SVG edgeMode is not supported.')
      } else if (name === 'stitchTiles') {
        if (!['stitch', 'noStitch'].includes(value))
          throw new Error('SVG stitchTiles is not supported.')
      } else if (name === 'mask-type') {
        if (!['luminance', 'alpha'].includes(value))
          throw new Error('SVG mask-type is not supported.')
      } else if (name === 'numOctaves') {
        const octaves = Number(value)
        if (!Number.isInteger(octaves) || octaves < 1 || octaves > SVG_LIMITS.maxOctaves)
          throw new Error(`SVG numOctaves must be an integer from 1 to ${SVG_LIMITS.maxOctaves}.`)
      } else if (
        [
          'stdDeviation',
          'baseFrequency',
          'values',
          'tableValues',
          'slope',
          'intercept',
          'amplitude',
          'exponent',
          'scale',
          'radius',
          'k1',
          'k2',
          'k3',
          'k4',
          'seed',
        ].includes(name)
      ) {
        if (!numberList(value)) throw new Error(`SVG ${name} must be a list of finite numbers.`)
      } else if (name === 'd') {
        if (
          value.length > SVG_LIMITS.pathData ||
          !/^[MmZzLlHhVvCcSsQqTtAaEe0-9eE.,+\-\s]+$/.test(value)
        )
          throw new Error('SVG path data contains unsupported commands or is too long.')
      } else if (name === 'points' || name === 'viewBox') {
        if (value.length > SVG_LIMITS.pointData || !/^[\d.eE,+\-\s]+$/.test(value))
          throw new Error(`SVG ${name} contains invalid coordinates.`)
      } else if (
        name === 'transform' ||
        name === 'gradientTransform' ||
        name === 'patternTransform'
      ) {
        if (
          value.length > SVG_LIMITS.transform ||
          !/^(?:(?:translate|rotate|scale|matrix|skewX|skewY)\(\s*[-+0-9.,eE\s]+\)\s*)+$/.test(
            value,
          )
        )
          throw new Error('SVG transform contains unsupported syntax.')
      } else if (
        ['opacity', 'fill-opacity', 'stroke-opacity', 'stop-opacity', 'flood-opacity'].includes(
          name,
        )
      ) {
        const opacity = Number(value.replace(/%$/, ''))
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > (value.endsWith('%') ? 100 : 1))
          throw new Error(`SVG ${name} must be between 0 and 1 (or 0% and 100%).`)
      } else if (
        [
          'stroke-width',
          'x',
          'y',
          'x1',
          'y1',
          'x2',
          'y2',
          'cx',
          'cy',
          'r',
          'rx',
          'ry',
          'fx',
          'fy',
          'fr',
          'width',
          'height',
          'refX',
          'refY',
          'markerWidth',
          'markerHeight',
          'font-size',
          'dx',
          'dy',
          'offset',
          'stroke-dashoffset',
          'stroke-miterlimit',
          'letter-spacing',
          'pathLength',
          'textLength',
        ].includes(name)
      ) {
        if (!numberValue(value))
          throw new Error(`SVG ${name} must be a finite number (received "${value.slice(0, 80)}").`)
      } else if (
        /url\(|https?:|ftp:|data:|javascript:|vbscript:|file:|<|>/i.test(value) ||
        [...value].some((character) => character.charCodeAt(0) <= 0x1f)
      ) {
        throw new Error(`Unsafe value in SVG attribute "${name}".`)
      }
      targetElement.setAttribute(name, value)
    }
    // A reference belongs to the nearest element that defines an id, so a
    // <use> nested inside a <symbol> is attributed to that symbol.
    const selfId = targetElement.getAttribute('id')
    const ownerId = selfId ?? scopeId
    if (hrefs.length) {
      for (const target of hrefs) pendingHref.push({ ownerId, target })
    }
    targetParent.appendChild(targetElement)
    for (const child of Array.from(sourceElement.childNodes))
      copy(child, targetElement, depth + 1, ownerId)
  }
  for (const child of Array.from(sourceRoot.childNodes)) copy(child, out, 1, null)
  for (const reference of references)
    if (!ids.has(reference)) throw new Error(`SVG references missing local id "${reference}".`)
  // A <use>/<pattern> chain that reaches itself makes the renderer expand
  // forever, so reject cycles before the artwork is ever placed.
  const graph = new Map<string, string[]>()
  for (const { ownerId, target } of pendingHref) {
    if (!ownerId) continue
    const list = graph.get(ownerId)
    if (list) list.push(target)
    else graph.set(ownerId, [target])
  }
  const visitState = new Map<string, number>()
  const walk = (id: string, depth: number): void => {
    if (depth > 24) throw new Error('SVG reference chain is too deep.')
    const state = visitState.get(id)
    if (state === 1) throw new Error('SVG contains a circular reference.')
    if (state === 2) return
    visitState.set(id, 1)
    for (const next of graph.get(id) ?? []) walk(next, depth + 1)
    visitState.set(id, 2)
  }
  for (const id of graph.keys()) walk(id, 0)
  const serialized = new XMLSerializer().serializeToString(out)
  return { svg: serialized, width: viewBox[2]!, height: viewBox[3]! }
}

/**
 * Rasterise a sanitised SVG to a PNG data URL.
 *
 * Excalidraw does not keep an `image/svg+xml` payload registered through
 * `addFiles`, so an element pointing at one renders as an empty placeholder and
 * the user sees nothing at all. Drawing the SVG into a canvas and storing the
 * PNG matches what the working raster paths already do, and always renders.
 */
async function rasterizeSvgToPng(
  svg: string,
  width: number,
  height: number,
): Promise<string | null> {
  try {
    const url = svgDataUrl(svg)
    const image = new Image()
    // Bounded: a payload the decoder silently refuses would otherwise leave the
    // tool waiting forever with no result and no error.
    const loaded = await Promise.race([
      new Promise<boolean>((resolve) => {
        image.onload = () => resolve(true)
        image.onerror = () => resolve(false)
        image.src = url
      }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
    ])
    if (!loaded) return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = canvas.toDataURL('image/png')
    return png.startsWith('data:image/png') ? png : null
  } catch {
    return null
  }
}
function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

/**
 * Turn one decomposed SVG primitive into a native, editable board element.
 * Line geometry is normalised to a top-left origin with relative points, and
 * SVG text baselines are converted to Excalidraw's top-aligned text boxes.
 */
function primitiveToBoardElement(
  primitive: Primitive,
  offsetX: number,
  offsetY: number,
): Record<string, unknown> {
  if (primitive.kind === 'rect') {
    return {
      id: uid(),
      type: 'rectangle',
      x: offsetX + primitive.x,
      y: offsetY + primitive.y,
      width: Math.max(1, primitive.width),
      height: Math.max(1, primitive.height),
      strokeColor: primitive.stroke,
      backgroundColor: primitive.fill,
      fillStyle: 'solid',
      strokeWidth: Math.max(1, primitive.strokeWidth),
      strokeStyle: 'solid',
      roughness: 0,
      opacity: primitive.opacity,
    }
  }
  if (primitive.kind === 'ellipse') {
    return {
      id: uid(),
      type: 'ellipse',
      x: offsetX + primitive.cx - primitive.rx,
      y: offsetY + primitive.cy - primitive.ry,
      width: Math.max(1, primitive.rx * 2),
      height: Math.max(1, primitive.ry * 2),
      strokeColor: primitive.stroke,
      backgroundColor: primitive.fill,
      fillStyle: 'solid',
      strokeWidth: Math.max(1, primitive.strokeWidth),
      strokeStyle: 'solid',
      roughness: 0,
      opacity: primitive.opacity,
    }
  }
  if (primitive.kind === 'polyline') {
    const xs = primitive.points.map((point) => point[0])
    const ys = primitive.points.map((point) => point[1])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return {
      id: uid(),
      type: 'line',
      x: offsetX + minX,
      y: offsetY + minY,
      width: Math.max(0, Math.max(...xs) - minX),
      height: Math.max(0, Math.max(...ys) - minY),
      points: primitive.points.map(([pointX, pointY]) => [pointX - minX, pointY - minY]),
      lastCommittedPoint: null,
      strokeColor: primitive.stroke,
      backgroundColor: primitive.fill,
      fillStyle: 'solid',
      strokeWidth: Math.max(1, primitive.strokeWidth),
      strokeStyle: primitive.dash ? 'dashed' : 'solid',
      roughness: 0,
      opacity: primitive.opacity,
    }
  }
  const fontSize = Math.max(8, Math.min(240, Math.round(primitive.fontSize)))
  const estimatedWidth = Math.max(60, Math.round(primitive.text.length * fontSize * 0.62))
  const left =
    primitive.anchor === 'center'
      ? primitive.x - estimatedWidth / 2
      : primitive.anchor === 'right'
        ? primitive.x - estimatedWidth
        : primitive.x
  return {
    id: uid(),
    type: 'text',
    // SVG y is the text baseline; Excalidraw boxes are top-aligned.
    x: offsetX + left,
    y: offsetY + primitive.y - fontSize,
    width: estimatedWidth,
    height: fontSize + 10,
    fontSize,
    fontFamily: 2,
    text: primitive.text.slice(0, 2000),
    textAlign: primitive.anchor,
    verticalAlign: 'top',
    strokeColor: primitive.fill,
    backgroundColor: 'transparent',
    opacity: primitive.opacity,
  }
}

async function executeBoardToolUnchecked(
  apiRef: ApiRef,
  call: AgentToolCall,
  getStaged: () => readonly StagedBoardImage[] = () => [],
  history?: BoardHistoryLike,
  fetchImage?: (url: string) => Promise<{ base64: string; mime: string } | null>,
  generateImage?: (op: {
    prompt: string
    aspectRatio?: string
  }) => Promise<{ base64: string; mime: string } | { error: string }>,
  analyzeMedia?: (op: {
    mediaUrls: string[]
    requirements: string
  }) => Promise<{ ok: boolean; text?: string; error?: string }>,
): Promise<ExecResult> {
  const canonicalName = resolveBoardToolName(call.name)
  if (!canonicalName) {
    return {
      output: `Unknown drawing tool "${call.name}". Available tools: ${BOARD_TOOL_NAMES.join(', ')}. Use build_drawboard_scene for a coordinated multi-element drawing.`,
      summary: `Unknown tool: ${call.name}`,
      isError: true,
    }
  }
  if (canonicalName !== call.name) call = { ...call, name: canonicalName }
  const api = apiRef.current
  const a = call.input as Record<string, unknown>
  if (!api) return { output: 'Drawing is still loading.', summary: 'Not ready', isError: true }

  if (canonicalName === 'inspect_board_layout') {
    const report = inspectNativeLayout(api.getSceneElements() as unknown as BoardEl[])
    return { output: JSON.stringify(report), summary: `Layout ${String(report.status)}` }
  }

  if (canonicalName === 'render_mermaid_diagram') {
    const source = typeof a.source === 'string' ? a.source.trim() : ''
    if (source.length < 8 || source.length > 24000)
      return {
        output: 'Mermaid source must contain 8-24000 characters.',
        summary: 'Invalid Mermaid input',
        isError: true,
      }
    try {
      const { default: mermaid } = await import('mermaid')
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        suppressErrorRendering: true,
      })
      const { svg } = await mermaid.render(`draw-mermaid-${uid()}`, source)
      if (svg.length > SVG_LIMITS.source)
        throw new Error(
          `Rendered Mermaid SVG exceeds the ${SVG_LIMITS.source}-character safety limit.`,
        )
      const parsedSvg = new DOMParser().parseFromString(svg, 'image/svg+xml')
      if (parsedSvg.querySelector('parsererror') || parsedSvg.documentElement.localName !== 'svg')
        throw new Error('Mermaid returned malformed SVG.')
      const svgRoot = parsedSvg.documentElement
      const viewBox = (svgRoot.getAttribute('viewBox') ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number)
      if (
        viewBox.length !== 4 ||
        viewBox.some((value) => !Number.isFinite(value)) ||
        viewBox[2]! < 1 ||
        viewBox[3]! < 1
      )
        throw new Error('Mermaid returned SVG with invalid dimensions.')
      // Mermaid annotates SVG with generated CSS classes and accessible labels.
      // The drawing importer intentionally accepts only self-contained SVG, so
      // strip metadata/stylesheets and retain only its allowlisted inline paint.
      const numericSvgAttributes = new Set([
        'x',
        'y',
        'x1',
        'y1',
        'x2',
        'y2',
        'cx',
        'cy',
        'r',
        'rx',
        'ry',
        'fx',
        'fy',
        'fr',
        'width',
        'height',
        'stroke-width',
        'font-size',
        'letter-spacing',
        'dx',
        'dy',
        'stroke-dashoffset',
        'stroke-miterlimit',
        'pathlength',
        'textlength',
        'refx',
        'refy',
        'markerwidth',
        'markerheight',
      ])
      for (const element of [svgRoot, ...Array.from(svgRoot.querySelectorAll('*'))]) {
        if (['style', 'title', 'desc', 'foreignObject'].includes(element.localName)) {
          element.remove()
          continue
        }
        for (const attribute of Array.from(element.attributes)) {
          const name = attribute.name.toLocaleLowerCase()
          if (
            name === 'class' ||
            name === 'role' ||
            name.startsWith('aria-') ||
            name.startsWith('data-')
          )
            element.removeAttribute(attribute.name)
          else if (numericSvgAttributes.has(name)) {
            const match = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+))(rem|em|px|pt)?$/i.exec(
              attribute.value.trim(),
            )
            if (match) {
              const multiplier =
                match[2]?.toLowerCase() === 'em' || match[2]?.toLowerCase() === 'rem'
                  ? 16
                  : match[2]?.toLowerCase() === 'pt'
                    ? 4 / 3
                    : 1
              element.setAttribute(attribute.name, String(Number(match[1]) * multiplier))
            }
          }
        }
      }
      svgRoot.removeAttribute('style')
      svgRoot.setAttribute('width', String(viewBox[2]))
      svgRoot.setAttribute('height', String(viewBox[3]))
      const safeSvg = new XMLSerializer().serializeToString(svgRoot)
      const position =
        a.position && typeof a.position === 'object' ? (a.position as Record<string, unknown>) : {}
      const existing = api.getSceneElements() as unknown as Array<Record<string, unknown>>
      const hasRequestedPosition =
        Number.isFinite(Number(position.x)) || Number.isFinite(Number(position.y))
      const autoY = existing.length
        ? Math.max(
            80,
            ...existing.map(
              (element) => Number(element.y ?? 0) + Math.max(1, Number(element.height ?? 1)),
            ),
          ) + 100
        : 80
      const placed = await executeBoardToolUnchecked(
        apiRef,
        {
          ...call,
          name: 'add_vector_artwork',
          input: {
            svg: safeSvg,
            x: Number.isFinite(Number(position.x)) ? Number(position.x) : 80,
            y:
              hasRequestedPosition && Number.isFinite(Number(position.y))
                ? Number(position.y)
                : autoY,
          },
        },
        getStaged,
        history,
        fetchImage,
        generateImage,
        analyzeMedia,
      )
      if (placed.isError) {
        const svgRoot = svg.match(/<svg\b[^>]*>/i)?.[0] ?? 'missing <svg> root'
        return {
          ...placed,
          output: `Mermaid rendered, but the board rejected its SVG: ${placed.output} Root: ${svgRoot}`,
          summary: 'Mermaid diagram was not placed',
        }
      }
      let details: Record<string, unknown> = {}
      try {
        details = JSON.parse(placed.output) as Record<string, unknown>
      } catch {
        /* retain safe summary */
      }
      return {
        ...placed,
        output: JSON.stringify({ diagramType: 'mermaid', sourceValidated: true, ...details }),
        summary: 'Rendered and added Mermaid diagram',
      }
    } catch (error) {
      return {
        output: `Mermaid diagram was not added: ${error instanceof Error ? error.message : String(error)}`,
        summary: 'Invalid Mermaid diagram',
        isError: true,
      }
    }
  }

  if (canonicalName === INFOGRAPHIC_TOOL_NAME) {
    try {
      const existing = api.getSceneElements() as unknown as Array<Record<string, unknown>>
      const requested =
        a.position && typeof a.position === 'object' ? (a.position as Record<string, unknown>) : {}
      const autoY = existing.length
        ? Math.max(
            80,
            ...existing.map(
              (element) => Number(element.y ?? 0) + Math.max(1, Number(element.height ?? 1)),
            ),
          ) + 100
        : 80
      const origin = {
        x: Number.isFinite(Number(requested.x)) ? Number(requested.x) : 80,
        y: Number.isFinite(Number(requested.y)) ? Number(requested.y) : autoY,
      }
      const infographic = compileInfographic(a, origin)
      const built = await executeBoardToolUnchecked(
        apiRef,
        { ...call, name: 'build_drawboard_scene', input: { elements: infographic.elements } },
        getStaged,
        history,
        fetchImage,
        generateImage,
        analyzeMedia,
      )
      if (built.isError) return { ...built, summary: 'Infographic needs correction' }
      return {
        ...built,
        output: JSON.stringify({
          infographic: true,
          title: infographic.title,
          layout: { width: infographic.width, height: infographic.height },
          nativeSceneItems: infographic.elements.length,
        }),
        summary: `Built editable infographic: ${infographic.title}`,
      }
    } catch (error) {
      return {
        output: `Infographic was not changed. ${error instanceof Error ? error.message : String(error)}`,
        summary: 'Infographic needs correction',
        isError: true,
      }
    }
  }

  if (DIAGRAM_TOOL_DEFS.some((definition) => definition.name === canonicalName)) {
    try {
      const existing = api.getSceneElements() as unknown as Array<Record<string, unknown>>
      const requested =
        a.position && typeof a.position === 'object' ? (a.position as Record<string, unknown>) : {}
      const hasRequestedPosition =
        Number.isFinite(Number(requested.x)) || Number.isFinite(Number(requested.y))
      const autoY = existing.length
        ? Math.max(
            80,
            ...existing.map(
              (element) => Number(element.y ?? 0) + Math.max(1, Number(element.height ?? 1)),
            ),
          ) + 100
        : 80
      const origin = {
        x: Number.isFinite(Number(requested.x)) ? Number(requested.x) : 80,
        y:
          hasRequestedPosition && Number.isFinite(Number(requested.y))
            ? Number(requested.y)
            : autoY,
      }
      const diagram = compileDiagramTool(canonicalName, a, origin)
      const built = await executeBoardToolUnchecked(
        apiRef,
        {
          ...call,
          name: 'build_drawboard_scene',
          input: { elements: diagram.elements },
        },
        getStaged,
        history,
        fetchImage,
        generateImage,
        analyzeMedia,
      )
      if (built.isError) return { ...built, summary: `${diagram.title} diagram needs correction` }
      let scene: Record<string, unknown> = {}
      try {
        scene = JSON.parse(built.output) as Record<string, unknown>
      } catch {
        /* executor still reports a successful mutation */
      }
      return {
        ...built,
        output: JSON.stringify({
          diagramType: canonicalName,
          title: diagram.title,
          layout: { width: diagram.width, height: diagram.height },
          nodes: diagram.nodeCount,
          nativeSceneItems: scene.created ?? diagram.elements.length,
          selfCheck: {
            referencesValid: true,
            geometryFiniteAndBounded: true,
            itemLimitSatisfied: true,
          },
        }),
        summary: `Built ${diagram.title} (${diagram.nodeCount} nodes)`,
      }
    } catch (error) {
      return {
        output: `Diagram was not changed. ${error instanceof Error ? error.message : String(error)}`,
        summary: 'Diagram needs correction',
        isError: true,
      }
    }
  }

  /** Explicit ids win; otherwise the live board selection applies. */
  const resolveIds = (input: unknown): Set<string> | null => {
    if (
      Array.isArray(input) &&
      input.length > 0 &&
      input.every((id) => typeof id === 'string' && id.trim())
    ) {
      return new Set((input as string[]).map((id) => id.trim()))
    }
    try {
      const selected = (api.getAppState() as { selectedElementIds?: Record<string, unknown> })
        .selectedElementIds
      const ids = Object.keys(selected ?? {})
      return ids.length > 0 ? new Set(ids) : null
    } catch {
      return null
    }
  }
  const liveEls = (): BoardEl[] => [...(api.getSceneElements() as unknown as BoardEl[])]
  // Every mutation crosses this boundary. Tool-created elements are plain
  // objects and may omit Excalidraw metadata such as groupIds. Normalize and
  // restore them before updateScene so the renderer receives the same complete
  // element shape for adds, moves, undo/redo, and imported snapshots.
  const updateElements = (elements: readonly unknown[]) => {
    const safeElements = normalizeBoardElementPoints(elements)
    const restored = restore({ elements: safeElements as never }, null, null, {
      repairBindings: true,
    } as never)
    api.updateScene({
      elements: normalizeBoardElementPoints(restored.elements ?? safeElements) as never,
    })
  }
  const applyEls = (elements: BoardEl[]) => updateElements(elements)

  if (call.name === 'read_drawboard') {
    return { output: summarizeScene(api), summary: 'Read drawing' }
  }

  if (call.name === 'inspect_board_visual') {
    if (!analyzeMedia) {
      return {
        output:
          'Visual inspection is unavailable in this session. Configure a vision-capable media analysis provider in Settings.',
        summary: 'Visual inspection unavailable',
        isError: true,
      }
    }
    const elements = [...api.getSceneElements()]
    if (elements.length === 0) {
      return { output: 'The board is empty; there is nothing to inspect.', summary: 'Empty board' }
    }
    const requirements =
      typeof a.requirements === 'string' && a.requirements.trim()
        ? a.requirements.trim().slice(0, 4000)
        : 'Inspect the complete drawing for composition, visual hierarchy, legibility, spacing, overlap, perspective, and obvious rendering defects. Give specific actionable corrections.'
    try {
      const { exportToBlob, exportToSvg } = await import('@excalidraw/excalidraw')
      const appState = { ...api.getAppState(), exportWithDarkMode: false } as never
      let dataUrl: string
      try {
        const blob = await exportToBlob({
          elements: elements as never,
          appState,
          files: api.getFiles(),
          mimeType: 'image/png',
          // Scene coordinates are model-generated and may span a much larger
          // area than the viewport. Bound the raster dimensions so canvas.toBlob
          // does not return null for oversized canvases during visual review.
          maxWidthOrHeight: 2048,
        })
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () =>
            typeof reader.result === 'string'
              ? resolve(reader.result)
              : reject(new Error('PNG export did not produce a data URL.'))
          reader.onerror = () =>
            reject(reader.error ?? new Error('Could not read the exported PNG.'))
          reader.readAsDataURL(blob)
        })
      } catch (exportError) {
        // Some Electron/Chromium builds return a null Blob from canvas.toBlob
        // even for a bounded canvas. Render Excalidraw's SVG export through a
        // fresh canvas as a fallback so AI visual review remains available.
        const svg = await exportToSvg({
          elements: elements as never,
          appState,
          files: api.getFiles(),
        })
        const viewBox = svg.viewBox.baseVal
        const sourceWidth = viewBox.width || Number(svg.getAttribute('width')) || 1
        const sourceHeight = viewBox.height || Number(svg.getAttribute('height')) || 1
        const scale = Math.min(1, 2048 / Math.max(sourceWidth, sourceHeight))
        const width = Math.max(1, Math.round(sourceWidth * scale))
        const height = Math.max(1, Math.round(sourceHeight * scale))
        svg.setAttribute('width', String(width))
        svg.setAttribute('height', String(height))
        const svgUrl = URL.createObjectURL(
          new Blob([new XMLSerializer().serializeToString(svg)], {
            type: 'image/svg+xml;charset=utf-8',
          }),
        )
        try {
          const image = new Image()
          image.src = svgUrl
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext('2d')
          if (!context)
            throw new Error('Could not create the visual review canvas.', { cause: exportError })
          context.drawImage(image, 0, 0, width, height)
          dataUrl = canvas.toDataURL('image/png')
        } catch (fallbackError) {
          throw new Error(
            `PNG export failed (${exportError instanceof Error ? exportError.message : String(exportError)}); SVG raster fallback failed (${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}).`,
            { cause: fallbackError },
          )
        } finally {
          URL.revokeObjectURL(svgUrl)
        }
      }
      const result = await analyzeMedia({ mediaUrls: [dataUrl], requirements })
      if (!result.ok || !result.text) {
        return {
          output: result.error ?? 'The vision provider did not return a visual assessment.',
          summary: 'Visual inspection failed',
          isError: true,
        }
      }
      return { output: result.text, summary: 'Visually inspected drawing' }
    } catch (error) {
      return {
        output: `Could not inspect the rendered drawing: ${error instanceof Error ? error.message : String(error)}`,
        summary: 'Visual inspection failed',
        isError: true,
      }
    }
  }

  if (call.name === 'get_board_element') {
    if (typeof a.id !== 'string' || !a.id)
      return { output: 'Missing element id.', summary: 'Invalid input', isError: true }
    try {
      const found = api.getSceneElements().find((el) => el.id === a.id)
      if (!found)
        return { output: `No element with id ${a.id}.`, summary: 'Unknown element', isError: true }
      return { output: JSON.stringify(found), summary: `Read element ${a.id}` }
    } catch (error) {
      return { output: String(error), summary: 'Read failed', isError: true }
    }
  }

  if (call.name === 'add_vector_artwork') {
    if (typeof a.svg !== 'string')
      return {
        output: 'The svg argument must contain SVG markup.',
        summary: 'Invalid artwork',
        isError: true,
      }
    try {
      const artwork = sanitizeVectorSvg(a.svg)
      const x = num(a.x, 80)
      const y = num(a.y, 80)
      if (Math.abs(x) > 50000 || Math.abs(y) > 50000)
        throw new Error('Artwork x and y must be within +/-50000 canvas pixels.')
      // Prefer real board geometry so the drawing stays editable. Filtered,
      // gradient, masked or arc-based artwork cannot decompose faithfully and
      // falls through to the single scalable image below.
      const decomposed = decomposeVectorSvg(artwork.svg)
      if (decomposed) {
        const elements = decomposed.primitives.map((primitive) =>
          primitiveToBoardElement(primitive, x, y),
        )
        if (elements.length) {
          const nextDecomposed = restore(
            {
              elements: normalizeBoardElementPoints([
                ...api.getSceneElements(),
                ...elements,
              ]) as never,
            },
            null,
            null,
            { repairBindings: true } as never,
          )
          updateElements(nextDecomposed.elements ?? [])
          return {
            output: JSON.stringify({
              created: elements.length,
              editable: true,
              kinds: decomposed.primitives.map((primitive) => primitive.kind),
              width: artwork.width,
              height: artwork.height,
            }),
            summary: `Added ${elements.length} editable shapes`,
            mutated: true,
          }
        }
      }
      const fileId = uid()
      // Rasterise BEFORE creating the element: an SVG payload is dropped by the
      // file store and would leave an empty frame on the board.
      const png = await rasterizeSvgToPng(artwork.svg, artwork.width, artwork.height)
      if (!png) {
        return {
          output: 'Artwork could not be rasterised for the board; nothing was added.',
          summary: 'Invalid artwork',
          isError: true,
        }
      }
      const element = {
        id: uid(),
        type: 'image',
        x,
        y,
        width: artwork.width,
        height: artwork.height,
        fileId,
        status: 'saved',
        scale: [1, 1],
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
      }
      api.addFiles([
        { id: fileId, mimeType: 'image/png', dataURL: png, created: Date.now() },
      ] as never)
      const nextScene = restore(
        { elements: normalizeBoardElementPoints([...api.getSceneElements(), element]) as never },
        null,
        null,
        { repairBindings: true } as never,
      )
      updateElements(nextScene.elements ?? [])
      // Say WHY it is a picture: without this neither the user nor the model can
      // tell an intentional fidelity fallback from a decomposition bug.
      const fallbackReason = explainVectorFallback(artwork.svg)
      return {
        output: JSON.stringify({
          id: element.id,
          type: 'svg artwork',
          x,
          y,
          width: artwork.width,
          height: artwork.height,
          scalable: true,
          editable: false,
          reason: fallbackReason ?? 'the artwork uses a construct with no native equivalent',
          hint: 'Remove the construct named in `reason` to keep the shapes editable.',
        }),
        summary: 'Added vector artwork (kept as one image)',
        mutated: true,
      }
    } catch (error) {
      return {
        output: `Artwork was not added: ${error instanceof Error ? error.message : String(error)}`,
        summary: 'Invalid artwork',
        isError: true,
      }
    }
  }

  if (call.name === 'build_drawboard_scene') {
    const specs = Array.isArray(a.elements) ? a.elements : []
    if (specs.length === 0 || specs.length > 120) {
      return {
        output: 'elements must contain between 1 and 120 items.',
        summary: 'Invalid scene',
        isError: true,
      }
    }
    const additions: Record<string, unknown>[] = []
    const vectorFiles: Array<{ id: string; mimeType: string; dataURL: string; created: number }> =
      []
    const errors: string[] = []
    const sketchDiagnostics: Array<Record<string, unknown>> = []
    const safeColor = (value: unknown, fallback: string): string => {
      if (typeof value !== 'string') return fallback
      const color = value.trim()
      return /^#[0-9a-f]{3,8}$/i.test(color) ||
        /^(transparent|black|white|red|orange|yellow|green|blue|purple|pink|brown|gray|grey)$/i.test(
          color,
        )
        ? color
        : fallback
    }
    const id = () => uid()
    const px = (value: unknown, fallback: number) => num(value, fallback)
    /** A crisp straight segment between two absolute canvas points. Excalidraw
     *  line elements are anchored at their top-left with relative points, so
     *  normalize here rather than emitting negative width/height. */
    const segment = (
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      stroke: string,
      sw: number,
      op: number,
      dashed = false,
    ): Record<string, unknown> => {
      const originX = Math.min(startX, endX)
      const originY = Math.min(startY, endY)
      return {
        id: id(),
        type: 'line',
        x: originX,
        y: originY,
        width: Math.abs(endX - startX),
        height: Math.abs(endY - startY),
        points: [
          [startX - originX, startY - originY],
          [endX - originX, endY - originY],
        ],
        lastCommittedPoint: null,
        strokeColor: stroke,
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: sw,
        strokeStyle: dashed ? 'dashed' : 'solid',
        roughness: 0,
        opacity: op,
      }
    }
    const textStyle = (
      text: string,
      textX: number,
      textY: number,
      size: number,
      stroke: string,
      op: number,
      align: 'left' | 'center' = 'left',
    ): Record<string, unknown> => ({
      id: id(),
      type: 'text',
      x: textX,
      y: textY,
      width: Math.max(60, Math.round(text.length * size * 0.62)),
      height: size + 10,
      fontSize: size,
      fontFamily: 2,
      text: text.slice(0, 2000),
      textAlign: align,
      verticalAlign: 'top',
      strokeColor: stroke,
      backgroundColor: 'transparent',
      opacity: op,
    })
    /**
     * Draw one dimension annotation. Shared by the `dimension` kind and by
     * solved sketches, so a parametric dimension looks identical either way.
     */
    const emitDimensionAnnotation = (options: {
      from: [number, number]
      to: [number, number]
      offset: number
      overshoot: number
      barb: number
      label: string
      labelSize: number
      labelGap: number
      color: string
      labelColor: string
      strokeWidth: number
      opacity: number
    }): { strokes: string[]; labelId: string } => {
      const firstIndex = additions.length
      const [x1, y1] = options.from
      const [x2, y2] = options.to
      const span = Math.hypot(x2 - x1, y2 - y1)
      if (!(span > 0)) return { strokes: [], labelId: '' }
      const normalX = -(y2 - y1) / span
      const normalY = (x2 - x1) / span
      const ax = x1 + normalX * options.offset
      const ay = y1 + normalY * options.offset
      const bx = x2 + normalX * options.offset
      const by = y2 + normalY * options.offset
      const reach = options.offset + Math.sign(options.offset || 1) * options.overshoot
      const thin = Math.max(1, options.strokeWidth - 1)
      additions.push(
        segment(
          x1,
          y1,
          x1 + normalX * reach,
          y1 + normalY * reach,
          options.color,
          thin,
          options.opacity,
        ),
      )
      additions.push(
        segment(
          x2,
          y2,
          x2 + normalX * reach,
          y2 + normalY * reach,
          options.color,
          thin,
          options.opacity,
        ),
      )
      additions.push(segment(ax, ay, bx, by, options.color, options.strokeWidth, options.opacity))
      const angle = Math.atan2(by - ay, bx - ax)
      const spread = Math.PI / 7
      for (const [pointX, pointY, direction] of [
        [ax, ay, angle + Math.PI],
        [bx, by, angle],
      ] as const) {
        additions.push(
          segment(
            pointX,
            pointY,
            pointX + Math.cos(direction - spread) * options.barb,
            pointY + Math.sin(direction - spread) * options.barb,
            options.color,
            thin,
            options.opacity,
          ),
        )
        additions.push(
          segment(
            pointX,
            pointY,
            pointX + Math.cos(direction + spread) * options.barb,
            pointY + Math.sin(direction + spread) * options.barb,
            options.color,
            thin,
            options.opacity,
          ),
        )
      }
      const midX = (ax + bx) / 2
      const midY = (ay + by) / 2
      const labelWidth = Math.max(60, Math.round(options.label.length * options.labelSize * 0.62))
      additions.push(
        textStyle(
          options.label,
          midX - labelWidth / 2,
          midY + (normalY >= 0 ? options.labelGap : -options.labelSize - options.labelGap),
          options.labelSize,
          options.labelColor,
          options.opacity,
          'center',
        ),
      )
      // hand back the created ids so a sketch can record what belongs to it
      const created = additions.slice(firstIndex)
      return {
        strokes: created
          .slice(0, -1)
          .map((element) => String((element as { id?: string }).id ?? '')),
        labelId: String((created[created.length - 1] as { id?: string } | undefined)?.id ?? ''),
      }
    }

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        errors.push(`item ${i + 1}: expected an object`)
        continue
      }
      const source = spec as Record<string, unknown>
      const item: Record<string, unknown> = { ...source }
      // Some local models ignore the required discriminator and flatten point
      // pairs despite the JSON schema. Recover the common unambiguous cases
      // rather than rejecting an otherwise complete scene transactionally.
      if (item.kind === undefined) {
        if (typeof item.text === 'string') item.kind = 'text'
        else if (Array.isArray(item.points)) item.kind = 'polygon'
        else if (['x', 'y', 'width', 'height'].every((key) => typeof item[key] === 'number'))
          item.kind = 'rect'
      }
      if (
        Array.isArray(item.points) &&
        item.points.length >= 6 &&
        item.points.length % 2 === 0 &&
        item.points.every((point) => typeof point === 'number')
      ) {
        const flatPoints = item.points as number[]
        item.points = Array.from({ length: flatPoints.length / 2 }, (_, pair) => [
          flatPoints[pair * 2],
          flatPoints[pair * 2 + 1],
        ])
      }
      // Local models very often reach for the natural word rather than the
      // schema's short name ("rectangle", "oval", "label"). Rejecting those
      // blocked drawing completely, so common synonyms are accepted. `circle`
      // keeps its own spelling because its geometry is handled separately below.
      if (typeof item.kind === 'string') {
        const spoken = item.kind
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, '')
        const alias = SCENE_KIND_ALIASES[spoken]
        if (alias) item.kind = alias
      }
      // Shorthand every model reaches for. Without this the geometry silently
      // fell back to the default 160x90 rectangle and the wrong colours, which
      // looks like the tool "not working" rather than an error.
      const aliasField = (long: string, short: string) => {
        if (item[long] === undefined && item[short] !== undefined) item[long] = item[short]
      }
      aliasField('width', 'w')
      aliasField('height', 'h')
      aliasField('fillColor', 'fill')
      aliasField('strokeColor', 'stroke')
      aliasField('backgroundColor', 'bg')
      const sourceKind = item.kind
      const rawPoints = Array.isArray(item.points) ? item.points : []
      const closedPath =
        rawPoints.length >= 3 &&
        Array.isArray(rawPoints[0]) &&
        Array.isArray(rawPoints.at(-1)) &&
        Math.abs(Number(rawPoints[0]![0]) - Number(rawPoints.at(-1)![0])) < 0.01 &&
        Math.abs(Number(rawPoints[0]![1]) - Number(rawPoints.at(-1)![1])) < 0.01
      const kind =
        sourceKind === 'circle'
          ? 'ellipse'
          : sourceKind === 'path'
            ? closedPath
              ? 'polygon'
              : 'freedraw'
            : sourceKind
      const radius = num(item.radius, 0)
      const x = sourceKind === 'circle' ? px(item.x, 80) - radius : px(item.x, 80 + (i % 6) * 190)
      const y =
        sourceKind === 'circle' ? px(item.y, 80) - radius : px(item.y, 80 + Math.floor(i / 6) * 150)
      const width = sourceKind === 'circle' ? radius * 2 : px(item.width, 160)
      const height = sourceKind === 'circle' ? radius * 2 : px(item.height, 90)
      const color = safeColor(item.color ?? item.strokeStyle, '#1e1b4b')
      const fill = safeColor(item.fillColor, 'transparent')
      const strokeWidth = clamp(Math.round(px(item.lineWidth ?? item.strokeWidth, 2)), 1, 16)
      const opacity = clamp(Math.round(px(item.opacity, 100)), 0, 100)
      const zeroAxisAllowed = kind === 'line' || kind === 'arrow'
      if (
        (sourceKind === 'circle' && (radius < 1 || radius > 2500)) ||
        ![x, y, width, height].every(Number.isFinite) ||
        Math.abs(x) > 50000 ||
        Math.abs(y) > 50000 ||
        width < (zeroAxisAllowed ? 0 : 1) ||
        height < (zeroAxisAllowed ? 0 : 1) ||
        width > 20000 ||
        height > 20000
      ) {
        errors.push(`item ${i + 1}: coordinates must be finite and size between 1 and 20000`)
        continue
      }
      if (kind === 'text') {
        if (typeof item.text !== 'string' || !item.text.trim()) {
          errors.push(`item ${i + 1}: text items require non-empty text`)
          continue
        }
        const size = clamp(Math.round(px(item.size, 20)), 8, 240)
        const textAlign =
          item.textAlign === 'center' || item.textAlign === 'right' ? item.textAlign : 'left'
        const body =
          item.preserveWhitespace === true
            ? item.text.replace(/\r\n?/g, '\n').slice(0, 8000)
            : item.text.trim().slice(0, 2000)
        additions.push({
          id: id(),
          type: 'text',
          x,
          y,
          width,
          height: Math.max(height, size + 10),
          fontSize: size,
          fontFamily: item.fontFamily === 3 ? 3 : 2,
          text: body,
          textAlign,
          verticalAlign: 'top',
          strokeColor: color,
          backgroundColor: 'transparent',
          opacity,
        })
        continue
      }
      if (kind === 'freedraw') {
        const points = Array.isArray(item.points) ? item.points : []
        if (
          points.length < 2 ||
          points.length > 1000 ||
          points.some(
            (point) =>
              !Array.isArray(point) ||
              point.length < 2 ||
              !Number.isFinite(point[0]) ||
              !Number.isFinite(point[1]),
          )
        ) {
          errors.push(`item ${i + 1}: freehand items require 2-1000 finite [x, y] points`)
          continue
        }
        const pairs = points as number[][]
        const xs = pairs.map((point) => point[0]!)
        const ys = pairs.map((point) => point[1]!)
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        if ([...xs, ...ys].some((point) => Math.abs(point) > 50000)) {
          errors.push(`item ${i + 1}: freehand coordinates must be within +/-50000`)
          continue
        }
        additions.push({
          id: id(),
          type: 'freedraw',
          x: minX,
          y: minY,
          width: Math.max(1, Math.max(...xs) - minX),
          height: Math.max(1, Math.max(...ys) - minY),
          strokeColor: color,
          backgroundColor: 'transparent',
          strokeWidth,
          points: pairs.map(([px0, py0]) => [px0! - minX, py0! - minY]),
          pressures: [],
          simulatePressure: true,
          lastCommittedPoint: null,
          opacity,
        })
        continue
      }
      if (kind === 'polygon') {
        const points = Array.isArray(item.points) ? item.points : []
        if (
          points.length < 3 ||
          points.length > 1000 ||
          points.some(
            (point) =>
              !Array.isArray(point) ||
              point.length < 2 ||
              !Number.isFinite(point[0]) ||
              !Number.isFinite(point[1]),
          )
        ) {
          errors.push(`item ${i + 1}: polygon items require 3-1000 finite [x, y] points`)
          continue
        }
        const pairs = points as number[][]
        const xs = pairs.map((point) => point[0]!)
        const ys = pairs.map((point) => point[1]!)
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        const polygonWidth = Math.max(...xs) - minX
        const polygonHeight = Math.max(...ys) - minY
        if (
          [...xs, ...ys].some((point) => Math.abs(point) > 50000) ||
          polygonWidth < 1 ||
          polygonHeight < 1 ||
          polygonWidth > 20000 ||
          polygonHeight > 20000
        ) {
          errors.push(`item ${i + 1}: polygon must have non-zero bounds no larger than 20000px`)
          continue
        }
        const fillColor = safeColor(item.fillColor, '#93c5fd')
        const outline = safeColor(item.color ?? item.strokeStyle, 'transparent')
        const localPoints = pairs
          .map(([px0, py0]) => `${(px0! - minX).toFixed(2)},${(py0! - minY).toFixed(2)}`)
          .join(' ')
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${polygonWidth}" height="${polygonHeight}" viewBox="0 0 ${polygonWidth} ${polygonHeight}"><polygon points="${localPoints}" fill="${fillColor}" stroke="${outline}" stroke-width="${strokeWidth * 2}" stroke-linejoin="round" opacity="${opacity / 100}"/></svg>`
        const png = await rasterizeSvgToPng(svg, polygonWidth, polygonHeight)
        if (!png) {
          errors.push(`item ${i + 1}: polygon could not be rasterised; scene was not changed`)
          continue
        }
        const fileId = id()
        vectorFiles.push({ id: fileId, mimeType: 'image/png', dataURL: png, created: Date.now() })
        additions.push({
          id: id(),
          type: 'image',
          x: minX,
          y: minY,
          width: polygonWidth,
          height: polygonHeight,
          fileId,
          status: 'saved',
          scale: [1, 1],
          strokeColor: 'transparent',
          backgroundColor: 'transparent',
          opacity,
        })
        continue
      }
      if (kind === 'sticky') {
        if (typeof item.text !== 'string' || !item.text.trim()) {
          errors.push(`item ${i + 1}: sticky items require non-empty text`)
          continue
        }
        const stickyId = id()
        const stickyColor = safeColor(item.fillColor, '#fef08a')
        additions.push({
          id: stickyId,
          type: 'rectangle',
          x,
          y,
          width,
          height,
          backgroundColor: stickyColor,
          strokeColor: safeColor(item.color ?? item.strokeStyle, '#422006'),
          fillStyle: 'solid',
          strokeWidth,
          opacity,
        })
        additions.push({
          id: id(),
          type: 'text',
          x: x + 12,
          y: y + 12,
          width: Math.max(1, width - 24),
          height: Math.max(1, height - 24),
          fontSize: clamp(Math.round(px(item.size, 16)), 8, 240),
          fontFamily: 2,
          text: item.text.trim().slice(0, 2000),
          containerId: stickyId,
          strokeColor: safeColor(item.color ?? item.strokeStyle, '#422006'),
          backgroundColor: 'transparent',
          opacity,
        })
        continue
      }
      if (kind === 'sketch') {
        const sketchElementId = id()
        const rawPoints = Array.isArray(item.sketchPoints) ? item.sketchPoints : null
        if (!rawPoints || rawPoints.length === 0) {
          errors.push(`item ${i + 1}: sketch items require a non-empty points array`)
          continue
        }
        let sketchProblem: string | null = null
        const sketchPoints: SketchPoint[] = []
        for (const entry of rawPoints) {
          const record = (entry ?? {}) as Record<string, unknown>
          const pointId = typeof record.id === 'string' ? record.id.trim() : ''
          if (!pointId) {
            sketchProblem = 'every sketch point needs a string id'
            break
          }
          if (!Number.isFinite(Number(record.x)) || !Number.isFinite(Number(record.y))) {
            sketchProblem = `sketch point "${pointId}" needs finite x and y`
            break
          }
          sketchPoints.push({ id: pointId, x: Number(record.x), y: Number(record.y) })
        }
        if (sketchProblem) {
          errors.push(`item ${i + 1}: ${sketchProblem}`)
          continue
        }
        const knownIds = new Set(sketchPoints.map((point) => point.id))
        const SKETCH_CONSTRAINT_KINDS = new Set([
          'fixed',
          'coincident',
          'horizontal',
          'vertical',
          'distance',
          'pointOnLine',
          'parallel',
          'perpendicular',
          'equalLength',
          'angle',
          'midpoint',
          'radius',
        ])
        const constraints: Constraint[] = []
        for (const entry of Array.isArray(item.constraints) ? item.constraints : []) {
          const record = (entry ?? {}) as Record<string, unknown>
          const constraintKind = typeof record.kind === 'string' ? record.kind : ''
          if (!SKETCH_CONSTRAINT_KINDS.has(constraintKind)) {
            sketchProblem = `unsupported sketch constraint "${constraintKind}"`
            break
          }
          const unknownPoint = Object.entries(record).find(
            ([key, value]) =>
              key !== 'kind' &&
              key !== 'value' &&
              typeof value === 'string' &&
              !knownIds.has(value),
          )
          if (unknownPoint) {
            sketchProblem = `sketch constraint "${constraintKind}" references unknown point "${String(unknownPoint[1])}"`
            break
          }
          constraints.push(record as unknown as Constraint)
        }
        for (const entry of rawPoints) {
          const record = (entry ?? {}) as Record<string, unknown>
          if (record.fixed === true && typeof record.id === 'string')
            constraints.push({ kind: 'fixed', point: record.id })
        }
        if (sketchProblem) {
          errors.push(`item ${i + 1}: ${sketchProblem}`)
          continue
        }
        const sketchScale =
          Number.isFinite(Number(item.scale)) && Number(item.scale) !== 0 ? Number(item.scale) : 1
        const baseSketch: Sketch = { points: sketchPoints, constraints }
        const move = item.move as Record<string, unknown> | undefined
        const solvedSketch =
          move && typeof move.point === 'string' && Array.isArray(move.to) && move.to.length >= 2
            ? solveWithMovedPoint(baseSketch, move.point, [
                Number(move.to[0]) || 0,
                Number(move.to[1]) || 0,
              ])
            : solveSketch(baseSketch)
        // Element ids are captured as the sketch is drawn so the model can
        // point back at them; that is what makes a later drag re-solvable.
        const memberIds = new Set<string>()
        const segmentLinks: SketchModel['segments'] = []
        const circleLinks: SketchModel['circles'] = []
        const dimensionLinks: SketchModel['dimensions'] = []
        const solvedById = new Map(solvedSketch.points.map((point) => [point.id, point]))
        const sketchOriginX = px(item.x, 80)
        const sketchOriginY = px(item.y, 80)
        const toCanvas = (pointId: unknown): [number, number] | null => {
          const solvedPoint = typeof pointId === 'string' ? solvedById.get(pointId) : undefined
          if (!solvedPoint) return null
          return [
            sketchOriginX + solvedPoint.x * sketchScale,
            sketchOriginY + solvedPoint.y * sketchScale,
          ]
        }
        for (const entry of Array.isArray(item.segments) ? item.segments : []) {
          const record = (entry ?? {}) as Record<string, unknown>
          const from = toCanvas(record.a)
          const to = toCanvas(record.b)
          if (!from || !to) {
            sketchProblem = 'a sketch segment references an unknown point'
            break
          }
          const createdSegment = segment(
            from[0],
            from[1],
            to[0],
            to[1],
            safeColor(record.color ?? item.color, '#1e1b4b'),
            clamp(Math.round(Number(record.strokeWidth ?? item.strokeWidth) || 2), 1, 16),
            opacity,
          )
          additions.push(createdSegment)
          segmentLinks.push({
            elementId: String(createdSegment.id),
            a: String(record.a),
            b: String(record.b),
          })
          memberIds.add(String(createdSegment.id))
        }
        if (sketchProblem) {
          errors.push(`item ${i + 1}: ${sketchProblem}`)
          continue
        }
        for (const entry of Array.isArray(item.circles) ? item.circles : []) {
          const record = (entry ?? {}) as Record<string, unknown>
          const sketchCenter = toCanvas(record.center)
          const sketchRim = toCanvas(record.rim)
          if (!sketchCenter || !sketchRim) {
            sketchProblem = 'a sketch circle references an unknown point'
            break
          }
          const radius = Math.hypot(sketchRim[0] - sketchCenter[0], sketchRim[1] - sketchCenter[1])
          if (!(radius > 0)) continue
          const createdCircle = {
            id: id(),
            type: 'ellipse',
            x: sketchCenter[0] - radius,
            y: sketchCenter[1] - radius,
            width: radius * 2,
            height: radius * 2,
            strokeColor: safeColor(record.color ?? item.color, '#1e1b4b'),
            backgroundColor: 'transparent',
            fillStyle: 'solid',
            strokeWidth: clamp(Math.round(Number(item.strokeWidth) || 2), 1, 16),
            roughness: 0,
            opacity,
          }
          additions.push(createdCircle)
          circleLinks.push({
            elementId: String(createdCircle.id),
            center: String(record.center),
            rim: String(record.rim),
          })
          memberIds.add(String(createdCircle.id))
        }
        if (sketchProblem) {
          errors.push(`item ${i + 1}: ${sketchProblem}`)
          continue
        }
        const sketchUnits = typeof item.units === 'string' ? item.units.trim().slice(0, 12) : ''
        for (const entry of Array.isArray(item.dimensions) ? item.dimensions : []) {
          const record = (entry ?? {}) as Record<string, unknown>
          const from = toCanvas(record.a)
          const to = toCanvas(record.b)
          if (!from || !to) continue
          const measuredSpan = Math.hypot(to[0] - from[0], to[1] - from[1]) / sketchScale
          const unitScale =
            Number.isFinite(Number(record.scale)) && Number(record.scale) !== 0
              ? Number(record.scale)
              : 1
          const value = measuredSpan * unitScale
          const labelText =
            typeof record.text === 'string' && record.text.trim()
              ? record.text.trim()
              : `${value >= 100 ? value.toFixed(0) : value.toFixed(2)}${sketchUnits ? ` ${sketchUnits}` : ''}`
          const dimensionColor = safeColor(record.color ?? item.color, '#1e1b4b')
          const dimensionOffset = clamp(px(record.offset, 36), -4000, 4000)
          const dimensionSize = clamp(Math.round(px(record.size, 18)), 8, 240)
          const annotation = emitDimensionAnnotation({
            from,
            to,
            offset: dimensionOffset,
            overshoot: 10,
            barb: 12,
            label: labelText,
            labelSize: dimensionSize,
            labelGap: 8,
            color: dimensionColor,
            labelColor: dimensionColor,
            strokeWidth,
            opacity,
          })
          for (const elementId of annotation.strokes) memberIds.add(elementId)
          if (annotation.labelId) memberIds.add(annotation.labelId)
          dimensionLinks.push({
            elementIds: annotation.strokes,
            labelId: annotation.labelId,
            from: String(record.a),
            to: String(record.b),
            offset: dimensionOffset,
            overshoot: 10,
            barb: 12,
            labelGap: 8,
            labelSize: dimensionSize,
            unitScale,
            units: sketchUnits,
            text: typeof record.text === 'string' ? record.text : '',
          })
        }
        // The whole constraint model rides on every member element, so any one
        // of them surviving a save/open is enough to keep the sketch live.
        const sketchModel: SketchModel = {
          version: 1,
          id: sketchElementId,
          originX: sketchOriginX,
          originY: sketchOriginY,
          scale: sketchScale,
          points: solvedSketch.points,
          constraints,
          segments: segmentLinks,
          circles: circleLinks,
          dimensions: dimensionLinks,
        }
        for (let index = 0; index < additions.length; index += 1) {
          const element = additions[index] as unknown as LiveElement
          if (memberIds.has(String(element.id))) {
            additions[index] = withSketchModel(element, sketchModel) as unknown as Record<
              string,
              unknown
            >
          }
        }
        sketchDiagnostics.push({
          status: solvedSketch.status,
          dof: solvedSketch.dof,
          converged: solvedSketch.converged,
          residual: solvedSketch.residual,
          iterations: solvedSketch.iterations,
        })
        continue
      }
      if (kind === 'dimension') {
        const x1 = px(item.x1, x)
        const y1 = px(item.y1, y)
        const x2 = px(item.x2, x + width)
        const y2 = px(item.y2, y + height)
        const span = Math.hypot(x2 - x1, y2 - y1)
        if (![x1, y1, x2, y2].every(Number.isFinite) || span < 1) {
          errors.push(`item ${i + 1}: dimension items require two distinct finite points`)
          continue
        }
        const dimColor = safeColor(item.color ?? item.strokeStyle, '#1e1b4b')
        const units = typeof item.units === 'string' ? item.units.trim().slice(0, 12) : ''
        const scale =
          Number.isFinite(Number(item.scale)) && Number(item.scale) !== 0 ? Number(item.scale) : 1
        const measured = span * scale
        const label =
          typeof item.text === 'string' && item.text.trim()
            ? item.text.trim()
            : `${measured >= 100 ? measured.toFixed(0) : measured.toFixed(2)}${units ? ` ${units}` : ''}`
        const labelSize = clamp(Math.round(px(item.size, 18)), 8, 240)
        emitDimensionAnnotation({
          from: [x1, y1],
          to: [x2, y2],
          offset: clamp(px(item.offset, 36), -4000, 4000),
          overshoot: clamp(px(item.overshoot, 10), 0, 400),
          barb: clamp(px(item.arrowSize, 12), 4, 200),
          label,
          labelSize,
          labelGap: clamp(px(item.labelGap, 8), 0, 400),
          color: dimColor,
          labelColor: safeColor(item.labelColor ?? item.color, dimColor),
          strokeWidth,
          opacity,
        })
        continue
      }
      if (kind === 'leader') {
        const text = typeof item.text === 'string' ? item.text.trim() : ''
        if (!text) {
          errors.push(`item ${i + 1}: leader items require non-empty text`)
          continue
        }
        const targetX = px(item.x, 80)
        const targetY = px(item.y, 80)
        const labelX = px(item.labelX, targetX + 140)
        const labelY = px(item.labelY, targetY - 70)
        const leaderLength = Math.hypot(labelX - targetX, labelY - targetY)
        if (![targetX, targetY, labelX, labelY].every(Number.isFinite) || leaderLength < 1) {
          errors.push(`item ${i + 1}: leader items require distinct target and label points`)
          continue
        }
        const leaderColor = safeColor(item.color ?? item.strokeStyle, '#1e1b4b')
        const labelSize = clamp(Math.round(px(item.size, 18)), 8, 240)
        const dot = clamp(px(item.dotSize, 8), 2, 60)
        additions.push(segment(targetX, targetY, labelX, labelY, leaderColor, strokeWidth, opacity))
        additions.push({
          id: id(),
          type: 'ellipse',
          x: targetX - dot / 2,
          y: targetY - dot / 2,
          width: dot,
          height: dot,
          strokeColor: leaderColor,
          backgroundColor: leaderColor,
          fillStyle: 'solid',
          strokeWidth: 1,
          roughness: 0,
          opacity,
        })
        additions.push(
          textStyle(
            text,
            labelX + 8,
            labelY - labelSize / 2,
            labelSize,
            safeColor(item.labelColor ?? item.color, leaderColor),
            opacity,
          ),
        )
        continue
      }
      if (
        kind === 'rect' ||
        kind === 'ellipse' ||
        kind === 'diamond' ||
        kind === 'line' ||
        kind === 'arrow'
      ) {
        const type = kind === 'rect' ? 'rectangle' : kind
        // Section hatching and other fills map onto Excalidraw's fill styles,
        // so technical drawings get hachure/cross-hatch fills natively.
        const requested =
          typeof item.hatch === 'string'
            ? item.hatch
            : typeof item.fillStyle === 'string'
              ? item.fillStyle
              : ''
        const fillStyle = ['hachure', 'cross-hatch', 'zigzag', 'dots', 'solid'].includes(requested)
          ? requested
          : 'solid'
        const shapeId = id()
        const shape: Record<string, unknown> = {
          id: shapeId,
          type,
          x,
          y,
          width,
          height,
          strokeColor: color,
          backgroundColor: fill,
          fillStyle,
          strokeWidth,
          strokeStyle: 'solid',
          roughness: 0,
          opacity,
        }
        if (kind === 'line' || kind === 'arrow') {
          const x1 = Number.isFinite(Number(item.x1)) ? Number(item.x1) : x
          const y1 = Number.isFinite(Number(item.y1)) ? Number(item.y1) : y
          const x2 = Number.isFinite(Number(item.x2)) ? Number(item.x2) : x + width
          const y2 = Number.isFinite(Number(item.y2)) ? Number(item.y2) : y + height
          const originX = Math.min(x1, x2)
          const originY = Math.min(y1, y2)
          shape.x = originX
          shape.y = originY
          shape.width = Math.abs(x2 - x1)
          shape.height = Math.abs(y2 - y1)
          shape.points = [
            [x1 - originX, y1 - originY],
            [x2 - originX, y2 - originY],
          ]
          shape.lastCommittedPoint = null
          shape.strokeStyle =
            item.dashed === true || item.strokeStyle === 'dashed' ? 'dashed' : 'solid'
          const arrowheads = new Set(['arrow', 'triangle', 'bar', 'dot'])
          if (kind === 'arrow') {
            shape.endArrowhead =
              typeof item.endArrowhead === 'string' && arrowheads.has(item.endArrowhead)
                ? item.endArrowhead
                : 'arrow'
            shape.startArrowhead =
              typeof item.startArrowhead === 'string' && arrowheads.has(item.startArrowhead)
                ? item.startArrowhead
                : null
          } else {
            shape.endArrowhead =
              typeof item.endArrowhead === 'string' && arrowheads.has(item.endArrowhead)
                ? item.endArrowhead
                : null
            shape.startArrowhead =
              typeof item.startArrowhead === 'string' && arrowheads.has(item.startArrowhead)
                ? item.startArrowhead
                : null
          }
        }
        additions.push(shape)
        if (typeof item.label === 'string' && item.label.trim()) {
          const insetX = kind === 'ellipse' ? Math.min(16, width * 0.12) : 10
          const insetY = kind === 'ellipse' ? Math.min(12, height * 0.12) : 8
          const labelSize = clamp(Math.round(px(item.size, 15)), 8, 240)
          additions.push({
            id: id(),
            type: 'text',
            x: x + insetX,
            y: y + Math.max(insetY, (height - labelSize - 10) / 2),
            width: Math.max(1, width - insetX * 2),
            height: Math.max(labelSize + 10, height - insetY * 2),
            fontSize: labelSize,
            fontFamily: 2,
            text: item.label.trim().slice(0, 2000),
            textAlign: 'center',
            verticalAlign: 'middle',
            containerId: shapeId,
            strokeColor: color,
            backgroundColor: 'transparent',
            opacity,
          })
        }
        continue
      }
      if (kind === 'scene3d') {
        try {
          const spec3d = parseScene3dSpec(item, {
            originX: px(item.x, 80),
            originY: px(item.y, 80),
          })
          const projected = projectScene3d(spec3d)
          if (!projected.faces.length && !projected.edges.length) {
            errors.push(`item ${i + 1}: 3D scene projected to nothing visible`)
            continue
          }
          const { minX, minY, maxX, maxY } = projected.bounds
          const sceneWidth = Math.max(1, maxX - minX)
          const sceneHeight = Math.max(1, maxY - minY)
          // Faces are shaded in world space and painted back-to-front, so the
          // whole shaded solid set ships as ONE scalable object.
          if (projected.faces.length) {
            const shapes = projected.faces
              .map(
                (face) =>
                  `<polygon points="${face.points.map(([pointX, pointY]) => `${(pointX - minX).toFixed(2)},${(pointY - minY).toFixed(2)}`).join(' ')}" fill="${face.fill}" stroke="none"/>`,
              )
              .join('')
            const sceneSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sceneWidth}" height="${sceneHeight}" viewBox="0 0 ${sceneWidth} ${sceneHeight}">${shapes}</svg>`
            const png = await rasterizeSvgToPng(sceneSvg, sceneWidth, sceneHeight)
            if (!png) {
              errors.push(`item ${i + 1}: 3D faces could not be rasterised; scene was not changed`)
              continue
            }
            const fileId = id()
            vectorFiles.push({
              id: fileId,
              mimeType: 'image/png',
              dataURL: png,
              created: Date.now(),
            })
            additions.push({
              id: id(),
              type: 'image',
              x: minX,
              y: minY,
              width: sceneWidth,
              height: sceneHeight,
              fileId,
              status: 'saved',
              scale: [1, 1],
              strokeColor: 'transparent',
              backgroundColor: 'transparent',
              opacity,
            })
          }
          // Edges ride on top as real board lines, so the linework stays crisp
          // and editable and hidden edges can be dashed.
          for (const edge of projected.edges) {
            additions.push(
              segment(
                edge.x1,
                edge.y1,
                edge.x2,
                edge.y2,
                spec3d.edgeColor,
                Math.max(1, strokeWidth - 1),
                opacity,
                edge.hidden,
              ),
            )
          }
          continue
        } catch (error) {
          errors.push(
            `item ${i + 1}: ${error instanceof Error ? error.message : 'invalid 3D scene'}`,
          )
          continue
        }
      }
      // Name the accepted set so the model can correct itself on the retry
      // instead of repeating the same rejected kind until the run gives up.
      errors.push(
        `item ${i + 1}: unsupported kind "${String(kind)}". Use one of: ${SCENE_KINDS.join(', ')}`,
      )
    }
    if (errors.length)
      return {
        output: `Scene was not changed. ${errors.join('; ')}`,
        summary: 'Scene needs correction',
        isError: true,
      }
    if (vectorFiles.length) api.addFiles(vectorFiles as never)
    const nextScene = restore(
      { elements: normalizeBoardElementPoints([...api.getSceneElements(), ...additions]) as never },
      null,
      null,
      { repairBindings: true } as never,
    )
    updateElements(nextScene.elements ?? [])
    const inventory = additions.map((item) => ({ id: item.id, type: item.type, text: item.text }))
    return {
      output: JSON.stringify({
        created: additions.length,
        elements: inventory,
        ...(sketchDiagnostics.length ? { sketches: sketchDiagnostics } : {}),
      }),
      summary: `Built scene (${additions.length} elements)${sketchDiagnostics.length ? ` - ${String(sketchDiagnostics[0]!.status)}` : ''}`,
      mutated: true,
    }
  }

  if (call.name === 'add_board_text') {
    if (typeof a.text !== 'string' || !a.text.trim())
      return { output: 'Missing text.', summary: 'Invalid input', isError: true }
    const size = clamp(Math.round(num(a.size, 20)), 8, 240)
    const element = {
      id: uid(),
      type: 'text',
      x: num(a.x, 80),
      y: num(a.y, 80),
      width: 240,
      height: size + 10,
      fontSize: size,
      fontFamily: 2,
      text: (a.text as string).trim(),
      textAlign: 'left',
      verticalAlign: 'top',
      strokeColor: str(a.color, '#1e1b4b'),
      backgroundColor: 'transparent',
    }
    updateElements([...api.getSceneElements(), element])
    return { output: JSON.stringify(element), summary: 'Added board text', mutated: true }
  }

  if (call.name === 'add_sticky_note') {
    if (typeof a.text !== 'string' || !a.text.trim())
      return { output: 'Missing text.', summary: 'Invalid input', isError: true }
    const x = num(a.x, 100)
    const y = num(a.y, 100)
    const noteId = uid()
    const rect = {
      id: noteId,
      type: 'rectangle',
      x,
      y,
      width: 220,
      height: 150,
      backgroundColor: str(a.color, '#fef08a'),
      strokeColor: '#422006',
    }
    const label = {
      id: uid(),
      type: 'text',
      x: x + 12,
      y: y + 16,
      width: 196,
      height: 118,
      fontSize: 16,
      fontFamily: 2,
      text: (a.text as string).trim(),
      containerId: noteId,
      strokeColor: '#422006',
      backgroundColor: 'transparent',
    }
    updateElements([...api.getSceneElements(), rect, label])
    return { output: JSON.stringify({ rect, label }), summary: 'Added sticky note', mutated: true }
  }

  if (call.name === 'add_board_shape' && typeof a.shape === 'string') {
    const shape = a.shape
    if (
      shape !== 'line' &&
      shape !== 'rect' &&
      shape !== 'ellipse' &&
      shape !== 'diamond' &&
      shape !== 'arrow'
    ) {
      return {
        output: 'Shape must be line, rect, ellipse, diamond, or arrow.',
        summary: 'Invalid input',
        isError: true,
      }
    }
    const x1 = num(a.x1, 80)
    const y1 = num(a.y1, 80)
    const x2 = num(a.x2, 220)
    const y2 = num(a.y2, 160)
    const type = shape === 'rect' ? 'rectangle' : shape
    const color = str(a.color, '#1e1b4b')
    const width = clamp(Math.round(num(a.width, 4) / 2), 1, 16)
    const element: Record<string, unknown> = {
      id: uid(),
      type,
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.max(1, Math.abs(x2 - x1)),
      height: Math.max(1, Math.abs(y2 - y1)),
      strokeColor: color,
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: width,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
    }
    if (type === 'line' || type === 'arrow') {
      const originX = Math.min(x1, x2)
      const originY = Math.min(y1, y2)
      element.x = originX
      element.y = originY
      element.points = [
        [x1 - originX, y1 - originY],
        [x2 - originX, y2 - originY],
      ]
      element.lastCommittedPoint = null
      if (type === 'arrow') {
        element.endArrowhead = 'arrow'
        element.startArrowhead = null
      }
    }
    updateElements([...api.getSceneElements(), element])
    return { output: JSON.stringify(element), summary: `Added ${shape}`, mutated: true }
  }

  if (call.name === 'add_freedraw') {
    const pts = Array.isArray(a.points) ? (a.points as unknown[]) : []
    if (pts.length < 2 || pts.length > 200)
      return { output: 'Provide 2-200 points.', summary: 'Invalid input', isError: true }
    const pairs: Array<[number, number]> = []
    for (const p of pts) {
      if (
        !Array.isArray(p) ||
        typeof p[0] !== 'number' ||
        typeof p[1] !== 'number' ||
        !Number.isFinite(p[0]) ||
        !Number.isFinite(p[1])
      ) {
        return {
          output: 'Every point must be [x, y] numbers.',
          summary: 'Invalid input',
          isError: true,
        }
      }
      pairs.push([p[0], p[1]])
    }
    const xs = pairs.map((p) => p[0])
    const ys = pairs.map((p) => p[1])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const element = {
      id: uid(),
      type: 'freedraw',
      x: minX,
      y: minY,
      width: Math.max(1, Math.max(...xs) - minX),
      height: Math.max(1, Math.max(...ys) - minY),
      strokeColor: str(a.color, '#1e1b4b'),
      backgroundColor: 'transparent',
      strokeWidth: clamp(Math.round(num(a.width, 4) / 2), 1, 16),
      points: pairs.map(([x, y]) => [x - minX, y - minY]),
      pressures: [],
      simulatePressure: true,
      lastCommittedPoint: null,
    }
    updateElements([...api.getSceneElements(), element])
    return {
      output: JSON.stringify(element),
      summary: `Drew stroke (${pairs.length} points)`,
      mutated: true,
    }
  }

  if (call.name === 'add_board_image') {
    const staged = getStaged()
    if (staged.length === 0) {
      return {
        output: 'No images were attached to this message. Ask the user to attach one first.',
        summary: 'No attached image',
        isError: true,
      }
    }
    const want = typeof a.name === 'string' ? a.name.trim().toLowerCase() : ''
    const match =
      staged.find((img) => img.name.toLowerCase().includes(want)) ?? (want ? undefined : staged[0])
    if (!match) {
      return {
        output: `No attached image matches "${String(a.name ?? '')}". Attached: ${staged.map((img) => img.name).join(', ')}.`,
        summary: 'Image not found',
        isError: true,
      }
    }
    const placed = placeImagesOnBoard(
      api,
      [match],
      [
        {
          x: num(a.x, 120),
          y: num(a.y, 120),
          maxWidth: clamp(Math.round(num(a.maxWidth, 480)), 64, 1200),
        },
      ],
    )
    if (placed.placed === 0)
      return { output: placed.summary, summary: 'Place failed', isError: true }
    return { output: placed.summary, summary: `Placed ${match.name}`, mutated: true }
  }

  if (call.name === 'add_board_image_from_url') {
    const imageUrl = typeof a.imageUrl === 'string' ? a.imageUrl.trim() : ''
    if (!imageUrl)
      return {
        output: 'A search result imageUrl is required.',
        summary: 'Missing image URL',
        isError: true,
      }
    try {
      const parsed = new URL(imageUrl)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return {
          output: 'Only HTTP or HTTPS image URLs can be placed.',
          summary: 'Unsupported image URL',
          isError: true,
        }
      }
    } catch {
      return {
        output: 'The imageUrl is not a valid URL.',
        summary: 'Invalid image URL',
        isError: true,
      }
    }
    if (!fetchImage) {
      return {
        output: 'Remote image fetching is unavailable in this app session.',
        summary: 'Image fetch unavailable',
        isError: true,
      }
    }
    try {
      const fetched = await fetchImage(imageUrl)
      if (!fetched || !fetched.mime.startsWith('image/')) {
        return {
          output: 'The image could not be downloaded. Choose another image_search result.',
          summary: 'Image download failed',
          isError: true,
        }
      }
      const dataUrl = `data:${fetched.mime};base64,${fetched.base64}`
      const dimensions = await readBoardImageDimensions(dataUrl)
      const title =
        typeof a.title === 'string' && a.title.trim() ? a.title.trim().slice(0, 180) : 'Web image'
      const staged: StagedBoardImage = {
        id: uid(),
        name: title,
        size: Math.floor(fetched.base64.length * 0.75),
        mimeType: fetched.mime,
        dataUrl,
        ...dimensions,
      }
      const placed = placeImagesOnBoard(
        api,
        [staged],
        [
          {
            x: num(a.x, 120),
            y: num(a.y, 120),
            maxWidth: clamp(Math.round(num(a.maxWidth, 480)), 64, 1200),
          },
        ],
      )
      if (placed.placed === 0)
        return { output: placed.summary, summary: 'Place failed', isError: true }
      return {
        output: `${placed.summary} Source: ${imageUrl}`,
        summary: `Placed ${title}`,
        mutated: true,
      }
    } catch (error) {
      return {
        output: `Could not fetch or place that image: ${error instanceof Error ? error.message : String(error)}`,
        summary: 'Image placement failed',
        isError: true,
      }
    }
  }

  if (call.name === 'generate_image') {
    const prompt = typeof a.prompt === 'string' ? a.prompt.trim() : ''
    if (!prompt) {
      return {
        output: 'A prompt is required to generate an image.',
        summary: 'Missing prompt',
        isError: true,
      }
    }
    if (!generateImage) {
      return {
        output: 'Image generation is unavailable in this app session.',
        summary: 'Image generation unavailable',
        isError: true,
      }
    }
    const aspectRatio = typeof a.aspectRatio === 'string' ? a.aspectRatio.trim() : ''
    try {
      // The shared app-wide handler reads the AI settings file itself and
      // routes to whichever image provider is configured, then hands back raw
      // bytes — the same shape fetchImage returns, so placement is identical.
      const generated = await generateImage({ prompt, ...(aspectRatio ? { aspectRatio } : {}) })
      if ('error' in generated) {
        return {
          output: `Image generation failed: ${generated.error}`,
          summary: 'Image generation failed',
          isError: true,
        }
      }
      if (!generated.mime.startsWith('image/')) {
        return {
          output: 'The provider did not return an image.',
          summary: 'Unexpected media type',
          isError: true,
        }
      }
      const dataUrl = `data:${generated.mime};base64,${generated.base64}`
      const dimensions = await readBoardImageDimensions(dataUrl)
      const title =
        typeof a.title === 'string' && a.title.trim()
          ? a.title.trim().slice(0, 180)
          : prompt.slice(0, 120)
      const staged: StagedBoardImage = {
        id: uid(),
        name: title,
        size: Math.floor(generated.base64.length * 0.75),
        mimeType: generated.mime,
        dataUrl,
        ...dimensions,
      }
      const placed = placeImagesOnBoard(
        api,
        [staged],
        [
          {
            x: num(a.x, 120),
            y: num(a.y, 120),
            maxWidth: clamp(Math.round(num(a.maxWidth, 480)), 64, 1200),
          },
        ],
      )
      if (placed.placed === 0)
        return { output: placed.summary, summary: 'Place failed', isError: true }
      return {
        output: `${placed.summary} Generated from prompt: ${prompt}`,
        summary: `Generated and placed "${title}"`,
        mutated: true,
      }
    } catch (error) {
      return {
        output: `Could not generate that image: ${error instanceof Error ? error.message : String(error)}`,
        summary: 'Image generation failed',
        isError: true,
      }
    }
  }

  if (call.name === 'update_board_text') {
    if (typeof a.id !== 'string' || !a.id)
      return { output: 'Missing element id.', summary: 'Invalid input', isError: true }
    if (typeof a.text !== 'string' || !a.text.trim())
      return { output: 'Missing text.', summary: 'Invalid input', isError: true }
    try {
      const elements = api.getSceneElements()
      const target = elements.find((el) => el.id === a.id) as unknown as
        Record<string, unknown> | undefined
      if (!target)
        return { output: `No element with id ${a.id}.`, summary: 'Unknown element', isError: true }
      if (target.type !== 'text')
        return {
          output: `Element ${a.id} is a ${String(target.type)}, not text.`,
          summary: 'Not a text element',
          isError: true,
        }
      const next = (a.text as string).trim()
      const updated = elements.map((el) =>
        el.id === a.id ? ({ ...el, text: next, originalText: next } as never) : el,
      )
      updateElements(updated)
      return {
        output: JSON.stringify({ id: a.id, text: next }),
        summary: 'Updated board text',
        mutated: true,
      }
    } catch (error) {
      return { output: String(error), summary: 'Update failed', isError: true }
    }
  }

  if (call.name === 'move_board_elements') {
    if (!Array.isArray(a.ids) || a.ids.length === 0 || a.ids.length > 50) {
      return { output: 'Provide 1-50 element ids.', summary: 'Invalid input', isError: true }
    }
    const dx = num(a.dx, NaN)
    const dy = num(a.dy, NaN)
    if (!Number.isFinite(dx) || !Number.isFinite(dy))
      return { output: 'dx and dy must be numbers.', summary: 'Invalid input', isError: true }
    try {
      const wanted = new Set(a.ids as string[])
      const elements = api.getSceneElements()
      // Bound labels travel with their shapes.
      for (const el of elements) {
        const e = el as unknown as Record<string, unknown>
        if (typeof e.containerId === 'string' && wanted.has(e.containerId)) wanted.add(el.id)
      }
      let moved = 0
      const updated = elements.map((el) => {
        if (!wanted.has(el.id)) return el
        const e = el as unknown as Record<string, unknown>
        if (typeof e.x !== 'number' || typeof e.y !== 'number') return el
        moved += 1
        return { ...el, x: (e.x as number) + dx, y: (e.y as number) + dy } as never
      })
      if (moved === 0)
        return {
          output: 'No matching elements on the board.',
          summary: 'Nothing moved',
          isError: true,
        }
      updateElements(updated)
      return {
        output: `Moved ${moved} element(s) by (${dx}, ${dy}).`,
        summary: `Moved ${moved} element(s)`,
        mutated: true,
      }
    } catch (error) {
      return { output: String(error), summary: 'Move failed', isError: true }
    }
  }

  if (call.name === 'scale_board_elements') {
    if (!Array.isArray(a.ids) || a.ids.length === 0 || a.ids.length > 50)
      return { output: 'Provide 1-50 element ids.', summary: 'Invalid input', isError: true }
    const scale = num(a.scale, NaN)
    if (!Number.isFinite(scale) || scale < 0.1 || scale > 4)
      return { output: 'Scale must be between 0.1 and 4.', summary: 'Invalid input', isError: true }
    const ids = new Set(a.ids as string[])
    for (const element of liveEls())
      if (typeof element.containerId === 'string' && ids.has(element.containerId))
        ids.add(element.id)
    const { elements, scaled } = scaleElements(liveEls(), ids, scale)
    if (!scaled)
      return {
        output: 'No matching elements on the board.',
        summary: 'Nothing scaled',
        isError: true,
      }
    applyEls(elements)
    return {
      output: `Scaled ${scaled} element(s) by ${scale}.`,
      summary: `Scaled ${scaled} element(s)`,
      mutated: true,
    }
  }

  if (call.name === 'style_board_elements') {
    if (!Array.isArray(a.ids) || a.ids.length === 0 || a.ids.length > 50)
      return { output: 'Provide 1-50 element ids.', summary: 'Invalid input', isError: true }
    const hex = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    if (
      (a.strokeColor !== undefined && !hex(a.strokeColor)) ||
      (a.backgroundColor !== undefined &&
        a.backgroundColor !== 'transparent' &&
        !hex(a.backgroundColor)) ||
      (a.strokeWidth !== undefined &&
        (!Number.isFinite(Number(a.strokeWidth)) ||
          Number(a.strokeWidth) < 1 ||
          Number(a.strokeWidth) > 12))
    )
      return {
        output: 'Use #RRGGBB colours and strokeWidth 1-12.',
        summary: 'Invalid style',
        isError: true,
      }
    const style = {
      ...(hex(a.strokeColor) ? { strokeColor: a.strokeColor as string } : {}),
      ...(a.backgroundColor === 'transparent' || hex(a.backgroundColor)
        ? { backgroundColor: a.backgroundColor as string }
        : {}),
      ...(a.strokeWidth !== undefined ? { strokeWidth: Number(a.strokeWidth) } : {}),
    }
    if (!Object.keys(style).length)
      return { output: 'Provide at least one style property.', summary: 'No style', isError: true }
    const { elements, changed } = styleElements(liveEls(), new Set(a.ids as string[]), style)
    if (!changed)
      return {
        output: 'No matching elements on the board.',
        summary: 'Nothing styled',
        isError: true,
      }
    applyEls(elements)
    return {
      output: `Styled ${changed} element(s).`,
      summary: `Styled ${changed} element(s)`,
      mutated: true,
    }
  }

  if (call.name === 'delete_board_elements' || call.name === 'erase_board_elements') {
    const erasing = call.name === 'erase_board_elements'
    if (erasing && !Array.isArray(a.ids)) {
      return {
        output: 'Provide 1-50 element ids to erase.',
        summary: 'Invalid erase targets',
        isError: true,
      }
    }
    if (a.ids !== undefined && (!Array.isArray(a.ids) || a.ids.length === 0 || a.ids.length > 50)) {
      return {
        output: erasing ? 'Provide 1-50 element ids to erase.' : 'Provide 1-50 element ids.',
        summary: 'Invalid input',
        isError: true,
      }
    }
    const ids = resolveIds(a.ids)
    if (!ids)
      return {
        output: 'Nothing is selected and no ids were given. Read the board first.',
        summary: 'No targets',
        isError: true,
      }
    try {
      const { elements, deleted } = deleteElements(liveEls(), ids)
      if (deleted === 0)
        return {
          output: 'No matching elements on the board.',
          summary: 'Nothing deleted',
          isError: true,
        }
      applyEls(elements)
      return {
        output: `${erasing ? 'Erased' : 'Deleted'} ${deleted} element(s).`,
        summary: `${erasing ? 'Erased' : 'Deleted'} ${deleted} element(s)`,
        mutated: true,
      }
    } catch (error) {
      return {
        output: String(error),
        summary: erasing ? 'Erase failed' : 'Delete failed',
        isError: true,
      }
    }
  }

  if (call.name === 'clear_drawboard') {
    if (a.confirm !== true) {
      return {
        output:
          'Refused: clearing needs confirm=true and an explicit user request to clear the board.',
        summary: 'Clear refused',
        isError: true,
      }
    }
    try {
      const count = api.getSceneElements().length
      if (count === 0)
        return { output: 'The drawing is already empty.', summary: 'Nothing to clear' }
      updateElements([])
      return { output: `Cleared ${count} element(s).`, summary: 'Cleared drawing', mutated: true }
    } catch (error) {
      return { output: String(error), summary: 'Clear failed', isError: true }
    }
  }

  if (call.name === 'undo_drawboard') {
    if (history) {
      const prev = history.undo()
      if (!prev) return { output: 'Nothing to undo.', summary: 'Nothing to undo' }
      updateElements(prev)
      return { output: 'Undid the last board change.', summary: 'Undid last change', mutated: true }
    }
    try {
      const elements = api.getSceneElements()
      if (elements.length === 0)
        return { output: 'The drawing is already empty.', summary: 'Nothing to undo' }
      updateElements(elements.slice(0, -1))
      return {
        output: 'Removed the last drawing element.',
        summary: 'Removed last element',
        mutated: true,
      }
    } catch (error) {
      return { output: String(error), summary: 'Undo failed', isError: true }
    }
  }

  if (call.name === 'redo_drawboard') {
    if (!history)
      return { output: 'Redo is unavailable in this session.', summary: 'No redo', isError: true }
    const next = history.redo()
    if (!next) return { output: 'Nothing to redo.', summary: 'Nothing to redo' }
    updateElements(next)
    return { output: 'Redid the board change.', summary: 'Redid change', mutated: true }
  }

  if (call.name === 'arrange_elements') {
    if (
      a.operation !== 'front' &&
      a.operation !== 'forward' &&
      a.operation !== 'backward' &&
      a.operation !== 'back'
    ) {
      return {
        output: 'Operation must be front, forward, backward, or back.',
        summary: 'Invalid input',
        isError: true,
      }
    }
    const ids = resolveIds(a.ids)
    if (!ids)
      return {
        output: 'Nothing is selected and no ids were given.',
        summary: 'No targets',
        isError: true,
      }
    applyEls(arrangeElements(liveEls(), ids, a.operation as ArrangeOp))
    return {
      output: `Arranged ${ids.size} element(s): ${a.operation}.`,
      summary: `Arranged ${a.operation}`,
      mutated: true,
    }
  }

  if (call.name === 'align_elements') {
    const alignments = ['left', 'centerX', 'right', 'top', 'middle', 'bottom']
    if (!alignments.includes(a.alignment as string)) {
      return {
        output: 'Alignment must be left, centerX, right, top, middle, or bottom.',
        summary: 'Invalid input',
        isError: true,
      }
    }
    const ids = resolveIds(a.ids)
    if (!ids)
      return {
        output: 'Nothing is selected and no ids were given.',
        summary: 'No targets',
        isError: true,
      }
    const { elements, moved } = alignElements(liveEls(), ids, a.alignment as Alignment)
    if (moved === 0) return { output: 'Nothing to align.', summary: 'No change' }
    applyEls(elements)
    return {
      output: `Aligned ${moved} element(s): ${a.alignment}.`,
      summary: `Aligned ${a.alignment}`,
      mutated: true,
    }
  }

  if (call.name === 'distribute_elements') {
    if (a.axis !== 'horizontal' && a.axis !== 'vertical') {
      return {
        output: 'Axis must be horizontal or vertical.',
        summary: 'Invalid input',
        isError: true,
      }
    }
    const ids = resolveIds(a.ids)
    if (!ids || ids.size < 3) {
      return {
        output: 'Distributing needs 3+ elements: select them or pass 3+ ids.',
        summary: 'Need 3+ elements',
        isError: true,
      }
    }
    const { elements, moved } = distributeElements(liveEls(), ids, a.axis)
    if (moved === 0) return { output: 'Already evenly spaced.', summary: 'No change' }
    applyEls(elements)
    return {
      output: `Distributed ${ids.size} element(s) ${a.axis === 'horizontal' ? 'horizontally' : 'vertically'}.`,
      summary: 'Distributed evenly',
      mutated: true,
    }
  }

  if (call.name === 'group_elements') {
    const ids = resolveIds(a.ids)
    if (!ids || ids.size < 2) {
      return {
        output: 'Grouping needs 2+ elements: select them or pass 2+ ids.',
        summary: 'Need 2+ elements',
        isError: true,
      }
    }
    const { elements, grouped } = groupElements(liveEls(), ids)
    if (grouped === 0) return { output: 'Nothing to group.', summary: 'No change' }
    applyEls(elements)
    return {
      output: `Grouped ${grouped} element(s).`,
      summary: `Grouped ${grouped}`,
      mutated: true,
    }
  }

  if (call.name === 'ungroup_elements') {
    const ids = resolveIds(a.ids)
    if (!ids)
      return {
        output: 'Nothing is selected and no ids were given.',
        summary: 'No targets',
        isError: true,
      }
    const { elements, ungrouped } = ungroupElements(liveEls(), ids)
    if (ungrouped === 0)
      return { output: 'None of those elements are grouped.', summary: 'No change' }
    applyEls(elements)
    return {
      output: `Ungrouped ${ungrouped} element(s).`,
      summary: `Ungrouped ${ungrouped}`,
      mutated: true,
    }
  }

  if (call.name === 'set_element_lock') {
    if (typeof a.locked !== 'boolean')
      return { output: 'locked must be true or false.', summary: 'Invalid input', isError: true }
    const ids = resolveIds(a.ids)
    if (!ids)
      return {
        output: 'Nothing is selected and no ids were given.',
        summary: 'No targets',
        isError: true,
      }
    const { elements, changed } = setLocked(liveEls(), ids, a.locked)
    if (changed === 0)
      return {
        output: `Those elements are already ${a.locked ? 'locked' : 'unlocked'}.`,
        summary: 'No change',
      }
    applyEls(elements)
    return {
      output: `${a.locked ? 'Locked' : 'Unlocked'} ${changed} element(s).`,
      summary: a.locked ? `Locked ${changed}` : `Unlocked ${changed}`,
      mutated: true,
    }
  }

  if (call.name === 'flip_elements') {
    if (a.direction !== 'horizontal' && a.direction !== 'vertical') {
      return {
        output: 'Direction must be horizontal or vertical.',
        summary: 'Invalid input',
        isError: true,
      }
    }
    const ids = resolveIds(a.ids)
    if (!ids)
      return {
        output: 'Nothing is selected and no ids were given.',
        summary: 'No targets',
        isError: true,
      }
    const { elements, flipped } = flipElements(liveEls(), ids, a.direction)
    if (flipped === 0) return { output: 'Nothing to flip.', summary: 'No change' }
    applyEls(elements)
    return {
      output: `Flipped ${flipped} element(s) ${a.direction === 'horizontal' ? 'horizontally' : 'vertically'}.`,
      summary: 'Flipped',
      mutated: true,
    }
  }

  if (call.name === 'duplicate_elements') {
    const ids = resolveIds(a.ids)
    if (!ids)
      return {
        output: 'Nothing is selected and no ids were given.',
        summary: 'No targets',
        isError: true,
      }
    const dx = Number.isFinite(a.dx as number) ? (a.dx as number) : 24
    const dy = Number.isFinite(a.dy as number) ? (a.dy as number) : 24
    const { elements, clones } = duplicateElements(liveEls(), ids, dx, dy)
    if (clones.length === 0)
      return {
        output: 'No matching elements on the board.',
        summary: 'Nothing duplicated',
        isError: true,
      }
    applyEls(elements)
    return {
      output: `Duplicated ${clones.length} element(s).`,
      summary: `Duplicated ${clones.length}`,
      mutated: true,
    }
  }

  if (call.name === 'select_all') {
    const ids = selectAllIds(liveEls())
    if (ids.length === 0) return { output: 'The drawing is empty.', summary: 'Nothing to select' }
    const selected: Record<string, true> = {}
    for (const id of ids) selected[id] = true
    api.updateScene({ appState: { selectedElementIds: selected } as never })
    return { output: `Selected all ${ids.length} element(s).`, summary: `Selected ${ids.length}` }
  }

  if (call.name === 'clear_selection') {
    api.updateScene({ appState: { selectedElementIds: {} } as never })
    return { output: 'Cleared the selection.', summary: 'Selection cleared' }
  }

  if (call.name === 'set_stroke_width') {
    if (a.width !== 1 && a.width !== 2 && a.width !== 4) {
      return { output: 'Width must be 1, 2, or 4.', summary: 'Invalid input', isError: true }
    }
    const ids = resolveIds(a.ids)
    if (!ids)
      return {
        output: 'Nothing is selected and no ids were given.',
        summary: 'No targets',
        isError: true,
      }
    const { elements, applied } = setStrokeWidth(liveEls(), ids, a.width)
    if (applied === 0)
      return {
        output: 'No matching elements on the board.',
        summary: 'Nothing changed',
        isError: true,
      }
    applyEls(elements)
    return {
      output: `Set stroke width ${a.width} on ${applied} element(s).`,
      summary: `Stroke width ${a.width}`,
      mutated: true,
    }
  }

  if (call.name === 'set_opacity') {
    const opacity = num(a.opacity, NaN)
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) {
      return { output: 'Opacity must be 0-100.', summary: 'Invalid input', isError: true }
    }
    const ids = resolveIds(a.ids)
    if (!ids)
      return {
        output: 'Nothing is selected and no ids were given.',
        summary: 'No targets',
        isError: true,
      }
    const { elements, applied } = setOpacity(liveEls(), ids, Math.round(opacity))
    if (applied === 0)
      return {
        output: 'No matching elements on the board.',
        summary: 'Nothing changed',
        isError: true,
      }
    applyEls(elements)
    return {
      output: `Set opacity ${Math.round(opacity)} on ${applied} element(s).`,
      summary: `Opacity ${Math.round(opacity)}`,
      mutated: true,
    }
  }

  if (call.name === 'set_text_size') {
    const size = num(a.size, NaN)
    if (!Number.isFinite(size) || size < 8 || size > 96) {
      return { output: 'Size must be 8-96.', summary: 'Invalid input', isError: true }
    }
    const ids = resolveIds(a.ids)
    if (!ids)
      return {
        output: 'Nothing is selected and no ids were given.',
        summary: 'No targets',
        isError: true,
      }
    const { elements, applied, skipped } = setTextSize(liveEls(), ids, Math.round(size))
    if (applied === 0) {
      return {
        output:
          skipped > 0 ? 'None of those elements are text.' : 'No matching elements on the board.',
        summary: 'Nothing changed',
        isError: true,
      }
    }
    applyEls(elements)
    return {
      output: `Set text size ${Math.round(size)} on ${applied} element(s).`,
      summary: `Text size ${Math.round(size)}`,
      mutated: true,
    }
  }

  if (call.name === 'zoom_to_fit') {
    try {
      api.scrollToContent(api.getSceneElements(), {
        fitToViewport: true,
        viewportZoomFactor: 0.9,
      } as never)
      return { output: 'Zoomed to fit the whole board.', summary: 'Zoomed to fit' }
    } catch (error) {
      return { output: String(error), summary: 'Zoom failed', isError: true }
    }
  }

  if (call.name === 'export_drawboard') {
    if (a.format !== 'png' && a.format !== 'svg' && a.format !== 'board-file') {
      return {
        output: 'Format must be png, svg, or board-file.',
        summary: 'Invalid input',
        isError: true,
      }
    }
    try {
      const scene = {
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
      }
      const { exportScenePng, exportSceneSvg, exportBoardFile, safeFilename } =
        await import('./exporters')
      if (a.format === 'png')
        await exportScenePng(
          scene.elements,
          scene.appState,
          scene.files,
          safeFilename('drawing', '.png'),
        )
      else if (a.format === 'svg')
        await exportSceneSvg(
          scene.elements,
          scene.appState,
          scene.files,
          safeFilename('drawing', '.svg'),
        )
      else
        await exportBoardFile(
          scene.elements,
          scene.appState,
          scene.files,
          safeFilename('drawing', '.draw'),
        )
      return { output: `Exported drawing as ${a.format}.`, summary: `Exported ${a.format}` }
    } catch (error) {
      return { output: String(error), summary: 'Export failed', isError: true }
    }
  }

  return {
    output: `Unsupported drawing operation: ${call.name}.`,
    summary: 'Invalid tool',
    isError: true,
  }
}

/** A malformed model response must become a tool result, never a renderer crash. */
export async function executeBoardTool(
  apiRef: ApiRef,
  call: AgentToolCall,
  getStaged: () => readonly StagedBoardImage[] = () => [],
  history?: BoardHistoryLike,
  fetchImage?: (url: string) => Promise<{ base64: string; mime: string } | null>,
  generateImage?: (op: {
    prompt: string
    aspectRatio?: string
  }) => Promise<{ base64: string; mime: string } | { error: string }>,
  analyzeMedia?: (op: {
    mediaUrls: string[]
    requirements: string
  }) => Promise<{ ok: boolean; text?: string; error?: string }>,
): Promise<ExecResult> {
  try {
    if (!call || typeof call !== 'object' || typeof call.name !== 'string') {
      return {
        output: 'The drawing tool call was malformed.',
        summary: 'Invalid tool call',
        isError: true,
      }
    }
    const input =
      call.input && typeof call.input === 'object' && !Array.isArray(call.input) ? call.input : {}
    return await executeBoardToolUnchecked(
      apiRef,
      { ...call, input },
      getStaged,
      history,
      fetchImage,
      generateImage,
      analyzeMedia,
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      output: `Drawing tool failed safely: ${detail}`,
      summary: 'Drawing tool failed',
      isError: true,
    }
  }
}

const MUTATING_BOARD_TOOLS = new Set([
  'build_infographic',
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
  'add_board_text',
  'add_sticky_note',
  'add_board_shape',
  'add_freedraw',
  'build_drawboard_scene',
  'add_vector_artwork',
  'add_board_image',
  'add_board_image_from_url',
  'update_board_text',
  'move_board_elements',
  'scale_board_elements',
  'style_board_elements',
  'erase_board_elements',
  'delete_board_elements',
  'clear_drawboard',
  'undo_drawboard',
  'redo_drawboard',
  'arrange_elements',
  'align_elements',
  'distribute_elements',
  'group_elements',
  'ungroup_elements',
  'set_element_lock',
  'flip_elements',
  'duplicate_elements',
  'set_stroke_width',
  'set_opacity',
  'set_text_size',
])

/** Claimed-action guard: a reply that claims a board change must have executed one. */
export function verifyBoardResponse(
  finalText: string,
  executed: ReadonlyArray<{ name: string; ok: boolean }>,
  options: { requireDiagramReview?: boolean; requireVisualReview?: boolean } = {},
): string | null {
  const ok = new Set(executed.filter((c) => c.ok).map((c) => c.name))
  const createdDiagram =
    options.requireDiagramReview &&
    executed.some(
      (call) =>
        call.ok &&
        (call.name === 'build_drawboard_scene' ||
          call.name === INFOGRAPHIC_TOOL_NAME ||
          (DIAGRAM_TOOL_NAMES as readonly string[]).includes(call.name)),
    )
  const createdInfographic = executed.some((call) => call.ok && call.name === INFOGRAPHIC_TOOL_NAME)
  if (createdDiagram) {
    const missingChecks = [
      !ok.has('read_drawboard') ? 'read_drawboard' : null,
      createdInfographic && !ok.has('inspect_board_layout') ? 'inspect_board_layout' : null,
      options.requireVisualReview && !ok.has('inspect_board_visual')
        ? 'inspect_board_visual'
        : null,
    ].filter((name): name is string => name !== null)
    if (missingChecks.length) {
      return `A diagram was created, but its post-build verification is incomplete. Call ${missingChecks.join(' and ')} now to verify the elements, labels, connections, spacing, overlap, and readability. If the review reports defects, repair them with native Drawboard tools and verify the repaired result before replying.`
    }
  }
  const claimsChange =
    /\b(i('ve| have)? |we('ve| have)? )?(added|drawn|drew|built|created|placed|inserted|deleted|removed|erased|moved|shifted|updated|changed|edited|renamed|cleared|wiped)\b.{0,50}\b(board|canvas|element|shape|text|note|arrow|image|line|stroke|diagram|scene|illustration|artwork)\b/i.test(
      finalText,
    ) || /\bon the board now\b/i.test(finalText)
  if (claimsChange && ![...MUTATING_BOARD_TOOLS].some((name) => ok.has(name))) {
    return 'Your reply claims a board change, but no board tool call succeeded. Inspect the board with read_drawboard, call the tool the task actually needs, then summarize what changed.'
  }
  if (
    /\bexported|downloaded\b.{0,30}\b(png|svg|file|board)\b/i.test(finalText) &&
    !ok.has('export_drawboard')
  ) {
    return 'Your reply claims an export, but export_drawboard did not run. Call export_drawboard with the requested format, then confirm.'
  }
  return null
}

// Backwards-compatible alias for the original 5-tool surface.
export const executeDrawboardTool = executeBoardTool
