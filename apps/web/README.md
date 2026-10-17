# ReveLith — Landing Site

Marketing site for **ReveLith**, the offline-first office suite for people who care about the file after they save it.

Edit DOCX, XLSX, PPTX, PDF and Markdown with byte-preserving fidelity, a local AI copilot, and zero telemetry.

> This repository is the **landing page only**. The ReveLith desktop application lives at
> [sainibhaowal/ReveLith](https://github.com/sainibhaowal/ReveLith) — download installers from
> [the releases page](https://github.com/sainibhaowal/ReveLith/releases).

---

## What's on the page

| Section | Purpose |
| --- | --- |
| Hero | Positioning, primary download CTA, trust markers |
| Workspace deck | Five realistic in-app canvases — Docs, Sheets, Slides, PDF, Markdown |
| Architecture | Parse-once / patch-precisely / save-cleanly explainer |
| Privacy | The local-first boundary and its guarantees |
| Footer | Navigation, release links, legal |

The workspace deck renders a **simulated desktop shell per engine** rather than a static screenshot:
a Word-style ribbon and paginated ruler for Docs, a cell grid with formula bar and sheet tabs for
Sheets, a thumbnail rail with a 16:9 canvas for Slides, a page viewer with an annotation rail for
PDF, and a source/preview split for Markdown. None of it is a raster image.

## Stack

- **React 19** + **TypeScript**
- **Vite 8** (Rolldown)
- **Tailwind CSS 4** via `@tailwindcss/vite`, plus hand-authored component CSS
- **oxlint** for linting

No analytics, no tracking scripts, no third-party runtime dependencies beyond the web fonts.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run oxlint |

## Project structure

```
src/
  App.tsx                 page composition and section order
  App.css                 layout + component styles
  index.css               design tokens, keyframes, ambient background
  components/
    AppCanvas.tsx         the five simulated engine canvases
    DownloadModal.tsx     platform picker (animated, focus-trapped)
    LegalModal.tsx        privacy + terms
    PatchGrid.tsx         background canvas (byte grid + patch band)
    GithubIcon.tsx
  hooks/
    useFocusTrap.ts       keeps Tab inside an open dialog
    useReveal.ts          bidirectional scroll reveal + header/scroll progress
  data/
    suite-data.ts         all copy and fixtures in one place
```

## Two implementation notes

**The background is not decoration.** `PatchGrid.tsx` draws a grid of blocks — a document parsed
into an in-memory block map — and sweeps a narrow *patch band* down the viewport, representing a
delta patch being written while everything outside it stays untouched. That is the product's core
claim, shown rather than stated. The band tracks scroll progress and the pointer warms a local
radius. It runs at 30 fps, pauses when the tab is hidden, renders a single static frame under
`prefers-reduced-motion`, and stops on small screens once the hero has been scrolled past.

**Content lives in `src/data/suite-data.ts`.** Feature copy, engine detail, preview fixtures, the
sheet grid and the slide deck are all there — edit content without touching components.

## Adding a release

Download URLs are built from `LATEST_VERSION` and the asset names in `DownloadModal.tsx`. GitHub
release asset names are **not guessable** — check the actual filenames on the
[releases page](https://github.com/sainibhaowal/ReveLith/releases) before editing, because generated
names differ per platform (`ReveLith.Setup.<version>.exe` versus `ReveLith-<version>-arm64.dmg`) and
not every platform ships every architecture.

## Accessibility

Colour contrast meets WCAG AA, focus rings are visible, dialogs trap Tab and close on Escape,
background scroll is locked while a dialog is open, and all motion honours `prefers-reduced-motion`.

## License

Landing site source is available under the **Apache License 2.0**, matching the ReveLith application.
ReveLith is a trademark of its respective owner.
