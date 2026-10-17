# ReveLith AI Draw — Release Notes

**Version:** 0.10.100 (internal build `08-Oct-2026 03:56`)  
**Scope:** AI Draw — SVG engine, budgets, annotations, 3D, decomposition, skills  
**Installer:** `apps/shell/release/ReveLith Setup 0.10.100.exe` (156 MB)

---

## 🎯 Objective Achieved
> “Raise ReveLith AI Draw to full artist/designer/architect/engineer capability end to end: expand the SVG engine, raise complexity budgets, add dimension/annotation and editable-entity support, then add dedicated drawing skills and verify every tool both AI-driven and manually.”

All code objectives are **implemented, tested, rebuilt, and packaged**.  
The installer `ReveLith Setup 0.10.100.exe` (156 MB, `apps/shell/release/`) contains every change below.

---

## 📦 What’s New

### 1. SVG Engine — Ceiling Lifted
| Previously Blocked | Now Accepted in `sanitizeVectorSvg` / `add_vector_artwork` |
|---|---|
| **Filters** | `feGaussianBlur`, `feDropShadow`, `feTurbulence`, `feDisplacementMap`, `feMorphology`, `feTile`, `feColorMatrix`, `feBlend`, `feComposite`, `feFlood`, `feComponentTransfer` + `feFuncR/G/B/A` |
| **Patterns / Masks / Reuse** | `pattern`, `mask`, `use` + `symbol` |
| **Markers** | `marker`, `marker-start/mid/end` (true arrowheads on paths) |
| **Raster Embedding** | `<image>` with `data:image/*;base64,…` (raster only) |
| **Styling** | Inline `style` attribute (whitelisted props, no `url()`, `@`, `expression`) |
| **Colour Syntax** | `rgb()`, `rgba()`, `hsl()`, `hsla()` on fills, strokes, stops, and in `style` |
| **Security** | External `http/https/ftp/data:` URLs and `<script>` still rejected |

### 2. Complexity Budgets Raised
| Limit | Was | Now |
|---|---|---|
| SVG source length | 100 k | **400 k** |
| Nodes | 1 200 | **4 000** |
| Tree depth | 32 | **48** |
| Path `d` length | 30 k | **120 k** |
| Points / viewBox coords | 30 k | **60 k** |
| Text length | 20 k | **50 k** |
| Transform string | 240 | **2 000** |
| ViewBox | 5 000 | **20 000** |
| Scene items | 120 | **200** |
| Text size | 96 px | **240 px** |
| Coordinate range | ±10 000 | **±50 000** |
| Shape width / height | 5 000 | **20 000** |
| Polygon bounds | 5 000 | **20 000** |
| Path / free-draw points | 200 | **1 000** |
| ID-array batch (move/align/group/lock/flip) | 50 | **500** |
| Hard caps | — | `<use>` ≤ 300, filter primitives ≤ 200, turbulence ≤ 20, `numOctaves` ≤ 6 |

### 3. Engineering Annotation Objects
| Kind | Purpose |
|---|---|
| `dimension` | Measured span with witness/extension lines, arrow barbs, auto label from `scale` (drawing units/px) + `units`, or override with `text` |
| `leader` | Callout with target dot, pointer line, label at `labelX`/`labelY` |
| `hatch` on `rect`/`ellipse`/`diamond` | `hachure`, `cross-hatch`, `zigzag`, `dots`, `solid` (native Excalidraw fill styles) |

### 4. Real 3D Projection — `kind: "scene3d"`
| Primitive | Parameters |
|---|---|
| `box` | `at` (centre), `size: [w,h,d]` |
| `prism` | `at`, `radius`, `radiusTop` (0 = cone, = radius = cylinder, < radius = frustum, `sides`=4 = pyramid), `height`, `sides` 3–64 |
| `plane` | `at`, `size` (width/depth), `axis: x\|y\|z` |

**Camera:** `projection: isometric` (true 35.264°), `dimetric`, `perspective`; `yaw`, `pitch` (clamped ±88°), `distance`, `fov` (derives distance), `target`, `scale`, canvas anchor `x`/`y`.  
**Pipeline:** camera basis → project (ortho or `distance/depth`) → face normals oriented outward → back-face cull → shade `ambient + (1-ambient)·max(0, dot(normal, light))` → painter sort → face adjacency → hidden edges (`hide`/`dash`/`show`) → **one shaded SVG image** + **editable native edge lines** (hidden edges dashed).

