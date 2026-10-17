# ReveLith Forms Builder parity plan

## Scope and purpose

The detailed, status-marked feature inventory and delivery checklist now lives in [REFERENCE_FEATURE_CHECKLIST.md](./REFERENCE_FEATURE_CHECKLIST.md). Use it as the source of truth for feature-level parity and acceptance evidence.

Use the seven packages under `assets/packages/` as read-only product references for the capability map. Six package manifests declare AGPL-3.0; `webapp/package.json` has no license declaration. Their implementation, assets, schemas, and text must not be copied into ReveLith. Implement suitable behaviors with ReveLith-owned TypeScript, React, Electron IPC, and local `.form.json` documents.

This plan covers the Forms Builder and its ReveLith AI panel. It does not authorize changes to the reference packages or unrelated editors.

## What ReveLith already has

- A local form document schema and editor in `src/renderer/types.ts` and `src/renderer/App.tsx`.
- A ribbon, field palette/canvas, field properties, settings, themes, preview, templates, and local test response list/export.
- Basic choice/text/number/date/contact/upload/signature/rating/NPS/section/page-break fields, per-field required/length/range/pattern checks, visibility conditions, and multipage preview.
- Local draft persistence and shell document lifecycle integration.
- ReveLith chat using `@revelith/app-chat`, `@revelith/agent-core`, configured provider transport, an app skill, and web search.
- AI tools for reading/updating the form, settings/theme, basic add/update/delete/reorder field operations, and visibility conditions.

## Reference capability map

| Read-only reference area | Product capabilities observed | ReveLith-native destination |
| --- | --- | --- |
| `assets/packages/shared-types-enums` | Field definitions, defaults, theme/settings, conditions/actions, translations and form state | `apps/forms-builder/src/renderer/types.ts`, schema migration/validation, AI tool schemas |
| `assets/packages/answer-utils` | Type-aware validation, answer serialization, conditions and calculated values | `apps/forms-builder/src/renderer/form-runtime/` pure functions, preview tests |
| `assets/packages/form-renderer` | Respondent flow, field rendering, branching, progress, validation, completion states | `apps/forms-builder/src/renderer/components/FieldRenderer.tsx`, `FormCanvas.tsx`, `form-runtime/` |
| `assets/packages/webapp` | Builder, settings/design/logic, preview, submissions and analytics surfaces | `apps/forms-builder/src/renderer/components/`, `Ribbon.tsx`, `PropertiesPane.tsx`, local response views |
| `assets/packages/embed` | Inline/popup/modal/full-page presentation patterns | Future local HTML export/preview; no hosted embed service assumed |
| `assets/packages/server` | Accounts, tenant/project authorization, hosted publishing, quotas, payments, uploads, integrations and analytics | Not portable into the local desktop app as-is. Keep local data local; add only explicit local equivalents or separately designed services. |
| `assets/packages/utils` | Shared form manipulation and serialization helpers | ReveLith-native schema utilities and migration tests |

## Detailed reference inventory

### Field and answer types

The reference enum and answer utilities cover group/nested fields; welcome, statement, and thank-you screens; short/long text and number; yes/no, single/multiple choice, picture choice; file upload; opinion scale and rating; date, date range, and time; input tables; payment; full name, address, email, URL, phone, country, signature, legal terms; submit date, hidden fields, variables, and hidden checkboxes. Choice data can include image/icon presentation, random order, “Other”, quiz scores and expected answers. Field layout can carry image/video media, background, brightness, alignment and width. Validation includes required state, number/length bounds, answer-type checks, expected quiz answers, and the field-specific constraints.

### Form lifecycle, presentation, and respondent flow

The renderer includes the general/interactive/popup modes; welcome and completion screens; locale-specific labels and dates; theme controls for fonts, text/button colors, backgrounds, images, logo, and custom CSS; single-question navigation, arrows, question list, progress, keyboard behavior, answer/session persistence, and respondent completion/closed states. The embed package adds inline, popup, modal, and full-page mounts with sizing and close behavior.

### Builder, logic, and operations

