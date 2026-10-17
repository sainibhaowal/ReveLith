import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { closeAndSaveVideo, launchShell } from './helpers'
import { FORM_TOOL_NAMES } from '../apps/forms-builder/src/renderer/form-tool-routing'

const GLOBAL_CHAT_TOOLS = ['read_attachment', 'ask_clarification', 'analyze_media']

const seedForm = {
  id: 'form-toolbar-e2e', version: 1, title: 'Untitled Form', description: 'Collect the details we need.',
  fields: [{ id: 'field-name', type: 'text', label: 'Name', required: false, helpText: 'Enter your name', validation: {}, layout: { width: '100%' } }],
  settings: { submitButtonText: 'Submit', showProgressBar: false, allowMultipleResponses: true, collectEmail: false, confirmationMessage: 'Thank you', confirmationTitle: 'Response recorded', confirmationButtonText: 'Submit another response', showQuestionNumbers: false, closeOnLimit: false, locale: 'en', navigationMode: 'paged', showNavigationArrows: true, showQuizScore: false },
  theme: { primaryColor: '#2563eb', backgroundColor: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', borderRadius: 8, buttonStyle: 'filled', contentWidth: 'standard', questionSpacing: 'comfortable', labelPosition: 'top' },
}

test('Forms Builder quick tools edit, undo, autosave, and run focused AI actions in ReveLith Chat', async () => {
  test.setTimeout(120_000)
  const requests: Array<{ action: string; offered: string[]; tools: string[]; userText: string }> = []
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const body = JSON.parse(raw)
    const messages = body.messages ?? []
    const userText = [...messages].reverse().find((message: any) => message.role === 'user')?.content ?? ''
    const action = /Analyze only the selected field shown below/.test(userText) ? 'selection'
      : /Polish the wording/.test(userText) ? 'polish'
      : /Format the visual design/.test(userText) ? 'format'
      : /add a small number of useful missing questions/i.test(userText) ? 'generate'
      : /Review this form for clarity/.test(userText) ? 'audit' : 'unknown'
    const offered = (body.tools ?? []).map((tool: any) => tool.function?.name ?? tool.name)
    const hasCurrentToolResult = messages.at(-1)?.role === 'tool'
    const priorTool = hasCurrentToolResult ? [...messages].reverse().find((message: any) => message.role === 'assistant' && message.tool_calls) : null
    const called = priorTool?.tool_calls?.map((call: any) => call.function?.name) ?? []

    requests.push({ action, offered, tools: called, userText: String(userText) })
    if (action === 'selection') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: 'The selected Name field is concise; add a concrete example only if users need formatting guidance.' }, finish_reason: 'stop' }] }))
      return
    }
    if (hasCurrentToolResult) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: `Completed ${action}` }, finish_reason: 'stop' }] }))
      return
    }

    const toolCalls = action === 'polish'
      ? [
          { name: 'update_form', args: { title: 'Polished intake', description: 'A clear, welcoming intake form.' } },
          { name: 'update_form_field', args: { id: 'field-name', label: 'Full name', helpText: 'Enter your first and last name.' } },
        ]
      : action === 'format' ? [{ name: 'update_form_theme', args: { primaryColor: '#0f766e', backgroundColor: '#f0fdfa', borderRadius: 12, contentWidth: 'wide', questionSpacing: 'comfortable' } }]
      : action === 'generate' ? [{ name: 'add_form_field', args: { type: 'email', label: 'Contact email', required: true } }]
      : action === 'audit' ? [{ name: 'audit_form', args: {} }]
      : []

    if (toolCalls.some((tool) => !offered.includes(tool.name))) {
      response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: `Expected tools are missing: ${JSON.stringify({ action, offered, toolCalls })}` } }))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: null, tool_calls: toolCalls.map((tool, index) => ({ id: `${action}-${index}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } })) }, finish_reason: 'tool_calls' }] }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not start the local toolbar test model.')
  const saveDir = await mkdtemp(join(tmpdir(), 'revelith-forms-toolbar-'))
  const saveDialogPath = join(saveDir, 'Toolbar form')
  const savedFormPath = `${saveDialogPath}.form`
  const readSavedFieldCount = async () => {
    try {
      return JSON.parse(await readFile(savedFormPath, 'utf8')).fields?.length ?? 0
    } catch {
      return -1
    }
  }
  const launched = await launchShell({
    onboardingSeen: true,
    aiSettings: { provider: 'custom', providers: { custom: { model: 'forms-toolbar-test', baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: '' } } },
    videoDir: 'forms-builder-toolbar',
  })
  const { app, page } = launched
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    const run = <T,>(script: string) => app.evaluate(async ({ BrowserWindow }, source) => {
      const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) => candidate.webContents.getURL().toLowerCase().includes('forms-builder'))
      return view?.webContents.executeJavaScript(source) as Promise<T> | undefined
    }, script) as Promise<T>
    await expect.poll(() => run<boolean>('Boolean(document.querySelector(".revelith-app-chat textarea:not(:disabled)"))')).toBe(true)
    const initialRibbon = await run<any>(`(() => {
      const ribbon = document.querySelector('.revelith-app-ribbon');
      const insert = ribbon?.querySelector('[data-ribbon-panel="insert"]');
      return { height: ribbon?.getBoundingClientRect().height ?? 0, hiddenInsertDisplay: insert ? getComputedStyle(insert).display : 'missing' };
    })()`)
    expect(initialRibbon.hiddenInsertDisplay).toBe('none')
    expect(initialRibbon.height).toBeLessThan(180)
    await app.evaluate(async ({ dialog }, targetPath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath }) }, saveDialogPath)
    await run<boolean>(`(() => { const session = new URLSearchParams(location.search).get('session') || 'browser'; localStorage.setItem('revelith-forms-builder/draft/' + session, ${JSON.stringify(JSON.stringify(seedForm))}); location.reload(); return true; })()`)
    await expect.poll(() => run<number>('JSON.parse(localStorage.getItem("revelith-forms-builder/draft/" + (new URLSearchParams(location.search).get("session") || "browser")) || "{}").fields?.length ?? 0')).toBe(1)

    expect(await run<boolean>('Boolean(document.querySelector(".forms-quick-button[aria-label=Save]"))')).toBe(true)
    expect(await run<boolean>('[...document.querySelectorAll(".forms-tool-button.ai")].some((button) => button.textContent?.trim() === "Polish")')).toBe(true)
    const autosaveInitiallyOn = await run<boolean>('document.querySelector(".forms-autosave-toggle")?.getAttribute("aria-pressed") === "true"')
    expect(autosaveInitiallyOn).toBe(true)
    await run<boolean>('document.querySelector(".forms-autosave-toggle")?.click(); true')
    await expect.poll(() => run<boolean>('document.querySelector(".forms-autosave-toggle")?.getAttribute("aria-pressed") === "false"')).toBe(true)
    await run<boolean>('document.querySelector(".forms-autosave-toggle")?.click(); true')

    await run<boolean>('document.querySelector(".forms-quick-button[aria-label=Save]")?.click(); true')
    await expect.poll(readSavedFieldCount).toBe(1)

    await run<boolean>(`(() => { [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent?.trim() === 'Insert')?.click(); return true; })()`)
    const insertLayout = await run<any>(`(() => {
      const panel = document.querySelector('[data-ribbon-panel="insert"]');
      const groups = [...(panel?.querySelectorAll(':scope > .revelith-app-ribbon-group') ?? [])];
      const basic = groups[0];
      const basicTools = basic?.querySelectorAll('.forms-tool-button').length ?? 0;
      return { groups: groups.length, width: panel?.clientWidth ?? 0, scrollWidth: panel?.scrollWidth ?? 0, basicTools };
    })()`)
    // The shared ribbon groups the palette into a smaller set of semantic
    // sections; keep the layout check tied to the rendered UI, not its former
    // five-category implementation detail.
    expect(insertLayout.groups).toBeGreaterThanOrEqual(2)
    expect(insertLayout.scrollWidth).toBeLessThanOrEqual(insertLayout.width + 1)
    // A wide viewport can fit the entire quick-field group on one row. Verify
    // all nine common controls are present instead of requiring wrapping.
    expect(insertLayout.basicTools).toBe(9)
    await run<boolean>(`(() => { [...document.querySelectorAll('.forms-tool-button')].find((button) => button.textContent?.includes('Short Text'))?.click(); return true; })()`)
    const readFieldCount = () => run<number>('JSON.parse(localStorage.getItem("revelith-forms-builder/draft/" + (new URLSearchParams(location.search).get("session") || "browser")) || "{}").fields?.length ?? 0')
    await expect.poll(readFieldCount).toBe(2)
    await expect.poll(readSavedFieldCount, { timeout: 10_000 }).toBe(2)
    await run<boolean>('document.querySelector(".forms-quick-button[aria-label=Undo]")?.click(); true')
    await expect.poll(readFieldCount).toBe(1)
    await expect.poll(readSavedFieldCount, { timeout: 10_000 }).toBe(1)
    await run<boolean>('document.querySelector(".forms-quick-button[aria-label=Redo]")?.click(); true')
    await expect.poll(readFieldCount).toBe(2)
    await expect.poll(readSavedFieldCount, { timeout: 10_000 }).toBe(2)

    const runToolbarAi = async (label: string, action: string, expectedToolNames: string[], expectedOffer: string[]) => {
      const priorCount = requests.length
      const clicked = await run<boolean>(`(() => { const button = [...document.querySelectorAll('.forms-tool-button, .forms-quick-command')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)}); if (!button) return false; button.click(); return true; })()`)
      expect(clicked, `${label} should be present on the form ribbon`).toBe(true)
      await expect.poll(() => requests.length, { timeout: 20_000 }).toBeGreaterThan(priorCount)
      await expect.poll(() => run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'), { timeout: 20_000 }).toContain(`Completed ${action}`)
      const actionRequests = requests.slice(priorCount).filter((item) => item.action === action)
      expect(actionRequests.length).toBeGreaterThan(0)
      const offeredAppTools = actionRequests[0]!.offered.filter((name) =>
        FORM_TOOL_NAMES.includes(name as (typeof FORM_TOOL_NAMES)[number]),
      )
      expect(offeredAppTools.sort()).toEqual([...expectedOffer].sort())
      expect(actionRequests[0]!.offered.filter((name) =>
        !FORM_TOOL_NAMES.includes(name as (typeof FORM_TOOL_NAMES)[number]) && !GLOBAL_CHAT_TOOLS.includes(name),
      )).toEqual([])
      const executed = await run<string[]>('Array.from(document.querySelectorAll(".ai-step-title[data-tip]")).map((item) => item.getAttribute("data-tip") ?? "")')
      expect(expectedToolNames.every((tool) => executed.includes(tool)), `${label} expected ${expectedToolNames.join(', ')}; activity=${JSON.stringify(executed)}; chat=${await run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""')}`).toBe(true)
      await expect.poll(() => run<number>('document.querySelectorAll(".ai-step-icon.error").length')).toBe(0)
    }

    await runToolbarAi('Polish', 'polish', ['update_form', 'update_form_field'], ['update_form', 'update_form_field'])
    let state = await run<any>(`(() => { const session = new URLSearchParams(location.search).get('session') || 'browser'; return JSON.parse(localStorage.getItem('revelith-forms-builder/draft/' + session) || '{}'); })()`)
    expect(state).toMatchObject({ title: 'Polished intake', description: 'A clear, welcoming intake form.' })
    expect(state.fields.find((field: any) => field.id === 'field-name')).toMatchObject({ label: 'Full name', helpText: 'Enter your first and last name.' })

    await runToolbarAi('Format', 'format', ['update_form_theme'], ['update_form_theme'])
    state = await run<any>(`(() => { const session = new URLSearchParams(location.search).get('session') || 'browser'; return JSON.parse(localStorage.getItem('revelith-forms-builder/draft/' + session) || '{}'); })()`)
    expect(state.theme).toMatchObject({ primaryColor: '#0f766e', contentWidth: 'wide', borderRadius: 12 })

    await runToolbarAi('Generate', 'generate', ['add_form_field'], ['add_form_field'])
    await expect.poll(readFieldCount).toBe(3)
    await runToolbarAi('Review', 'audit', ['audit_form'], ['audit_form'])

    // Exercise the field-scoped Ask AI action through the actual shell, form
    // canvas, shared chat panel, and local mock provider. Include a decoy field
    // and answer-like values to prove the selected-field context stays narrow.
    const selectionForm = {
      ...seedForm,
      fields: [
        { ...seedForm.fields[0], id: 'field-name', label: 'Name' },
        { id: 'field-private', type: 'text', label: 'Hidden Admin Field', required: true, defaultValue: 'private-answer-sentinel' },
      ],
    }
    await run<boolean>(`(() => { const session = new URLSearchParams(location.search).get('session') || 'browser'; localStorage.setItem('revelith-forms-builder/draft/' + session, ${JSON.stringify(JSON.stringify(selectionForm))}); location.reload(); return true; })()`)
    await expect.poll(() => run<number>('JSON.parse(localStorage.getItem("revelith-forms-builder/draft/" + (new URLSearchParams(location.search).get("session") || "browser")) || "{}").fields?.length ?? 0')).toBe(2)
    await run<boolean>(`(() => { document.querySelector('[data-form-field-id="field-name"]')?.click(); return true; })()`)
    const askReady = await run<boolean>(`Boolean([...document.querySelectorAll('.forms-properties-pane button')].find((button) => button.textContent?.trim() === 'Ask AI'))`)
    expect(askReady).toBe(true)
    const priorSelectionRequests = requests.length
    await run<boolean>(`(() => { [...document.querySelectorAll('.forms-properties-pane button')].find((button) => button.textContent?.trim() === 'Ask AI')?.click(); return true; })()`)
    await expect.poll(() => requests.slice(priorSelectionRequests).some((request) => request.action === 'selection'), { timeout: 20_000 }).toBe(true)
    const selectionRequest = requests.slice(priorSelectionRequests).find((request) => request.action === 'selection')!
    expect(selectionRequest.offered).toEqual([])
    expect(selectionRequest.userText).toContain('"id":"field-name"')
    expect(selectionRequest.userText).toContain('"label":"Name"')
    expect(selectionRequest.userText).toContain('coordinateSpace')
    expect(selectionRequest.userText).not.toContain('Hidden Admin Field')
    expect(selectionRequest.userText).not.toContain('private-answer-sentinel')
    await expect.poll(() => run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""')).toContain('selected Name field is concise')
  } finally {
    await closeAndSaveVideo(launched, 'forms-builder-toolbar')
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