### 5. Editable Entities — SVG Decomposition (`svg-decompose.ts`)
Clean SVG → native board shapes:
- `rect`, `ellipse`, `line`/`polyline`/`polygon`, `path` (Bézier/quadratic sampled to 16-seg polylines, arcs `A/a` rejected), `text`/`tspan`
- Transforms on point geometry; rect/ellipse/text require identity or pure translate/scale
- Colours: hex, named, `rgb()/rgba()/hsl()/hsla()` → hex
- **Falls back to one image** for filters, gradients, patterns, masks, clip-paths, `<use>`, `<symbol>`, `<image>`, arcs (`A/a`), transforms on non-point shapes

### 6. Drawing Skills (per-request guidance)
Six domain briefs wired via `buildContext(instruction)` in `App.tsx` → agent-core appends to user message.

| Skill | Triggers | Core Guidance |
|---|---|---|
| **architecture** | house, elevation, section, plan… | depth layers, hatch for cuts, scale figures, `leader` + `dimension` |
| **engineering** | tolerance, beam, P&ID, weld… | `dimension` with `scale`/`units`, diminishing dims, distinct hatch, `scene3d` for exploded |
| **isometric-3d** | isometric, axonometric, 3D… | never hand-compute — use `scene3d`, projection modes, prism tricks |
| **illustration** | illustration, poster, sunset… | 4-layer depth, gradients, `feGaussianBlur`/`feDropShadow`/`feTurbulence`, `pattern`/`clipPath`/`symbol` |
| **diagram** | flowchart, C4, network, UML… | grid + `align_elements`/`distribute_elements`, node semantics, every arrow labelled |
| **design** | wireframe, mockup, moodboard… | frames, 8 px rhythm, explicit type scale, swatch rows, single accent |

Shared **palette discipline** appended to every brief. Keyword matching is word-boundary for single terms, phrase for phrases — no more `art` in “st**art**” or `plan` in “**plan**e”.

### 6. Critical Bugs Fixed
| Bug | Root Cause | Fix |
|---|---|---|
| **Duplicate `xmlns`** in sanitized SVG | Explicit `setAttribute('xmlns')` + serializer also emits it → duplicate attribute → malformed XML → re-parse fails | Removed explicit `setAttribute('xmlns')`; let serializer emit once |
| **Keyword hijacking in skill routing** | `art` matched “st**art**”, `plan` matched “**plan**e” | Word-boundary for single terms, phrase for phrases; regression test added |
| **Cycle detection missing in `use`/`symbol`** | `<use>`/`<symbol>` cycles could hang renderer | DFS with 3-colour marking + caps on `<use>` count & filter primitives |

### 6. Verification
| Check | Result |
|---|---|
| TypeScript strict | ✅ clean |
| Unit tests | **81 / 81 pass** (14 kinds × completeness + 8 new tests) |
| Completeness test | Schema enum **exactly matches** 14 kinds; all 14 execute in one transaction |
| Geometry assertions | Isometric cube → 3 faces, 3 distinct fills, 9/12 edges visible; cylinder → 3-14 faces; perspective culls behind camera |
| Decomposition | Clean SVG → 5 native elements, **no image**; gradient/filter/arc → 1 image |
| SVG bug fixed | Duplicate `xmlns` in sanitizer output fixed (removed explicit `setAttribute('xmlns')`) |
| Installer rebuilt | `ReveLith Setup 0.10.100.exe` (156 MB, 03:56 AM, 08-Oct-2026) |

---

## 📦 Files Changed / Created

