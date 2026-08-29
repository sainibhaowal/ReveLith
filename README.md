<div align="center">

<img src="assets/revelith-readme-banner.svg" alt="ReveLith — Offline-first intelligent office suite" width="100%" />

# ReveLith

**The Next-Generation, Offline-First Intelligent Office Suite**

An ultra-fast, local-first productivity powerhouse designed for modern engineering, writing, and analysis. Built from the ground up to handle real Microsoft Office formats, PDF, and Markdown without compromising privacy or document fidelity.

[📥 Download ReveLith (.exe / .dmg / .deb)](https://github.com/sainibhaowal/Revelith/releases) • [Features](#key-capabilities) • [Architecture](#architecture--fidelity-model) • [Suite Overview](#applications) • [Build from Source](#building-from-source-for-developers) • [Security](#security--privacy)

</div>

---

## 📥 Download ReveLith

Ready to use ReveLith on your computer? Download the pre-built installer for your operating system from our **[Releases Page](https://github.com/sainibhaowal/Revelith/releases)**:

- 🪟 **Windows**: `.exe` (Installer)
- 🍎 **macOS**: `.dmg` (Apple Silicon & Intel)
- 🐧 **Linux**: `.AppImage` / `.deb`

*No compilation or terminal setup required for end users.*

## Key Capabilities

* **Byte-Preserving Fidelity**: Edits Word (`.docx`), Excel (`.xlsx`), and PowerPoint (`.pptx`) files by patching modified structures only. Untouched elements, layouts, and styles remain 100% byte-for-byte intact.
* **100% Local and Private**: Document processing and editing run entirely on your local machine. Your files never leave your system.
* **Native AI Copilot**: Context-aware AI agents embedded across all editors for deep document comprehension, refactoring, synthesis, and creative generation.
* **Unified Workspace Shell**: Seamless tabbed multi-document management for Docs, Sheets, Slides, PDF, and Markdown in a single cohesive environment.
* **High-Performance Architecture**: Native Rust sidecars, WebAssembly text shaping, and specialized parsing engines deliver instant startup and fluid performance.
* **Modern Design System**: Polished Light, Dark, and System themes featuring dark chrome with accurate white-canvas presentation to ensure print and export accuracy.

---

## Applications

| Module | Core Functionality | Engine & Architecture |
| :--- | :--- | :--- |
| **Docs** | Word processor (`.docx`) | Byte-preserving round trips, paginated layout engine, tracked changes, rich comments, complex equations, and ink support. |
| **Sheets** | Spreadsheet analyzer (`.xlsx`) | In-house Rust calculation engine and `.xlsx` sidecar, dynamic charting, pivot tables, slicers, formula tracing, and conditional styling. |
| **Slides** | Presentation designer (`.pptx`) | Custom OOXML parser, master and layout inheritance, shape transforms, non-destructive cropping, and smart layout snapping. |
| **PDF** | Complete PDF editor (`.pdf`) | Direct page content stream manipulation, font-preserving text updates, form filling, digital signatures, and vector annotations. |
| **Markdown** | Technical document editor (`.md`) | Block-based rich text workspace with immediate bi-directional plain text synchronization and native export capabilities. |
| **Shell** | Master orchestrator | Central workspace hub, unified tab engine, instant project switcher, and integrated theme controller. |

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

* `packages/docx-engine`: OOXML tokenizer and block tree delta patcher.
* `packages/pptx-engine` / `packages/pptx-render`: Presentation model parser and canvas rendering pipeline.
* `packages/file-parse`: Multi-format text and metadata extractor for AI context feeding.
* `packages/agent-core`: Multi-agent orchestration loop with skill dispatch and document state inspection.
* `packages/ai-provider`: Resilient streaming provider abstraction supporting local and hosted model backends.
* `packages/ai-search`: Integrated live web search, documentation lookup, and image synthesis tools.
* `packages/ui`: High-performance React component primitives and custom design tokens.

---

## 🛠️ Building from Source (For Developers)

If you are a developer looking to explore the codebase or build ReveLith locally:

### Prerequisites

* **Node.js**: `v22.0.0` or higher
* **npm**: `v10.0.0` or higher
* **Rust Toolchain**: `cargo` available on `PATH` (required for high-performance `.xlsx` sidecar)

### Setup & Development

```bash
# Clone the repository
git clone https://github.com/sainibhaowal/Revelith.git
cd Revelith

# Install workspace dependencies
npm install

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
npm run dist:win      # Windows (.exe / NSIS)
npm run dist:mac      # macOS (.dmg)
npm run dist:linux    # Linux (.AppImage, .deb, .rpm)
```

---

## Security & Privacy

ReveLith is engineered with zero-trust local boundaries:
* **Sandboxed Renderers**: Strict Electron process isolation and context segregation.
* **Safe IPC Layer**: Fully validated remote schema communication between GUI layers and system sidecars.
* **No Unsolicited Telemetry**: Your files, prompts, and edits stay strictly on your local hardware.

---

## Acknowledgments & Credits

ReveLith is developed, engineered, and maintained by [ReveLith Contributors](https://github.com/sainibhaowal).

We would like to acknowledge the open-source community for the foundational tools powering our desktop engine, including **Electron**, **Rust**, **Fast-XML-Parser**, **PDFium**, and **Vitest**.

---

## License & Trademarks

ReveLith is open-source software licensed under the [Apache License, Version 2.0](LICENSE).

*The "ReveLith" name, logos, brand assets, and custom UI icons are proprietary trademarks of the author and may not be used in derivative works without prior written consent.*
