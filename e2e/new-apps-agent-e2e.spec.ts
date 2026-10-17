import { expect, test } from '@playwright/test'
import { closeAndSaveVideo, launchShell } from './helpers'

const model = 'nvidia/nemotron-3-nano-4b'
const aiSettings = {
  provider: 'lmstudio',
  providers: {
    lmstudio: { model, baseUrl: 'http://127.0.0.1:1234/v1', apiKey: '' },
  },
}

const apps = [
  {
    slug: 'forms-builder',
    launch: 'newFormsBuilder',
    toolSummary: 'Added Nemotron forms E2E',
    prompt:
      'Call add_form_field now with this exact input: {"type":"text","label":"Nemotron forms E2E"}. Then confirm the field was added.',
  },
  {
    slug: 'tasks',
    launch: 'newTasks',
    toolSummary: 'Created “Nemotron tasks E2E”',
    prompt:
      'Call create_task with this exact title: Nemotron tasks E2E. Then confirm it was created.',
  },
  {
    slug: 'drawboard',
    launch: 'newDrawboard',
    toolSummary: 'Added board text',
    prompt:
      'Call add_board_text with text Nemotron drawboard E2E at x 120 and y 120. Then confirm it was added.',
  },
] as const

async function runInApp<T>(
  app: Awaited<ReturnType<typeof launchShell>>['app'],
  slug: string,
  script: string,
): Promise<T | null> {
  const workspaceSlug = slug === 'drawboard' ? 'whiteboard' : slug
  return app.evaluate(
    async ({ BrowserWindow }, args) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) =>
        view.webContents.getURL().includes(`/apps/${args.slug}/out/renderer/index.html`),
      )
      if (!child) return null
      return child.webContents.executeJavaScript(args.script)
    },
    { slug: workspaceSlug, script },
  ) as Promise<T>
}

