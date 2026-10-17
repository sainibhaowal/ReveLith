import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { closeAndSaveVideo, launchShell } from './helpers'
import { FORM_TOOL_NAMES } from '../apps/forms-builder/src/renderer/form-tool-routing'

const GLOBAL_CHAT_TOOLS = ['read_attachment', 'ask_clarification', 'analyze_media']

const model = process.env.FORMS_LIVE_TOOL_MODEL ?? 'google/gemma-4-e2b'

const seedForm = {
  id: 'form-live-tool-verification',
  version: 1,
  title: 'Live tool verification',
  description: '',
  fields: [
    { id: 'group-team', type: 'group', label: 'Team', required: false, children: [] },
    { id: 'terms-live', type: 'legal_terms', label: 'Terms', required: false, termsText: 'I agree.' },
    { id: 'field-name', type: 'text', label: 'Name', required: false },
    { id: 'field-department', type: 'text', label: 'Department', required: false, conditionalLogic: { match: 'all', showWhen: [{ fieldId: 'field-name', operator: 'is_not_empty', value: '' }] } },
    { id: 'field-delete', type: 'text', label: 'Disposable field', required: false },
    { id: 'field-move', type: 'text', label: 'Move me', required: false },
  ],
  settings: {
    submitButtonText: 'Submit', showProgressBar: false, allowMultipleResponses: true,
    collectEmail: false, confirmationMessage: 'Thank you for your response!',
    confirmationTitle: 'Response recorded', confirmationButtonText: 'Submit another response',
    showQuestionNumbers: false, closeOnLimit: false, locale: 'en', navigationMode: 'paged',
    showNavigationArrows: true, showQuizScore: false,
  },
  theme: {
    primaryColor: '#2563eb', backgroundColor: 'var(--surface)',
    fontFamily: 'Inter, system-ui, sans-serif', borderRadius: 8,
    buttonStyle: 'filled', contentWidth: 'standard', questionSpacing: 'comfortable', labelPosition: 'top',
  },
  variables: [{ id: 'variable-legacy', name: 'Legacy score', type: 'number', initialValue: 1 }],
  logicRules: [{
    id: 'rule-legacy', name: 'Legacy route', match: 'all',
    conditions: [{ fieldId: 'field-name', operator: 'is_not_empty', value: '' }],
    action: { kind: 'navigate', fieldId: 'field-department' },
  }],
}

const actions = [
  ['get_form', 'Inspect the current form and tell me how many question fields it contains.'],
  ['update_form', 'Rename this form to Customer Intake.'],
  ['update_form_settings', 'Turn on the progress bar and change the submit button label to Send now.'],
  ['update_form_translation', 'Translate this form into German and use Live Formular as its translated title.'],
  ['update_form_theme', 'Change the form primary color to #1769aa.'],
  ['audit_form', 'Call the audit_form tool for the current form now. Then summarize any respondent experience or structure issues it finds.'],
  ['add_form_field', 'Add a short text question called Project code.'],
  ['manage_group_fields', 'Add a short text question called Team code inside the Team group.'],
  ['update_form_field', 'Make the Name question required.'],
  ['configure_special_field', 'Change the wording shown in the Terms consent question to I agree to the local test terms.'],
  ['delete_form_field', 'Remove the Disposable field from this form.'],
  ['move_form_field', 'Move the Move me question to the first position.'],
  ['set_field_condition', 'Only show the Move me question when Name has an answer.'],
  ['clear_field_conditions', 'Remove the visibility rule from Department so it is always visible.'],
  ['manage_form_variable', 'Create a number variable named Session score and start it at 3.'],
  ['add_logic_rule', 'Add a routing rule named Live route: when Name has an answer, jump to Department.'],
  ['delete_logic_rule', 'Remove the old Legacy route rule.'],
] as const

