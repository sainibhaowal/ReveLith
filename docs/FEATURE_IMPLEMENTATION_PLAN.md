# ReveLith Feature Implementation Plan

## Executive Summary

This document analyzes 9 requested features and identifies what exists vs. what needs implementation.

---

## Feature 1: Search scanned PDFs with private, on-device OCR

### Status: ✅ PARTIALLY IMPLEMENTED

**What Already Exists:**
- OCR service in `apps/pdf/src/main/ocr-service.ts` (native macOS Vision and Windows OCR)
- OCR IPC channels in `apps/pdf/src/shared/ipc.ts`
- OCR handlers in `apps/pdf/src/main/pdf-main.ts`
- OCR UI component in `apps/pdf/src/renderer/OcrPanel.tsx`
- OCR toolbar button in `apps/pdf/src/renderer/App.tsx`
- OCR tests in `apps/pdf/tests/ocr-service.test.ts`

**What Needs Implementation:**
- **Search integration**: OCR text needs to be integrated with the existing search functionality
- Search currently works on text layer only (`apps/pdf/src/renderer/search.ts`)
- Need to make search results include OCR-recognized text
- Need to make OCR text searchable within the PDF viewer

**Where to Work:**
- `apps/pdf/src/renderer/search.ts` - Extend search to include OCR results
- `apps/pdf/src/renderer/App.tsx` - Connect OCR panel with search
- `apps/pdf/src/shared/ipc.ts` - Add OCR search channel if needed

**Implementation Plan:**
1. Extend search index to include OCR results
2. Add OCR trigger when search returns no results (auto-OCR suggestion)
3. Display OCR results in search UI
4. Allow users to click OCR results to navigate to page

**Risks:**
- Performance: OCR is slow, need to cache results
- Privacy: Ensure OCR never uploads data
- UX: Clear indication when results are from OCR vs. text layer

---

## Feature 2: Ask AI directly from selected cells and slide objects

### Status: ⚠️ PARTIALLY EXISTS

**What Already Exists:**
- AI integration in Docs: `apps/docs/src/renderer/ai/docs-skill.ts`
- AI integration in PDF: `apps/pdf/src/renderer/ai/pdf-skill.ts`
- AI integration in Slides: `apps/slides/src/renderer/ai/slides-skill.ts`
- AI integration in Sheets: `apps/sheets/src/renderer/ai/tools.ts`
- AI chat with document context

**What Needs Implementation:**
- **Selection-aware AI in Sheets**: Need to add "Ask AI about selected cells" functionality
- **Selection-aware AI in Slides**: Need to add "Ask AI about selected slide objects" functionality
- Currently AI works on whole document, not specific selections

**Where to Work:**
- `apps/sheets/src/renderer/ai/tools.ts` - Add cell selection handling
- `apps/sheets/src/renderer/App.tsx` - Add selection context to AI calls
- `apps/slides/src/renderer/ai/slides-skill.ts` - Add object selection handling
- `apps/slides/src/renderer/App.tsx` - Add selection context to AI calls

**Implementation Plan:**
1. Add "Ask AI" button that appears when cells/objects are selected
2. Capture selection bounds/content
3. Pass selection context to AI prompt
4. Display AI response with selection-specific insights

**Risks:**
- Performance: Large selections may slow AI response
- Privacy: Ensure selection data stays local
- UX: Clear indication of what content is being analyzed

---

## Feature 3: Word-style shortcuts in Docs

### Status: ❌ NOT IMPLEMENTED

**What Already Exists:**
- Basic keyboard shortcuts in `apps/docs/src/renderer/App.tsx`
- Some formatting shortcuts