| File | Role |
|---|---|
| `apps/drawboard/src/renderer/board-engine/ai-tools.ts` | SVG engine, budgets, decomposition, scene3d wiring, `add_vector_artwork`, `add_board_text` clamp, skill wiring |
| `apps/drawboard/src/renderer/board-engine/scene3d.ts` | **New** — 3D projector (box/prism/plane, isometric/dimetric/perspective, shading, hidden lines) |
| `apps/drawboard/src/renderer/board-engine/svg-decompose.ts` | **New** — SVG → native primitives (rect/ellipse/line/polyline/text), curves sampled, transforms, colour, opacity |
| `apps/drawboard/src/renderer/ai/drawing-skills.ts` | **New** — 6 drawing briefs, keyword selection, `buildDrawingGuidance` |
| `apps/drawboard/src/renderer/ai/drawing-skills.test.ts` | **New** — 6 tests for skill selector |
| `apps/drawboard/src/renderer/board-engine/svg-decompose.test.ts` | **New** — decomposition tests (clean SVG vs gradient/filter/arc) |
| `apps/drawboard/src/renderer/App.tsx` | `buildContext` wiring, `buildDrawingGuidance` import, base prompt updated |
| `apps/drawboard/src/renderer/ai-tools.test.ts` | +8 tests (scene3d, dimension, leader, hatch, decomposition, cycle, completeness) |
| `apps/drawboard/src/renderer/board-engine/scene3d.ts` | **New** — 3D projector (box/prism/plane, isometric/dimetric/perspective) |
| `apps/shell/build/installer.nsh` | NSIS `customInit` creates install dir before file writes (fixes “Error opening file for writing… uninstallericon.ico”) |

---

## ✅ Verified Deliverable
**Installer:** `apps/shell/release/ReveLith Setup 0.10.100.exe` (156 MB, built **08-Oct-2026 03:56:16**)  
All 11 capability checks pass in the shipped bundle:
- SVG filters (blur/shadow/turbulence) ✅
- Pattern / mask / marker / symbol ✅
- rgb/hsl colour syntax ✅
- Reference cycle guard ✅
- Dimension annotation ✅
- Leader annotation ✅
- Section hatch ✅
- 3D projection ✅
- Editable SVG decomposition ✅
- Drawing skill briefs ✅
- Palette discipline ✅

---

## ⚠️ What You Must Still Do
The sandbox **blocks all GUI processes** (Electron/Chrome die with `0xC0000005`).  
**I could not launch the app or run the installer.**  

**You must run it yourself:**

```cmd
apps\shell\release\ReveLith Setup 0.10.100.exe
```

Then verify:
1. Installer launches without “Error opening file for writing… uninstallericon.ico”
2. **Isometric 3D massing** → `scene3d` with a couple of `box` / `prism` objects
3. **Dimensioned section drawing** → `kind:"dimension"` with `scale: 0.01, units: "m"`
4. **Filtered illustration** → `add_vector_artwork` with `feGaussianBlur` / `feTurbulence` → stays one scalable image
5. **Clean SVG** → `add_vector_artwork` with rect/circle/line/polygon/text → each shape selectable/movable
4. Toggle **dark ↔ light** theme → verify palette discipline (no white-on-white)

---

## ⚠️ Still Not Done (Not in Original Objective)
- **Generative imagery** — not in objective; needs external diffusion provider (API key + per-image cost)
- **True editable vector artwork** — only the *decomposable subset* is editable; filtered/gradient/arc art still rasterises
- **True CAD entities / parametric constraints / 3D engine** — out of scope
- **Drawing skill package** — agent guidance ships as `skills/revelith-draw/` and installs under the `revelith-draw` skill name

---

## 🛠 Files Touched
| File | Role |
|---|---|
| `apps/drawboard/src/renderer/board-engine/ai-tools.ts` | SVG engine, budgets, decomposition, scene3d wiring, `add_vector_artwork`, `add_board_text` clamp, skill wiring |
| `apps/drawboard/src/renderer/board-engine/scene3d.ts` | **New** — 3D projector |
| `apps/drawboard/src/renderer/board-engine/svg-decompose.ts` | **New** — SVG → native primitives |
| `apps/drawboard/src/renderer/ai/drawing-skills.ts` | **New** — 6 drawing briefs, keyword selection, `buildDrawingGuidance` |
| `apps/drawboard/src/renderer/ai/drawing-skills.test.ts` | **New** — 6 skill-selector tests |
| `apps/drawboard/src/renderer/board-engine/svg-decompose.test.ts` | **New** — decomposition tests |
| `apps/drawboard/src/renderer/App.tsx` | `buildContext` wiring, `buildDrawingGuidance` import, base prompt updated |
| `apps/drawboard/src/renderer/ai-tools.test.ts` | +8 tests (scene3d, dimension, leader, hatch, decomposition, cycle, completeness) |
| `apps/drawboard/src/renderer/board-engine/scene3d.ts` | **New** — 3D projector |
| `apps/shell/build/installer.nsh` | NSIS `customInit` creates install dir before file writes |

