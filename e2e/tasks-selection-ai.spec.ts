import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { expect, test } from '@playwright/test'
import { closeAndSaveVideo, launchShell } from './helpers'

type ShellApp = Awaited<ReturnType<typeof launchShell>>['app']

async function inTasks<T>(app: ShellApp, script: string): Promise<T> {
  return app.evaluate(async ({ BrowserWindow }, code) => {
    const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) =>
      (candidate as unknown as { webContents: { getURL(): string } }).webContents
        .getURL()
        .includes('/apps/tasks/out/renderer/index.html'),
    ) as unknown as { webContents: { executeJavaScript(code: string): Promise<T> } } | undefined
    if (!view) throw new Error('AI Tasks view is not open')
    return view.webContents.executeJavaScript(code)
  }, script) as Promise<T>
}

async function setDialogInput(app: ShellApp, value: string, index = 0): Promise<void> {
  await inTasks<void>(
    app,
    `(() => {
    const input = document.querySelectorAll('[role="dialog"] input')[${index}];
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing dialog input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing input setter');
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`,
  )
}

test('AI Tasks streams selected-content tokens live while preserving scope and shortcuts', async () => {
  test.setTimeout(180_000)
  const requests: Array<{ body: Record<string, any>; text: string }> = []
  let streamPaused = false
  let responseFinished = false
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const body = JSON.parse(raw) as Record<string, any>
    const messages = Array.isArray(body.messages) ? body.messages : []
    const text = messages
      .map((message: any) => {
        const content = message.content
        return typeof content === 'string' ? content : JSON.stringify(content ?? '')
      })
      .join('\n')
    requests.push({ body, text })
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    const emit = (content: string, finishReason: string | null = null) => {
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: content ? { content } : {}, finish_reason: finishReason }] })}\n\n`,
      )
    }
    emit('The selected cards are clear;')
    for (let index = 1; index <= 60; index++) {
      emit(`\n\nStreamed task insight ${index}`)
      if (index === 40) {
        // Leave a long, overflowing partial answer on screen so the E2E can
        // inspect whether the chat follows streamed tokens before completion.
        streamPaused = true
        await new Promise((resolve) => setTimeout(resolve, 1_500))
        streamPaused = false
      } else {
        await new Promise((resolve) => setTimeout(resolve, 12))
      }
    }
    emit('\n\nConfirm the first dependency before advancing them.')
    emit('', 'stop')
    response.write('data: [DONE]\n\n')
    response.end()
    responseFinished = true
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Could not start the local Tasks analysis model.')

  let launched: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'tasks-selection-ai',
      aiSettings: {
        provider: 'custom',
        providers: {
          custom: {
            model: 'tasks-selection-test',
            baseUrl: `http://127.0.0.1:${address.port}/v1`,
            apiKey: '',
          },
        },
      },
    })
    const { app, page } = launched
    await page.evaluate(() =>
      (window as unknown as { aiOffice: { newTasks(): Promise<void> } }).aiOffice.newTasks(),
    )
    await expect
      .poll(() =>
        app.evaluate(
          ({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.contentView.children.some((candidate) =>
              (candidate as unknown as { webContents: { getURL(): string } }).webContents
                .getURL()
                .includes('/apps/tasks/out/renderer/index.html'),
            ) ?? false,
        ),
      )
      .toBe(true)
    await expect.poll(() => inTasks<string>(app, 'document.title')).toContain('Tasks')

    await inTasks<void>(
      app,
      `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'New project')?.click())()`,
    )
    await expect
      .poll(() =>
        inTasks<boolean>(
          app,
          'Boolean(document.querySelector(\'[role="dialog"][aria-label="New project"]\'))',
        ),
      )
      .toBe(true)
    await setDialogInput(app, 'Selection AI E2E')
    await setDialogInput(app, 'SCOPE', 1)
    await inTasks<void>(
      app,
      `(() => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === 'Create project')?.click())()`,
    )
    await expect
      .poll(() => inTasks<string>(app, 'document.body.innerText'))
      .toContain('Selection AI E2E')

    const addTask = async (title: string) => {
      await inTasks<void>(
        app,
        `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'New task')?.click())()`,
      )
      await expect
        .poll(() =>
          inTasks<boolean>(
            app,
            'Boolean(document.querySelector(\'[role="dialog"][aria-label="New task"]\'))',
          ),
        )
        .toBe(true)
      await setDialogInput(app, title)
      await inTasks<void>(
        app,
        `(() => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === 'Create task')?.click())()`,
      )
      await expect.poll(() => inTasks<string>(app, 'document.body.innerText')).toContain(title)
    }
    await addTask('Selected release checklist')
    await addTask('Selected validation task')
    await addTask('Private decoy task')

    await inTasks<void>(
      app,
      `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'List')?.click())()`,
    )
    await expect
      .poll(() => inTasks<number>(app, 'document.querySelectorAll(".tasks-task-row").length'))
      .toBe(3)
    await inTasks<void>(
      app,
      `(() => {
      for (const title of ['Selected release checklist', 'Selected validation task']) {
        const row = [...document.querySelectorAll('.tasks-task-row')].find((candidate) => candidate.textContent?.includes(title));
        const checkbox = row?.querySelector('input[type="checkbox"]');
        if (!(checkbox instanceof HTMLInputElement)) throw new Error('Missing selection checkbox for ' + title);
        checkbox.click();
      }
    })()`,
    )
    await expect
      .poll(() =>
        inTasks<boolean>(
          app,
          '[...document.querySelectorAll(\'[role="toolbar"][aria-label="Bulk actions"] button\')].some((button) => button.textContent?.includes("Ask AI about selected"))',
        ),
      )
      .toBe(true)
    const askButtonTitle = await inTasks<string>(
      app,
      `(() => [...document.querySelectorAll('[role="toolbar"][aria-label="Bulk actions"] button')].find((button) => button.textContent?.includes('Ask AI about selected'))?.title ?? '')()`,
    )
    expect(askButtonTitle).toContain('configured AI provider')
    expect(askButtonTitle).toContain('provider may be remote')
    await inTasks<void>(
      app,
      `(() => [...document.querySelectorAll('[role="toolbar"][aria-label="Bulk actions"] button')].find((button) => button.textContent?.includes('Ask AI about selected'))?.click())()`,
    )

    await expect.poll(() => requests.length, { timeout: 20_000 }).toBeGreaterThan(0)
    await expect
      .poll(
        () =>
          inTasks<string>(
            app,
            'document.querySelector(".revelith-app-chat-log")?.innerText ?? ""',
          ),
        { timeout: 1_200 },
      )
      .toContain('The selected cards')
    expect(responseFinished).toBe(false)
    await expect.poll(() => streamPaused, { timeout: 10_000 }).toBe(true)
    const partialScroll = await inTasks<{
      bottomGap: number
      lastParagraphVisible: boolean
      streaming: boolean
      text: string
    }>(
      app,
      `(() => {
        const log = document.querySelector('.revelith-app-chat-log');
        const message = log?.querySelector('.ai-msg-assistant:last-child');
        const paragraph = message?.querySelector('.ai-md p:last-child');
        if (!(log instanceof HTMLElement) || !paragraph) return { bottomGap: Infinity, lastParagraphVisible: false, streaming: false, text: log?.innerText ?? '' };
        const logRect = log.getBoundingClientRect();
        const paragraphRect = paragraph.getBoundingClientRect();
        return {
          bottomGap: log.scrollHeight - log.scrollTop - log.clientHeight,
          lastParagraphVisible: paragraphRect.top >= logRect.top && paragraphRect.bottom <= logRect.bottom,
          streaming: message?.classList.contains('ai-msg-streaming') ?? false,
          text: log.innerText,
        };
      })()`,
    )
    expect(responseFinished).toBe(false)
    expect(partialScroll.text).toContain('Streamed task insight 40')
    expect(partialScroll.streaming).toBe(true)
    expect(partialScroll.bottomGap).toBeLessThanOrEqual(2)
    expect(partialScroll.lastParagraphVisible).toBe(true)

    await inTasks<void>(
      app,
      `(() => {
        const log = document.querySelector('.revelith-app-chat-log');
        if (!(log instanceof HTMLElement)) throw new Error('Missing chat log');
        log.scrollTop = 0;
        log.dispatchEvent(new Event('scroll'));
      })()`,
    )
    expect(
      await inTasks<string>(
        app,
        'document.querySelector(".revelith-app-chat-log")?.innerText ?? ""',
      ),
    ).not.toContain('confirm the first dependency')
    const request = requests.at(-1)!
    expect(request.body.stream).toBe(true)
    expect(request.body.tools ?? []).toEqual([])
    expect(request.text).toContain(
      'Selected task context (2 of 2 requested; no other board tasks included)',
    )
    expect(request.text).toContain('Selected release checklist')
    expect(request.text).toContain('Selected validation task')
    expect(request.text).toContain('Visible card bounds (viewport CSS px)')
    expect(request.text).not.toContain('Private decoy task')
    await expect
      .poll(() =>
        inTasks<string>(app, 'document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'),
      )
      .toContain('The selected cards are clear')
    await expect
      .poll(() =>
        inTasks<string>(app, 'document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'),
      )
      .toContain('Analyzing selected content')
    await expect
      .poll(() =>
        inTasks<string>(app, 'document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'),
      )
      .toContain('Selected release checklist')
    await expect
      .poll(() =>
        inTasks<string>(app, 'document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'),
      )
      .toContain('Confirm the first dependency before advancing them.')
    await expect
      .poll(() =>
        inTasks<boolean>(
          app,
          'Boolean(document.querySelector(".revelith-app-chat-log .ai-msg-assistant:last-child")?.classList.contains("ai-msg-streaming"))',
        ),
      )
      .toBe(false)
    const finalScroll = await inTasks<{ bottomGap: number; scrollTop: number }>(
      app,
      `(() => {
        const log = document.querySelector('.revelith-app-chat-log');
        if (!(log instanceof HTMLElement)) return { bottomGap: Infinity, scrollTop: -1 };
        return {
          bottomGap: log.scrollHeight - log.scrollTop - log.clientHeight,
          scrollTop: log.scrollTop,
        };
      })()`,
    )
    expect(finalScroll.scrollTop).toBe(0)
    expect(finalScroll.bottomGap).toBeGreaterThan(100)

    await expect
      .poll(() =>
        inTasks<boolean>(
          app,
          '[...document.querySelectorAll("button")].some((button) => button.textContent?.includes("Shortcuts · 9"))',
        ),
      )
      .toBe(true)
    await inTasks<void>(
      app,
      `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Shortcuts · 9'))?.click())()`,
    )
    await expect
      .poll(() => inTasks<string>(app, 'document.querySelector("[role=dialog]")?.innerText ?? ""'))
      .toContain('Keyboard shortcuts (9)')
    await expect
      .poll(() => inTasks<string>(app, 'document.querySelector("[role=dialog]")?.innerText ?? ""'))
      .toContain('Move the open task to that column')
  } finally {
    if (launched) await closeAndSaveVideo(launched, 'tasks-selection-ai')
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
