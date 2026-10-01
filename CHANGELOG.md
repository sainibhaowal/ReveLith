# Changelog

## [Unreleased]

### v0.10.100 — settings parity & HTML AI (implemented, on `release/v0.10.100`)

#### Features

- **settings:** new Account page (on-device profile with avatar, persisted via `home:get/set-profile`) and AI Media & Search page (Serper/DuckDuckGo + key, dedicated image provider/model/key/URL, image & video analysis providers)
- **ai-provider:** `MediaSearchSettings` with defaults, legacy BYOK migration, `resolveWebSearchKey` / `resolveImageGenTarget` / `resolveMediaAnalysisTarget`; `resolveAiSettings` preserves `byok`/`mediaSearch`
- **search & image:** docs/sheets/slides `ai:web-search` + `ai:image-search` use the stored Serper key; slides/sheets/PDF image generation and slides media analysis honor the dedicated backends with active-provider fallback
- **shell:** `home:detect-skills`, per-agent skill install, `home:get/set-usage-stats` (default off), General rows for AI text size / spellcheck / usage stats, Integrations guide (3-step, per-assistant rows, try-it, full CLI reference)
- **html ai:** new AI Summarize (ribbon button, streaming summary modal with copy/stop); Design/Document/element-refine failures now surface in-UI with Stop wired to `ai:stream-cancel`

#### Bug Fixes

- **html:** guard `registerHtmlIpc` against double registration (fixes `html:consume-pending` crash on the 2nd tab); per-tab pending queue (fixes blank untitled tab race)
- **packaging:** `build:all` builds `@revelith/html` and the installer ships `modules/html` (packaged HTML tab previously loaded a missing bundle)
- **release:** win packaging config updated for the electron-builder 26.15 schema (`cscLink`, `signtoolOptions`); signing test updated to match

### Features