The web app includes question reorder/duplicate/delete, rich text and field mentions, question type switching, themes and per-field layout, preview, hidden fields, variables, condition/action rules, calculated values, branching, bulk logic editing, and a visual logic-flow editor. Settings include publishing/drafts, activation windows/time zone, expiration/time limit, password access, CAPTCHA, spam filtering, response quotas and IP limits, redirect/closed messages, metadata/social image, translations, email notifications, brand/domain settings, and permissions. The submissions/analytics/sharing areas add response filters/details/exports, reports, links, QR codes, and embed snippets. The server adds workspace/project accounts, invitations/roles, OAuth/OIDC, retention/trash, file storage, payment intents/webhooks, email, integrations, and tenant-scoped authorization.

### ReveLith implementation boundary

The local editor will implement the form model, authoring, logic, respondent preview, local drafts/responses, export, themes, localization-ready strings, and local equivalents for reports/share artifacts where they have useful offline behavior. Remote CAPTCHA verification, actual card processing, hosted file transfer, team identity/roles, remote publishing, custom domains, server quotas/IP tracking, email delivery, webhooks, and third-party integrations need real service endpoints, secrets, privacy terms, and tenant/security designs. They will not be represented as working by inert controls. The implementation will expose only those hosted capabilities when their backend is configured and tested.

## Implementation status (2026-10-06)

Implemented in ReveLith-native code:

- Versioned schema normalization and bounds for the current field, variable, rule, validation, and theme-related data; old field documents receive defaults and unknown top-level extensions are retained.
- Native authoring and respondent rendering for nested question groups, full name, date range, localized country, picture choice, legal consent, input table, hidden value, welcome, statement, and completion fields, alongside the existing field types.
- One-question, page-break, and all-at-once respondent flows, question navigation, time limit, welcome/completion behavior, and best-effort local preview draft recovery.
- All/any field visibility conditions and typed rule conditions for text, numbers, dates, and empty answers. Rules can navigate to questions or calculate bounded text/number variables.
- Choice randomization, per-choice image/icon/color presentation and layouts, and quiz scoring for expected text/number answers and correct choice answers, including partial credit for multi-select quizzes and optional respondent score display.
- Nested group editing, recursive rendering/validation and logic/scoring, an AI child-field management tool, nested response details and flattened CSV columns.
- UTC opening/closing schedules, closed-window preview enforcement and custom closed-form messages. These are local preview rules, not hosted publication controls.
- Manually authored locale translations for form title/description, nested field labels and helper text, and respondent messages/buttons; preview can switch languages and falls back to original copy. The AI can update or remove locale translations.
- AI tools for adding/updating/removing supported fields, editing special field content, managing variables and rules, settings/theme changes, and auditing the form. Inputs are validated before writes.
- Local response search, detail expansion, individual deletion, clear-all confirmation, CSV/JSON export, and importing offline respondent JSON packages into the matching form, including uploaded file bytes.
- Editor drafts are autosaved locally, same-tab reload restores the draft, and a fresh task remains blank while offering recovery copies from earlier sessions.
- Current evidence: Forms Builder `typecheck` passed; `vitest` (8 files, 29 tests) passed; production `electron-vite build` passed; all 8 tests in `e2e/forms-builder-authoring.spec.ts` passed after the latest changes, including translated choice display, field media, and file persistence/download/cleanup with local analytics.

Still to implement for broader native parity: media browsing/selection and remaining theme controls; automatic language negotiation, full localized field/system labels, phone-country support and locale E2E; timezone-selectable schedules; upload progress/retry/cancel, broader signature coverage and malware scanning; response filtering, richer analytics/reporting and broader import/export/share artifacts; a complete keyboard/screen-reader audit; and full standalone parity for advanced navigation/branching. Offline respondent HTML, returned-response JSON import, an iframe snippet, core locale formatting, signature checks for common file families and response JSON with file bytes are implemented. Hosted publishing and its account, security, retention and response services still require a separately designed and deployed backend.

## Work plan

### Stage 1: stabilize the native contract and AI controls (implemented for current scope)

1. Add an explicit schema version and backward-compatible normalizer/validator. Old `.form.json` documents continue to load with defaults; invalid IDs, unsupported types, oversized option lists, malformed conditions, and unsafe regex patterns are reported safely.
2. Expand the ReveLith AI tools to inspect a structured form report, create/edit supported fields including their validation/layout/conditional properties, manage form settings/theme, and run a deterministic form audit. Every write uses the same normalizer and bounds as file loading; the AI cannot execute code, arbitrary HTML, or arbitrary filesystem operations.
3. Make the shared chat dock width animate between its open width and the 36 px rail, honor reduced-motion preferences, and retain the mounted panel as legacy editor docks do.