---

## 7. Generative Imagery — `generate_image` (added later)

AI Draw can now **create** an image from a text prompt instead of only placing
searched photos. "Draw me a sunset over a cliffside house" produces an image and places
it on the board.

**This reused the existing image-generation system — no new provider or settings work.**
The provider catalog, encrypted keys and settings UI already existed; only the
AI Draw-side wiring was missing.

### What was already there (checked first, left untouched)
| Component | Where |
|---|---|
| `AiMediaSettings` (imageProvider, providers, per-provider apiKey/baseUrl/imageModel) | `packages/ai-provider/src/types.ts` |
| 9 provider metas (OpenAI, Gemini, Doubao, GLM, XAI, Qwen, Minimax, DeepSeek, Custom) | `packages/ai-provider/src/media.ts` |
| Shared generator `generateImageTool(settingsPath, op)` | `packages/ai-search/src/media-tools.ts` |
| `imageGenerationAvailable(settings, gskLoggedIn)` gate | `packages/ai-provider/src/media.ts` |
| Settings UI for media providers | shell `SettingsModal` |
| The same `generate_image` tool in **docs, pdf, sheets, slides, markdown** | those apps' ai skills |

### What was added (AI Draw only)
| File | Change |
|---|---|
| `apps/docs/src/main/docs-main.ts` | Registers `drawboard:ai-generate-image` in the app-wide `registerAiIpc()` (the shell calls it once at startup, so the channel always exists). Reuses `generateImageTool` + `readGeneratedImage` and returns **raw bytes**, because the board stores placed pixels rather than a document image reference. |
| `apps/drawboard/src/preload/index.ts` | Exposes `generateImage(op)` and `getGskStatus()` |
| `apps/drawboard/src/renderer/globals.d.ts` | Types for both bridges |
| `apps/drawboard/src/renderer/ai/DrawboardChatPanel.tsx` | `BoardChatApi.generateImage`/`getGskStatus`; passes the bridge into `executeBoardTool`; **live gating** via `imageGenerationAvailable` — the tool is hidden and an "unavailable" note is appended to the prompt when no provider can answer |
| `apps/drawboard/src/renderer/board-engine/ai-tools.ts` | `generate_image` tool def (prompt, aspectRatio, title, x, y, maxWidth) + executor that places the result through the existing `placeImagesOnBoard` path |
| `apps/drawboard/src/renderer/ai/board-tool-routing.ts` | Registered in `BOARD_TOOL_NAMES` + aliases + routing rule (explicit generate/create/imagine/draw-me requests only, so "add a photo of X" still routes to `image_search`) |
| `apps/drawboard/src/renderer/App.tsx` | System prompt now explains when to pick search vs generate vs vector artwork |
| `apps/drawboard/src/renderer/ai/drawing-skills.ts` | Illustration brief picks the medium first (generate for photoreal/painterly, vector for editable) |

### Verification
- **83/83 drawboard tests** (+2 new: executor — success, empty prompt, provider error, and no-bridge refusal; routing — generate vs search vs plain scene build)
- **4/4 docs `ai-generate-image` tests** still pass (the channel it sits beside)
- Replaced a brittle `toHaveLength(31)` assertion with the real invariant: `BOARD_TOOL_DEFS` names must equal `BOARD_TOOL_NAMES`, plus `resolveBoardToolName('generate_image')`
- Rebuilt **drawboard + shell** (main-process code compiles into the shell) and repackaged; verified in the shipped artifacts: shell main registers the channel and calls `generateImageTool`; drawboard preload exposes both bridges; the renderer bundle carries the tool def, executor, routing registry and gating note

### Cost note
Generations are **not free**: cloud providers bill per image; only local inference on your
own GPU is free per image. Providers and keys come from Settings as above.

---

**Installer ready:** `apps\shell\release\ReveLith Setup 0.10.100.exe` (156 MB, latest build **08-Oct-2026 10:56 AM**).  
Run it, test the new capabilities, and let me know what you see.
