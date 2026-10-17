---
name: revelith-draw
description: Create and edit drawings in ReveLith Draw using its drawing tools — diagrams, architecture, engineering drawings, isometric and perspective 3D, constrained parametric sketches and illustrations. Use whenever the user wants something drawn, sketched, diagrammed, illustrated, redrawn or annotated. The board runs locally; only the configured AI provider ever sees a prompt.
metadata:
  version: 1.0.0
  cli: '>=0.10.100'
---

# ReveLith Draw — Drawing Skill

You are drawing on a live ReveLith Draw board. Every call is one undo step, so a
wrong scene is cheap to correct. Work from the tool list you are given; never
invent a tool name, and if a tool returns an error, fix the arguments and retry
the real call rather than reporting success.

## Before you draw

- If the request depends on existing board content, inspect it with
  `read_drawboard`; use `get_board_element` when you need one element's exact
  fields. For a standalone new diagram, start with its dedicated builder instead
  of spending a turn reading an empty or irrelevant board.
- **Keep it on screen.** Generic compositions start near `80,80` and stay inside
  roughly `0–1400 × 0–900`. Dedicated diagram builders choose bounded layouts;
  use `zoom_to_fit` when requested or when the result extends beyond the view.
- **Never clear the board** unless the user explicitly asked, and then only with
  `clear_drawboard {confirm:true}`.

## Choosing the tool

| The user wants                                                  | Use                                                                                                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A process, flowchart, architecture, or dependency diagram       | `build_flow_diagram`                                                                                  |
| A UML sequence diagram                                          | `build_sequence_diagram`                                                                              |
| A UML use-case diagram                                          | `build_use_case_diagram`                                                                              |
| Requirements, stakeholder goals, verification, or traceability  | `build_requirement_diagram`                                                                           |
| A UML class diagram or entity-relationship/database model       | `build_uml_class_diagram` or `build_er_diagram`                                                       |
| A state machine, state chart, or mind map                       | `build_state_diagram` or `build_mind_map`                                                             |
| A chart with supplied data                                      | `build_chart_diagram`; use `build_gantt_diagram` for schedules and `build_heatmap_chart` for matrices |
| An ASCII or fixed-width text diagram                            | `build_text_diagram`                                                                                  |
| Mermaid source/syntax or an explicitly Mermaid-rendered diagram | `render_mermaid_diagram`                                                                              |
| A custom composition not covered by a typed builder             | `build_drawboard_scene` — one coordinated update                                                     |
| Crisp vector art, logos, icons, anything editable               | `add_vector_artwork` (complete SVG)                                                                   |
| A photorealistic or painterly image                             | `generate_image` (needs an image provider in Settings)                                                |
| A real photo or existing artwork                                | `image_search` → `add_board_image_from_url`                                                           |
| A dimensioned or constrained drawing                            | `build_drawboard_scene` with `kind:"sketch"`                                                         |
| Believable 3D massing                                           | `build_drawboard_scene` with `kind:"scene3d"`                                                        |
| A measured annotation on a drawing                              | `kind:"dimension"`; a labelled callout, `kind:"leader"`                                               |

Use only tools exposed for the current request. Diagram builders have strict,
conditional JSON schemas and validate IDs, references, coordinates, and item
limits locally before adding editable native elements. Supply complete IDs and
references, and fix a returned validation error before claiming success. For a
multi-diagram request, call every matching dedicated builder in the same turn;
do not replace requested views with one generic scene. For charts, use only
user-provided or tool-verified values—never invent data. Mermaid rendering is
lazy-loaded; prefer native builders when individually editable UML elements
matter.

Every element needs `kind` — `{kind:"text", text:"Title"}` for a label. Polygon,
path and freedraw points are **coordinate pairs**: `[[0,800],[1400,800],[1000,600]]`,
never a flat number list.

## Capabilities that are easy to forget

**Curves, filters and texture (SVG).** `add_vector_artwork` accepts paths with
arcs, linear and radial gradients, `pattern`, `mask`, `clipPath`, `use`/`symbol`
reuse, marker arrowheads, `feGaussianBlur`, `feDropShadow`, `feTurbulence`,
`feColorMatrix`, `feBlend`, embedded base64 raster, an inline `style` attribute,
and `rgb()`/`rgba()`/`hsl()` colours. Give every gradient and filter an id and
reference it with `url(#id)`.

**What stays a bitmap.** If the SVG uses an element or attribute the decomposer
cannot reproduce faithfully, the whole artwork is placed as **one scalable
image** rather than losing fidelity. That is deliberate — never promise that
such artwork will be editable, and prefer constructs from the list above when
editability matters.

**Hatching and section fills.** `rect`, `ellipse` and `diamond` take
`hatch: hachure | cross-hatch | zigzag | dots | solid`.

**Dimensions.** `kind:"dimension"` draws its own witness lines, arrowheads and
value label. Set `scale` (drawing units per canvas pixel) and `units` and the
label computes itself; pass `text` only to override it. Diminish from smallest to
largest so extension lines never cross.

**3D.** Never compute projected coordinates by hand. `kind:"scene3d"` takes
world-space primitives and a camera:

- objects: `box` (`at` centre, `size`), `prism` (`radius`, `radiusTop`,
  `height`, `sides` — `radiusTop: 0` is a cone, equal radii a cylinder,
  `sides: 4` a pyramid), `plane`
- camera: `projection: isometric | dimetric | perspective`, `yaw`, `pitch`,
  `distance`, optional `fov`, `target`, `scale`
- `hidden: hide | dash | show` for hidden edges; `edges: true` keeps crisp
  editable linework over the shaded faces

**Parametric sketches.** `kind:"sketch"` is a real 2D constraint solver, not a
drawing helper. Supply `sketchPoints: [{id,x,y,fixed?}]`, `constraints`,
`segments`, `circles`, `dimensions` and optionally `move: {point, to}`.

Constraint kinds: `fixed`, `coincident`, `horizontal`, `vertical`, `distance`,
`pointOnLine`, `parallel`, `perpendicular`, `equalLength`, `angle` (radians),
`midpoint`, `radius`.

The tool **reports the solve**: `status` is `solved`, `underconstrained`,
`overconstrained` or `inconsistent`, with `dof` (degrees of freedom) and the
final `residual`. Read it. An `underconstrained` sketch still has freedom —
say so instead of claiming the shape is fully defined. An `inconsistent` solve
means the constraints contradict each other; fix or drop one rather than
retrying unchanged. Geometry is drawn from the **solved** coordinates, so a
dimension label always agrees with what was drawn.

## Craft briefs

Select the brief that matches the request and follow it.

### Architectural concept boards

Build in depth layers back to front: sky, distant terrain, mid terrain, the
building, then foreground vegetation and a figure for scale. Use `scene3d` when
the massing must read as real. `hatch:"hachure"` for cut surfaces, retaining
walls and ground; solid fills for glass. Annotate with `leader` callouts and
`dimension` spans for overall width and storey heights.

### Technical and engineering drawings

Accuracy over decoration. A `sketch` with real constraints wherever the geometry
is defined by dimensions, with `dimensions` on the solved sketch. Cut and section
faces take `hatch:"cross-hatch"`; adjacent parts must use different hatch
directions or densities. Outlines 1–2px, thinner for centre lines. Include a
title block (name, scale, units) in its own text element. For pictorial and
exploded views use `scene3d` with `projection:"isometric"`.

### Isometric and perspective scenes

Leave the default isometric camera alone (true 35.264° elevation) unless a
specific view was asked for. `projection:"perspective"` with `fov` 25–45 for
interior or hero views. Build complex forms from several boxes rather than one.
`hidden:"dash"` reads as construction lines; `hidden:"hide"` for clean
illustration. One light direction, one base colour per material — the projector
derives the face values.

### Vector illustration craft

One `add_vector_artwork` per coherent illustration. Work in at least four layers:
sky/background, distant shapes, mid subject, foreground detail — with overlap,
scale change and lighter distant colours for aerial perspective. Depth comes from
gradients rather than flat blocks. `feGaussianBlur` for soft shadow and glow,
`feDropShadow` for cast shadows, `feTurbulence` for texture and grain,
`feColorMatrix`/`feBlend` for tinting. Repeated detail (trees, windows, waves,
tiles) belongs in `symbol` plus `use`. Keep the silhouette readable at thumbnail
size and put the highest contrast on the subject.

### System architecture and flow diagrams

Structure first. Lay out on a grid with even gutters, then `align_elements` and
`distribute_elements` rather than eyeballing coordinates. `rect` for services,
`diamond` for decisions, `ellipse` for start/end. **Every arrow gets a label** —
an unlabelled arrow is a defect. Group related nodes, keep edge routing
orthogonal or with a single bend, and stack arrows above node fills with
`arrange_elements`. Add a title and a legend once more than three colours are in
play. Dense or layered systems suit `add_vector_artwork` with marker arrowheads.

### Product and UI design boards

Show the work as a board: title, one-line intent, then labelled sections with
generous margins on an 8px rhythm. Frames are `rect` with no fill and a 1–2px
stroke, annotated with `leader` rather than floating text. Type scale: 32 title,
20 section, 16 label, 13 note. Swatches are small `rect`s on one row with hex
labels beneath, on a light panel (#f1f5f9). Reserve the accent colour for the
single most important element.

## Palette discipline

One dominant hue, one accent, neutrals. Ink and labels `#1e1b4b`; structure
`#334155`; surfaces `#e2e8f0` / `#f1f5f9`; accent `#2563eb`; warm highlight
`#f59e0b`; success `#16a34a`; warning `#dc2626`. Three or four fills per drawing,
not ten. Light comes from the upper left: brighter faces up, darker down and
right. Never place text in the background colour of the surface behind it.

## Finishing

The typed builders report their validation and generated element counts. Read or
visually inspect the board when the user asks for verification/review, when
editing existing content, or when a tool reports uncertainty; avoid an extra
inspection turn after a clean standalone build. If the result has a concrete
problem, revise it with the edit tools or undo and rebuild—do not describe a
scene you did not create. Export only when asked, in the requested format
(`png`, `svg`, `board-file`).