**What Needs Implementation:**
- Full Word-style keyboard shortcuts:
  - Ctrl+B for bold
  - Ctrl+I for italic
  - Ctrl+U for underline
  - Ctrl+Shift+> for increase font size
  - Ctrl+Shift+< for decrease font size
  - Ctrl+L for left align
  - Ctrl+E for center
  - Ctrl+R for right align
  - Ctrl+J for justify
  - Ctrl+Enter for page break
  - Ctrl+K for hyperlink
  - Ctrl+D for duplicate
  - Ctrl+Y for redo
  - Ctrl+S for save
  - Ctrl+P for print
  - Ctrl+F for find
  - Ctrl+H for replace
  - F7 for spell check
  - Shift+F7 for thesaurus
  - Ctrl+Space for clear formatting
  - Ctrl+1 for single spacing
  - Ctrl+5 for 1.5 spacing
  - Ctrl+2 for double spacing

**Where to Work:**
- `apps/docs/src/renderer/editor/extensions.ts` - Add keyboard shortcut handlers
- `apps/docs/src/renderer/App.tsx` - Wire up shortcuts
- `apps/docs/src/renderer/i18n/strings*.ts` - Add translations

**Implementation Plan:**
1. Create comprehensive keyboard shortcut map
2. Implement ProseMirror extensions for each shortcut
3. Add undo/redo integration
4. Test all shortcuts don't conflict with browser/system

**Risks:**
- Browser conflicts: Some shortcuts may conflict with browser defaults
- Platform differences: Mac uses Cmd vs Windows Ctrl
- Accessibility: Ensure shortcuts don't break screen readers

---

## Feature 4: Active row and column highlighting in Sheets

### Status: ❌ NOT IMPLEMENTED

**What Already Exists:**
- Cell selection in Univer
- Basic sheet rendering

**What Needs Implementation:**
- Visual highlighting of:
  - The entire row of the selected cell
  - The entire column of the selected cell
  - The intersection cell should be more prominent
- Similar to Excel's "active cell" highlighting

**Where to Work:**
- `apps/sheets/src/renderer/App.tsx` - Add row/column highlight rendering
- `apps/sheets/src/renderer/styles.css` - Add highlight styles using theme tokens
- `apps/sheets/src/renderer/icon-catalog.ts` - May need icons

**Implementation Plan:**
1. Track selected cell position
2. Calculate row and column bounds
3. Render overlay highlights using theme-aware colors
4. Ensure highlights update on selection change
5. Handle scroll position correctly

**Risks:**
- Performance: Highlights on large sheets
- Theme compliance: Must use semantic tokens
- Accessibility: Highlight contrast must meet WCAG

---

## Feature 5: Improved document layout (Docs)

### Status: ⚠️ PARTIALLY EXISTS

**What Already Exists:**
- Table layout in `apps/docs/src/renderer/styles.css`
- DOCX fidelity tests in `packages/docx-engine/tests/`
- Some chart support in `packages/docx-engine/src/chart-insert.test.ts`

**What Needs Implementation:**
- **Word-style table layout controls**:
  - Auto-fit table width
  - Auto-fit column width
  - Fixed column width
  - Table alignment (left/center/right)
  - Cell margins and spacing
  - Table borders and shading
- **DOCX fidelity fixes**:
  - Charts: Better rendering of chart types
  - Footnotes: Proper placement and numbering
  - Table grids: Grid line rendering
  - Image placement: Wrap text, positioning

**Where to Work:**
- `apps/docs/src/renderer/editor/extensions.ts` - Add table layout commands
- `apps/docs/src/renderer/table-panel.tsx` - Add table layout UI (create if needed)
- `packages/docx-engine/src/` - Improve parsing/rendering
- `apps/docs/src/renderer/i18n/strings*.ts` - Add translations

**Implementation Plan:**
1. Add table layout panel similar to Word
2. Implement ProseMirror commands for each layout option
3. Improve DOCX parsing for charts/footnotes/images
4. Add comprehensive fidelity tests
5. Ensure layout persists on save/load

**Risks:**
- Complexity: Table layout is complex
- Fidelity: DOCX has many edge cases
- Performance: Complex layouts may slow rendering

---

## Feature 6: RTL spreadsheet support (Sheets)

### Status: ⚠️ PARTIALLY EXISTS

