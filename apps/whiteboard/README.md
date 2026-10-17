# ReveLith Draw (AI Draw)

AI-native drawing board for sketching, flowcharts, and diagrams — part of the ReveLith suite.

## Run

- Browser renderer: `npm run dev:renderer -w @revelith/drawboard` (port 5182)
- Standalone Electron: `npm run dev -w @revelith/drawboard`
- Inside Shell: Shell hosts `out/renderer/index.html` via `DRAWBOARD_RENDERER_URL`

## Features (end-to-end)

- Full Draw canvas: selection, rectangle, diamond, ellipse, arrow, line, freedraw, text, image, eraser, hand, frame, laser, library, command palette, history, zoom, grid, snap
- Rich icon ribbon (File/Edit/Arrange/Style/View/Export/AI): board files, real undo/redo history, select/duplicate/delete, order/align/distribute/group/lock/flip, stroke/opacity/text/font presets, zoom/grid/snap/present/theme/paper, PNG/SVG/board-file/clipboard export, image insert, AI quick prompts
- Full AI chat (attach/paste/drop images, scope tracking, vision input), `.draw` save/open with legacy file support, 30s autosave, Drawboard settings (title, language)
- Explicit read-only **Ask AI about selected** analysis: bounded selected-element text and approximate bounds only, no tools/attachments, and loopback-only model endpoints; cloud endpoints are refused before selection data is sent
- Draw shortcut info opens the drawing engine's built-in keyboard shortcut reference and shows the actual reference-row count after opening
- Agent tools (33 board tools plus shared web search, image search, attachment, clarification, and media-analysis tools): full CRUD plus arrange/align/distribute/group/lock/flip/duplicate/style/zoom, zero-token per-request router, claimed-action guard
- Compatibility: opens legacy v1 `{ops}` boards and raw board JSON; always saves v2 `{elements, appState, files}`
- Safety: embeddables blocked, no collaboration server in v1
