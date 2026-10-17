import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { expect, test } from '@playwright/test'
import { closeAndSaveVideo, launchShell } from './helpers'

const selectionForm = {
  id: 'selection-ai-e2e', version: 1, title: 'Selection scope check', description: 'Only the selected question may be analyzed.',
  fields: [
    { id: 'field-name', type: 'text', label: 'Name', required: true, placeholder: 'Your name', validation: {}, layout: { width: '100%' } },
    { id: 'field-private', type: 'text', label: 'Hidden Admin Field', required: true, defaultValue: 'private-answer-sentinel', validation: {}, layout: { width: '100%' } },
  ],
  settings: { submitButtonText: 'Submit', showProgressBar: false, allowMultipleResponses: false, collectEmail: false, confirmationMessage: 'Thanks', locale: 'en', navigationMode: 'all-at-once' },
  theme: { primaryColor: '#2563eb', backgroundColor: '#f8fafc', fontFamily: 'system-ui, sans-serif', borderRadius: 8, contentWidth: 'standard', questionSpacing: 'comfortable', labelPosition: 'top' },
}

test('selected-field Ask AI sends only the chosen definition and bounds, with no tools or prior answers', async () => {
  const requests: Array<{ body: Record<string, any>; userText: string }> = []
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const body = JSON.parse(raw) as Record<string, any>
    const userMessages = (body.messages ?? []).filter((message: any) => message.role === 'user')
    const userText = userMessages.map((message: any) => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n')
    requests.push({ body, userText })
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      choices: [{ message: { content: 'The selected Name field is clear; retain the example placeholder to guide respondents.' }, finish_reason: 'stop' }],
    }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not start the local selection-analysis model.')

  const launched = await launchShell({
    onboardingSeen: true,
    aiSettings: { provider: 'custom', providers: { custom: { model: 'selection-scope-test', baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: '' } } },
    videoDir: 'new-app-selection-ai',
  })
  const { app, page } = launched
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    const run = <T,>(script: string) => app.evaluate(async ({ BrowserWindow }, source) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) => view.webContents.getURL().includes('forms-builder'))
      return child?.webContents.executeJavaScript(source) as Promise<T> | undefined
    }, script) as Promise<T>
    await expect.poll(() => run<boolean>('Boolean(document.querySelector(".revelith-app-chat textarea:not(:disabled)"))')).toBe(true)
    await run<boolean>(`(() => { const session = new URLSearchParams(location.search).get('session') || 'browser'; localStorage.setItem('revelith-forms-builder/draft/' + session, ${JSON.stringify(JSON.stringify(selectionForm))}); location.reload(); return true; })()`)
    await expect.poll(() => run<number>('JSON.parse(localStorage.getItem("revelith-forms-builder/draft/" + (new URLSearchParams(location.search).get("session") || "browser")) || "{}").fields?.length ?? 0')).toBe(2)
    await run<boolean>(`(() => { document.querySelector('[data-form-field-id="field-name"]')?.click(); return true; })()`)
    await expect.poll(() => run<boolean>(`Boolean([...document.querySelectorAll('.forms-properties-pane button')].find((button) => button.textContent?.trim() === 'Ask AI'))`)).toBe(true)

    await run<boolean>(`(() => { [...document.querySelectorAll('.forms-properties-pane button')].find((button) => button.textContent?.trim() === 'Ask AI')?.click(); return true; })()`)
    await expect.poll(() => requests.length, { timeout: 20_000 }).toBeGreaterThan(0)
    const request = requests.at(-1)!
    expect(request.body.tools ?? []).toEqual([])
    expect(request.userText).toContain('"id":"field-name"')
    expect(request.userText).toContain('"label":"Name"')
    expect(request.userText).toContain('coordinateSpace')
    expect(request.userText).not.toContain('Hidden Admin Field')
    expect(request.userText).not.toContain('private-answer-sentinel')
    await expect.poll(() => run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""')).toContain('selected Name field is clear')
  } finally {
    await closeAndSaveVideo(launched, 'new-app-selection-ai')
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('selected-task Ask AI sends only the chosen task and bounds to the local provider', async () => {
  const requests: Array<{ body: Record<string, any>; userText: string }> = []
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const body = JSON.parse(raw) as Record<string, any>
    const userMessages = (body.messages ?? []).filter((message: any) => message.role === 'user')
    const userText = userMessages.map((message: any) => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n')
    requests.push({ body, userText })
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      choices: [{ message: { content: 'The selected task is clear; confirm its owner before starting.' }, finish_reason: 'stop' }],
    }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not start the local selection-analysis model.')

  const launched = await launchShell({
    onboardingSeen: true,
    aiSettings: { provider: 'custom', providers: { custom: { model: 'selection-scope-test', baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: '' } } },
    videoDir: 'new-app-selection-ai-tasks',
  })
  const { app, page } = launched
  const run = <T,>(script: string) => app.evaluate(async ({ BrowserWindow }, source) => {
    const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) =>
      view.webContents.getURL().includes('/apps/tasks/out/renderer/index.html'),
    )
    return child?.webContents.executeJavaScript(source) as Promise<T> | undefined
  }, script) as Promise<T>
  const clickButton = (label: string) => run<boolean>(`(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === ${JSON.stringify(label)});
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click(); return true;
  })()`)
  const fillDialogInput = (value: string, index = 0) => run<boolean>(`(() => {
    const input = document.querySelectorAll('[role="dialog"] input')[${index}];
    if (!(input instanceof HTMLInputElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) return false;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true })); return true;
  })()`)

  try {
    await page.evaluate(async () => { await window.aiOffice.newTasks() })
    await expect.poll(() => run<string>('document.title')).toContain('Tasks')

    expect(await clickButton('New project')).toBe(true)
    await expect.poll(() => run<boolean>('Boolean(document.querySelector(\'[role="dialog"][aria-label="New project"]\'))')).toBe(true)
    expect(await fillDialogInput('Selection context E2E')).toBe(true)
    expect(await fillDialogInput('SEL', 1)).toBe(true)
    expect(await clickButton('Create project')).toBe(true)
    await expect.poll(() => run<string>('document.body.innerText')).toContain('Selection context E2E')

    for (const title of ['Selected task E2E', 'UNSELECTED_PRIVATE_TASK_SENTINEL']) {
      expect(await clickButton('New task')).toBe(true)
      await expect.poll(() => run<boolean>('Boolean(document.querySelector(\'[role="dialog"][aria-label="New task"]\'))')).toBe(true)
      expect(await fillDialogInput(title)).toBe(true)
      expect(await clickButton('Create task')).toBe(true)
      await expect.poll(() => run<string>('document.body.innerText')).toContain(title)
    }

    expect(await run<boolean>(`(() => {
      const card = [...document.querySelectorAll('[data-task-id]')].find((entry) => entry.textContent?.includes('Selected task E2E'));
      if (!(card instanceof HTMLElement)) return false;
      card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return true;
    })()`)).toBe(true)
    await expect.poll(() => run<boolean>('Boolean(document.querySelector(\'[aria-label^="Task "] button[title^="Analyze only"]\'))')).toBe(true)
    await run<boolean>(`(() => { document.querySelector('[aria-label^="Task "] button[title^="Analyze only"]')?.click(); return true; })()`)

    await expect.poll(() => requests.length, { timeout: 20_000 }).toBeGreaterThan(0)
    const request = requests.at(-1)!
    expect(request.body.tools ?? []).toEqual([])
    expect(request.userText).toContain('Selected task E2E')
    expect(request.userText).toContain('Visible card bounds (viewport CSS px)')
    expect(request.userText).not.toContain('UNSELECTED_PRIVATE_TASK_SENTINEL')
    await expect.poll(() => run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""')).toContain('The selected task is clear')
  } finally {
    await closeAndSaveVideo(launched, 'new-app-selection-ai-tasks')
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