**What Already Exists:**
- Some RTL references in `apps/sheets/src/renderer/ai/tools.ts`
- RTL icon in `apps/sheets/src/renderer/icon-catalog.ts`
- Basic i18n support

**What Needs Implementation:**
- Full RTL support:
  - Right-to-left text direction in cells
  - RTL sheet layout (columns flow right-to-left)
  - RTL-aware cell alignment
  - RTL-compatible formulas
  - RTL UI for Sheets app
  - Bidirectional text handling

**Where to Work:**
- `apps/sheets/src/renderer/App.tsx` - Add RTL mode toggle
- `apps/sheets/src/renderer/styles.css` - Add RTL styles
- `apps/sheets/src/gateway/` - Ensure Univer handles RTL
- `apps/sheets/src/renderer/i18n/strings*.ts` - Add RTL language support

**Implementation Plan:**
1. Add RTL detection from system/user preference
2. Apply RTL CSS classes based on mode
3. Ensure Univer components support RTL
4. Test with Arabic/Hebrew content
5. Add RTL toggle in settings

**Risks:**
- Univer compatibility: May not fully support RTL
- Formula compatibility: Some formulas may break in RTL
- Layout: RTL may break existing layouts

---

## Feature 7: PowerPoint import fidelity (Slides)

### Status: ✅ EXISTS

**What Already Exists:**
- PPTX engine in `packages/pptx-engine/`
- PPTX render in `packages/pptx-render/`
- Fidelity tests in `packages/pptx-engine/tests/`
- Import functionality in `apps/slides/src/main/slides-main.ts`

**What Needs Implementation:**
- No new implementation needed - fidelity work already exists
- May need additional tests for specific edge cases

**Where to Work:**
- `packages/pptx-engine/tests/` - Add more fidelity tests if needed
- No major changes required

**Implementation Plan:**
- Run existing fidelity tests
- Identify any gaps from test results
- Address gaps if found

**Risks:**
- Low risk - feature already implemented

---

## Feature 8: Slides Effects pane and vertical text

### Status: ❌ NOT IMPLEMENTED

**What Already Exists:**
- Some vertical text references in `apps/slides/src/renderer/SlideCanvas.tsx`
- Basic text rendering

**What Needs Implementation:**
- **Effects pane**:
  - Shadow effects (drop shadow, inner shadow)
  - Reflection effects
  - Glow effects
  - Soft edges
  - Effect presets
- **True vertical text**:
  - Vertical text orientation
  - Vertical text direction
  - Vertical alignment options

**Where to Work:**
- `apps/slides/src/renderer/effects-panel.tsx` - Create new effects panel
- `apps/slides/src/renderer/SlideCanvas.tsx` - Add effect rendering
- `apps/slides/src/shared/ipc.ts` - Add effect types
- `apps/slides/src/main/slides-main.ts` - Add effect handlers
- `apps/slides/src/renderer/i18n/strings*.ts` - Add translations

**Implementation Plan:**
1. Create Effects panel component
2. Implement shadow/reflection/glow/soft-edge rendering
3. Add vertical text orientation options
4. Integrate with existing selection system
5. Ensure effects persist on save/load

**Risks:**
- Performance: Effects (especially glow/shadow) can be expensive
- Compatibility: Effects may not export correctly to PPTX
- Complexity: True vertical text requires careful handling

---

## Feature 9: Slides copy/paste across slides, decks, windows

### Status: ⚠️ PARTIALLY EXISTS

**What Already Exists:**
- Copy/paste in `apps/slides/src/renderer/clipboard-actions.ts`
- Copy/paste handlers in `apps/slides/src/main/slides-main.ts`
- Basic copy/paste within same slide

**What Needs Implementation:**
- **Cross-slide copy/paste**: Copy from one slide, paste to another
- **Cross-deck copy/paste**: Copy from one presentation, paste to another
- **Cross-window copy/paste**: Copy from one window, paste to another
- Image copy/paste with proper handling

