# TRI-Signature Features: End-to-End Implementation Plan

## Overview

Implement 3 revolutionary AI-native features with full production-grade quality:

1. **Cursor for Docs** — Inline ghost-text autocomplete (Tab to accept, Ctrl+Right word-by-word, Esc dismiss)
2. **Hebbia Matrix** — PDF → Live Sheet with clickable citations (drop PDFs, extract to structured grid, click cell → jump to PDF)
3. **Grounded Source Notebook** — Source Tray with session-bound storage, citation engine (APA/Harvard/Chicago/MLA/IEEE), auto-footnotes, bibliography generation

---

## Phase 1: Cursor for Docs (Ghost Completion) — AI Wiring + Tests

### 1.1 What to do

Wire the existing `GhostCompletionExtension` to the AI provider via IPC so ghost text actually appears.

### 1.2 Why

Currently the ProseMirror plugin exists but `requestGhostCompletion()` is never called. Users see nothing.

### 1.3 What already exists

- `apps/docs/src/renderer/editor/ghost-completion.ts` — Plugin with keymaps, debounce, widget
- `apps/docs/src/renderer/editor/ghost-completion.css` — Styled with design tokens
- `apps/docs/src/renderer/editor/extensions.ts` — Extension registered

### 1.4 What needs work

| File                                                | Change                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/docs/src/renderer/editor/ghost-completion.ts` | Export `fetchCompletion` that calls IPC `ai:inline-complete`       |
| `apps/docs/src/main/docs-main.ts`                   | Add IPC handler `ai:inline-complete` using `@revelith/ai-provider` |
| `apps/docs/src/renderer/App.tsx`                    | Call `requestGhostCompletion` on editor mount/selection change     |
| `apps/docs/src/renderer/ai/protocol.ts`             | Add `inlineComplete` message type if needed                        |
| `apps/docs/tests/ghost-completion.test.ts`          | NEW: Unit tests for plugin behavior                                |

### 1.5 Where to do it

- Frontend: `apps/docs/src/renderer/editor/ghost-completion.ts`, `App.tsx`
- Main: `apps/docs/src/main/docs-main.ts`
- Tests: `apps/docs/tests/ghost-completion.test.ts`

### 1.6 Implementation steps

1. Add `fetchCompletion` function in ghost-completion.ts that sends IPC to main
2. Add IPC handler in docs-main.ts using ai-provider's fast model (low latency)
3. Hook into App.tsx editor lifecycle to trigger on cursor idle
4. Add CSS already matches theme — verify
5. Write tests for: debounce, Tab accept, Ctrl+Right word accept, Esc dismiss, cursor move clears

### 1.7 Safety

- Ghost text is decoration only — never mutates doc unless accepted
- IPC uses existing ai-provider infrastructure
- No auth/tenant changes

---

## Phase 2: Hebbia Matrix — Full UI + Real XLSX + Deep Links

### 2.1 What to do

Build complete Matrix workflow: Shell entry → file drop → parallel extraction → real .xlsx with hyperlinks → Sheets opens with citation overlay.

### 2.2 Why

Currently: extraction engine exists, but outputs CSV, no UI, no hyperlinks, no deep-link to PDF.

### 2.3 What already exists

- `packages/agent-core/src/matrix/matrix-extractor.ts` — Prompt building, JSON parsing
- `packages/agent-core/src/matrix/types.ts` — MatrixProject, MatrixRow, MatrixColumn, MatrixCell
- Tests: 3 pass

### 2.4 What needs work

| File                                                 | Change                                                                                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/agent-core/src/matrix/matrix-to-xlsx.ts`   | REWRITE: Use `@revelith/xlsx-gateway` to create real `.xlsx` with: formatted headers, frozen row, auto-filter, cell comments with citations, `revelith-source://` hyperlinks |
| `apps/shell/src/renderer/src/MatrixModal.tsx`        | NEW: Drag-drop zone, column config, "Generate Matrix" button, progress, open result in Sheets                                                                                |
| `apps/shell/src/renderer/src/Home.tsx`               | Add "New Matrix Project" button                                                                                                                                              |
| `apps/sheets/src/renderer/MatrixCitationOverlay.tsx` | NEW: Click cell with `revelith-source://` link → open PDF viewer split-screen at page/bbox                                                                                   |
| `apps/sheets/src/renderer/App.tsx`                   | Register citation overlay, handle `revelith-source://` protocol                                                                                                              |
| `apps/pdf/src/main/pdf-main.ts`                      | Handle `revelith-source://` → open PDF at page, highlight snippet                                                                                                            |
| `apps/sheets/src/main/sheets-main.ts`                | Handle `revelith-source://` IPC from Sheets to PDF                                                                                                                           |

### 2.5 Where to do it

