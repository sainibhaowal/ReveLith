import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { expect, test } from '@playwright/test'
import { closeAndSaveVideo, launchShell } from './helpers'

const seedForm = {
  id: 'form-selection-e2e',
  version: 1,
  title: 'Selection analysis form',
  description: 'A form used to verify selected-field analysis.',
  fields: [
    {
      id: 'field-name',
      type: 'text',
      label: 'Name',
      required: true,
      helpText: 'Enter your name',
      validation: {},
      layout: { width: '100%' },
    },
    {
      id: 'field-private',
      type: 'text',
      label: 'Private decoy field',
      required: true,
      defaultValue: 'private-answer-sentinel',
      validation: {},
      layout: { width: '100%' },
    },
  ],
  settings: {
    submitButtonText: 'Submit',
    showProgressBar: false,
    allowMultipleResponses: true,
    collectEmail: false,
    confirmationMessage: 'Thanks',
    confirmationTitle: 'Response recorded',
    confirmationButtonText: 'Submit another response',
    showQuestionNumbers: false,
    closeOnLimit: false,
    locale: 'en',
    navigationMode: 'paged',
    showNavigationArrows: true,
    showQuizScore: false,
  },
  theme: {
    primaryColor: '#2563eb',
    backgroundColor: '#f8fafc',
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: 8,
    buttonStyle: 'filled',
    contentWidth: 'standard',
    questionSpacing: 'comfortable',
    labelPosition: 'top',
  },
}

test('Forms Builder sends only selected field data locally and exposes its shortcut list', async () => {
  test.setTimeout(120_000)
  const requests: Array<{ body: Record<string, any>; userText: string }> = []
  let responseFinished = false
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const body = JSON.parse(raw) as Record<string, any>
    const messages = Array.isArray(body.messages) ? body.messages : []
    const userText =
      [...messages].reverse().find((message: any) => message.role === 'user')?.content ?? ''
    requests.push({ body, userText: String(userText) })
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    const delta = (content: string) =>
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`,
      )
    delta('The selected Name field ')
    // Hold a partial response on screen long enough to prove the renderer is
    // showing incoming deltas, not only the completed assistant message.
    await new Promise((resolve) => setTimeout(resolve, 900))
    delta('is concise; ')
    delta('add a concrete example only ')
    delta('if users need formatting guidance.')
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
    )
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
    throw new Error('Could not start the local Forms analysis model.')

  let launched: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    launched = await launchShell({
      onboardingSeen: true,
      videoDir: 'forms-builder-selection-ai',
      aiSettings: {
        provider: 'custom',
        providers: {
          custom: {
            model: 'forms-selection-test',
            baseUrl: `http://127.0.0.1:${address.port}/v1`,
            apiKey: '',
          },
        },
      },
    })
    const { app, page } = launched
    const run = <T>(script: string) =>
      app.evaluate(async ({ BrowserWindow }, source) => {
        const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) =>
          candidate.webContents.getURL().toLowerCase().includes('forms-builder'),
        )
        return view?.webContents.executeJavaScript(source) as Promise<T> | undefined
      }, script) as Promise<T>

    await page.evaluate(() =>
      (
        window as unknown as { aiOffice: { newFormsBuilder(): Promise<void> } }
      ).aiOffice.newFormsBuilder(),
    )
    await expect
      .poll(() =>
        run<boolean>(
          'Boolean(document.querySelector(".revelith-app-chat textarea:not(:disabled)"))',
        ),
      )
      .toBe(true)
    await run<boolean>(`(() => {
      const session = new URLSearchParams(location.search).get('session') || 'browser';
      localStorage.setItem('revelith-forms-builder/draft/' + session, ${JSON.stringify(JSON.stringify(seedForm))});
      location.reload();
      return true;
    })()`)
    await expect
      .poll(() =>
        run<number>(
          'JSON.parse(localStorage.getItem("revelith-forms-builder/draft/" + (new URLSearchParams(location.search).get("session") || "browser")) || "{}").fields?.length ?? 0',
        ),
      )
      .toBe(2)

    await run<boolean>(`(() => {
      const field = document.querySelector('[data-form-field-id="field-name"]');
      if (!(field instanceof HTMLElement)) throw new Error('Selected field is not rendered');
      field.click();
      return true;
    })()`)
    await expect
      .poll(() =>
        run<boolean>(`(() => {
          const button = [...document.querySelectorAll('.forms-properties-pane button')]
            .find((candidate) => candidate.textContent?.trim() === 'Ask AI');
          return Boolean(button && button.getAttribute('title')?.includes('response data is excluded'));
        })()`),
      )
      .toBe(true)
    await run<boolean>(`(() => {
      [...document.querySelectorAll('.forms-properties-pane button')]
        .find((candidate) => candidate.textContent?.trim() === 'Ask AI')?.click();
      return true;
    })()`)

    await expect.poll(() => requests.length, { timeout: 20_000 }).toBeGreaterThan(0)
    const request = requests.at(-1)!
    expect(request.body.stream).toBe(true)
    expect(request.body.tools ?? []).toEqual([])
    expect(request.userText).toContain('Analyze only the selected field')
    expect(request.userText).toContain('"id":"field-name"')
    expect(request.userText).toContain('"label":"Name"')
    expect(request.userText).toContain('coordinateSpace')
    expect(request.userText).not.toContain('Private decoy field')
    expect(request.userText).not.toContain('private-answer-sentinel')
    await expect
      .poll(() => run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'))
      .toContain('The selected Name field')
    expect(responseFinished).toBe(false)
    expect(
      await run<boolean>(
        'Boolean(document.querySelector(".revelith-app-chat-log .ai-msg-assistant")?.classList.contains("ai-msg-streaming"))',
      ),
    ).toBe(true)
    await expect
      .poll(() => run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'))
      .toContain('The selected Name field is concise')
    await expect.poll(() => responseFinished).toBe(true)
    await expect
      .poll(() => run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'))
      .toContain('Analyzing selected content')
    await expect
      .poll(() => run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'))
      .toContain('Name (text)')

    await expect
      .poll(() =>
        run<boolean>(
          '[...document.querySelectorAll(".forms-tool-button")].some((button) => button.textContent?.includes("Shortcuts · 4"))',
        ),
      )
      .toBe(true)
    await run<boolean>(`(() => {
      [...document.querySelectorAll('.forms-tool-button')]
        .find((button) => button.textContent?.includes('Shortcuts · 4'))?.click();
      return true;
    })()`)
    await expect
      .poll(() => run<string>('document.querySelector("[role=dialog]")?.innerText ?? ""'))
      .toContain('Keyboard shortcuts (4)')
    await expect
      .poll(() => run<string>('document.querySelector("[role=dialog]")?.innerText ?? ""'))
      .toContain('Save the form')
  } finally {
    if (launched) await closeAndSaveVideo(launched, 'forms-builder-selection-ai')
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