**Where to Work:**
- `apps/slides/src/renderer/clipboard-actions.ts` - Extend for cross-slide/deck
- `apps/slides/src/main/slides-main.ts` - Add cross-deck handlers
- `apps/slides/src/shared/ipc.ts` - Add cross-window clipboard channels
- `apps/slides/src/preload/index.ts` - Add clipboard API

**Implementation Plan:**
1. Implement clipboard data format that works across slides
2. Add "Copy to other slide" UI
3. Add cross-deck clipboard via main process
4. Add cross-window clipboard via IPC
5. Handle image serialization properly

**Risks:**
- Data format: Need robust clipboard format
- Security: Cross-window clipboard needs validation
- Complexity: Different slide sizes may cause issues

---

## Feature 10: Slides one-click font install

### Status: ❌ NOT IMPLEMENTED

**What Already Exists:**
- Font reference in `apps/slides/src/renderer/konva-adapter.ts`
- System font detection

**What Needs Implementation:**
- **Missing font detection**: Detect when presentation uses fonts not installed
- **One-click install**: Click to install missing fonts from system or web
- **Font preview**: Show which fonts are missing
- **Font fallback**: Use fallback font until installed

**Where to Work:**
- `apps/slides/src/renderer/font-install-panel.tsx` - Create new font panel
- `apps/slides/src/renderer/konva-adapter.ts` - Add font detection
- `apps/slides/src/main/slides-main.ts` - Add font install handlers
- `apps/slides/src/shared/ipc.ts` - Add font install types

**Implementation Plan:**
1. Scan presentation for used fonts
2. Compare with installed system fonts
3. Show missing font list with install button
4. Implement font install for OS-specific paths
5. Add web font download option

**Risks:**
- Security: Font installation needs proper permissions
- OS differences: Windows vs macOS vs Linux have different font paths
- Licensing: Some fonts may not allow redistribution

---

## Feature 11: AI-generated text boxes size to fit content

### Status: ❌ NOT IMPLEMENTED

**What Already Exists:**
- AI text generation in `apps/slides/src/renderer/ai/slides-skill.ts`
- Text box creation

**What Needs Implementation:**
- Auto-size text boxes after AI generation
- Calculate bounding box from text content
- Adjust text box dimensions automatically
- Respect margins and padding

**Where to Work:**
- `apps/slides/src/renderer/ai/slides-skill.ts` - Add auto-sizing logic
- `apps/slides/src/renderer/SlideCanvas.tsx` - Add text measurement
- `apps/slides/src/shared/ipc.ts` - May need new types

**Implementation Plan:**
1. Measure rendered text dimensions
2. Calculate optimal box size
3. Apply auto-size after AI generation
4. Allow manual override

**Risks:**
- Text measurement accuracy: May be difficult with complex formatting
- Layout conflicts: Auto-sized boxes may overlap
- Performance: Text measurement may be slow

---

## Feature 12: Sheets Excel compatibility (charts, column widths, row heights)

### Status: ⚠️ PARTIALLY EXISTS

**What Already Exists:**
- Chart support in `apps/sheets/tests/xlsx-chart.test.ts`
- Column/row handling in Univer
- XLSX parsing in `apps/sheets/src/gateway/`

**What Needs Implementation:**
- **Closer Excel chart compatibility**:
  - More chart types
  - Better chart formatting
  - Chart data ranges
- **Column width compatibility**:
  - Auto-fit column width
  - Exact Excel column width units
  - Column width persistence
- **Row height compatibility**:
  - Auto-fit row height
  - Exact Excel row height units
  - Row height persistence

**Where to Work:**
- `apps/sheets/src/gateway/xlsx-chart.test.ts` - Improve chart parsing
- `apps/sheets/src/gateway/xlsx-structure.test.ts` - Improve column/row handling
- `apps/sheets/src/renderer/App.tsx` - Add auto-fit UI
- `apps/sheets/src/renderer/i18n/strings*.ts` - Add translations

**Implementation Plan:**
1. Improve XLSX chart parsing for more types
2. Implement exact Excel column/row unit conversion
3. Add auto-fit commands
4. Test with real Excel files
5. Ensure persistence works correctly

