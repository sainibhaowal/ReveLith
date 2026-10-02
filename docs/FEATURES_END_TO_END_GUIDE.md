# ReveLith Complete End-to-End Features & Architecture Guide

This document is the master technical reference and verification guide for all native features across the ReveLith Office Suite (Slides, Sheets, Docs, PDF, AI, and Desktop Shell).

---

## 1. Slides (Presentation Engine & App)

### 1.1 Right-to-Left (RTL) Support

- **Scope:** Paragraph & table reading direction toggles, complex-script shaping via `bidi-js`, and mirrored bullets.
- **Engine / OOXML:**
  - Emits `<a:pPr rtl="1">` for RTL paragraphs and `<a:rPr><a:rtl/></a:rPr>` for complex-script text runs in [packages/pptx-engine/src/generate.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-engine/src/generate.ts).
  - Emits `<a:tblPr rtl="1">` for right-to-left table columns in [packages/pptx-engine/src/table-edit.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-engine/src/table-edit.ts).
  - Preserves `<a:bodyPr rtlCol="1">` for multi-column text boxes in [packages/pptx-engine/src/parse.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-engine/src/parse.ts).
- **Renderer:**
  - [packages/pptx-render/src/text-layout.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-render/src/text-layout.ts) handles bidirectional text runs, Arabic/Hebrew character shaping, and mirrored bullet punctuation.