test(`${model} executes all 17 Forms Builder tools through ReveLith Chat with one relevant tool per turn`, async () => {
  test.setTimeout(600_000)
  const liveCalls: Array<{ offered: string[]; calls: Array<{ name: string; arguments: string }>; sentMessages: Array<{ role: string; content: string }>; raw: string }> = []
  const proxy = createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    try {
      const upstream = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
      })
      const payload = await upstream.text()
      const calls = new Map<number, { name: string; arguments: string }>()
      const collectCalls = (items: any[]) => {
        for (const tool of items) {
          const index = Number(tool.index ?? calls.size)
          const accumulated = calls.get(index) ?? { name: '', arguments: '' }
          accumulated.name += tool.function?.name ?? ''
          accumulated.arguments += tool.function?.arguments ?? ''
          calls.set(index, accumulated)
        }
      }
      for (const line of payload.split(/\r?\n/)) {
        if (!line.startsWith('data: ')) continue
        const event = line.slice(6)
        if (event === '[DONE]') continue
        try {
          const item = JSON.parse(event)
          collectCalls(item.choices?.[0]?.delta?.tool_calls ?? item.choices?.[0]?.message?.tool_calls ?? [])
        } catch { /* ignore partial or non-JSON stream records */ }
      }
      try {
        const item = JSON.parse(payload)
        collectCalls(item.choices?.[0]?.message?.tool_calls ?? [])
      } catch { /* the upstream may have returned an SSE stream */ }
      const sentMessages = (JSON.parse(raw).messages ?? []).map((message: any) => ({ role: message.role, content: typeof message.content === 'string' ? message.content.slice(-3000) : '[structured content]' }))
      liveCalls.push({
        offered: (JSON.parse(raw).tools ?? []).map((tool: any) => tool.function?.name ?? tool.name),
        calls: [...calls.values()],
        sentMessages,
        raw: payload.slice(-3000),
      })
      response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' })
      response.end(payload)
    } catch (error) {
      response.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: String(error) } }))
    }
  })
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  const address = proxy.address()
  if (!address || typeof address === 'string') throw new Error('Could not start the local-model trace proxy.')
  const launched = await launchShell({
    onboardingSeen: true,
    aiSettings: { provider: 'custom', providers: { custom: { model, baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: '' } } },
    videoDir: `forms-live-all-tools-${model.split('/').at(-1)}`,
  })
  const { app, page } = launched
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    const run = <T,>(script: string) => app.evaluate(async ({ BrowserWindow }, source) => {
      const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) => candidate.webContents.getURL().toLowerCase().includes('forms-builder'))
      return view?.webContents.executeJavaScript(source) as Promise<T> | undefined
    }, script) as Promise<T>
    await expect.poll(() => run<boolean>('Boolean(document.querySelector(".revelith-app-chat textarea:not(:disabled)"))')).toBe(true)
    await run<boolean>(`(() => {
      const session = new URLSearchParams(location.search).get('session') || 'browser';
      localStorage.setItem('revelith-forms-builder/draft/' + session, ${JSON.stringify(JSON.stringify(seedForm))});
      location.reload();
      return true;
    })()`)
    await expect.poll(() => run<string>('document.querySelector(".revelith-app-chat textarea:not(:disabled)") ? document.body.innerText : ""'), { timeout: 20_000 }).not.toBe('')

    const actionFilter = process.env.FORMS_LIVE_TOOL_FILTER?.split(',').map((name) => name.trim()).filter(Boolean)
    const selectedActions = actionFilter?.length
      ? actions.filter(([toolName]) => actionFilter.includes(toolName))
      : actions
    for (const [toolName, instruction] of selectedActions) {
      const formBeforeTurn = await run<any>(`(() => { const session = new URLSearchParams(location.search).get('session') || 'browser'; return JSON.parse(localStorage.getItem('revelith-forms-builder/draft/' + session) || '{}'); })()`)
      if (toolName === 'move_form_field') expect(formBeforeTurn.fields?.some((field: any) => field.id === 'field-move'), 'move fixture should still be present before the move request').toBe(true)
      const before = await run<number>('document.querySelectorAll(".ai-step-title[data-tip]").length')
      const traceBefore = liveCalls.length
      const modelInstruction = instruction
      const sent = await run<boolean>(`(() => {
        const input = document.querySelector('.revelith-app-chat textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!input || !setter) return false;
        setter.call(input, ${JSON.stringify(modelInstruction)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const send = [...document.querySelectorAll('.revelith-app-chat button')].find((button) => button.getAttribute('aria-label') === 'Send');
        if (!send || send.disabled) return false;
        send.click();
        return true;
      })()`)
      expect(sent, `${toolName} request should submit through ReveLith Chat`).toBe(true)
      await expect.poll(() => liveCalls.length, { timeout: 90_000, message: `${model} should answer the ${toolName} request` })
        .toBeGreaterThan(traceBefore)
      await expect.poll(() => run<number>('document.querySelectorAll(".ai-step-title[data-tip]").length'), {
        timeout: 90_000,
        message: `${model} should call ${toolName}; chat: ${await run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""')}; trace: ${JSON.stringify(liveCalls.slice(traceBefore))}`,
      }).toBeGreaterThan(before)
      await expect.poll(() => run<boolean>('Boolean(document.querySelector(".revelith-app-chat textarea:not(:disabled)"))'), { timeout: 90_000 }).toBe(true)
      const calls = await run<Array<{ name: string; failed: boolean }>>('Array.from(document.querySelectorAll(".ai-step-row")).map((step) => ({ name: step.querySelector(".ai-step-title[data-tip]")?.getAttribute("data-tip") ?? "", failed: !!step.querySelector(".ai-step-icon.error") }))')
      const newCalls = calls.slice(before)
      expect(newCalls.length, `${instruction} should invoke its available tool`).toBeGreaterThan(0)
      expect(liveCalls.slice(traceBefore).every((request) => {
        const formTools = request.offered.filter((name) => FORM_TOOL_NAMES.includes(name as (typeof FORM_TOOL_NAMES)[number]))
        const unexpected = request.offered.filter((name) =>
          !FORM_TOOL_NAMES.includes(name as (typeof FORM_TOOL_NAMES)[number]) && !GLOBAL_CHAT_TOOLS.includes(name),
        )
        return formTools.length === 1 && formTools[0] === toolName && unexpected.length === 0
      }), `${instruction} should send only the one relevant Forms tool plus shared Chat tools: ${JSON.stringify(liveCalls.slice(traceBefore).map(({ offered }) => offered))}`).toBe(true)
      expect(newCalls.every((call) => call.name === toolName && !call.failed), `${instruction} must invoke only ${toolName} and succeed: ${JSON.stringify({ newCalls, activity: await run<string>('Array.from(document.querySelectorAll(".ai-tool-step")).map((step) => step.innerText).join(" | ")'), modelCalls: liveCalls.slice(traceBefore) })}`).toBe(true)

      // Keep each real-model request small: reload to clear prior chat history
      // while the form draft remains safely persisted in the app's local draft.
      await run<boolean>('new Promise((resolve) => setTimeout(() => resolve(true), 250))')
      const state = await run<any>(`(() => {
        const session = new URLSearchParams(location.search).get('session') || 'browser';
        return JSON.parse(localStorage.getItem('revelith-forms-builder/draft/' + session) || '{}');
      })()`)
      const fields = state.fields as Array<any>
      if (toolName === 'update_form') expect(state.title).toBe('Customer Intake')
      if (toolName === 'update_form_settings') expect(state.settings).toMatchObject({ showProgressBar: true, submitButtonText: 'Send now' })
      if (toolName === 'update_form_translation') expect(state.translations?.de?.title).toBe('Live Formular')
      if (toolName === 'update_form_theme') expect(state.theme.primaryColor).toBe('#1769aa')
      if (toolName === 'add_form_field') expect(fields.some((field) => /project code/i.test(field.label))).toBe(true)
      if (toolName === 'manage_group_fields') expect(fields.find((field) => field.id === 'group-team')?.children?.some((field: any) => /team code/i.test(field.label))).toBe(true)
      if (toolName === 'update_form_field') expect(fields.find((field) => field.id === 'field-name')?.required).toBe(true)
      if (toolName === 'configure_special_field') expect(fields.find((field) => field.id === 'terms-live')?.termsText).toContain('local test terms')
      if (toolName === 'delete_form_field') expect(fields.some((field) => field.id === 'field-delete')).toBe(false)
      if (toolName === 'move_form_field') expect(fields[0]?.id).toBe('field-move')
      if (toolName === 'set_field_condition') expect(fields.find((field) => field.id === 'field-move')?.conditionalLogic?.showWhen?.[0]).toMatchObject({ fieldId: 'field-name', operator: 'is_not_empty' })
      if (toolName === 'clear_field_conditions') expect(fields.find((field) => field.id === 'field-department')?.conditionalLogic).toBeUndefined()
      if (toolName === 'manage_form_variable') expect(state.variables.some((variable: any) => variable.name === 'Session score' && variable.type === 'number' && variable.initialValue === 3)).toBe(true)
      if (toolName === 'add_logic_rule') expect(state.logicRules.some((rule: any) => /^Live route\b/i.test(rule.name) && rule.action.fieldId === 'field-department')).toBe(true)
      if (toolName === 'delete_logic_rule') expect(state.logicRules.some((rule: any) => rule.id === 'rule-legacy')).toBe(false)
      await app.evaluate(async ({ BrowserWindow }) => {
        const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) => candidate.webContents.getURL().toLowerCase().includes('forms-builder'))
        view?.webContents.reload()
      })
      await expect.poll(() => run<boolean>('Boolean(document.querySelector(".revelith-app-chat textarea:not(:disabled)"))'), { timeout: 20_000 }).toBe(true)
    }
  } finally {
    await closeAndSaveVideo(launched, 'forms-live-all-tools-gemma-4-e2b')
    proxy.closeAllConnections()
    await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()))
  }
})
