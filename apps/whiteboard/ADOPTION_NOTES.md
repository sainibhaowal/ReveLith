# Adoption Notes — ReveLith Draw (AI Draw)

## Source of truth

- Canvas engine via npm (see `package.json` dependencies; version pinned 0.18.1)
- External reference repos: READ-ONLY, untouched
- Scope: ONLY `apps/drawboard` (+ `package-lock.json` via `npm install -w @revelith/drawboard`)

## What changed (by phase)

- Phase 0: added the pinned canvas-engine dependency + declared `@revelith/ui`; `electron.vite.config.ts` + `vite.renderer.config.ts` gain `optimizeDeps.include`; `vite.renderer.config.ts` sets `root: 'src/renderer'` (same as slides/docs)
- Phase 1: NEW `src/shared/ipc.ts` (v1/v2 compat), `src/shared/types.ts`, `src/main/drawboard-main.ts` (standalone only; Shell owns `new-app:*` in hosted mode); `src/main/index.ts` delegates; `src/preload/index.ts` keeps `electronAPI`, adds `drawboardApi`; `src/renderer/main.tsx` async theme/lang bootstrap
- Phase 2: NEW `src/renderer/board-engine/` (`DrawboardHost.tsx`, `persistence.ts`, `open-content.ts`, `exporters.ts`, `library.ts`, `ai-tools.ts` (28 tools), `images.ts`, `history.ts`, `link-policy.ts`, `dropdown-fit.ts`, `drawboard-host.css`); NEW `src/renderer/ribbon/` (`DrawboardRibbon.tsx`, `icons.tsx`, `board-actions.ts`, `ribbon.css`); NEW `src/renderer/ai/` (`DrawboardChatPanel.tsx`, `board-tool-routing.ts`, `drawboard-chat.css`); `src/renderer/App.tsx` orchestrates shell save, history, ribbon, chat
- Phase 3: parity — board menu/welcome/footer ReveLith-branded; settings bar (title/lang/theme/grid); import/export; clear; AI tools on the board API; collaboration off
- Phase 4: tests (10 passing), this doc + README, typecheck + build verification

## Branding rule

All user-visible names are ReveLith Draw / AI Draw only. The npm package id and the engine's own component/prop keys stay in code because the build breaks without them; they never appear in the UI.

## What must not break (verified)

- Shell contract: `new-app:get-document/new-document/open-document/save-document/set-document-state/set-document-path`, `.drawboard` extension, `DRAWBOARD_RENDERER_URL`/port 5182 — unchanged
- Other apps/packages untouched; no auth/tenant/crypto changes; no network/collab enabled
- Legacy boards migrate non-destructively (eraser strokes skipped, original `ops-v1` cache kept)

## Validation

- `npm run typecheck -w @revelith/drawboard` — pass
- `npm run test -w @revelith/drawboard` — 9 files, 50 tests pass (tool surface, router, guard, images, persistence, pure actions, history, policy, dropdown fit)
- `npm run build -w @revelith/drawboard` — pass
- `curl http://localhost:5182/` — 200