- **UI:**
  - Paragraph direction toggle buttons (`ribbonDirectionLtr`, `ribbonDirectionRtl`) in [RibbonHomeTab.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/components/RibbonHomeTab.tsx).
  - Table direction toggle button in [Ribbon.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/components/Ribbon.tsx#L2393) calling `slides:set-table-rtl`.
- **Tests & Verification:**
  - `packages/pptx-engine/tests/rtl.test.ts` (11/11 tests pass).
  - `packages/pptx-render/tests/rtl-layout.test.ts` (7/7 tests pass).

---

### 1.2 Chart Fidelity & Theme Overrides

- **Scope:** Manual plot layouts (`c:manualLayout`), RTL-aware legends, and theme-override color palettes.
- **Engine / Renderer:**
  - [packages/pptx-render/src/build-chart.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-render/src/build-chart.ts) computes exact plot coordinates and respects manual plot bounds.
  - Automatically mirrors legend layout coordinates when `legendRtl` is active.
  - Resolves theme override colors from `a:themeOverride` and `p:fmtScheme`.
- **Tests & Verification:**
  - `packages/pptx-render/tests/build-chart.test.ts` (16/16 tests pass).
  - `packages/pptx-render/tests/chart-fidelity.test.ts` (15/15 tests pass).
  - `packages/pptx-render/tests/chart-style-info.test.ts` (4/4 tests pass).

---

### 1.3 Scrollable Notes Pane & Text Fidelity

- **Scope:** Resizable, scrollable speaker notes pane; text fidelity for embedded fonts, gradient text fills, and baseline offsets.
- **UI:**
  - Speaker notes pane in [apps/slides/src/renderer/components/NotesPane.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/components/NotesPane.tsx) and [App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/App.tsx) with live synchronization.
- **Engine & Renderer:**
  - Speaker notes serialization in [packages/pptx-engine/src/notes-comments.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-engine/src/notes-comments.ts).
  - [packages/pptx-render/src/text-layout.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-render/src/text-layout.ts) handles font metric measurement, super/subscript baseline shifts, and gradient fills.
- **Tests & Verification:**
  - `packages/pptx-engine/tests/speaker-notes.test.ts` (7/7 tests pass).
  - `packages/pptx-engine/tests/notes-comments.test.ts` (6/6 tests pass).

---

### 1.4 Effects Pane & True Vertical Text

- **Scope:** Dedicated UI inspector for Shadow, Reflection, Glow, and Soft Edges; True vertical text layout (`vert`, `eaVert`, `vert270`, `wordArtVert`).
- **Engine & Renderer:**
  - `patchElementEffects` and `patchBodyPrVert` in [packages/pptx-engine/src/generate.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-engine/src/generate.ts).
  - `layoutTextVertical` in [packages/pptx-render/src/text-layout.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-render/src/text-layout.ts).
  - Effect resolvers `resolveShadow`, `resolveGlow`, `resolveReflection`, and `softEdgePx` in [packages/pptx-render/src/build-slide.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-render/src/build-slide.ts).
- **UI:**
  - Collapsible Effects accordion section in [FormatPane.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/components/FormatPane.tsx).
  - Text direction controls in [FormatPane.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/components/FormatPane.tsx) and Vertical Text ribbon button in [RibbonHomeTab.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/components/RibbonHomeTab.tsx).
- **Tests & Verification:**
  - `packages/pptx-engine/tests/effects-and-vertical-text.test.ts` (7/7 tests pass).

---

### 1.5 Cross-Window & Cross-Deck Copy & Paste

- **Scope:** Full element serialization through the native OS clipboard with binary media asset bundling.
- **Implementation:**
  - Custom clipboard buffer format `io.revelith.slides.elements` written with `clipboard.writeBuffer` in [apps/slides/src/main/slides-main.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/main/slides-main.ts).
  - Embedded images, audio, and video are serialized as base64 in `mediaParts` and re-injected into the target presentation's ZIP package upon paste.
- **Tests & Verification:**
  - `packages/pptx-engine/tests/copy-slide-across-decks.test.ts` (11/11 tests pass).
  - `packages/pptx-engine/tests/clipboard-table-transition.test.ts` (17/17 tests pass).

---

### 1.6 Missing-Font Detection & One-Click Font Installer

- **Scope:** Deck-wide missing font analysis and native OS installation of missing fonts.
- **Implementation:**
  - [apps/slides/src/main/fonts.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/main/fonts.ts) scans slide runs and masters against OS font registries.
  - `installFont` saves `.ttf`/`.otf`/`.woff2` files directly to user font directories and updates font caches.
  - Ambient warning banner and one-click installation modal in [apps/slides/src/renderer/App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/App.tsx).
  - AI text box autofit via `applyAutofitResize` with `spAutoFit` in [slides-main.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/main/slides-main.ts).

---

### 1.7 Dual-Window Presentation Editing

- **Scope:** Open the same PPTX in two separate windows with real-time state synchronization.
- **Implementation:**
  - Multi-window session tracking in [apps/slides/src/main/slides-main.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/main/slides-main.ts) coordinates slide updates and broadcasts changes across windows.

---

### 1.8 PowerPoint Import Fidelity (3 Waves)

- **Scope:** High-fidelity conversion and preservation of autoshapes, connectors, SmartArt fallbacks, OLE objects, animations, and masters.
- **Tests & Verification:**
  - 61 test files and 587 tests in `packages/pptx-engine/tests`.

---

### 1.9 Compressed Embedded Fonts (MTX) Decoding

- **Scope:** Decodes compressed MicroType Express (MTX) font streams embedded within `.pptx` presentations into native OpenType/TrueType tables for canvas rendering.
- **Implementation:**
  - Font decompressor in [apps/slides/src/main/fonts.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/main/fonts.ts) extracts compressed MTX font data parts from the PPTX package and transforms them to standard `@font-face` buffers.

---

### 1.10 Text Run & Font Fidelity

- **Scope:** Comprehensive text run styling matching PowerPoint: default run properties (`defRPr`), Symbol & Wingdings bullet font mapping (`<a:buFont>`), theme colors, CJK vs. Latin font selection, and live `slidenum` fields.
- **Implementation:**
  - Text styling resolution in [packages/pptx-render/src/text-layout.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-render/src/text-layout.ts), [placeholder.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-render/src/placeholder.ts), and [packages/pptx-engine/src/parse.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-engine/src/parse.ts).
- **Tests & Verification:**
  - `packages/pptx-render/tests/text-fidelity.test.ts` and `packages/pptx-engine/tests/text-runs.test.ts`.

---

### 1.11 EMF+ Vector Pictures & Pattern Brushes

- **Scope:** Renders Enhanced Metafile Format Plus (EMF+) vector graphics and GDI+ pattern brushes (`EMR_CREATEDIBPATTERNBRUSHPT`) crisply without rasterization blur.
- **Implementation:**
  - Vector decoder in [packages/emf-parser/src/emf.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/emf-parser/src/emf.ts) and [packages/docx-engine/src/metafile-bitmap.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/docx-engine/src/metafile-bitmap.ts).

---

### 1.12 Serialized Saves & Resilient AI Runs

- **Scope:** Chained Promise queues (`saveQueueBySender`) prevent concurrent write corruption during rapid saves; background AI agent tasks survive window lifecycle boundaries.
- **Implementation:**
  - Serialized save queue in [apps/slides/src/main/slides-main.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/main/slides-main.ts) and lifecycle state persistence in [apps/slides/src/renderer/ai/slides-skill.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/ai/slides-skill.ts).

---

## 2. Sheets (Spreadsheet Engine & App)

### 2.1 Fast Million-Cell Copies & Formula Safety Guard

- **Scope:** High-speed paste handling for 1,000,000+ cells and rejection of operations that break calculation chains.
- **Implementation:**
  - [apps/sheets/src/domain/paste-formulas.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/domain/paste-formulas.ts) offsets formulas with coordinate shifting in ~2.5s for 1M cells.
  - [apps/sheets/src/renderer/paste-guard.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/paste-guard.ts) validates cell operations against active formulas.
- **Tests & Verification:**
  - `apps/sheets/tests/paste-formulas.test.ts` (11/11 tests pass).
  - `apps/sheets/tests/paste-guard.test.ts` (4/4 tests pass).

---

### 2.2 Reliable AI Edits (Raw Cell Values, Streamed Formulas & Sheet Splitting)

- **Scope:** AI `sort_range`, `copy_range`, and `fill_range` operations run on raw cell values rather than formatted display strings; streamed workbooks support formula edits and sheet splitting.
- **Implementation:**
  - [apps/sheets/src/domain/workbook-dsl.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/domain/workbook-dsl.ts) lines 1175–1240 expand operations into cell-level edits with compare-and-swap (CAS) safety.
  - [apps/sheets/src/gateway/xlsx-streaming-save.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/gateway/xlsx-streaming-save.ts) updates modified worksheets while streaming untouched parts byte-for-byte.
- **Tests & Verification:**
  - `apps/sheets/tests/xlsx-streaming-save.test.ts` (6/6 tests pass).
  - `apps/sheets/tests/xlsx-sheets.test.ts` (31/31 tests pass).

---

### 2.3 AI Chat Export & High-Speed Conditional Formatting

- **Scope:** AI chat can export active worksheets as standalone files; fast conditional formatting evaluation on large workbooks.
- **Implementation:**
  - `export_sheet` tool in [apps/sheets/src/renderer/ai/tools.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/ai/tools.ts).
  - Conditional formatting rules in [apps/sheets/src/gateway/xlsx-cf.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/gateway/xlsx-cf.ts).
- **Tests & Verification:**
  - `apps/sheets/tests/xlsx-cf.test.ts` (15/15 tests pass).

---

### 2.4 CSV Support (Export Active Sheet as CSV & Direct Save)

- **Scope:** Direct export of active worksheet to RFC-4180 CSV with UTF-8 BOM (`\ufeff`); direct saving of opened `.csv` files back to disk without forcing `.xlsx` conversion prompts.
- **Implementation:**
  - [apps/sheets/src/main/csv-export.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/main/csv-export.ts) formats rows and manages save dialogs.
  - [apps/sheets/src/renderer/csv-export-action.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/csv-export-action.ts) extracts display and raw values.
  - [apps/sheets/src/main/sheets-main.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/main/sheets-main.ts) adds native File menu item across **all 19 supported UI languages** and handles `isDirectCsvSave`.
  - [apps/sheets/src/renderer/ExcelShell.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/ExcelShell.tsx) adds "Export to CSV" button in the Data ribbon tab.
- **Tests & Verification:**
  - `apps/sheets/tests/csv-export.test.ts` (5/5 tests pass).

---

### 2.5 Excel Parity: Charts, Fills, Pivot Styles, Pictures & Validation Dropdowns

- **Scope:** Full OOXML parity for chart styles, pattern/gradient fills, PivotTable styles, embedded floating pictures, and data validation rules.
- **Tests & Verification:**
  - `apps/sheets/tests/xlsx-chart.test.ts` (74/74 tests pass).
  - `apps/sheets/tests/xlsx-pivot-add.test.ts` (22/22 tests pass).
  - `apps/sheets/tests/xlsx-dv.test.ts` (11/11 tests pass).
  - `apps/sheets/tests/xlsx-drawing-add.test.ts` (14/14 tests pass).

---

### 2.6 Excel Column Widths, Row Heights & Filter-Hidden Find

- **Scope:** Pixel-perfect Excel row height (points) and column width (character width units); Find & Replace automatically skips rows hidden by filters.
- **Implementation:**
  - Unit conversions in [apps/sheets/src/renderer/ribbon-actions.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/ribbon-actions.ts#L767).
  - Filter state awareness in Univer find-replace integration.

---

### 2.7 Active Row & Column Highlighting

- **Scope:** Dynamic highlight styling on row and column headers matching Excel's visual feedback.
- **Implementation:**
  - Theme-aware header highlighting registered in [apps/sheets/src/renderer/App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/App.tsx).

---

### 2.8 PDF to Excel Table Extraction (Multi-Page & Rule-Less Bands)

- **Scope:** Converts scanned and digital PDF tables into Excel worksheets, merging tables across page breaks and recognizing rule-less bands and key-value grids.
- **Implementation:**
  - [apps/sheets/src/main/pdf-table-extractor.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/main/pdf-table-extractor.ts).
- **Tests & Verification:**
  - `apps/sheets/tests/pdf-table-extractor.test.ts` (10/10 tests pass).

---

### 2.9 "No Fill" Cell Style Saving & Draft State

- **Scope:** Accurately distinguishes between explicit white cell fills and "No fill" (`null`), serializing clean OOXML styles without unwanted background fills.
- **Implementation:**
  - Explicit cell fill draft state in [apps/sheets/src/renderer/FormatCellsDialog.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/FormatCellsDialog.tsx) and [apps/sheets/src/domain/workbook-dsl.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/domain/workbook-dsl.ts).

---

### 2.10 Safe Header/Footer Page Setup ($ Protection)

- **Scope:** Literal `$` characters (e.g., `$100 Budget`, `$&`, `$$`) in custom headers and footers no longer corrupt XML page setup.
- **Implementation:**
  - Slicing and XML entity escaping in [apps/sheets/src/gateway/xlsx-page-setup.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/gateway/xlsx-page-setup.ts) avoiding regex replacement token conflicts.
- **Tests & Verification:**
  - `apps/sheets/tests/xlsx-page-setup.test.ts` (passing).

---

### 2.11 Cell Shortcuts Isolation

- **Scope:** Cell navigation and formatting shortcuts (`Ctrl+1`, `Ctrl+G`, arrow keys) are strictly suppressed whenever focus is in text inputs, textareas, contenteditable elements, modal dialogs, or the AI chat panel.
- **Implementation:**
  - Focus isolation filter in [apps/sheets/src/renderer/ExcelShell.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/ExcelShell.tsx) `onKeyDown` handler.

---

### 2.12 Smooth Scrolling & Recalculation Stream Synchronization

- **Scope:** Fluid scrolling and row/column virtualization on multi-hundred-thousand row workbooks; formula recalculation waits for async streaming to complete before evaluation.
- **Implementation:**
  - Virtualization and stream coordination in [apps/sheets/src/renderer/univer-sync.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/univer-sync.ts) and [apps/sheets/src/gateway/xlsx-streaming-save.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/gateway/xlsx-streaming-save.ts).

---

### 2.13 Leading-Slash ZIP Entry Compatibility

- **Scope:** Workbooks created by 3rd-party generators containing leading slashes in ZIP entry paths (e.g., `/xl/workbook.xml`) open cleanly without path mismatch errors.
- **Implementation:**
  - Path normalization in `loadSafeZip` within [apps/sheets/src/gateway/xlsx-gateway.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/gateway/xlsx-gateway.ts).
- **Tests & Verification:**
  - `apps/sheets/tests/xlsx-producer-compat.test.ts` (passing).

---

### 2.14 Zoom Persistence & Combo Chart / Conditional Formatting Fixes

- **Scope:** Sheet zoom percentage persists across saves and reloads; combo charts with dual axes and complex conditional formatting rules evaluate and render accurately.
- **Implementation:**
  - View serialization in [apps/sheets/src/gateway/xlsx-cf.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/gateway/xlsx-cf.ts) and [apps/sheets/src/gateway/xlsx-chart.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/gateway/xlsx-chart.ts).

---

## 3. Docs (Word Processor Engine & App)

### 3.1 Floating-Table Layout, Drop Caps, Hidden Text & Shading

- **Scope:** Complete floating table layout (`w:tblpPr`), drop caps, hidden text (`w:vanish`), and cell background shading (`w:shd`).
- **Engine:**
  - [packages/docx-engine/src/parse.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/docx-engine/src/parse.ts) and [generate.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/docx-engine/src/generate.ts).
- **Tests & Verification:**
  - `packages/docx-engine/tests/table-floating.test.ts` (passing).
  - `apps/docs/tests/floating-tables.test.ts` (passing).

---

### 3.2 URL Auto-Linkify, Cleaner Page Breaks & Hyperlinks

- **Scope:** URLs automatically turn into clickable links as you type; clean visual page breaks; in-place link editing tooltip.
- **Implementation:**
  - [apps/docs/src/renderer/editor/autolink.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/editor/autolink.ts).
  - [apps/docs/src/renderer/editor/pagination-gaps.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/editor/pagination-gaps.ts).
  - [apps/docs/src/renderer/components/LinkTooltip.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/components/LinkTooltip.tsx).
- **Tests & Verification:**
  - `apps/docs/tests/autolink.test.ts` (passing).

---

### 3.3 Layout Fidelity (Row Heights across Page Breaks, Footnotes, Spacing)

- **Scope:** Tables splitting across pages maintain row heights; footnote sizing and numbering match Word; Word-compatible justified text spacing.
- **Implementation:**
  - [apps/docs/src/renderer/editor/convert.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/editor/convert.ts) and [marks.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/editor/marks.ts).

---

### 3.4 DOCX Fidelity (Image Anchoring, WordArt & Clean PDF Export)

- **Scope:** Wrap text and absolute image anchoring; WordArt and WMF/EMF vector metafile rasterization; PDF export without artifacts.
- **Implementation:**
  - [packages/docx-engine/src/metafile-bitmap.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/docx-engine/src/metafile-bitmap.ts) and [packages/emf-parser/src/emf.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/emf-parser/src/emf.ts).
- **Tests & Verification:**
  - `packages/docx-engine/tests/metafile-bitmap.test.ts` (passing).
  - `packages/emf-parser/tests/emf.test.ts` (passing).

---

### 3.5 Word-Style Table Controls & Shortcuts

- **Scope:** Word-style ribbon table controls (Insert/Delete Row/Column, Merge, Split, Alignment) and keyboard shortcuts (Ctrl+B/I/U, Ctrl+L/E/R/J, Ctrl+K, Ctrl+Enter).
- **Implementation:**
  - [apps/docs/src/renderer/App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/App.tsx) and [editor/extensions.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/editor/extensions.ts).

---

### 3.6 Word-Style Dark Page in Dark Theme

- **Scope:** Word-style dark page rendering in dark theme; print media, PDF export, and clipboard HTML copy preserve original document colors and text styling.
- **Implementation:**
  - Document canvas inversion via `.doc-page.dark-canvas` in [apps/docs/src/renderer/App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/App.tsx) and [apps/docs/src/renderer/styles.css](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/styles.css); export and clipboard pathways preserve original hex color values.

---

### 3.7 Fast Long Document Loading

- **Scope:** High-speed opening of long, multi-hundred-page documents without UI freezing or excessive memory allocation.
- **Implementation:**
  - Paginated layout virtualization and incremental chunking in [apps/docs/src/renderer/editor/convert.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/editor/convert.ts) and [pagination-gaps.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/editor/pagination-gaps.ts).

---

### 3.8 Review Tab Spellcheck Toggle

- **Scope:** Word-style spelling & grammar toggle in the Review ribbon tab Proofing group with visual active state and `localStorage` preference persistence.
- **Implementation:**
  - `IconSpellcheck` button in [apps/docs/src/renderer/components/ribbon-tabs.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/components/ribbon-tabs.tsx) and dynamic `spellcheck` attribute synchronization on the editor DOM in [apps/docs/src/renderer/App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/App.tsx).

---

### 3.9 Interactive In-Place Hyperlink Editing Card

- **Scope:** Hovering or clicking existing hyperlinks opens an inline card to edit URL, copy, visit, or remove the link.
- **Implementation:**
  - [apps/docs/src/renderer/components/LinkTooltip.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/components/LinkTooltip.tsx).

---

### 3.10 Per-Side Table Borders Engine

- **Scope:** Independent styling for top, bottom, left, right, inside horizontal, and inside vertical table borders (`w:top`, `w:bottom`, `w:left`, `w:right`, `w:insideH`, `w:insideV`).
- **Implementation:**
  - [packages/docx-engine/src/table-style.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/docx-engine/src/table-style.ts).

---

### 3.11 Embedded DOCX Font Extraction & Loading

- **Scope:** Embedded font streams (`w:font` / `w:embedRegular`) in DOCX files are extracted and loaded dynamically as `@font-face` rules.
- **Implementation:**
  - Native font extraction in [packages/docx-engine/src/parse.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/docx-engine/src/parse.ts).

---

### 3.12 Comprehensive Word Fidelity Fixes

- **Scope:** Strict schema order enforcement for tables, headers/footers, anchored pictures, multi-level lists, footnotes, and CJK typography conforming strictly to OOXML schema child ordering.
- **Implementation:**
  - [packages/docx-engine/src/generate.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/docx-engine/src/generate.ts).
- **Tests & Verification:**
  - `packages/docx-engine/tests/schema-order.test.ts` (passing).

---

## 4. Platform, Desktop Shell, PDF & AI

### 4.1 On-Device OCR for Scanned PDFs

- **Scope:** 100% private, on-device OCR using native OS engines (Windows Media OCR / macOS Vision Framework); zero cloud uploads.
- **Implementation:**
  - [apps/pdf/src/main/ocr-service.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/pdf/src/main/ocr-service.ts) and [apps/shell/src/main/search-index.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/main/search-index.ts).
- **Tests & Verification:**
  - `apps/pdf/tests/ocr-service.test.ts` (passing).
  - `apps/shell/tests/search-index.test.ts` (passing).

---

### 4.2 Selection-Aware AI (Cells & Slide Objects)

- **Scope:** Ask AI directly from active spreadsheet selections or slide objects.
- **Implementation:**
  - Selected cell ranges and slide shapes are bound to the conversation context in [AiChatPanel.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/ai/AiChatPanel.tsx).

---

### 4.3 Stronger Multi-Doc AI (Batch Edits, Tracked Changes, Citations & Images)

- **Scope:** Queue multiple edits and apply them in one atomic transaction; tracked changes and comments awareness; citation jumps; in-document image generation.
- **Implementation:**
  - Unified AI skills in `apps/docs/src/renderer/ai/docs-skill.ts`, `apps/markdown/src/main/markdown-main.ts`, and `apps/pdf/src/renderer/ai/pdf-skill.ts`.

---

### 4.4 Window Drag-and-Drop Document Opening

- **Scope:** Open documents by dragging and dropping `.docx`, `.pptx`, `.xlsx`, or `.pdf` files onto any app window.
- **Implementation:**
  - Desktop frame drop handler in [apps/shell/src/renderer/src/AppFrame.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/renderer/src/AppFrame.tsx).

---

### 4.5 Code-Signed Executables & Per-Document File Icons

- **Scope:** All production binaries are code-signed; custom file icons for each document type across Windows, macOS, and Linux.
- **Implementation:**
  - Icon generation in [apps/shell/build/gen-doc-icons.mjs](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/build/gen-doc-icons.mjs).
  - Signing configuration in [apps/shell/electron-builder.cjs](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/electron-builder.cjs).
- **Tests & Verification:**
  - `apps/shell/tests/doc-icons.test.ts` (passing).

---

## 5. v1.3.0 Native End-to-End Integrations (Unreleased)

### 5.1 ReveLith CLI + Agent Skill (all local)

- **Scope:** `revelith info|read|render|create|convert|docs|sheets|deck outline|build|replace|audit`; `skills/revelith/SKILL.md` agent contract; Settings → Integrations one-click install; OpenCode `x-opencode-session` header.
- **Implementation:**
  - CLI in [packages/revelith-cli/src/commands.ts](file:///c:/Users\Ravin\Projects\ReveLith\packages\revelith-cli\src\commands.ts); skill in [skills/revelith/SKILL.md](file:///c:/Users\Ravin/Projects/ReveLith/skills/revelith/SKILL.md).
  - Installer in [apps/shell/src/main/skill-install.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\shell\src\main\skill-install.ts), IPC `skill:install` in [apps/shell/src/main/index.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\shell\src\main\index.ts), preload + `HomeApi.installSkill` in [apps/shell/src/preload/index.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\shell\src\preload\index.ts) / [apps/shell/src/shared/home-api.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\shell\src\shared\home-api.ts), UI `IntegrationsSection` in [apps/shell/src/renderer/src/SettingsModal.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\shell\src\renderer\src\SettingsModal.tsx).
  - Session header in [packages/ai-provider/src/types.ts](file:///c:/Users\Ravin/Projects/ReveLith/packages\ai-provider\src\types.ts), [packages/ai-provider/src/stream.ts](file:///c:/Users\Ravin/Projects/ReveLith/packages\ai-provider\src\stream.ts), [packages/ai-provider/src/chat.ts](file:///c:/Users\Ravin/Projects/ReveLith/packages\ai-provider\src\chat.ts).
- **Tests:** `packages/revelith-cli/tests/cli.test.ts` (4/4: info/create/reject/outline→build→audit).
- **Limits:** `render` emits a manifest (desktop rasterizes); docs/sheets edits are journaled receipts; `convert` validates pairs.

### 5.2 Docs — Citations, Paste, Checkboxes, Drops, Streaming

- **Implementation:** `handleDrop` + checkbox/stream listeners + `PasteOptionsChip` in [apps/docs/src/renderer/App.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\docs\src\renderer\App.tsx); [apps/docs/src/renderer/components/PasteOptionsChip.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\docs\src\renderer\components\PasteOptionsChip.tsx); [apps/docs/src/renderer/components/zotero-import.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\docs\src\renderer\components\zotero-import.ts) (`parseRis`/`parseBibtex`); RIS/BibTeX file input in [apps/docs/src/renderer/components/ribbon-references-tab.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\docs\src\renderer\components\ribbon-references-tab.tsx).
- **Tests:** `apps/docs/tests/zotero-import.test.ts` (2/2).

### 5.3 Sheets — Home Actions, Images, Print, Functions

- **Implementation:** [apps/sheets/src/renderer/ExcelShell.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\sheets\src\renderer\ExcelShell.tsx) (AutoSum/Sort&Filter/AutoFit), [apps/sheets/src/renderer/ribbon-actions.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\sheets\src\renderer\ribbon-actions.ts) (`autofit-row/col`, `toggle-filter`), [apps/sheets/src/renderer/paste-guard.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\sheets\src\renderer\paste-guard.ts) (`installClipboardImagePaste`), [apps/sheets/src/renderer/print-html.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\sheets\src\renderer\print-html.ts) (`PrintVisual[]`), [apps/sheets/src/renderer/InsertFunctionDialog.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\sheets\src\renderer\InsertFunctionDialog.tsx) (84 functions).
- **Tests:** `tests/insert-function-catalog.test.ts` (4/4), `tests/paste-guard.test.ts` (6/6).

### 5.4 Slides — Bullets, Tables, Editing, Hardening

- **Implementation:** `a:buBlip` picture bullets in [packages/pptx-engine/src/parse.ts](file:///c:/Users\Ravin/Projects/ReveLith/packages\pptx-engine\src\parse.ts) + `picture` type in [packages/pptx-engine/src/types.ts](file:///c:/Users\Ravin/Projects/ReveLith/packages\pptx-engine\src\types.ts); `TableDialog` in [apps/slides/src/renderer/components/InsertDialogs.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\slides\src\renderer\components\InsertDialogs.tsx); single-click edit in [apps/slides/src/renderer/SlideCanvas.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\slides\src\renderer\SlideCanvas.tsx); `sanitizeDeckForPowerPoint` in [packages/pptx-engine/src/index.ts](file:///c:/Users\Ravin/Projects/ReveLith/packages\pptx-engine\src\index.ts).
- **Tests:** `packages/pptx-engine/tests/sanitize-deck.test.ts` (1/1).

### 5.5 HTML — Insert, Images, Single-File, Reorder

- **Implementation:** [apps/html/src/renderer/App.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\html\src\renderer\App.tsx) (snippets, image URL, single-file, `handleMoveLayer`); [apps/html/src/renderer/components/Ribbon.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\html\src\renderer\components\Ribbon.tsx); [apps/html/src/renderer/components/LayerTree.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\html\src\renderer\components\LayerTree.tsx) (`onMove`); `saveSingleFile` across [apps/html/src/shared/ipc.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\html\src\shared\ipc.ts), [apps/html/src/preload/index.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\html\src\preload\index.ts), [apps/html/src/main/html-main.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\html\src\main\html-main.ts).

### 5.6 PDF — Print Ranges, Conversions

- **Implementation:** `parsePageRange` + ranged `printPdf` in [apps/pdf/src/renderer/print.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\pdf\src\renderer\print.ts); [apps/pdf/src/renderer/PrintRangeDialog.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\pdf\src\renderer\PrintRangeDialog.tsx) wired to Ctrl+P + ribbon in [apps/pdf/src/renderer/App.tsx](file:///c:/Users\Ravin/Projects/ReveLith/apps\pdf\src\renderer\App.tsx); [apps/pdf/src/renderer/pdf-export-convert.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\pdf\src\renderer\pdf-export-convert.ts).
- **Tests:** `apps/pdf/tests/print-range-convert.test.ts` (3/3).

### 5.7 Shell Chrome

- **Implementation:** `autoHideMenuBar` + `titleBarOverlay` + `ready-to-show` in [apps/shell/src/main/index.ts](file:///c:/Users\Ravin/Projects/ReveLith/apps\shell\src\main\index.ts).

---

### 4.6 Collapsible Ribbon in Every Editor

- **Scope:** Office-style collapsible ribbon in Docs, Slides, and Sheets with `Ctrl+F1` keyboard shortcut, active tab double-click, and top-right chevron button.
- **Implementation:**
  - Implemented in Docs [Ribbon.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/components/Ribbon.tsx), Slides [Ribbon.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/components/Ribbon.tsx), and Sheets [ExcelShell.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/ExcelShell.tsx).

---

### 4.7 Rich AI Chat: Tables, Syntax-Highlighted Code & RTL

- **Scope:** AI chat renders GitHub-style markdown tables with borders and styled syntax-highlighted code blocks with one-click copy buttons; automatic right-to-left layout for Arabic/Hebrew.
- **Implementation:**
  - Markdown renderer in [packages/ui/src/Markdown.tsx](file:///c:/Users/Ravin/Projects/ReveLith/packages/ui/src/Markdown.tsx) with code copying and RTL direction detection.

---

### 4.8 Clean "New Chat" State Reset

- **Scope:** Triggering "New chat" completely resets conversation history, file attachment queues, and preview cards.
- **Implementation:**
  - `newChat()` implementation in [apps/docs/src/renderer/ai/AiPanel.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/ai/AiPanel.tsx).

---

### 4.9 Dedicated AI Tools for PDF

- **Scope:** Comprehensive AI tool suite for watermarks, headers/footers, page move/reverse/rotate, metadata editing, markup removal, sticky note annotations, form checkboxes, and text block alignment.
- **Implementation:**
  - Native PDF engine and AI skill handlers in `apps/pdf/src/main/` and [apps/pdf/src/renderer/ai/pdf-skill.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/pdf/src/renderer/ai/pdf-skill.ts).

---

### 4.10 Native Windows ARM64 Installer (Snapdragon X & Windows on Arm)

- **Scope:** Native Windows on Arm installer targeting Snapdragon X and ARM64 devices, verified on Windows 11 ARM64 and signed with DigiCert EV Authenticode.
- **Implementation:**
  - Electron Builder configuration in [apps/shell/electron-builder.cjs](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/electron-builder.cjs) and [.github/workflows/release.yml](file:///c:/Users/Ravin/Projects/ReveLith/.github/workflows/release.yml).

---

### 4.11 Direct In-App Auto-Updates via ReveLith GitHub Releases

- **Scope:** Semantic release builds and packages native ARM64 and x64 releases; installed apps automatically check, verify, and download updates exclusively from ReveLith GitHub releases. If x64 is run on Arm, it auto-migrates to ARM64.
- **Implementation:**
  - Baked GitHub update provider in [apps/shell/electron-builder.cjs](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/electron-builder.cjs), `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and `*.blockmap` release asset uploads.

---

### 4.12 ReveLith HTML (Interactive HTML Studio & Document Engineering)

- **Scope:** Full-featured `.html` document creator & editor with AI Design, AI Document generation, interactive element click-to-restyle, targeted element AI refinement, DOM layer tree inspector, fullscreen presentation mode, and local Word (`.docx`) & PDF export.
- **Architecture & Implementation:**
  - **App & Layout:** [apps/html/src/renderer/App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/html/src/renderer/App.tsx) hosts the sandboxed live preview iframe, ribbon controls, and sidebars.
  - **Click-to-Restyle & Inspection:** [apps/html/src/renderer/components/ElementRestyler.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/html/src/renderer/components/ElementRestyler.tsx) communicates bidirectionally with the guest document via `postMessage` (`revelith:element-selected`, `revelith:update-element-style`).
  - **Targeted AI Refinement:** Prompts AI to alter or enhance only the selected DOM node using `revelith:replace-selected-html` without disrupting surrounding document structure.
  - **DOM Layer Tree:** [apps/html/src/renderer/components/LayerTree.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/html/src/renderer/components/LayerTree.tsx) recursively renders the document hierarchy with selection highlighting.
  - **Fullscreen Present Mode:** [apps/html/src/renderer/components/PresentMode.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/html/src/renderer/components/PresentMode.tsx) enables full-screen slide presentations with keyboard navigation.
  - **Native Word & PDF Export:** [apps/html/src/renderer/export/htmlDocxExport.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/html/src/renderer/export/htmlDocxExport.ts) parses HTML elements to typed OOXML blocks using `@revelith/docx-engine`, and headless Chromium PDF printing in [apps/html/src/main/html-main.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/html/src/main/html-main.ts).
  - **Shell Integration:** Integrated into [apps/shell](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell) as `TabKind = 'html'`, with desktop file associations (`.html`, `.htm`) and Home screen templates.

---

### 4.13 AI Provider Architecture & Selection Quoting

- **Scope:** Granular BYOK API keys for Web Search, Image Generation, and Media Analysis; new `codex-app-server` provider; Ask AI quotes and highlights selected text in Docs.
- **Implementation:**
  - **Granular BYOK Keys:** [packages/ai-provider/src/types.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/ai-provider/src/types.ts) defines `ByokSettings` (`webSearchKey`, `imageGenKey`, `mediaAnalysisKey`). Configured in Shell's [SettingsModal.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/renderer/src/SettingsModal.tsx).
  - **Web Search BYOK:** [packages/ai-search/src/search.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/ai-search/src/search.ts) prioritizes user BYOK search keys before falling back to default Serper configurations.
  - **Codex App Server:** Added `'codex-app-server'` provider metadata (`http://localhost:8765/v1`, model `codex-1`) in [packages/ai-provider/src/types.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/ai-provider/src/types.ts) and streaming transports.
  - **Selection Quoting & Highlight:** In [apps/docs/src/renderer/ai/AiPanel.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/ai/AiPanel.tsx), selected text appears as a quote badge chip; submitting quotes applies a native `docTextStyle` yellow highlight (`#fef08a`) to the quoted span in the editor.

---

### 4.14 App Shell: Global AutoSave, AI Typography & Czech Localization

- **Scope:** Global AutoSave toggle with configurable interval (1-60 min); AI panel typography scaling and spellcheck preferences; Complete Czech UI (`cs` / `cs-CZ`).
- **Implementation:**
  - **Global AutoSave:** Central timer in [apps/shell/src/renderer/src/App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/renderer/src/App.tsx) and configuration card in [SettingsModal.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/renderer/src/SettingsModal.tsx).
  - **AI Typography & Spellcheck:** Configures `--ai-base-font-size` and spellcheck attributes in [apps/docs/src/renderer/ai/AiPanel.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/ai/AiPanel.tsx) and [apps/docs/src/renderer/App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/App.tsx).
  - **Czech Localization:** Added `cs` (Čeština, `cs-CZ`) across [packages/i18n](file:///c:/Users/Ravin/Projects/ReveLith/packages/i18n), [apps/shell/src/renderer/src/locale.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/renderer/src/locale.tsx), [apps/pdf/src/renderer/i18n/strings.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/pdf/src/renderer/i18n/strings.ts), [apps/markdown/src/renderer/i18n/strings.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/markdown/src/renderer/i18n/strings.ts), and main process menus.

---

### 4.15 Docs: HTML Export & In-Place Comment Editing

- **Scope:** Export document directly to HTML; double-click/edit existing comments in-place.
- **Implementation:**
  - **HTML Export:** Registered IPC `docs:export-html` in [apps/docs/src/main/docs-main.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/main/docs-main.ts) and File menu actions in [apps/docs/src/renderer/file-actions.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/file-actions.ts).
  - **In-Place Comments:** Inline textarea mode in [apps/docs/src/renderer/components/CommentsPanel.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/components/CommentsPanel.tsx) preserving OOXML thread identifiers and author metadata.

---

### 4.16 Sheets: Performance Bounding, Cached Formulas & Paste Repeat

- **Scope:** Find & Replace no longer freezes on large grids; external-workbook formulas keep cached values; Excel-style paste repeat pattern tiling.
- **Implementation:**
  - **Find Scope Bounding:** [apps/sheets/src/renderer/find-replace-fix.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/find-replace-fix.ts) bounds searches to `worksheet.getDataRealRange()`, preventing scanning 1M+ empty grid cells. Installed in [App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/App.tsx).
  - **External Formula Caching:** [apps/sheets/src/gateway/xlsx-gateway.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/gateway/xlsx-gateway.ts) preserves original `<v>` cached values when formulas refer to external workbooks.
  - **Excel-Style Paste Repeat:** `tileTsv` in [apps/sheets/src/renderer/paste-guard.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/paste-guard.ts) tiles copied clipboard blocks across larger destination selections. Verified in `apps/sheets/tests/paste-guard.test.ts`.

---

### 4.17 Slides: Large Deck PDF Streaming & Font Resolution

- **Scope:** Memory-safe streamed PDF export for large decks; East Asian and complex font resolution for themes and WMF/EMF metafiles.
- **Implementation:**
  - **Disk Streaming PDF Export:** [apps/slides/src/main/slides-main.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/main/slides-main.ts) streams slide raster images to temporary disk files via `mkdtemp` and loads them via `win.loadFile`, preventing base64 URL blowout and memory exhaust.
  - **East Asian & Complex Fonts:** Extended typeface resolver in [packages/pptx-engine/src/theme.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-engine/src/theme.ts) resolving `<a:ea>` (`Jpan`, `Hans`, `Hant`, `Kore`) and `<a:cs>`.

---

### 4.18 PDF & Markdown: Find/Replace & Mermaid Diagrams

- **Scope:** In-content Find and Replace in PDF; aligned highlight geometry in PDF; full TipTap Find & Replace in Markdown; live Mermaid diagrams in Markdown.
- **Implementation:**
  - **PDF Find & Replace:** [apps/pdf/src/renderer/App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/pdf/src/renderer/App.tsx) adds Replace mode to the search bar (`Ctrl+H`), applying in-place `LocalTextEdit` replacements.
  - **PDF Aligned Highlights:** [apps/pdf/src/renderer/annotations.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/pdf/src/renderer/annotations.ts) aligns highlight bounds to glyph ascender/descender metrics.
  - **Markdown Find & Replace:** [apps/markdown/src/renderer/editor/searchHighlight.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/markdown/src/renderer/editor/searchHighlight.ts) and [FindReplaceBar.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/markdown/src/renderer/components/FindReplaceBar.tsx) provide match highlighting, regex, whole-word, and replace all.
  - **Mermaid Diagrams:** [apps/markdown/src/renderer/editor/CodeBlockView.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/markdown/src/renderer/editor/CodeBlockView.tsx) renders live SVG diagrams with an interactive source code toggle button.

### 4.19 Model Context Protocol (MCP) & AI Automation

- **Scope:** Headless CLI MCP server over stdio (`revelith mcp`), live in-app Word editing server (`http://127.0.0.1:3928/mcp`), and guided multi-slide presentation builder.
- **Implementation:**
  - **`@revelith/cli`**: Headless package in `packages/revelith-cli` implementing JSON-RPC 2.0 stdio server, document checking (`revelith check`), editor navigation (`revelith open`), operations (`docs apply`, `sheet apply`, `slides apply`), and guided deck building (`guided_deck_builder`).
  - **Live In-App Server**: [apps/shell/src/main/mcp-server.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/main/mcp-server.ts) starts an HTTP JSON-RPC server on port 3928 allowing AI agents to inspect the active document and edit live Word text in real time.
  - **Settings → Integrations**: [apps/shell/src/renderer/src/SettingsModal.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/renderer/src/SettingsModal.tsx) provides copy-ready configuration blocks for Claude Code, Claude Desktop, and Cursor.
- **Tests & Verification:**
  - `packages/revelith-cli/tests/cli.test.ts` (6/6 tests pass).

---

### 4.20 Native End-to-End Suite Features

- **App / Shell**:
  - Save folder explorer (`<FoldersPanel>` in [Home.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/renderer/src/Home.tsx)) listing subfolders, file counts, and folder filter banner.
  - Help → About dialog showing version `1.1.4` and system metadata.
- **Docs**:
  - File → Export as Images exporting pages as crisp PNG files.
  - View & Save Picture As preview modal and context-menu actions.
  - CJK document editing optimization in [word-count.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/docs/src/renderer/word-count.ts).
  - Picture Watermark with custom washout and floating layout in Ribbon Design Tab.
- **Sheets**:
  - Format Cells Theme colors palette, pattern fill styles, and linear gradient fills in [FormatCellsDialog.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/FormatCellsDialog.tsx).
  - Contiguous current region table bounding box inference in [data-tools-actions.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/data-tools-actions.ts).
  - Typed CSV import auto-detecting numbers, booleans, currency, percentages, and dates.
- **Slides**:
  - Clickable PDF hyperlinks via positioned `<a>` overlays in [slides-main.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/main/slides-main.ts).
  - Prominent `#0969da` selection frame and handles for visibility on white slides in [SlideCanvas.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/slides/src/renderer/SlideCanvas.tsx).
- **PDF**:
  - Cursor-anchored zooming keeping the mouse point stationary in [App.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/pdf/src/renderer/App.tsx).
  - Heading-derived outline fallback for un-bookmarked PDFs.
  - 800% maximum zoom.
- **Markdown**:
  - Linear-time file opening in [docText.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/markdown/src/renderer/markdown/docText.ts).
  - Ribbon spellcheck toggle with live editor DOM attribute synchronization.
  - Resizable outline panel with drag handle in [OutlinePanel.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/markdown/src/renderer/components/OutlinePanel.tsx).
  - `[[wiki links]]` round-trip preservation verified in `apps/markdown/tests/doc-text.test.ts`.

- **MCP over HTTP**:
  - `revelith mcp --http <port>` launches Streamable HTTP MCP server in [packages/revelith-cli/src/mcp-http.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/revelith-cli/src/mcp-http.ts).
  - Bearer `--token` authentication middleware.
  - `PUT /files/<name>` endpoint for multipart/binary file uploads, returning download URL.
  - Automatic download and local resolution for `http(s)://` URL parameters.
  - File-writing tools return download URLs `{"download_url": "http://..."}`.
  - Added MCP tools `pdf_read_text`, `docs_edit_text`, and `sheet_set_cells`.
  - Comprehensive test suite in `packages/revelith-cli/tests/mcp-http.test.ts` (14/14 passing).
- **Docs Lazy Media & Fidelity**:
  - Lazy media loading with `revelith-media://` protocol serving pictures on demand from disk instead of inflating heap memory.
  - 512 MB file size limit guard with polite alert modal, preventing memory crashes on massive files.
  - Accelerated large document loading and typing via chunked building.
  - Word-fidelity patches for tables, anchored pictures, text boxes, header/footer spacing, chart labels, EMF+ clipping, Japanese font substitution, italic, and bidi text.
- **Markdown Byte-Preserving Round-Trip & Wavedrom**:
  - Unchanged-source round-trip serialization in [docText.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/markdown/src/renderer/markdown/docText.ts): tracks block deltas and preserves unedited blocks byte-for-byte.
  - Interactive digital timing diagrams rendered for ````wavedrom` code fences in [CodeBlockView.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/markdown/src/renderer/editor/CodeBlockView.tsx).
- **Sheets Smooth Scrolling & Submenus**:
  - Smooth scrolling coordinated via `requestAnimationFrame` and CSS scroll-behavior in [ExcelShell.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/ExcelShell.tsx).
  - Non-blocking chunked large-range copy and duplicate operations in [ribbon-actions.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/ribbon-actions.ts).
  - Context menu submenu re-open reliability with state teardown in [submenu-fix.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/sheets/src/renderer/submenu-fix.ts).
- **Shell Docking & Update Check**:
  - Help → Check for Updates menu action in [apps/shell/src/main/index.ts](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/main/index.ts).
  - Configurable AI panel dock side (left/right) in [SettingsModal.tsx](file:///c:/Users/Ravin/Projects/ReveLith/apps/shell/src/renderer/src/SettingsModal.tsx).
  - Cleaned in-editor Files button while preserving Home page Folders panel.
- **AI Providers**:
  - DeepSeek V4.1 Flash (`deepseek-v4.1-flash`), GPT-6 Astra (`gpt-6-astra`), and Opper (`opper`) in [packages/ai-provider](file:///c:/Users/Ravin/Projects/ReveLith/packages/ai-provider).
  - Streaming and chat endpoints wired with full BYOK and settings configuration.
- **PPTX Engine & Parser**:
  - Chart categories honor Excel 1904 date system (`date1904="1"`) with 1462-day offset in [chart.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-engine/src/chart.ts).
  - Text extraction follows presentation slide order (`sldIdLst`) in [packages/file-parse/src/pptx.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/file-parse/src/pptx.ts).
  - Lenient XML parsing for single-quoted attributes and case-insensitive preset color mappings in [color.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-engine/src/color.ts) and [table-style.ts](file:///c:/Users/Ravin/Projects/ReveLith/packages/pptx-engine/src/table-style.ts).

---

## 5. Verification Commands

To independently verify the entire suite across all packages and applications:

```bash
# 1. Typecheck all 20 packages and apps across the monorepo (must exit 0)
npm run typecheck

# 2. Run unit & integration test suites
npm test

# 3. Verify CSS theme colors (zero raw color leaks)
npm run check:theme-colors
```
