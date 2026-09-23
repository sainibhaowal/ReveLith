# Contributing to ReveLith

Hi! I'm ReveLith Contributors, the creator and maintainer of ReveLith. 

ReveLith is an independent, open-source project. Whether you are reporting a bug, suggesting a new feature, or submitting a code improvement, all contributions are welcome!

---

## How You Can Contribute

- **Report Bugs**: Open an issue on GitHub describing what happened, your operating system, and steps to reproduce.
- **Suggest Features**: Have an idea for a new editor feature, AI integration, or UI improvement? Open an issue and let's discuss it!
- **Submit Pull Requests**: Fix a bug or implement a feature and open a PR against the `main` branch.

---

## Repository Structure

- `apps/`
  - `apps/shell`: The main Electron window orchestrator, tab manager, and application frame.
  - `apps/docs`: Document editor (`.docx`).
  - `apps/sheets`: Spreadsheet editor (`.xlsx`).
  - `apps/slides`: Presentation editor (`.pptx`).
  - `apps/pdf`: PDF viewing and annotation workspace.
  - `apps/markdown`: Technical markdown editor.
- `packages/`
  - `packages/docx-engine`: OOXML tokenizer and delta patcher.
  - `packages/pptx-engine` / `packages/pptx-render`: Presentation model parser and rendering engine.
  - `packages/agent-core`: AI orchestration and state inspection.
  - `packages/ai-provider`: Multi-vendor provider abstraction (local and cloud LLMs).
  - `packages/ui`: Design tokens and React primitives.
- `apps/sheets/native/xlsx-engine`: High-performance Rust sidecar process for calculation and sheet parsing.

---

## Local Development Setup

### Prerequisites
- **Node.js**: `v22+`
- **npm**: `v10+`
- **Rust toolchain** (`cargo` on PATH, needed for the Rust xlsx sidecar)

### Quick Start
```bash
# Install all dependencies
npm install

# Generate fixtures (one-time setup)
npm run fixtures

# Start full dev mode (all editors + shell)
npm run dev
```

---

## Running Checks

Before submitting a pull request, please run the automated checks to make sure everything passes:

```bash
npm run format:check   # Prettier code formatting check
npm run lint           # ESLint across all workspaces
npm run typecheck      # TypeScript type checking
npm test               # Unit tests for engines and apps
```

---

## Packaging Native Installers

To package native desktop binaries locally:

```bash
npm run dist:win      # Windows installer (.exe)
npm run dist:mac      # macOS package (.dmg)
npm run dist:linux    # Linux package (.AppImage, .deb)
```

---

## License

ReveLith is open-source under the **Apache License, Version 2.0**. By submitting a pull request, you agree that your contributions will also be licensed under the [Apache-2.0 License](LICENSE).