- Core: `packages/agent-core/src/matrix/matrix-to-xlsx.ts`
- Shell: `apps/shell/src/renderer/src/MatrixModal.tsx`, `Home.tsx`
- Sheets: `apps/sheets/src/renderer/MatrixCitationOverlay.tsx`, `App.tsx`
- PDF: `apps/pdf/src/main/pdf-main.ts`
- IPC: `apps/sheets/src/main/sheets-main.ts`

### 2.6 Implementation steps

1. Rewrite `matrix-to-xlsx.ts` to use `writeWorkbook` from `@revelith/xlsx-gateway` with cell hyperlinks and comments
2. Build `MatrixModal.tsx` with drag-drop, column editor, progress UI
3. Add "New Matrix Project" to Home shell
4. Build `MatrixCitationOverlay` — detect `revelith-source://` clicks, send IPC
5. Add PDF main handler for `revelith-source://` protocol
6. Wire Sheets main to forward citation clicks to PDF
7. Test: drop 3 PDFs → matrix generates → click cell → PDF opens at page

### 2.7 Safety

- Uses existing xlsx-gateway (no new file format)
- IPC protocols follow existing patterns
- No auth changes

---

## Phase 3: Grounded Source Notebook — Source Tray + Citation Engine + Session Storage

### 3.1 What to do

Build Source Tray sidebar in Docs with session-bound storage, auto-citation injection, bibliography generation.

### 3.2 Why

Citation engine exists but no UI, no session storage, no integration with writing.

### 3.3 What already exists

- `packages/agent-core/src/citations/citation-engine.ts` — Full formatting for 5 styles
- `packages/agent-core/src/citations/types.ts` — SourceItem, FormattedCitation
- Tests: 7 pass

### 3.4 What needs work

| File                                               | Change                                                                                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/docs/src/renderer/sources/source-session.ts` | NEW: Session-bound storage (IndexedDB + file sync `.revelith-sources/<docId>.json`)                                                                                                                              |
| `apps/docs/src/renderer/sources/source-store.ts`   | NEW: React context + hooks for Source Tray state                                                                                                                                                                 |
| `apps/docs/src/renderer/components/SourceTray.tsx` | NEW: Collapsible sidebar with: filter bar (date, category, type, search, sort), source cards, quick actions (Cite in APA/Harvard/..., Copy Ref, Insert Footnote, Generate Bibliography), "Grounded Write" toggle |
| `apps/docs/src/renderer/App.tsx`                   | Integrate SourceTray, provide SourceStore context                                                                                                                                                                |
| `apps/docs/src/renderer/ai/docs-skill.ts`          | Add `grounded_write` tool that reads Source Tray, injects citations                                                                                                                                              |
| `apps/docs/src/main/docs-main.ts`                  | Handle source file import, session cleanup on doc delete                                                                                                                                                         |
| `apps/docs/tests/source-tray.test.ts`              | NEW: Tests for session storage, citation insertion, bibliography                                                                                                                                                 |

### 3.5 Where to do it

- Core: `packages/agent-core/src/citations/` (already done)
- Docs renderer: `apps/docs/src/renderer/sources/`, `SourceTray.tsx`, `App.tsx`
- Docs main: `apps/docs/src/main/docs-main.ts`
- AI: `apps/docs/src/renderer/ai/docs-skill.ts`
- Tests: `apps/docs/tests/source-tray.test.ts`

### 3.6 Implementation steps

1. Build `source-session.ts` — IndexedDB with docId key, auto-save on doc save, cleanup on delete
2. Build `source-store.ts` — React context with add/remove/update sources, filters, grounded-write toggle
3. Build `SourceTray.tsx` — Collapsible right sidebar with design token styling, virtualized list
4. Integrate in `App.tsx` — Show tray when doc has sources or grounded-write enabled
5. Add `grounded_write` skill — reads Source Tray chunks, generates text with `[1]` citations
6. Add bibliography generation — insert at cursor or end of doc
7. Handle file import — drag-drop to tray, extract text, chunk, store
8. Session cleanup — on doc delete, remove `.revelith-sources/<docId>.json`
9. Tests: session persist, citation format accuracy, bibliography generation

### 3.7 Safety

- Session storage isolated per document
- No cross-doc leakage
- File cleanup on delete
- Uses existing citation engine (no new formatting logic)

---

## Phase 4: Cross-Feature Integration + Polish

### 4.1 What to do

Ensure all three features work together seamlessly.

### 4.2 Integration points

| Integration                    | Implementation                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Ghost Completion + Source Tray | When Grounded Write enabled, ghost completion uses Source Tray chunks as context |
| Matrix + Source Tray           | Matrix extraction can use Source Tray sources as additional context              |
| Matrix + Ghost Completion      | In Sheets, formula ghost completion works inside Matrix-generated sheets         |
| Theme consistency              | All new components use `@revelith/ui` tokens, CSS variables                      |

### 4.3 Quality gates

- `npm run format` — All new files formatted
- `npm run lint` — No new errors
- `npm run typecheck` — Full monorepo passes
- `npm run test` — All new tests pass
- `npm run check:english-comments` — Passes
- `npm run licenses` — Passes

---

## Risk Assessment & Mitigation

| Risk                                 | Likelihood | Impact               | Mitigation                                                         |
| ------------------------------------ | ---------- | -------------------- | ------------------------------------------------------------------ |
| Ghost completion latency too high    | Medium     | Feature feels broken | Use local model (LM Studio/Ollama) for inline; cloud as fallback   |
| Matrix extraction hallucinates       | Medium     | Bad data in sheet    | Low temp (0.1), strict JSON schema, citation required for non-null |
| Source Tray IndexedDB quota exceeded | Low        | Data loss            | Warn at 80% quota, cleanup old sessions                            |
| Citation format edge cases           | Medium     | Wrong bibliography   | Comprehensive test matrix for each style                           |
| PDF deep-link fails                  | Low        | Citation broken      | Fallback: open PDF at page 1                                       |

---

## File Inventory (All New/Modified Files)

### New Files (~25)

```
apps/docs/src/renderer/editor/ghost-completion.ts          (modify: add fetchCompletion)
apps/docs/src/main/docs-main.ts                            (modify: IPC handler)
apps/docs/src/renderer/App.tsx                             (modify: wire ghost + SourceTray)
apps/docs/src/renderer/components/SourceTray.tsx           (NEW)
apps/docs/src/renderer/sources/source-session.ts           (NEW)
apps/docs/src/renderer/sources/source-store.ts             (NEW)
apps/docs/src/renderer/ai/docs-skill.ts                    (modify: grounded_write)
apps/docs/tests/ghost-completion.test.ts                   (NEW)
apps/docs/tests/source-tray.test.ts                        (NEW)