### Stage 2: respondent experience and authoring completeness (partially implemented; remaining tasks are explicit)

1. Continue extracting pure field/condition/validation helpers and test them independently.
2. Add richer field authoring/rendering for per-choice media, field backgrounds, and scoring modes beyond current expected-answer quiz scoring. Nested groups now have authoring, recursive rendering/validation, logic, quiz scoring, response details/CSV, and an AI management tool.
3. Expand localization and per-field presentation/theme controls with deterministic preview behavior and migration coverage.
4. Add accessibility keyboard/screen-reader coverage and improve file attachment handling before expanding response storage.

### Stage 3: local responses, export and packaging (partially implemented)

1. Response search, full-answer detail, per-response deletion, clear-all confirmation, and CSV export are implemented. Add filters, response tables/charts, export options, and CSV edge-case regression coverage.
2. Review the standalone HTML export, local submissions and attachment package boundaries, and close the documented runtime parity gaps. Hosted publishing, accounts, payments, team workspaces, external integrations, and tenant services are not implied by the sibling server package.
3. Expand schema-format documentation and E2E coverage for open/save/autosave, migrations, preview, AI mutations, and shell tab lifecycle.

## Exact ReveLith paths in scope

- App schema/state and AI skill: `apps/forms-builder/src/renderer/types.ts`, `apps/forms-builder/src/renderer/App.tsx`.
- Authoring UI: `apps/forms-builder/src/renderer/components/Ribbon.tsx`, `FieldPalette.tsx`, `FormCanvas.tsx`, `FieldRenderer.tsx`, `PropertiesPane.tsx`.
- New pure modules: `apps/forms-builder/src/renderer/schema/` and `form-runtime/` (introduced as each stage is implemented).
- Shell/IPC boundaries only if required: `apps/forms-builder/src/main/`, `src/preload/`, `src/shared/`; no permission bypass or general filesystem API.
- Tests: `apps/forms-builder/src/**/*.test.ts(x)`, `e2e/forms-builder-authoring.spec.ts`, and `e2e/new-app-document-lifecycle.spec.ts`.
- User documentation: `apps/forms-builder/README.md` and this plan.
- Shared chat animation: `apps/app-chat/src/index.tsx`.

## Safety and compatibility rules

- Preserve old `.form.json` files with explicit, idempotent migrations; never silently discard unknown user data during normalization.
- Keep respondent answers and drafts in existing local storage/document flows. Do not upload form content or responses unless a separate, explicit network feature is designed.
- Keep the ReveLith provider, agent transport, tool permission boundaries, and shell document lifecycle intact. AI may call only declared form tools plus the already-enabled web search tool.
- Validate tool input at execution time, not only in model-facing JSON schemas. Bound string lengths, list sizes, indices, colors, enum values, and nested objects.
- Preserve other apps, the shell, authentication, tenant/security boundaries, and the seven external reference directories. Do not change dependencies to the AGPL packages.
- All new form types require authoring, serialization, preview, validation, AI schema exposure, and regression coverage together.

## Validation evidence required before completion

- Unit coverage for migrations, normalization, conditions, type-aware validation, and CSV serialization.
- Forms Builder end-to-end: create/edit/reorder, configure validation/logic/theme, preview invalid and valid submissions, verify response persistence/export, and exercise AI read/write/audit calls through the configured ReveLith agent path.
- Lifecycle end-to-end: autosave/reopen, save-as/open, close prompt, and retain state after reopening.
- Forms Builder typecheck/build and relevant E2E suites; report any unavailable external AI provider separately rather than treating a mocked call as provider verification.
- Compare git changes to confirm unrelated editors and all reference package directories were not modified by this work.

## Known risks and explicit non-goals

- The sibling server implements a hosted SaaS with account/project authorization and provider services. Recreating it inside a local-only desktop feature without a separate backend design would weaken security and create misleading product claims.
- The current form schema has little versioning discipline; migration tests must precede schema expansion.
- AI can propose structurally valid but poor questions. The user must retain direct editing and preview; AI output is not a substitute for respondent testing.
- A complete hosted form platform is larger than one implementation pass. This plan makes the stages and remaining work explicit rather than claiming feature parity prematurely.
