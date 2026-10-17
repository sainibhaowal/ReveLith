# ReveLith Tasks

A local-first kanban app. No server, no database, no Docker, no account — every
board lives in `localStorage` and, optionally, in a `.json` file you control.

## Running it

```bash
npm install
npm run dev        # Electron
npm run dev:renderer   # browser only, on http://localhost:5181
npm test           # 280 tests
npm run typecheck
npm run build
```

The AI panel needs the Electron shell (it streams through `window.electronAPI`).
In browser mode the panel still renders and exposes quick-action tool buttons.

## What it does

| Area          | Capability                                                                                |
| ------------- | ----------------------------------------------------------------------------------------- |
| Projects      | Unlimited, each with its own columns, labels, custom fields and ticket key (`ENG-12`)     |
| Columns       | User-defined, reorderable, colourable, optional WIP limit, one or more "done" columns     |
| Tasks         | Priority (4 levels), start/due dates, estimates, time logging, archive, manual drag order |
| Labels        | Coloured, multi-assign, global or per-project                                             |
| Relations     | `blocks` / `blocked_by` / `relates_to` / `duplicates`                                     |
| Sub-tasks     | Nested one level, with progress on the parent card                                        |
| Comments      | Per task, with an author and timestamp                                                    |
| Custom fields | `text`, `number`, `date`, `select`, `checkbox`, validated on write                        |
| Attachments   | Files up to 25 MB, bytes in IndexedDB, image previews, metadata exported with the board   |
| Saved views   | Named filter + sort presets; persisted; the badge drops when you edit filters away        |
| Notifications | Derived live from board state: overdue, due soon, blocked, `@mentions`                    |
| Undo / redo   | 50 steps deep, `u` and `Ctrl/⌘+Z`; selection never pollutes the history                   |
| Keyboard      | `n`, `/`, `1`–`9`, `u`, `?`, `Esc` — all inert while typing                               |
| Search        | Titles, descriptions, ticket ids and label names, plus priority/label/overdue filters     |
| History       | Every mutation is recorded to a per-task activity log                                     |
| Export        | Markdown, CSV, JSON, and iCalendar (`.ics`) per project or for the whole board            |
| Files         | Open/save through the host shell, with autosave; legacy boards import automatically       |

### AI tools

The agent gets 38 tools over the same board the UI uses — there is no privileged
path. It addresses tasks by ticket id (`ENG-12`), title, or id; all three
resolve. Destructive tools (`delete_task`, `delete_project`, `delete_label`,
`delete_column`, `delete_saved_view`) state their irreversibility in the tool
description so the model can warn first.

The task detail and bulk-selection actions also offer read-only **Ask AI about
selected** analysis. It sends at most 12 selected tasks' titles, bounded
descriptions, project/column, priority, due date, labels, and visible card
bounds when available. It excludes unrelated tasks and attachments, and uses
the AI provider configured in ReveLith (which may be a cloud service). Clicking
Ask AI sends that bounded selection to the configured provider; the button
tooltip lists the data included. The shortcut button/dialog count is derived
from the same help map as the registered keyboard shortcuts.

## Architecture

```
src/
  domain/      pure types, ids, fractional ordering
  store/       reducer, selectors, persistence, migration, export,
               undo-aware store, attachments (IndexedDB), iCal, notifications
  ai/          resolvers, 38 tools, skill definition
  ui/          ribbon + chat panel primitives
  renderer/    React components
  test/        fixtures
```

Four rules hold it together:

1. **The reducer is the only writer.** The UI and the AI both dispatch `Action`
   objects; neither mutates state. A no-op action returns the _same_ reference so
   React skips the render and undo history stays clean.
2. **Selectors are pure functions of state.** Filtering, sorting, stats,
   relations and notifications are all derived — no cached or denormalised copies
   to invalidate.
3. **Ordering is fractional.** `position` is a float; a drag inserts the
   midpoint between neighbours, so reordering is one write rather than a renumber.
4. **Undo is whole-state snapshots**, capped at 50. Boards are kilobytes, so the
   simplicity is worth more than the memory — an inverse action per case would be
   a second place for the same invariant to drift.

### Why no `xmin` / no advisory locks

This replaces a single-process desktop board, so there is no cross-instance
write contention to serialise. Referential integrity that Postgres would enforce
with triggers is handled here in the reducer: deleting a parent promotes
sub-tasks rather than destroying them, deleting a column moves its tasks to a
survivor, and a column is never removed if it is the last one.

### Why filters live in board state

Saved views have to reference the current filters, and filters have to survive a
reload. Keeping them in the store rather than in a `useState` is what lets a view
be a plain data snapshot — and it means the AI tools see the same view the user
is looking at.

## Merging back into the ReveLith monorepo

This folder was developed standalone so it could build and test without the
host workspace. To fold it back into `ReveLith/apps/tasks`:

1. **Restore the workspace deps** in `package.json`:
   `@revelith/agent-core`, `@revelith/ai-provider`, `@revelith/app-chat`.

2. **Swap two local modules for the shared ones.** Both were written to match
   the upstream prop shape, so no call site changes:

   | Local                  | Shared                    | File                       |
   | ---------------------- | ------------------------- | -------------------------- |
   | `src/ui/Ribbon.tsx`    | `@revelith/ui`            | `AppRibbon`, `RibbonGroup` |
   | `src/ui/ChatPanel.tsx` | `@revelith/app-chat`      | `AppChatPanel`             |
   | `src/ui/tokens.css`    | `@revelith/ui/tokens.css` | CSS variables              |

   `tokens.css` deliberately reuses the upstream variable names
   (`--surface`, `--text-secondary`, `--border`, …), so restoring that import
   restyles nothing.

3. **Re-add the `main.tsx` side-effect imports** from `@revelith/ui` that the
   shell expects (`tokens.css`, `ai-panel-prefs.css`, `markdown.css`,
   `app-ribbon.css`) and `installAppChatShellTheme()`.

4. **Keep `tsconfig.json` inline.** The upstream version extends
   `../../tsconfig.base.json`; merge the `compilerOptions` rather than the file.

5. **Check `externalizeDepsPlugin`.** `CLAUDE.md` notes that workspace packages
   listed in an app's `dependencies` must also appear in its `exclude` list or
   the packaged app crashes on launch.

Nothing outside this folder was modified.