- **mcp & cli:** Streamable HTTP MCP server (`revelith mcp --http <port>`) for remote agents, sandboxes, and containers; Bearer `--token` security; `PUT /files/<name>` file uploads; auto-download of `http(s)://` file parameters; file-writing tools return download URLs; new MCP tools `pdf_read_text` (extract PDF text/page ranges), `docs_edit_text` (edit open Word document), and `sheet_set_cells` (drive visible Sheets grid)
- **docs:** Lazy media loading for picture-heavy documents with assets served from disk on demand via `revelith-media://` protocol; safe 512 MB file size guard refusing oversized files with clean alert instead of crash; accelerated large document loading and typing; Word-fidelity patches for tables, anchored pictures, text boxes, header/footer spacing, chart labels, EMF+ clipping, Japanese font substitution, italic, and bidi text
- **markdown:** Opt-in unchanged-source round-trip serialization preserving unedited blocks byte-for-byte and re-serializing modified blocks in document conventions; Wavedrom code fences (```wavedrom) rendering interactive digital timing diagrams
- **sheets:** Smooth scrolling with requestAnimationFrame scheduling; non-blocking chunked large-range copy and duplicate on massive workbooks; reliable context-menu submenu reopening with clean state teardown
- **shell:** Help → Check for Updates menu action; configurable AI panel dock position (dock left or dock right); in-editor Files pane button removed while preserving Home page Folders panel
- **ai-provider:** Added DeepSeek V4.1 Flash (`deepseek-v4.1-flash`), GPT-6 Astra (`gpt-6-astra`), and Opper (`opper`) providers with streaming, chat, and BYOK configurations
- **pptx-engine & file-parse:** Chart categories honor Excel 1904 date system with 1462-day offset; presentation text extraction honors slide presentation order (`sldIdLst`); lenient XML parsing for single-quoted attributes and case-insensitive preset colors
- **mcp & cli (v1.3.0 stdio):** full Model Context Protocol (MCP) support over stdio (`revelith mcp`) and in-app live Word editor server (`http://127.0.0.1:3928/mcp`); guided presentation deck builder (`guided_deck_builder`); CLI `docs apply`, `sheet apply`, `slides apply`, `check` quality issue reports, `open` targeting slide/range/page, and structured `--json` errors
- **shell (v1.3.0):** Home page Folders panel over save folder (`defaultSaveDir`), Help → About shows version in menus and native dialog, Settings → Integrations with copy-ready commands for Claude Code, Claude Desktop, Cursor, and In-App Live MCP
- **docs (v1.3.0):** File → Export as Images (PNG export per page); View & Save Picture As; CJK document editing optimization (O(1) loop); Picture watermark with custom washout & floating layout; OS image drop onto page (`handleDrop`); Paste Options chip (Text Only clears marks); clickable SDT checkboxes; streamed AI writing event (`docs:ai-stream-insert`); RIS/BibTeX import in References tab (`zotero-import.ts`)
- **sheets (v1.3.0):** Theme colors palette, pattern fills, gradient fills in Format Cells; table range inferred from contiguous current region; typed CSV import (auto-detects numbers, booleans, dates, percentages, currency); Home AutoSum + Sort & Filter + AutoFit row/col; clipboard image paste bridge; print embeds charts/pictures; function catalog 60→84
- **slides (v1.3.0):** Hyperlinks stay clickable in exported PDFs (positioned `<a>` overlay tags); selection frame and resize handles visible on white slides (`#0969da`); picture bullets (`a:buBlip` parse + `picture` type); Insert Table dialog; single-click-to-edit selected shapes; repair-free sanitizer (`sanitizeDeckForPowerPoint`)
- **pdf (v1.3.0):** Cursor-anchored zooming (page point under mouse stays pinned); heading-derived outline fallback for un-bookmarked PDFs; 800% max zoom; Print Range dialog (`PrintRangeDialog`, Ctrl+P); editable-PPTX model + compact-DOCX helpers
- **markdown (v1.3.0):** Large files open in linear time (O(1) legacy check); spellcheck toggle in ribbon & editor DOM; resizable outline panel with drag handle; `[[wiki links]]` survive save round-trips intact
- **html (v1.3.0):** Insert menu (hero/cards/table/form/nav), image-from-URL, single-file export (`saveSingleFile` IPC), layer ↑/↓ reorder (`onMove`/`handleMoveLayer`), element resize (width/height)

## [1.2.0] (2026-09-27)

### Features

- **html:** new ReveLith HTML app (`apps/html`) for visual/dashboard/slides AI Design and long-form AI Documents, live preview, element click-to-restyle, targeted AI element refinement, DOM layer tree inspector, fullscreen present mode, and local Word (`.docx`) & PDF export
- **ai & byok:** separate BYOK API keys for web search, image generation, and media analysis; new `codex-app-server` provider integration (`http://localhost:8765/v1`, `codex-1`)
- **docs & ai:** Ask AI quotes selected text and highlights it with yellow mark; export document as clean HTML (`.html`); in-place comment editing mode; global spellcheck preference synchronization
- **shell:** Global AutoSave settings toggle with configurable interval (1-60 min); AI panel font size and spellcheck configuration; Czech UI (`cs` / `cs-CZ`) localized across Desktop Shell, PDF, Markdown, and core apps
- **sheets:** Find scoped to `worksheet.getDataRealRange()` to prevent scanning empty cells and eliminate UI freezes on large grids; external-workbook formula cached `<v>` values preserved verbatim; Excel-style paste repeat pattern replication
- **slides:** streamed PDF export for large decks to temp disk files without base64 data-URL blowout; font resolution for EMF/WMF pictures and East Asian themes (`Jpan`, `Hans`, `Hant`, `Kore`)
- **pdf:** aligned highlight geometry; Find and Replace in PDF content-stream text with match navigation and replace all (`Ctrl+H`)
- **markdown:** full TipTap Find & Replace (`Ctrl+F`, `Ctrl+H`) with regex/case/word options; live Mermaid diagram rendering with source toggle
- **slides:** new Effects inspector pane (Shadow, Reflection, Glow, Soft Edges) in FormatPane and true vertical text direction toggle
- **slides:** cross-window and cross-deck element copy/paste with base64 binary media bundling via native OS clipboard buffer `io.revelith.slides.elements`
- **slides:** one-click OS user font installer with deck-wide missing font detection and AI text box autofit
- **slides:** right-to-left support with paragraph and table direction toggles, mirrored bullets, and bidi complex-script shaping
- **slides:** chart fidelity with manual plot layout support, RTL-aware legends, and theme-override colors
- **slides:** compressed embedded fonts (MTX) decode; text fidelity for default run properties (`defRPr`), Symbol bullets, theme colors, CJK/Latin font selection, and live slide-number fields (`slidenum`)
- **slides:** EMF+ vector graphics and DIB pattern brush rendering in slide canvas and shapes
- **slides:** serialized file saves via Promise queue preventing concurrent write corruption; agent runs survive lifecycle boundaries
- **slides:** dual-window editing allowing the same presentation to be opened and edited across multiple windows
- **sheets:** CSV export of active worksheet (RFC-4180 with UTF-8 BOM) and direct saving of opened CSV files without XLSX conversion prompt
- **sheets:** multi-language File menu support for CSV export across all 19 UI languages and Data Ribbon "Export to CSV" button
- **sheets:** million-cell copies twice as fast with formula coordinate shifting and formula-breaking safety guard
- **sheets:** reliable AI edits for sort, copy, and fill on raw cell values and standalone sheet export
- **sheets:** "No fill" saves correctly; `$` in headers/footers no longer corrupts page setup
- **sheets:** cell shortcuts (`Ctrl+1`, `Ctrl+G`, navigation) isolated from AI chat panels and modal dialogs
- **sheets:** smoother scrolling and async loading of large workbooks; recalculation waits for streaming to complete
- **sheets:** workbooks with leading-slash ZIP entries open cleanly; sheet zoom level persists across saves
- **sheets:** combo chart and conditional-formatting fixes
- **sheets:** Excel compatibility for charts, column widths, row heights, and filter-hidden find skipping
- **sheets:** PDF to Excel table converter supporting multi-page spanning, rule-less bands, and label/value grids
- **docs:** Word-style dark page in dark theme — print, PDF export, and clipboard HTML preserve original document colors
- **docs:** fast opening for long documents with virtualized pagination and incremental chunking
- **docs:** spellcheck toggle in Review ribbon tab Proofing group with editor DOM and preference synchronization
- **docs:** floating-table layout overhaul (`w:tblpPr`), drop caps, hidden text (`w:vanish`), and background shading (`w:shd`)
- **docs:** live URL auto-linkify as you type, cleaner page breaks, and in-place hyperlink editing with inline card
- **docs:** per-side table borders (`w:top`, `w:bottom`, `w:left`, `w:right`, `w:insideH`, `w:insideV`); embedded DOCX fonts load
- **docs:** Word-fidelity fixes for tables, headers/footers, anchored pictures, lists, footnotes, and CJK typography
- **docs:** Word-style ribbon table layout controls and Word-compatible keyboard shortcuts
- **docs:** image anchoring, WordArt, WMF/EMF metafile rasterization, and cleaner PDF export
- **pdf:** new AI tools for watermarks, headers/footers, page move/reverse/rotate, metadata, markup removal, sticky notes, form checkboxes, and text block alignment
- **pdf & shell:** on-device OCR for scanned PDFs (native Windows Media OCR / macOS Vision Framework) with zero uploads
- **shell:** collapsible ribbon like Office in every editor (`Ctrl+F1`, double-click tab, chevron button)
- **shell & ai:** AI chat renders GitHub-style markdown tables and syntax-highlighted code blocks with copy button
- **shell & ai:** "New chat" fully clears history, pending attachments, and previews; RTL-aware AI panels
- **shell:** native Windows ARM64 installer for Snapdragon X and Windows on Arm devices, signed with DigiCert EV
- **shell & ci:** semantic release builds native ARM64 and x64 packages; automatic in-app updates directly from ReveLith GitHub releases
- **shell:** per-document file icons (`.docx`, `.pptx`, `.xlsx`, `.pdf`) and code-signed production executables
- **shell:** window-level drag-and-drop document opening across the entire suite

## [1.1.4](https://github.com/sainibhaowal/ReveLith/compare/revelith-v1.1.3...revelith-v1.1.4) (2026-08-22)

### Bug Fixes

- **ci:** point release asset upload to apps/shell/release output directory ([13be6c5](https://github.com/sainibhaowal/ReveLith/commit/13be6c5c9c1837d40a43680794c3488216d374c1))
- **pdf:** add DOMMatrix polyfill for jsdom environment in tests ([aafe725](https://github.com/sainibhaowal/ReveLith/commit/aafe7251fde99db82f5247192218fed842d0a984))

### Performance Improvements

- **ci:** add rust crate build caching for faster native sidecar builds in CI and release pipelines ([3af84a1](https://github.com/sainibhaowal/ReveLith/commit/3af84a1bfef9724aa8108ae21c486a4f5636746b))
- **ci:** parallelize test suite across 6 high-speed Ubuntu matrix runners and fix release upload path ([1b0814c](https://github.com/sainibhaowal/ReveLith/commit/1b0814c6636d9c26b0fbf0b2d9610ec1ce1989a1))

## [1.1.3](https://github.com/sainibhaowal/ReveLith/compare/revelith-v1.1.2...revelith-v1.1.3) (2026-08-22)

### Bug Fixes

- **ci:** add macOS universal rust targets x86_64-apple-darwin and aar… ([69e3945](https://github.com/sainibhaowal/ReveLith/commit/69e394564a38f8a7c1376e878f68a0da7ec2d7ad))
- **ci:** add macOS universal rust targets x86_64-apple-darwin and aarch64-apple-darwin ([4d90d34](https://github.com/sainibhaowal/ReveLith/commit/4d90d345d2c8906c152d9b08a628e64b6e4340e7))

## [1.1.2](https://github.com/sainibhaowal/ReveLith/compare/revelith-v1.1.1...revelith-v1.1.2) (2026-08-22)

### Bug Fixes

- **ci:** install platform-specific native rollup binary for macOS and Linux runners ([049d4c6](https://github.com/sainibhaowal/ReveLith/commit/049d4c676d54d858f6dba4632b191b44918d518c))
- **ci:** install platform-specific native rollup binary for macOS and… ([4b27243](https://github.com/sainibhaowal/ReveLith/commit/4b2724325d9b6a39f965fe8fc1b5c118bc80135c))

## [1.1.1](https://github.com/sainibhaowal/ReveLith/compare/revelith-v1.1.0...revelith-v1.1.1) (2026-08-21)

### Bug Fixes

- **release:** fix Ubuntu libasound dependency, macOS optional rollup binary, and Windows sidecar & repository detection ([1341365](https://github.com/sainibhaowal/ReveLith/commit/13413653d68059f105fe84addb8bf6a6be4ed32e))
- **release:** fix Ubuntu libasound dependency, macOS rollup … ([2f7c675](https://github.com/sainibhaowal/ReveLith/commit/2f7c6756669d3c5ab4fb10191d476f21187e7446))

## [1.1.0](https://github.com/sainibhaowal/ReveLith/compare/revelith-v1.0.0...revelith-v1.1.0) (2026-08-21)

### Features

- complete ReveLith office suite - clean branding, 100% test coverage and full UX integrity ([e12b570](https://github.com/sainibhaowal/ReveLith/commit/e12b570223d76d65d96fada4cb7e151c47783a59))

### Bug Fixes

- **ci:** generate valid package-lock.json for npm ci in GitHub Actions ([2be6dd8](https://github.com/sainibhaowal/ReveLith/commit/2be6dd8a373c28556225efd060851994e5d60029))
