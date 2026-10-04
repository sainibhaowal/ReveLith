# Architecture & Implementation Plan: ReveLith Tri-Signature Features

## Executive Summary

This document establishes the production-grade implementation architecture for ReveLith's three revolutionary native capabilities:

1. **Cursor for Docs & Sheets**: Real-time ambient inline ghost-text completion, `Tab` acceptance, `Ctrl+Right` word-by-word stepping, `Esc` dismiss, and formula completion.
2. **The Hebbia Matrix**: Multi-document / PDF / contract batch analysis into a structured interactive spreadsheet with clickable citations that deep-link to source passages.
3. **Grounded Source Notebook (NotebookLM for ReveLith)**: Dedicated per-document source tray capturing research files per document session, zero-hallucination grounded drafting, multi-style bibliographic citation formatting (APA 7th, Harvard, Chicago, MLA 9th, IEEE), footnote insertion, and full reference list generation.

---

## 1. What To Do & Why To Do It

### Feature 1: Cursor for Docs & Sheets (Ambient Inline Ghost Text)

- **What**: As the user pauses typing (~250-400ms debounce), an ultra-fast inline prediction request analyzes preceding document context. A subtle, semi-transparent ghost text overlay (`opacity: 0.42`, italic/accent) is rendered directly at the cursor in ProseMirror/Tiptap (Docs) and in the cell editor/formula bar (Sheets).
- **Interactions**:
  - `Tab`: Inserts full ghost text into the document.
  - `Ctrl + RightArrow` (or `Cmd + RightArrow` on macOS): Accepts next word of ghost text.
  - `Escape` or any keypress: Instantly dismisses ghost text without interruption.
- **Why**: Eliminates the 15-second "stop writing -> open sidebar -> type prompt -> copy-paste" friction, making AI an ambient co-writer.

### Feature 2: The Hebbia Matrix (PDF / Contract Multi-Doc Grid)

- **What**: A native capability accessible from the Home Shell and PDF/Sheets views. Users drop N documents (PDFs, DOCX, XLSX). The agent executes schema-guided parallel extraction across documents for designated or auto-inferred columns (e.g. _Party Name, Contract Value, Effective Date, Governing Law, Liability Cap_). It writes directly into a `.xlsx` workbook via `@revelith/xlsx-gateway` and opens in Sheets. Every cell contains metadata/hyperlink jumping directly into the source document at the exact bounding box / page coordinates.
- **Why**: High-stakes analysis in legal, finance, and procurement currently requires manual entry or expensive multi-seat SaaS ($10k+/yr). ReveLith bridges native PDF parsing and XLSX generation on-device.

### Feature 3: Grounded Source Notebook (Source Tray & Citation Engine)

- **What**: A dedicated collapsible panel in Docs ("Source Tray") tied strictly to the document session.
  - Stores uploaded research files (PDFs, DOCX, MD, web URLs).
  - Categorized with date/time, type badges, search filters, and sorting.
  - Lifecycle: strictly bound to the document's session ID (`docSessionId`) or project folder.
  - Agentic grounding: When writing or editing, the agent grounds facts strictly against indexed chunks from the Source Tray.
  - Citation engine: Automatically generates in-text citations (`(Smith, 2024)` or superscripts `[1]`) and complete bibliographies in **APA 7th, Harvard, Chicago, MLA 9th, and IEEE** formats.
- **Why**: Zero hallucinations for research, academic, and business proposal writing.

---

## 2. Existing Codebase Analysis (What We Already Have)

- **Docs Editor**: TipTap / ProseMirror v3 in `apps/docs/src/renderer/App.tsx` and `apps/docs/src/renderer/editor/`. Supports custom ProseMirror plugins, decorations (`Decoration.widget`), transactions, and marks.
- **Sheets Engine & App**: Univer spreadsheet in `apps/sheets/src/renderer/App.tsx`, paired with `@revelith/xlsx-gateway` for structural ops and formula shifts.
- **AI Infrastructure**: `@revelith/ai-provider` (streaming, models, local LM Studio/Ollama, OpenAI, Claude, Gemini), `@revelith/agent-core` (agent loops, tool execution, skills).
- **PDF Infrastructure**: `@revelith/file-parse`, pdfium.wasm, OCR helpers.
- **Shell**: `apps/shell/src/renderer/src/Home.tsx` (launcher, recent docs, file explorer).
- **UI Components**: `@revelith/ui` (Dropdown, design tokens in `tokens.css`, popovers, icons).

---

## 3. Architecture & Where To Do It

