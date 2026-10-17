import { expect, test } from '@playwright/test'
import { closeAndSaveVideo, launchShell } from './helpers'

const apps = [
  {
    kind: 'forms',
    slug: 'forms-builder',
    launch: 'newFormsBuilder',
    tool: 'add_form_field',
    result: 'Added E2E question',
    input: { type: 'text', label: 'E2E question' },
  },
  {
    kind: 'tasks',
    slug: 'tasks',
    launch: 'newTasks',
    tool: 'create_task',
    result: 'Created “E2E task”',
    input: { title: 'E2E task' },
  },
  {
    kind: 'drawboard',
    slug: 'drawboard',
    launch: 'newDrawboard',
    tool: 'add_board_text',
    result: 'Added board text',
    input: { text: 'E2E note', x: 100, y: 100 },
  },
] as const

test('Shell opens each integrated app and its ReveLith Chat panel', async () => {
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'app-integrations' })
  const { app, page } = launched

  try {
    for (const item of apps) {
      const workspaceSlug = item.slug === 'drawboard' ? 'whiteboard' : item.slug
      await page.evaluate(async (method) => {
        const api = window.aiOffice as unknown as Record<string, () => Promise<void>>
        await api[method]?.()
      }, item.launch)

      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const api = (
                window as Window & {
                  aiOfficeTabs: { list: () => Promise<Array<{ kind: string }>> }
                }
              ).aiOfficeTabs
              return (await api.list()).map((tab) => tab.kind)
            }),
          { message: `${item.kind} should be registered in the Shell tab strip` },
        )
        .toContain(item.kind)

      await expect
        .poll(
          async () =>
            app.evaluate(({ BrowserWindow }, slug) => {
              const window = BrowserWindow.getAllWindows()[0]
              const child = window?.contentView.children.find((view) =>
                view.webContents.getURL().includes(`/apps/${slug}/out/renderer/index.html`),
              )
              return child?.webContents.getURL() ?? ''
            }, workspaceSlug),
          { message: `${item.kind} app should load in a Shell tab` },
        )
        .toContain(workspaceSlug)

      const chatOpened = await app.evaluate(async ({ BrowserWindow }, slug) => {
        const window = BrowserWindow.getAllWindows()[0]
        const child = window?.contentView.children.find((view) =>
          view.webContents.getURL().includes(`/apps/${slug}/out/renderer/index.html`),
        )
        if (!child) return false
        return child.webContents.executeJavaScript(
          "Boolean(document.querySelector('.revelith-app-chat, .revelith-board-chat'))",
        )
      }, workspaceSlug)
      expect(chatOpened, `${item.kind} app should mount the shared Chat panel`).toBe(true)

      await expect
        .poll(
          () =>
            app.evaluate(async ({ BrowserWindow }, slug) => {
              const window = BrowserWindow.getAllWindows()[0]
              const child = window?.contentView.children.find((view) =>
                view.webContents.getURL().includes(`/apps/${slug}/out/renderer/index.html`),
              )
              if (!child) return false
              return child.webContents.executeJavaScript(
                "Boolean(document.querySelector('.revelith-app-chat, .revelith-board-chat'))",
              )
            }, workspaceSlug),
          { message: `${item.kind} Chat panel should mount` },
        )
        .toBe(true)

      const toolCalls =
        item.kind === 'tasks'
          ? [
              { tool: 'create_project', input: { name: 'E2E Project', key: 'E2E' } },
              { tool: 'create_task', input: { title: 'E2E task', project: 'E2E' } },
            ]
          : [{ tool: item.tool, input: item.input }]
      await app.evaluate(
        ({ ipcMain }, action) => {
          let turn = 0
          ipcMain.removeHandler('ai:stream')
          ipcMain.handle('ai:stream', (event, request: { requestId: string }) => {
            const tool = action.toolCalls[turn]
            if (tool) {
              turn += 1
              event.sender.send('ai:stream-chunk', {
                requestId: request.requestId,
                type: 'tool-call',
                toolCall: { id: `e2e-action-${turn}`, name: tool.tool, input: tool.input },
              })
            } else {
              event.sender.send('ai:stream-chunk', {
                requestId: request.requestId,
                type: 'delta',
                text: 'Completed the requested app update.',
              })
            }
            event.sender.send('ai:stream-chunk', { requestId: request.requestId, type: 'done' })
          })
        },
        { toolCalls },
      )

      const ready = await app.evaluate(async ({ BrowserWindow }, slug) => {
        const window = BrowserWindow.getAllWindows()[0]
        const child = window?.contentView.children.find((view) =>
          view.webContents.getURL().includes(`/apps/${slug}/out/renderer/index.html`),
        )
        if (!child) return false
        return child.webContents.executeJavaScript(
          'Boolean(document.querySelector(".revelith-app-chat textarea:not(:disabled), .revelith-board-chat textarea:not(:disabled)"))',
        )
      }, workspaceSlug)
      expect(ready, `${item.kind} Chat should load ReveLith AI settings`).toBe(true)

      const sent = await app.evaluate(async ({ BrowserWindow }, slug) => {
        const window = BrowserWindow.getAllWindows()[0]
        const child = window?.contentView.children.find((view) =>
          view.webContents.getURL().includes(`/apps/${slug}/out/renderer/index.html`),
        )
        if (!child) return false
        return child.webContents.executeJavaScript(`(() => {
          const host = document.querySelector('.revelith-app-chat, .revelith-board-chat');
          const input = host?.querySelector('textarea');
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
          if (!input || !setter) return false;
          setter.call(input, 'Please make the requested app change.');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const send = [...(host?.querySelectorAll('button') ?? [])].find((button) => /send/i.test(button.getAttribute('aria-label') ?? ''));
          if (!send || send.disabled) return false;
          send.click();
          return true;
        })()`)
      }, workspaceSlug)
      expect(sent, `${item.kind} Chat should submit a request`).toBe(true)

      await expect
        .poll(
          () =>
            app.evaluate(async ({ BrowserWindow }, slug) => {
              const window = BrowserWindow.getAllWindows()[0]
              const child = window?.contentView.children.find((view) =>
                view.webContents.getURL().includes(`/apps/${slug}/out/renderer/index.html`),
              )
              if (!child) return ''
              return child.webContents.executeJavaScript(
                'document.querySelector(".revelith-app-chat-log, .board-chat-log")?.innerText ?? ""',
              )
            }, workspaceSlug),
          { message: `${item.kind} agent should execute its app tool and finish the AI turn` },
        )
        .toContain('Completed the requested app update.')

      const toolReported = await app.evaluate(async ({ BrowserWindow }, slug) => {
        const window = BrowserWindow.getAllWindows()[0]
        const child = window?.contentView.children.find((view) =>
          view.webContents.getURL().includes(`/apps/${slug}/out/renderer/index.html`),
        )
        if (!child) return ''
        return child.webContents.executeJavaScript(
          'document.querySelector(".revelith-app-chat-log, .board-chat-log")?.innerText ?? ""',
        )
      }, workspaceSlug)
      // Drawboard has its own vision-aware chat transcript and reports the
      // mocked tool step as activity rather than the shared text summary.
      if (item.kind === 'tasks') expect(toolReported).toContain('E2E task')
      else if (item.kind !== 'drawboard') expect(toolReported).toContain(item.result)
    }
  } finally {
    await closeAndSaveVideo(launched, 'app-integrations')
  }
})