apps/shell/src/renderer/src/MatrixModal.tsx                (NEW)
apps/shell/src/renderer/src/Home.tsx                       (modify: Matrix button)

apps/sheets/src/renderer/MatrixCitationOverlay.tsx         (NEW)
apps/sheets/src/renderer/App.tsx                           (modify: citation overlay)
apps/sheets/src/main/sheets-main.ts                        (modify: IPC forward)

apps/pdf/src/main/pdf-main.ts                              (modify: revelith-source:// handler)

packages/agent-core/src/matrix/matrix-to-xlsx.ts           (REWRITE: xlsx-gateway)
packages/agent-core/src/matrix/matrix-extractor.ts         (modify: add Source Tray context)
packages/agent-core/src/citations/citation-engine.ts       (verify: already complete)
```

### Existing Files Modified (~15)

All modifications are additive — no breaking changes to existing APIs.

---

## Execution Order

1. **Phase 1** — Ghost Completion AI wiring + tests (2-3 hours)
2. **Phase 2** — Matrix XLSX rewrite + MatrixModal + CitationOverlay (4-5 hours)
3. **Phase 3** — Source Tray + Session Storage + Grounded Write (4-5 hours)
4. **Phase 4** — Cross-integration + polish + full test run (2-3 hours)

**Total: ~12-16 hours of focused implementation**

---

## Verification Checklist (Per Feature)

### Ghost Completion

- [ ] Type → pause 320ms → ghost text appears
- [ ] Tab → full accept
- [ ] Ctrl+Right → word accept (repeats)
- [ ] Esc → dismiss
- [ ] Keep typing → dismiss
- [ ] Cursor move → dismiss
- [ ] Formula `=...` in Sheets → ghost formula
- [ ] Tests pass

### Hebbia Matrix

- [ ] Home → "New Matrix Project" opens modal
- [ ] Drag 5 PDFs → shows file list
- [ ] Configure columns (or auto-infer) → "Generate"
- [ ] Progress shows → real `.xlsx` created
- [ ] Opens in Sheets with frozen header, auto-filter
- [ ] Click cell → PDF opens split-screen at page, highlights snippet
- [ ] Works with local models
- [ ] Tests pass

### Grounded Source Notebook

- [ ] Docs → Source Tray opens (right sidebar)
- [ ] Drag PDF/DOCX/MD/URL → source card appears with metadata
- [ ] Filter by date/category/type/search/sort works
- [ ] "Cite in APA" → inserts `(Author, Year)` at cursor
- [ ] "Insert Footnote" → inserts superscript `[1]` + footnote
- [ ] "Generate Bibliography" → inserts full reference list at end
- [ ] "Grounded Write" toggle → ghost completion uses only tray sources
- [ ] Save doc → sources persist in `.revelith-sources/<docId>.json`
- [ ] Delete doc → source file cleaned up
- [ ] Tests pass (all 5 citation styles verified)

---

## Start Signal

Ready to begin Phase 1 immediately. Will work safely, never break existing code, run tests at each step.
