# ReveLith app modules

The Forms Builder, Tasks, and AI Draw modules live in the main ReveLith workspace and open as tabs in the ReveLith Shell. The Shell supplies their ReveLith AI settings, streamed model requests, and web search. Its separate OCR support remains available to PDF workflows.

## Apps

| Module        | Workspace                 | Renderer port | Chat tools                                             |
| ------------- | ------------------------- | ------------: | ------------------------------------------------------ |
| Forms Builder | `@revelith/forms-builder` |          5180 | Read and edit form details and fields                  |
| Tasks         | `@revelith/tasks`         |          5181 | List, create, update, move, and delete tasks           |
| AI Draw       | `@revelith/drawboard`     |          5182 | Inspect the drawing, add text, notes, and shapes, undo |

Each Chat also has the shared ReveLith web search tool. App operations use the active app state and apply changes directly to that app.

## Selected-content Ask AI and shortcuts

Tasks, Forms Builder, and Draw each provide an explicit Ask AI action for the current task, form field, or Draw selection. These runs are read-only, exclude unrelated app context and staged attachments, and use bounded selection data. Tasks sends its selected-task context to the AI provider configured by the user, which may be remote; the Ask AI button discloses the data included. Forms Builder and Draw still require a same-device loopback provider (`localhost`, `127.0.0.0/8`, or `::1`) and refuse cloud endpoints before sending selection data. Normal chat follows the configured provider. The Tasks and Forms shortcut dialogs show counts from their shortcut maps; Draw opens the drawing engine's built-in shortcut reference and displays its row count after the first open.

Selection analysis does not edit app data or send attachments/tools. The provider boundary is enforced in the shared Chat request path for Forms and in Draw's own chat path; Tasks intentionally allows the already configured provider after the user clicks Ask AI. Unit and Playwright coverage uses local mock endpoints.

## Run and verify

Run the full desktop Shell with all module renderer servers:

```powershell
npm run dev
```

Build the production modules and Shell:

```powershell
npm run build:all
```

Run the integrated-app Shell and Chat E2E check (after building):

```powershell
npx playwright test --config e2e/playwright.config.ts e2e/app-integrations.spec.ts
```

The standalone module dev commands remain available for app UI development. Use the Shell run above when checking ReveLith Chat and shared Shell services.
