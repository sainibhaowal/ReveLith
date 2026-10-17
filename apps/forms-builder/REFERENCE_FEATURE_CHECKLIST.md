# Forms Builder reference feature checklist and delivery plan

## Goal and rules

Build ReveLith-owned, local-first Forms Builder behavior inspired by the complete product capabilities in `assets/packages/{answer-utils,embed,form-renderer,server,shared-types-enums,utils,webapp}`. This is a behavior checklist, not a code port. Do not copy or adapt source code, schemas, assets, translations, CSS, or dependency choices from the references. Keep the seven reference trees read-only. Six package manifests declare AGPL-3.0; the `webapp` manifest has no license declaration and its package tree has no visible LICENSE/COPYING file. No license claim is made for `webapp`; the plan keeps every reference tree read-only.

Use `[x]` for implemented and verified in ReveLith, `[~]` for partial implementation, `[ ]` for not implemented, and `[service]` for a hosted capability that needs a deliberate backend, privacy/security model, credentials, and integration tests. A checked feature is not evidence of feature parity beyond the exact behavior listed.

## Reference code actually inspected

| Reference package                    | Source areas reviewed                                                                                                                                                                                       | Capability groups mapped                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets/packages/shared-types-enums` | `src/enums/form.ts`, `src/form.ts`, `src/constants/form.ts`, `src/submission.ts`, `src/audience.ts`, `src/unsplash.ts`                                                                                      | Form/field/status/mode enums; nested groups; choices, layout, validation, answers, variables, logic, payment; form settings, themes, translations, submissions |
| `assets/packages/answer-utils`       | `src/index.ts` and exports for validation, payloads, conditions, logic, calculations, field flattening, answer conversion/HTML/JSON/plain/API serialization, hidden fields, escaping; corresponding tests   | Deterministic answer/runtime contract and safety serialization                                                                                                 |
| `assets/packages/form-renderer`      | `src/Renderer.tsx`, `src/blocks`, `src/components`, `src/views`, `src/store.ts`, `src/theme.ts`, `src/i18n.ts`, `src/locales`, renderer tests                                                               | Respondent runtime, field-specific controls, navigation, uploads, payment/captcha adapters, themes, locale strings, storage                                    |
| `assets/packages/embed`              | `src/index.ts`, `config.ts`, `type.ts`, `standard.ts`, `popup.ts`, `modal.ts`, `full-page.ts`, `utils`, `style.scss`                                                                                        | DOM attribute configuration; inline, popup, modal, full-page; sizing, resize, open/close/toggle, hidden fields                                                 |
| `assets/packages/webapp`             | `src/routes/index.ts`; `pages/form/{Builder,Settings,Share,Submissions,Analytics,Integrations,Render}`; `pages/project`, `pages/workspace`, `pages/auth`; services and tests; manifest has no license field | Form editor, settings, logic flow, preview, themes, translation, sharing, analytics, submissions, integrations, project/workspace and identity surfaces        |
| `assets/packages/server`             | `src/resolver/{apps,auth,endpoint,form,integration,payment,project,submission,team,template,unsplash,user}`, `src/common`, `src/app.module.ts`, resources/email templates                                   | GraphQL operations; auth/authorization; public respondent endpoints; uploads, jobs, email, storage, payment, search, integrations, retention                   |
| `assets/packages/utils`              | `src/index.ts`, exported helpers and tests for dates, MIME, bytes, object/clone, validation, color, ids, query/string parsing                                                                               | Pure data helpers used across the product; only equivalents useful to the desktop contract belong in ReveLith                                                  |

The reference web app routes include login/signup/password recovery/email verification/OAuth; workspace dashboard/members/settings; project forms/members/trash; form builder, render, settings, share, submissions, analytics, and integrations. Server resolver families confirm that publishing, identity, teams, payment, integrations and public submissions are real backend services, not standalone UI features.

## Current ReveLith implementation map

| Area                                                          | Existing ReveLith paths                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron app, form state, save/open lifecycle, AI skill/tools | `apps/forms-builder/src/renderer/App.tsx`, `src/renderer/ai/AiPanel.tsx`, `src/main/`, `src/preload/`, `src/shared/`                                                                                                                                        |
| Form model and compatibility                                  | `apps/forms-builder/src/renderer/types.ts`, `schema.ts`, `schema.test.ts`                                                                                                                                                                                   |
| Native respondent runtime                                     | `apps/forms-builder/src/renderer/components/FormCanvas.tsx`, `FieldRenderer.tsx`, `logic.ts`, `quiz.ts`, `translations.ts`, `countries.ts`                                                                                                                  |
| Builder UI                                                    | `apps/forms-builder/src/renderer/components/Ribbon.tsx`, `FieldPalette.tsx`, `PropertiesPane.tsx`, `styles.css`                                                                                                                                             |
| Existing validation                                           | `apps/forms-builder/src/renderer/schema.test.ts`, `logic.test.ts`, `quiz.test.ts`, `countries.test.ts`, `translations.test.ts`                                                                                                                              |
| New local response features                                   | `apps/forms-builder/src/renderer/attachments.ts`, `fileValidation.ts`, `responseExport.ts`, `responseAnalytics.ts`, `standaloneExport.ts` and matching tests; used by `components/FieldRenderer.tsx`, `FormCanvas.tsx`, `PropertiesPane.tsx`, and `App.tsx` |
| Forms Builder desktop E2E                                     | `e2e/forms-builder-authoring.spec.ts`, `e2e/forms-builder-offline-export.spec.ts`; adjacent new-app lifecycle/agent E2E remain in `e2e/new-app-document-lifecycle.spec.ts` and `e2e/new-apps-agent-e2e.spec.ts`                                             |
| User documentation                                            | `apps/forms-builder/README.md`, `apps/forms-builder/FORM_BUILDER_PARITY_PLAN.md`                                                                                                                                                                            |

Existing shipped behavior includes `.form.json` authoring and lifecycle, ReveLith chat/provider/web-search integration, multiple field types, nested groups, validation/visibility/branching/variables, quiz scoring, local responses/CSV, themes, preview, UTC schedule windows, per-choice icon/color/layout, and manually authored translations with preview switching. See the implementation paths above and the current E2E cases for the verified scope.

## Complete capability checklist

### A. Form model, lifecycle, fields, and choices (`shared-types-enums`, `webapp`)

- [x] Local form title/description, stable field ids, versioned `.form.json` normalization, safe backward-compatible open.
- [~] Form kinds: survey, quiz, contact; distinguish respondent behavior and authoring defaults by kind.
- [~] Draft/active/published/suspended/archive/trash states; local draft exists, full lifecycle actions do not.
- [x] Nested groups with children; recursive editing, preview, validation, logic/quiz participation, AI child operations, response detail, CSV columns.
- [x] Short/long text, number, email, URL, phone, date, date range, time, yes/no, dropdown, radio, checkbox, rating, NPS, address, country, signature, file, picture choice, input table, legal consent, welcome, statement, completion, hidden value, section and page break.
- [~] Per-choice image/icon/color, randomization, layout, correct-answer editing, and field-level quiz points exist; stable option IDs, per-choice point weights/feedback/badges and complete migration semantics remain.
- [ ] Payment field with price/currency/variable-price authoring and real payment intent lifecycle.
- [ ] Submit-date field, hidden checkbox, and the full custom response-column family (text/single/multiple/date/number/checkbox).
- [~] Choice “Other” and min/max selection controls; audit every choice type and multi-select edge case together.
- [~] Field width and safe HTTPS image/video URL rendering, brightness, background color, and inline/float/split/cover placement are implemented; the image settings-to-preview path is E2E-covered. Remaining: local file/media picker, optional attributed image-library search, video error fallback, responsive/accessibility verification and richer backgrounds.
- [ ] Rich-text question title/description editing, mention insertion, safe rich-text serialization and type-switch preservation.
- [ ] Reorder, duplicate, delete, bulk edit, question numbering, visibility flags, and all legacy model conversion cases verified across nested fields.
- [~] Choice authoring already includes option editing, image/icon/color presentation, randomization, correct-answer selection, and field-level points; add stable choice IDs, per-choice points/feedback/badges, accessible reorder, and option migration.
- [~] Media discovery equivalent to the reference Unsplash picker (`webapp/src/components/UnsplashPicker.tsx`, `services/unsplash.ts`, server `unsplash-search`/download tracking): not implemented. Any future image search must be opt-in, show attribution/license/source metadata, avoid leaking document text without consent, and keep API credentials out of renderer code.

### B. Answer processing, validation, logic, and respondent runtime (`answer-utils`, `form-renderer`)

- [x] Required/type checks for the currently implemented field set, safe bounded patterns, validation messages, and response answer mapping.
- [~] Full field-specific validators: Unicode/grapheme length, phone/country formats, numeric boundaries/precision, selection cardinality, date/time and file constraints, cross-field checks.
- [~] Nested field flattening and conditional visibility; test all operators, all/any groups, hidden answers and dependency order.
- [~] Logic actions for navigating and calculating typed variables; implement complete comparisons, references, arithmetic precision/divide-by-zero behavior, and rule conflict ordering.
- [ ] Logic-flow diagram editor, bulk logic editing, variable references and deterministic rule preview.
- [~] Respondent all-at-once, one-at-a-time and page-break navigation; finish keyboard navigation, resume/back behavior, branch/page target validation and progress semantics.
- [~] Welcome/completion/closed screens, response limit, time limit, local draft resume; implement start gate, timeout submission policy, scheduling transitions, closed-state variants and duplicate-response policy accurately.
- [~] Bundled offline respondent messages for English, German, Spanish, French, Italian, Portuguese, Hindi, Japanese and Arabic; locale-aware date/number formatting, HTML `lang`/Arabic direction, and built-in language selection are implemented. Phone-country parsing, automatic browser-language selection, full control-label translation, plural rules and dedicated locale E2E coverage remain.
- [~] Authored form/field translations and respondent language switch; translated choice display labels preserve canonical response values, custom BCP 47 tags can be entered, and confirmation/closed messages are editable. Built-in respondent strings, translated “Other” labels, language negotiation and fallback UX remain.
- [ ] CAPTCHA/spam/access controls in a real configured service-backed respondent path.
- [~] Multiple file uploads store actual bytes in local IndexedDB, enforce configured extensions/MIME labels and per-file byte/count bounds, inspect PDF/common image/ZIP/UTF-8 text signatures, save compact references, download files and clean up orphaned blobs. JSON response packages include attachment bytes with a 100 MB package cap. Remaining: progress/cancel/retry, expanded signature coverage, malware scanning (not an offline signature check), and quota/recovery UX.
- [ ] Real signature data lifecycle (clear/redo/keyboard alternative, export, size bounds, persistence validation).
- [service] Payment collection, payment verification, receipts, webhook reconciliation, and failures; never accept client-only payment claims.
- [ ] Answer serialization round trips: safe JSON, CSV, plain text, HTML, response detail, hidden fields, custom fields, uploads and groups; escape output and test hostile text.

### C. Design, presentation, and respondent preview (`form-renderer`, `webapp`)

- [~] Theme colors, font family, radius, content width, button style, spacing and label position.
- [ ] Theme typography scales, question/answer/button colors, logo/favicon, full-page background image/color/brightness, groups, layout previews and theme presets.
- [~] Field media authoring and runtime for HTTPS image/video, brightness and inline/float/split/cover layout are present; complete media selection, video-specific tests, responsive/accessibility work and richer background controls.
- [ ] Native media selection/import and optional attributed remote image search with privacy and credential boundaries.
- [ ] Custom CSS with parsing/size policy, isolation, safe export boundaries, reset and live preview; do not execute script or inline event attributes.
- [ ] Responsive design previews for desktop/tablet/mobile verified at representative widths and zoom levels.
- [~] Respondent controls receive accessible names/descriptions, validation errors use live alerts, progress has ARIA values, completion focus moves to its heading, and keyboard focus indicators are visible. Full keyboard/screen-reader/contrast/reduced-motion audit and assistive-technology E2E remain.
- [~] Preview-device controls and zoom exist; test editing/preview state retention and response reset/restart flows.

### D. Settings, security, localization, sharing metadata (`webapp`, `shared-types-enums`)

- [~] UTC opening/closing schedule and custom closed message exist; add IANA timezone selection, DST-safe behavior, expiration enable switch and transitions.
- [~] Response count limit and multiple-response control; define reliable local semantics and preserve distinction between quotas, per-person identity, and IP limits.
- [ ] Password gate with secure local verification for local preview/export only; hosted protection must be server-enforced and use modern password hashing.
- [ ] Metadata title/description/social preview image, completion redirect controls and safe http/https validation/confirmation.
- [ ] Publish/unpublish lifecycle and form archive/trash/restore/retention flows for local project files.
- [~] Translated form/field strings, canonical-choice display labels, confirmation button/message and closed-form message are editable; translated validation/system controls, dates, terms, pluralization and runtime locale formatting remain.
- [~] A self-contained offline HTML respondent page and local iframe embed snippet are exported with a CSP hash, no external connections, local response storage and downloadable response JSON. Hosted links/QR are out of scope; standalone mode currently uses an all-at-once flow, omits remote media and does not reproduce every advanced branching/navigation feature.
- [service] Custom domains, remove-branding plan controls, remote publish links and tenant-aware access controls.

### E. Responses, analytics, reports, import/export (`webapp`, `answer-utils`)

- [~] Local response collection, search, details, delete/clear, quiz-score review, formula-neutralized CSV, JSON export with attachment bytes, importing offline respondent JSON into the matching form, and submission-only question/quiz summaries exist. Remaining: date/answer filters, sorting, paging, storage quota/recovery UX and export selected/filtered subsets.
- [ ] Response table: sort, filter by date/answer/category, pagination, selection, edit answer, delete and bulk category changes.
- [~] Response export: CSV/JSON, quoted cells, formula neutralization, Unicode and nested fields are supported; add selectable columns, selected/filtered subsets, explicit upload packaging and broader round-trip tests.
- [~] Local analytics: submission date-window counts, answer distributions, numeric means and quiz-score average with question-level sample counts are implemented. Published views/starts/completions/drop-off need instrumented respondent traffic and are intentionally not inferred from preview submissions.
- [ ] Report generation/export and saved filters; never infer server-side views or uniqueness from local previews.
- [ ] Form import from reference-neutral JSON/CSV, duplicate/clone/rename, schema migration diagnostics and recovery UI.
- [ ] Standalone respondent HTML bundle and print-friendly form; review embedded data, CSP, URL fetching, storage and accessibility before calling it shareable.

### F. Embed behaviors (`embed`)

- [ ] Inline mount with configurable width/height, transparent background and safe resize messaging.
- [ ] Popup with open/close/toggle, placement, trigger and focus restoration.
- [ ] Modal with dimensions, backdrop, Escape behavior, scroll locking and focus trap.
- [ ] Full-page respondent mount with presentation configuration.
- [ ] Hidden-field configuration, form-id validation, duplicate-init protection, teardown, resize and postMessage origin checks.
- [ ] ReveLith-local export should provide static HTML or a local route only; a hosted URL/embed requires a publishing service.

### G. Web app/product administration (`webapp`, `server`)

- [ ] Local workspace/project analog for document organization, form listing, search, duplication, trash, retention and restore.
- [service] Registration/login, email verification, password reset, OAuth/OIDC and session/token revocation.
- [service] Tenant/workspace/team/project roles, invitations, access checks, transfer/leave/delete, audit trail and invite-code lifecycle.
- [service] S3-compatible uploads, signed URLs, malware/content checks, quotas and retention cleanup.
- [service] Email notification delivery, templates, queue/retry/dead-letter behavior, unsubscribe/privacy policy and deletion alerts.
- [service] Google Analytics/Facebook Pixel/other integrations, secret encryption, scopes, consent, disconnect, webhook signatures and delivery logs.
- [service] Stripe onboarding/payments/revocation, intent verification, webhook idempotency and billing boundary.
- [service] CAPTCHA, spam filtering, rate limiting, IP quotas and public respondent endpoints.
- [service] Hosted analytics/reporting, public form endpoints, custom domains, server-side expiration/suspension, tenant-isolated data and backups.
- [ ] ReveLith AI tools for every supported local action; declare narrow schemas, runtime-check all input, return mutation summaries, preserve undo/save state, and test local-provider tool-call execution. Never expose arbitrary filesystem, network, code execution or server administration tools.

## Implementation sequence and exact work locations

### Phase 0 — baseline and contracts

- [x] Read the seven reference package public exports, core types/enums, webapp route families, server resolver families and package manifests; maintain references read-only.
- [x] Snapshot current ReveLith Forms Builder typecheck, unit tests, production build and authoring E2E; inspect shell/save/AI interfaces before feature changes.
- [ ] Map every checklist row to acceptance tests and add explicit serialization/version migration cases before schema growth.
- Paths: `apps/forms-builder/src/renderer/types.ts`, `schema.ts`, `App.tsx`, `README.md`, `FORM_BUILDER_PARITY_PLAN.md`, this checklist.

### Phase 1 — fields, media, and editor fidelity

- [ ] Expand field types/choice model and migration/validation in `src/renderer/types.ts`, `src/renderer/schema.ts`.
- [~] Complete the per-choice editor and rich content controls in `src/renderer/components/PropertiesPane.tsx`; basic field media/layout/background controls are implemented. Confirm first-class score/correctness editing and keyboard reorder before marking complete.
- [~] Complete responsive/accessibility verification for fields, media modes, nested groups and form canvas; core field/media rendering is implemented in `FieldRenderer.tsx`.
- [~] Extend and test AI tools in `App.tsx` for all supported native field, choice, media and translation operations; tool schemas/runtime bounds are present, live provider invocation still needs direct E2E coverage.
- [~] Schema media URL/layout unit tests and image layout Electron E2E are implemented. Image network failure is covered as editor resilience; add video error and save/reopen coverage.

### Phase 2 — answer/runtime correctness and localization

- [ ] Extract deterministic validation, payload serialization and rule calculation modules under `src/renderer/form-runtime/`.
- [ ] Complete supported comparison/action matrix, branching preview, timeouts and DST-aware IANA schedule conversion.
- [~] Editable form/field/choice translations and custom language tags plus bundled offline UI strings and locale formatting exist in `translations.ts`; automatic language detection, full field-label translations and locale E2E remain.
- [ ] Tests: property/fuzz-style bounded cases for validation/serialization, every operator/action, locales, dates, timezones/DST and nested values; E2E for each respondent path.

### Phase 3 — local responses, analytics, and share artifacts

- [~] Local attachment blobs use IndexedDB with response references, file count/size/type restrictions, recognized content signatures, JSON packaging with bytes, downloads and reference-aware cleanup; add progress/cancel/retry, expanded signature coverage, storage migration/quota/recovery reporting.
- [~] Add response filter/table/category/edit/export and offline analytics/report views under `components/` and pure calculations under `form-runtime/`; basic local analytics and CSV/JSON exports are now implemented.
- [~] Add single-file offline respondent HTML export with CSP, safe text rendering, local-only response storage/download, returned response JSON import, and iframe snippet. Hosted links/QR and full parity for advanced rules/navigation in standalone remain.
- [~] Unit tests cover CSV formula defense, nested labels/answers, local response analytics and attachment validation; E2E covers attachment persistence/download/deletion. Add large/quota/malicious/Unicode export cases, filtered JSON/CSV and standalone HTML CSP/escaping.

### Phase 4 — accessibility, security review, regression, and release

- [~] Visible focus, accessible control names/descriptions, announced errors, form progress semantics and completion focus are implemented. Complete keyboard/screen-reader/contrast/reduced-motion audit and responsive checks remain.
- [ ] Threat review for uploaded files, remote image/video URLs, export, storage, redirect URLs, AI tool boundaries, and local-vs-hosted claims.
- [ ] Verify save/open/save-as/autosave/close prompts and shell/AI integration remain functional.
- [ ] Run Forms Builder tests, typecheck, production build, all Forms Builder E2E and adjacent shell lifecycle/agent E2E after remaining implementation phases; document exact results and remaining service dependencies.

## Compatibility and protection rules

- Never modify `assets/packages/**`; do not add these packages as dependencies. Use ReveLith-owned implementations only.
- Keep existing Electron shell lifecycle, local file save/open/autosave, ReveLith chat/provider/web-search connection, agent permission boundary and other apps intact.
- Keep local form content and answers local unless a separately approved backend capability has a privacy, authentication, tenant-isolation, encryption, retention, and failure design.
- Validate untrusted form JSON, AI tool calls, URLs, text, lists, file metadata, condition references and exports at runtime; bound sizes/depth and preserve unknown top-level extensions in migrations.
- Hosted auth, payment, upload, email, integration and tenant features cannot be reported as working based on local mocks or inert buttons.
- A phase is complete only when its data model, UI, runtime, AI tool path where relevant, persistence, tests, docs and regression check are all complete.

## Current implementation status

Verified for the current offline-language/file/accessibility/export changes: Forms Builder typecheck, production Electron build, and Vitest (10 files, 33 tests) pass. Nine focused desktop E2Es pass, including the existing eight authoring/response tests plus an interactive standalone HTML test that submits a response and verifies the downloaded JSON carries actual PDF bytes. The uploaded-file response E2E also verifies the local JSON response package contains actual bytes. Every `[ ]`, `[~]`, and `[service]` remains unfinished scope; this work does not complete overall feature parity.