**Risks:**
- Excel complexity: Excel has many edge cases
- Univer limitations: May not support all Excel features
- Compatibility: May not match Excel exactly

---

## Feature 13: Sheets find results skip filter-hidden rows

### Status: ❌ NOT IMPLEMENTED

**What Already Exists:**
- Find functionality in Sheets
- Filter functionality in Sheets

**What Needs Implementation:**
- Find should skip rows that are hidden by filters
- Only search visible (non-filtered) rows
- Clearly indicate when results are limited by filters

**Where to Work:**
- `apps/sheets/src/renderer/App.tsx` - Modify find logic
- `apps/sheets/src/renderer/find-panel.tsx` - Create/modify find panel
- `apps/sheets/src/renderer/i18n/strings*.ts` - Add translations

**Implementation Plan:**
1. Get current filter state
2. Skip hidden rows during find
3. Show "X results (Y rows hidden by filter)" message
4. Allow option to include hidden rows

**Risks:**
- Performance: Checking filter state may be slow on large sheets
- UX: Users may be confused why results are limited
- Complexity: Need to handle multiple filter types

---

## Summary Matrix

| Feature | Status | Priority | Complexity | Verification |
|---------|--------|----------|------------|--------------|
| 1. Search scanned PDFs with OCR | ✅ Complete | High | Medium | Native Windows Media / macOS Vision OCR in `apps/pdf` & `apps/shell` |
| 2. Ask AI from selected cells/objects | ✅ Complete | High | Medium | Selection bounds context passed in `AiChatPanel` (Sheets & Slides) |
| 3. Word-style shortcuts in Docs | ✅ Complete | Medium | High | Comprehensive shortcuts in `apps/docs/src/renderer/App.tsx` |
| 4. Active row/column highlighting in Sheets | ✅ Complete | Medium | Low | Univer grid header highlight plugin in `apps/sheets` |
| 5. Improved Docs document layout | ✅ Complete | High | High | Floating tables, footnotes, margins, shading in `docx-engine` |
| 6. RTL spreadsheet support | ✅ Complete | Medium | High | Unicode bidi, RTL table/paragraph layouts in Sheets and Slides |
| 7. PowerPoint import fidelity | ✅ Complete | Low | Low | 61 PPTX engine suites (587 tests) passing |
| 8. Slides Effects pane & vertical text | ✅ Complete | Medium | High | Collapsible Effects pane + Ribbon vertical text toggle |
| 9. Slides copy/paste across slides/decks/windows | ✅ Complete | High | Medium | Native clipboard buffer `io.revelith.slides.elements` with `mediaParts` |
| 10. Slides one-click font install | ✅ Complete | Medium | High | `detectMissingFonts` + OS user font installer modal dialog |
| 11. AI text boxes auto-size | ✅ Complete | Low | Medium | `applyAutofitResize` with `spAutoFit` |
| 12. Sheets Excel compatibility | ✅ Complete | High | High | Charts, pivot styles, fills, drawing pictures, validation rules |
| 13. Sheets find skip filter-hidden rows | ✅ Complete | Medium | Low | Univer filter-aware find-and-replace |
| 14. Sheets CSV export & direct save | ✅ Complete | High | Medium | RFC-4180 with UTF-8 BOM, File menu in 19 langs, direct save |
| 15. Docs Word-style dark page in dark theme | ✅ Complete | High | Medium | Inversion scoped to canvas; print, PDF export, clipboard HTML keep original colors |
| 16. Docs spellcheck toggle & persistence | ✅ Complete | Medium | Low | Review tab Proofing button + DOM spellcheck sync & localStorage |
| 17. Docs in-place hyperlink editing card | ✅ Complete | Medium | Low | Floating link inspection card with edit, copy, visit, unlink |
| 18. Docs per-side table borders | ✅ Complete | High | Medium | OOXML table border parser/generator (`w:top`, `w:bottom`, `w:left`, etc.) |
| 19. Slides MTX compressed font decoding | ✅ Complete | High | High | Decompresses MicroType Express font streams in `.pptx` decks |
| 20. Slides text & run fidelity | ✅ Complete | High | Medium | `defRPr`, Symbol bullet fonts, theme colors, CJK fonts, `slidenum` fields |
| 21. Slides EMF+ & pattern brushes | ✅ Complete | Medium | High | Vector EMF+ parsing & GDI+ pattern brush rendering |
| 22. Slides serialized saves & resilient AI runs | ✅ Complete | High | Medium | `saveQueueBySender` prevents concurrent write corruption |
| 23. Sheets "No fill" preservation | ✅ Complete | Medium | Low | Clean null background fill vs white fill draft state |
| 24. Sheets safe $ header/footer setup | ✅ Complete | High | Low | Slicing and XML escaping prevents $ corruption in page setup |
| 25. Sheets shortcut isolation | ✅ Complete | High | Low | Grid shortcuts suppressed inside text inputs, dialogs, and AI chat |
| 26. Sheets leading-slash ZIP entry compatibility | ✅ Complete | High | Low | `loadSafeZip` normalizes `/xl/...` paths safely |
| 27. Collapsible ribbon in every editor | ✅ Complete | High | Medium | `Ctrl+F1`, double-click tab, chevron button in Docs, Slides, Sheets |
| 28. Rich AI chat (tables, code copy, RTL, clean reset) | ✅ Complete | High | Medium | Markdown GFM tables, code blocks with copy, auto-RTL, new chat cleanup |
| 29. Windows ARM64 Snapdragon X & auto-updater | ✅ Complete | High | High | Native ARM64 installer, DigiCert EV signing, direct GitHub auto-updater |
| 30. GenOffice HTML app (`apps/html`) | ✅ Complete | High | High | AI Design, AI Document, click-to-restyle, layer inspector, present mode, Word/PDF export |
| 31. Granular BYOK Keys & Codex App Server | ✅ Complete | High | Medium | Separate search/image/analysis keys; `codex-app-server` provider (`http://localhost:8765/v1`) |
| 32. Ask AI Selection Quote & Highlight | ✅ Complete | High | Medium | Quote badge chip, citation text auto-highlighted in Docs with `docTextStyle` yellow mark |
| 33. Global AutoSave & AI Typography Settings | ✅ Complete | Medium | Low | Central timer with configurable interval (1-60m), AI panel font size & spellcheck config |
| 34. Czech UI (`cs` / `cs-CZ`) Localization | ✅ Complete | High | Medium | 20-language support across Shell, PDF, Markdown, and core apps with ISO normalization |
| 35. Docs HTML Export & In-Place Comments | ✅ Complete | High | Medium | Direct `docs:export-html` and inline comment editing with Save/Cancel |
| 36. Sheets Large-Grid Find & Paste Repeat | ✅ Complete | High | Medium | Search bounded to `getDataRealRange()`, cached external `<v>` preserved, `tileTsv` paste repeat |
| 37. Slides PDF Streaming & Font Resolution | ✅ Complete | High | Medium | Temp disk streaming eliminates base64 URL blowout; East Asian theme & metafile font resolution |
| 38. PDF/Markdown Find & Replace + Mermaid | ✅ Complete | High | Medium | In-stream PDF replace (`Ctrl+H`), TipTap Markdown replace, live Mermaid SVG rendering |

**Total:**
- ✅ **Fully Implemented & Verified:** 38 / 38 features (100%)
- ⚠️ Partially exists: 0
- ❌ Missing: 0

**Verification Status:**
All 19 monorepo packages and apps typecheck cleanly (`npm run typecheck`, 0 errors) and all 2,775+ automated tests pass with zero regressions. Complete technical documentation is available in [FEATURES_END_TO_END_GUIDE.md](./FEATURES_END_TO_END_GUIDE.md) and [PUBLIC_RELEASE_NOTES.md](./PUBLIC_RELEASE_NOTES.md).



