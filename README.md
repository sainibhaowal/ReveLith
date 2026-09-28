<div align="center">

<img src="assets/revelith-readme-banner.svg" alt="ReveLith — Offline-first intelligent office suite" width="100%" />

# ReveLith

**The Next-Generation, Offline-First Intelligent Office Suite**

An ultra-fast, local-first productivity powerhouse designed for modern engineering, writing, and analysis. Built from the ground up to handle real Microsoft Office formats, PDF, and Markdown without compromising privacy or document fidelity.

[📥 Download ReveLith (.exe / .dmg / .deb)](https://github.com/sainibhaowal/Revelith/releases) • [🚀 v1.2.0 Release Notes](docs/PUBLIC_RELEASE_NOTES.md) • [📖 End-to-End Guide](docs/FEATURES_END_TO_END_GUIDE.md) • [Features](#key-capabilities) • [Architecture](#architecture--fidelity-model) • [Suite Overview](#applications) • [Build from Source](#building-from-source-for-developers) • [Security](#security--privacy)

</div>

---

## 📥 Download ReveLith

Ready to use ReveLith on your computer? Download the pre-built installer for your operating system from our **[Releases Page](https://github.com/sainibhaowal/Revelith/releases)**:

- 🪟 **Windows**: `.exe` (x64 and Native ARM64 for Snapdragon X & Windows on Arm)
- 🍎 **macOS**: `.dmg` (Universal: Apple Silicon & Intel)
- 🐧 **Linux**: `.AppImage` / `.deb`

_No compilation or terminal setup required for end users. Installed apps automatically and exclusively receive updates directly from ReveLith GitHub releases (with automatic x64-to-ARM64 migration on Windows on Arm)._

## Key Capabilities

- **Byte-Preserving Fidelity**: Edits Word (`.docx`), Excel (`.xlsx`), and PowerPoint (`.pptx`) files by patching modified structures only. Untouched elements, layouts, and styles remain 100% byte-for-byte intact.
- **100% Local and Private**: Document processing, editing, and on-device OCR run entirely on your local machine. Your files never leave your system.
- **Native AI Copilot & BYOK**: Context-aware AI agents across all editors, supporting dedicated BYOK keys (Search, Image, Analysis) and custom local/server models (e.g. `codex-app-server`), with quote-aware prompt references and highlights.
- **Unified Workspace Shell**: Seamless tabbed multi-document management for Docs, Sheets, Slides, PDF, Markdown, and ReveLith HTML in a single cohesive environment with collapsible ribbons (`Ctrl+F1`), Global AutoSave, and multi-language UI (including Czech).
- **High-Performance Architecture**: Native Rust sidecars, WebAssembly text shaping, streaming large-deck PDF exports, and specialized parsing engines deliver instant startup and fluid performance on x64 and ARM64 hardware.
- **Modern Design System**: Polished Light, Dark, and System themes featuring Word-style dark page rendering in dark theme with accurate print, PDF export, and clipboard fidelity.

---

## Applications

| Module       | Core Functionality                | Engine & Architecture                                                                                                                              |
| :----------- | :-------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Docs**     | Word processor (`.docx`)          | Byte-preserving round trips, paginated layout engine, tracked changes, in-place comments, HTML export, equations, and ink support.                 |
| **Sheets**   | Spreadsheet analyzer (`.xlsx`)    | In-house Rust calculation engine and `.xlsx` sidecar, dynamic charting, cached external formulas, Excel-style paste repeat, and large-grid search. |
| **Slides**   | Presentation designer (`.pptx`)   | Custom OOXML parser, master and layout inheritance, shape transforms, streamed PDF export, East Asian font resolution, and smart layout snapping.  |
| **PDF**      | Complete PDF editor (`.pdf`)      | Direct page content stream manipulation, aligned highlight geometry, in-stream Find and Replace, form filling, signatures, and annotations.        |
| **Markdown** | Technical document editor (`.md`) | Block-based rich text workspace with immediate bi-directional plain text sync, live Mermaid diagrams, Find and Replace, and native exports.        |
| **HTML**     | ReveLith HTML studio (`.html`)    | Full-featured HTML document creator & editor with AI Design, AI Document, click-to-restyle, layer inspector, present mode, and Word/PDF export.    |
| **Shell**    | Master orchestrator               | Central workspace hub, unified tab engine, Global AutoSave, instant project switcher, and integrated theme controller.                             |

---

## Architecture & Fidelity Model

ReveLith uses a unique non-destructive patching model. Traditional editors re-serialize the entire file upon saving, which often degrades templates, macros, and complex document structures. ReveLith protects the original source of truth:

```
[Open Document] ───► Fingerprint and archive original file state
                 ───► Parse block-level tree and map XML offsets
                 ───► Isolate user and AI modifications
[Save Document] ───► Generate OOXML delta patches for dirty nodes only
                 ───► Inject modified blocks into original binary container
                 ───► Produce clean, fully compatible document without drift
```

---

## Engine Modules

The core engines are standalone TypeScript and Rust modules, designed with zero Electron coupling and covered by extensive test suites:

- `packages/docx-engine`: OOXML tokenizer and block tree delta patcher.
- `packages/pptx-engine` / `packages/pptx-render`: Presentation model parser and canvas rendering pipeline.
- `packages/file-parse`: Multi-format text and metadata extractor for AI context feeding.
- `packages/agent-core`: Multi-agent orchestration loop with skill dispatch and document state inspection.
- `packages/ai-provider`: Resilient streaming provider abstraction supporting local and hosted model backends.
- `packages/revelith-cli`: Headless `revelith` CLI — local Office engines for coding agents (info/read/render/create/convert/docs/sheets/deck).
- `skills/revelith/SKILL.md`: Agent skill contract (Claude Code, Codex, OpenCode); install in one click via Settings → Integrations.
- `packages/ai-search`: Integrated live web search, documentation lookup, and image synthesis tools.
- `packages/ui`: High-performance React component primitives and custom design tokens.

---

## 🤖 Model Context Protocol (MCP) & Claude Code Integration

AI agents can drive ReveLith over the **Model Context Protocol (MCP)** across three flexible modes:

1. **Headless CLI over stdio (`revelith mcp`)**: Serves document inspection, checking, editing, and guided presentation building as standard JSON-RPC MCP tools over stdio. Ideal for local **Claude Code**, **Claude Desktop**, and **Cursor** sessions.
2. **Streamable HTTP Server (`revelith mcp --http <port> [--token <secret>]`)**: Serves the identical MCP tool suite over HTTP for agents in containers, sandboxes, or remote workstations.
   - **File Transport**: `PUT /files/<name>` uploads files directly; any file parameter accepts an `http(s)://` URL (auto-downloaded); file-writing tools return download URLs (`{"download_url": "..."}`).
   - **Security**: Protected with Bearer `--token` authentication header.
   - **Extended Agent Tools**: Includes `pdf_read_text` (extracts text across pages), `docs_edit_text` (edits open Word document), and `sheet_set_cells` (drives visible Sheets grid).
3. **Live In-App Editing**: When the ReveLith desktop suite is running, agents connect to the local in-app server (`http://127.0.0.1:3928/mcp`) to inspect and edit your open documents live in real time.
4. **Settings → Integrations**: Walkthrough inside ReveLith providing copy-ready setup commands for Claude Code, Claude Desktop, Cursor, and remote agent configurations.

### Building an 8-Slide Pitch Deck with Claude Code

Easily generate professional, publication-ready multi-slide presentations directly from Claude Code using ReveLith's guided deck builder tool:

```bash
# Register ReveLith with Claude Code (one-time setup)
claude mcp add revelith -- npx revelith mcp
```

In Claude Code, issue your prompt:

```
> Build an 8-slide presentation deck on "Next-Gen Clean Energy & Grid Storage 2026" using revelith
```

Claude Code orchestrates the `guided_deck_builder` tool to compose each slide with layout specifications, bullet points, statistics, and speaker notes:

```
[Claude Code] ──► revelith guided_deck_builder
               ├── Slide 1: Title & Vision ("Clean Energy & Grid Storage 2026")
               ├── Slide 2: Market Context & Macro Drivers (Two-Column Layout)
               ├── Slide 3: Battery Energy Storage Systems (BESS) Tech Breakdown
               ├── Slide 4: Key Performance Metrics & CapEx Reductions (Stat Callouts)
               ├── Slide 5: Grid Integration & AI Transmission Optimization
               ├── Slide 6: Regulatory Milestones & Global Adoption Trends
               ├── Slide 7: Commercial Deployment Roadmap & Milestones
               └── Slide 8: Conclusion & Next Steps (Call to Action)
               ──► Output: CleanEnergy2026.pptx (native OOXML with custom theme)
```

You can immediately open and inspect the presentation at any slide in ReveLith:

```bash
revelith open CleanEnergy2026.pptx --slide 4
```

---

## 🛠️ Building from Source (For Developers)

If you are a developer looking to explore the codebase or build ReveLith locally:

### Prerequisites

- **Node.js**: `v22.0.0` or higher
- **npm**: `v10.0.0` or higher
- **Rust Toolchain**: `cargo` available on `PATH` (required for high-performance `.xlsx` sidecar)

### Setup & Development

```bash
# Clone the repository
git clone https://github.com/sainibhaowal/Revelith.git
cd Revelith

# Install workspace dependencies

# Generate test fixtures and run test suites
npm run fixtures
npm test

# Launch the full desktop application in development mode
npm run dev
```

### Targeted Development & Packaging

```bash
# Run a specific application module
npm run dev:docs

# Run workspace type checking
npm run typecheck

# Build native installers
npm run dist:win        # Windows x64 (.exe / NSIS)
npm run dist:win:arm64  # Windows ARM64 (.exe / NSIS for Snapdragon X)
npm run dist:mac        # macOS (.dmg)
npm run dist:linux      # Linux (.AppImage, .deb, .rpm)
```

---

## Security & Privacy

ReveLith is engineered with zero-trust local boundaries:

- **Sandboxed Renderers**: Strict Electron process isolation and context segregation.
- **Safe IPC Layer**: Fully validated remote schema communication between GUI layers and system sidecars.
- **No Unsolicited Telemetry**: Your files, prompts, and edits stay strictly on your local hardware.

---

## Acknowledgments & Credits

ReveLith is developed, engineered, and maintained by [ReveLith Contributors](https://github.com/sainibhaowal).

We would like to acknowledge the open-source community for the foundational tools powering our desktop engine, including **Electron**, **Rust**, **Fast-XML-Parser**, **PDFium**, and **Vitest**.

---

## License & Trademarks

ReveLith is open-source software licensed under the [Apache License, Version 2.0](LICENSE).

_The "ReveLith" name, logos, brand assets, and custom UI icons are proprietary trademarks of the author and may not be used in derivative works without prior written consent._