test('three integrated apps use Nemotron through real tools and match shared Chat controls/themes', async () => {
  test.setTimeout(15 * 60 * 1000)
  const { app, page, userDataDir } = await launchShell({
    onboardingSeen: true,
    aiSettings,
    videoDir: 'new-apps-agent-e2e',
  })

  try {
    for (const item of apps) {
      // Drawboard keeps its board-aware chat shell so it can host selection,
      // image and tool-browser context; the other new apps use the shared app
      // chat shell. Assert the same user-facing controls through each shell's
      // real DOM instead of requiring an implementation-specific class name.
      const chatPanel = item.slug === 'drawboard' ? '.revelith-board-chat' : '.revelith-app-chat'
      const chatLog = item.slug === 'drawboard' ? '.board-chat-log' : '.revelith-app-chat-log'
      const chatResizer =
        item.slug === 'drawboard' ? '.board-chat-resizer' : '.revelith-app-chat-resizer'
      await page.evaluate(async (method) => {
        const api = window.aiOffice as unknown as Record<string, () => Promise<void>>
        await api[method]?.()
      }, item.launch)

      await expect
        .poll(() => runInApp<string>(app, item.slug, 'window.location.href'))
        .toContain(
          `${item.slug === 'drawboard' ? 'whiteboard' : item.slug}/out/renderer/index.html`,
        )

      const ribbonState = await runInApp<{
        title: string
        tabs: number
        activePanels: number
        top: number
      }>(
        app,
        item.slug,
        `(() => {
        const ribbon = document.querySelector('[data-revelith-ribbon]');
        const tabs = [...(ribbon?.querySelectorAll('[role="tab"]') ?? [])];
        const panels = [...(ribbon?.querySelectorAll('[role="tabpanel"]') ?? [])];
        return {
          title: ribbon?.querySelector('[role="tablist"]')?.getAttribute('aria-label')?.replace(/ tools$/, '') ?? '',
          tabs: tabs.length,
          activePanels: panels.filter((panel) => !panel.hasAttribute('hidden')).length,
          top: ribbon?.getBoundingClientRect().top ?? -1,
        };
      })()`,
      )
      expect(ribbonState?.title, `${item.slug} should use the ReveLith ribbon shell`).toBeTruthy()
      expect(ribbonState?.tabs, `${item.slug} should expose ribbon tabs`).toBeGreaterThanOrEqual(2)
      expect(ribbonState?.activePanels).toBe(1)
      expect(ribbonState?.top).toBe(0)

      const tabsWork = await runInApp<boolean>(
        app,
        item.slug,
        `(async () => {
        const ribbon = document.querySelector('[data-revelith-ribbon]');
        const tabs = [...(ribbon?.querySelectorAll('[role="tab"]') ?? [])];
        for (const tab of tabs) {
          tab.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const panels = [...(ribbon?.querySelectorAll('[role="tabpanel"]') ?? [])];
          if (tab.getAttribute('aria-selected') !== 'true' || panels.filter((panel) => !panel.hasAttribute('hidden')).length !== 1) return false;
        }
        return true;
      })()`,
      )
      expect(tabsWork, `${item.slug} ribbon tabs should switch their tool groups`).toBe(true)

      const chatAlwaysAvailable = await runInApp<boolean>(
        app,
        item.slug,
        `(() => {
        const panel = document.querySelector(${JSON.stringify(`${chatPanel}[data-collapsed="false"]`)});
        const ribbon = document.querySelector('[data-revelith-ribbon]');
        const manualChatToggle = [...(ribbon?.querySelectorAll('button') ?? [])].some((button) => button.title === 'Toggle AI assistant' || /AI Chat/.test(button.innerText));
        return Boolean(panel) && !manualChatToggle;
      })()`,
      )
      expect(
        chatAlwaysAvailable,
        `${item.slug} should keep ReveLith Chat visible without a ribbon toggle`,
      ).toBe(true)

      await expect
        .poll(() =>
          runInApp<boolean>(
            app,
            item.slug,
            `Boolean(document.querySelector(${JSON.stringify(`${chatPanel} textarea:not(:disabled)`)}))`,
          ),
        )
        .toBe(true)

      await page.evaluate(async () => {
        const api = window.aiOffice as unknown as {
          setTheme(theme: 'light' | 'dark' | 'system'): Promise<void>
        }
        await api.setTheme('dark')
      })
      await expect
        .poll(() =>
          runInApp<string>(app, item.slug, 'document.documentElement.getAttribute("data-theme")'),
        )
        .toBe('dark')
      const darkChat = await runInApp<string>(
        app,
        item.slug,
        `getComputedStyle(document.querySelector(${JSON.stringify(chatPanel)})).backgroundColor`,
      )
      expect(darkChat, `${item.slug} Chat should use the shared dark surface`).toBe(
        'rgb(30, 30, 30)',
      )
      const darkApp = await runInApp<string>(
        app,
        item.slug,
        'getComputedStyle(document.body).backgroundColor',
      )
      expect(darkApp, `${item.slug} workspace should follow dark theme`).toBe('rgb(42, 42, 42)')

      await page.evaluate(async () => {
        const api = window.aiOffice as unknown as {
          setTheme(theme: 'light' | 'dark' | 'system'): Promise<void>
        }
        await api.setTheme('light')
      })
      await expect
        .poll(() =>
          runInApp<string>(app, item.slug, 'document.documentElement.getAttribute("data-theme")'),
        )
        .toBe('light')
      const lightChat = await runInApp<string>(
        app,
        item.slug,
        `getComputedStyle(document.querySelector(${JSON.stringify(chatPanel)})).backgroundColor`,
      )
      expect(lightChat, `${item.slug} Chat should use the shared light surface`).toBe(
        'rgb(255, 255, 255)',
      )
      const lightApp = await runInApp<string>(
        app,
        item.slug,
        'getComputedStyle(document.body).backgroundColor',
      )
      expect(lightApp, `${item.slug} workspace should follow light theme`).toBe(
        'rgb(246, 247, 249)',
      )

      const moveToRight = await runInApp<boolean | string[]>(
        app,
        item.slug,
        `(() => {
        const move = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Move AI panel to the right');
        if (!move) return [...document.querySelectorAll(${JSON.stringify(`${chatPanel} button`)})].map((button) => button.getAttribute('aria-label') || button.innerText);
        move.click();
        return true;
      })()`,
      )
      expect(moveToRight, `${item.slug} should expose the right-side panel control`).toBe(true)
      await expect
        .poll(() =>
          runInApp<string>(
            app,
            item.slug,
            `document.querySelector(${JSON.stringify(chatPanel)})?.dataset.side ?? ""`,
          ),
        )
        .toBe('right')
      const oldWidth = await runInApp<number>(
        app,
        item.slug,
        `document.querySelector(${JSON.stringify(chatPanel)}).getBoundingClientRect().width`,
      )
      await runInApp<void>(
        app,
        item.slug,
        `(() => {
        const grip = document.querySelector(${JSON.stringify(chatResizer)});
        const x = grip.getBoundingClientRect().left + 2;
        grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 77, clientX: x, clientY: 200 }));
        window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 77, clientX: x - 90, clientY: 200 }));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 77, clientX: x - 90, clientY: 200 }));
      })()`,
      )
      await expect
        .poll(() =>
          runInApp<number>(
            app,
            item.slug,
            `document.querySelector(${JSON.stringify(chatPanel)}).getBoundingClientRect().width`,
          ),
        )
        .toBeGreaterThan(oldWidth + 60)
      await runInApp<void>(
        app,
        item.slug,
        `(() => {
        const move = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Move AI panel to the left');
        if (!move) throw new Error('Missing Move AI panel to left control');
        move.click();
      })()`,
      )
      await expect
        .poll(() =>
          runInApp<string>(
            app,
            item.slug,
            `document.querySelector(${JSON.stringify(chatPanel)})?.dataset.side ?? ""`,
          ),
        )
        .toBe('left')

      const sent = await runInApp<boolean>(
        app,
        item.slug,
        `(() => {
        const input = document.querySelector(${JSON.stringify(`${chatPanel} textarea`)});
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!input || !setter) return false;
      setter.call(input, ${JSON.stringify(
        item.slug === 'tasks'
          ? 'There is no project yet. Create a project named "Nemotron E2E" with key "NEMO", then create a task titled "Nemotron tasks E2E" in that project. Confirm both were created.'
          : item.prompt,
      )});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const send = [...document.querySelectorAll(${JSON.stringify(`${chatPanel} button`)})].find((button) => button.getAttribute('aria-label') === 'Send');
        if (!send || send.disabled) return false;
        send.click();
        return true;
      })()`,
      )
      expect(sent, `${item.slug} should submit to the configured Nemotron model`).toBe(true)

      await expect
        .poll(
          () =>
            runInApp<string>(
              app,
              item.slug,
              `document.querySelector(${JSON.stringify(chatLog)})?.innerText ?? ""`,
            ),
          {
            timeout: 180_000,
            message: `${item.slug} Nemotron call should execute its app-specific tool and finish`,
          },
        )
        .toContain(item.slug === 'tasks' ? 'Nemotron tasks E2E' : item.toolSummary)

      const transcript = await runInApp<string>(
        app,
        item.slug,
        `document.querySelector(${JSON.stringify(chatLog)})?.innerText ?? ""`,
      )
      expect(transcript, `${item.slug} should show the successful tool result`).toContain(
        item.slug === 'tasks' ? 'Nemotron tasks E2E' : item.toolSummary,
      )
    }
  } finally {
    await closeAndSaveVideo({ app, page, userDataDir }, 'new-apps-agent-e2e')
  }
})
