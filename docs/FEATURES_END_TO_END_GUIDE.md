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

## 5. Verification Commands

To independently verify the entire suite:

```bash
# 1. Typecheck all packages
npx tsc --noEmit -p packages/pptx-engine
npx tsc --noEmit -p packages/pptx-render
npm run --prefix apps/slides typecheck
npm run --prefix apps/sheets typecheck

# 2. Run unit & integration test suites
npx vitest run --dir packages/pptx-engine
npx vitest run --dir packages/pptx-render
npx vitest run --dir apps/slides
npx vitest run --dir apps/sheets
```