```
┌────────────────────────────────────────────────────────────────────────┐
│                              REVELITH                                  │
├────────────────────────────────┬───────────────────────────────────────┤
│          APPS/DOCS             │              APPS/SHEETS              │
│  ┌──────────────────────────┐  │  ┌──────────────────────────────────┐ │
│  │ Inline Ghost Plugin      │  │  │ Cell Formula Ghost Plugin        │ │
│  │ (ProseMirror Decoration) │  │  │ (Univer Editor Key Hook)         │ │
│  └──────────┬───────────────┘  │  └──────────────────────────────────┘ │
│             │                  │                                       │
│  ┌──────────▼───────────────┐  │  ┌──────────────────────────────────┐ │
│  │ Source Tray Panel        │  │  │ Matrix View / Citation Jump      │ │
│  │ (Session-isolated RAG,   │  │  │ (Deep-link to PDF viewer coords) │ │
│  │  APA/Harvard/MLA formats)│  │  └──────────────────────────────────┘ │
│  └──────────────────────────┘  │                                       │
├────────────────────────────────┴───────────────────────────────────────┤
│                          PACKAGES / ENGINES                            │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ @revelith/agent-core    │  │ @revelith/ai-provider               │  │
│  │ - CitationFormatter     │  │ - Fast inline completion endpoint   │  │
│  │ - MatrixExtractorAgent  │  │ - LM Studio / Ollama / Cloud models │  │
│  │ - SessionSourceStore    │  │                                     │  │
│  └─────────────────────────┘  └─────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Component & Implementation Specifications

### Feature 1: Cursor for Docs (Inline Ghost Completion)

1. **ProseMirror Plugin**: `apps/docs/src/renderer/editor/ghost-completion.ts`
   - Listens to doc changes and cursor movements.
   - Debounces (300ms) on text entry.
   - Obtains preceding 1500 chars and trailing 300 chars of document text.
   - Calls fast stream or one-shot completion via IPC `ai:inline-complete`.
   - Renders `Decoration.widget` with `.revelith-ghost-text` at the caret position.
   - Keymaps:
     - `Tab`: Intercepts event if ghost text is present; calls `tr.insertText(ghostText, pos)`; clears ghost.
     - `Ctrl+ArrowRight` / `Cmd+ArrowRight`: Takes the first word of ghost text, inserts it, keeps remaining ghost text.
     - `Escape` / `Backspace` / normal typing: Cancels pending request and clears widget.
2. **IPC Handler**: `apps/docs/src/main/docs-main.ts` -> `ai:inline-complete` using the active low-latency model with temperature 0.2 and max_tokens 48.
3. **CSS**: `apps/docs/src/renderer/editor/ghost-completion.css` matching design tokens.

### Feature 2: The Hebbia Matrix

1. **Core Package**: `packages/agent-core/src/matrix/`
   - `matrix-schema.ts`: Defines `MatrixProject`, `MatrixRow`, `MatrixColumn`, `MatrixCell` (value, confidence, citation snippet, sourceFile, page, bbox).
   - `matrix-extractor.ts`: Orchestrates parallel batch document processing. For each document, extracts text/page layout via `@revelith/file-parse`, sends prompt with schema to active provider, parses structured JSON response.
   - `matrix-to-xlsx.ts`: Uses `@revelith/xlsx-gateway` to create an `.xlsx` workbook containing:
     - Formatted table headers and rows.
     - Cell comments and hyperlinked citations pointing to `revelith-source://<file>?page=<n>&highlight=<text>`.
2. **UI Integration**:
   - `apps/shell/src/renderer/src/MatrixModal.tsx`: Accessible from Home ("New Matrix Project") or Drag-and-Drop multiple files.
   - `apps/sheets/src/renderer/MatrixCitationOverlay.tsx`: When viewing a matrix sheet in Sheets, clicking a citation opens the PDF in split-view directly scrolled to the citation.

### Feature 3: Grounded Source Notebook (Source Tray & Citation Engine)

1. **Citation & Bibliography Formatter**: `packages/agent-core/src/citations/`
   - `types.ts`: `SourceItem` (id, title, authors, year, publication, url, doi, pages, type, docSessionId, createdAt, fullText, chunks).
   - `citation-engine.ts`: Full formatting for:
     - **APA 7th**: In-text `(Author, Year)` / Reference list.
     - **Harvard**: In-text `(Author, Year)` / Reference list with publication details.
     - **Chicago (Author-Date & Notes)**: Footnote style or `(Author Year, p. X)`.
     - **MLA 9th**: In-text `(Author Page)` / Works Cited.
     - **IEEE**: In-text numbered brackets `[1]` / Numbered references.
2. **Session-Bound Storage**: `apps/docs/src/renderer/sources/`
   - `source-session.ts`: Manages source files attached to the current document. If the document is saved, sources persist in `.revelith-sources/<docId>.json`; if closed/deleted, session sources are cleaned up.
3. **UI Source Tray**: `apps/docs/src/renderer/components/SourceTray.tsx`
   - Collapsible dock in Docs (right or left tray).
   - Header with Date/Time filter, Category dropdown, Search input, and Sort by (Date, Name, Author).
   - List of source cards with format preview badges.
   - Quick actions: "Cite in APA", "Cite in Harvard", "Copy Reference", "Insert Footnote", "Generate Bibliography".
   - "Grounded Write" toggle: forces all subsequent AI suggestions and drafts to only use facts present in the Source Tray.

---

## 5. Production-Safe Verification & Safety Guards

1. **Zero Impact on Existing Document Engine**:
   - Ghost completion is purely a ProseMirror decoration; it never touches doc state unless accepted with `Tab`.
   - Source tray lives as a non-destructive side-dock alongside the document editor.
   - Matrix project outputs standard `.xlsx` files compatible with Excel and Univer.
2. **Local & Cloud Safe**:
   - All components work seamlessly with local offline models (LM Studio, Ollama) and cloud providers (OpenAI, Anthropic, Gemini, DeepSeek).
3. **Quality Gates**:
   - Unit tests for Citation Engine (verifying exact punctuation for APA, Harvard, MLA, Chicago, IEEE).
   - Unit tests for Ghost Completion tokenizer and keyhandler.
   - Full monorepo typecheck (`npm run typecheck`) across all 26 packages.
   - Production bundle validation.
