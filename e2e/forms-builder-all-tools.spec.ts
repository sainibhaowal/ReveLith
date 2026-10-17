import { expect, test } from '@playwright/test'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { closeAndSaveVideo, launchShell } from './helpers'

type FormField = { id: string; type: string; label: string; children?: FormField[] }
type FormState = {
  fields: FormField[]
  groups?: FormField[]
  variables?: Array<{ id: string; name: string; type: string; initialValue: string | number }>
  logicRules?: Array<{ id: string }>
}

const toolNames = [
  'get_form',
  'update_form',
  'update_form_settings',
  'update_form_translation',
  'update_form_theme',
  'audit_form',
  'add_form_field',
  'manage_group_fields',
  'update_form_field',
  'configure_special_field',
  'delete_form_field',
  'move_form_field',
  'set_field_condition',
  'clear_field_conditions',
  'manage_form_variable',
  'add_logic_rule',
  'delete_logic_rule',
]

function lastUserText(body: any): string {
  return (
    [...(body.messages ?? [])].reverse().find((message: any) => message.role === 'user')?.content ??
    ''
  )
}

function formFrom(text: string): FormState {
  const reference = text.match(/Relevant form references: (\{[^\n]*\})/)
  if (reference) {
    const parsed = JSON.parse(reference[1]!) as Partial<FormState>
    return {
      ...parsed,
      fields: parsed.fields ?? [],
      groups: parsed.groups?.map((group) => ({ ...group, type: 'group' })) ?? [],
    }
  }

  const translation = text.match(/Source form text for translation: (\{[^\n]*\})/)
  if (translation) {
    const source = JSON.parse(translation[1]!) as {
      fields?: Record<string, Omit<FormField, 'id'> & { id?: string }>
    }
    return { fields: Object.entries(source.fields ?? {}).map(([id, field]) => ({ ...field, id })) }
  }

  const liveForm = text.match(/Live form reference: (\{[^\n]*\})/)
  if (liveForm) return { ...(JSON.parse(liveForm[1]!) as FormState), fields: [] }

  // Several tools need no existing form references, and their minimal
  // request context is intentionally empty to avoid sending unrelated data.
  return { fields: [] }
}

function flattened(fields: FormField[]): FormField[] {
  return fields.flatMap((field) => [field, ...flattened(field.children ?? [])])
}

function toolArgs(name: string, form: FormState): Record<string, unknown> {
  const all = flattened([...form.fields, ...(form.groups ?? [])])
  const rootRespondent = form.fields.find(
    (field) =>
      !['group', 'section', 'pagebreak', 'statement', 'welcome', 'thankyou', 'hidden'].includes(
        field.type,
      ),
  )
  const group = all.find((field) => field.type === 'group')
  const terms = all.find((field) => field.type === 'legal_terms')
  const respondentField = all.find(
    (field) =>
      !['group', 'section', 'pagebreak', 'statement', 'welcome', 'thankyou', 'hidden'].includes(
        field.type,
      ),
  )
  const secondField = all.find(
    (field) =>
      field.id !== respondentField?.id &&
      !['group', 'section', 'pagebreak', 'statement', 'welcome', 'thankyou', 'hidden'].includes(
        field.type,
      ),
  )
  const variable = form.variables?.[0]
  const logicRule = form.logicRules?.[0]
  switch (name) {
    case 'get_form':
    case 'audit_form':
      return {}
    case 'update_form':
      return { title: 'Tool verified form', description: 'Saved through the Forms Builder agent.' }
    case 'update_form_settings':
      return {
        showProgressBar: true,
        navigationMode: 'all-at-once',
        submitButtonText: 'Send response',
      }
    case 'update_form_translation':
      return {
        locale: 'de',
        title: 'Toolgeprüftes Formular',
        fields: respondentField ? { [respondentField.id]: { label: 'Prüffeld' } } : {},
      }
    case 'update_form_theme':
      return { primaryColor: '#1463d6', borderRadius: 10 }
    case 'add_form_field':
      return { type: 'text', label: 'AI created tool field' }
    case 'manage_group_fields':
      return { operation: 'add', groupId: group!.id, type: 'text', label: 'Nested AI question' }
    case 'update_form_field':
      return { id: respondentField!.id, label: 'Updated by AI tool' }
    case 'configure_special_field':
      return { id: terms!.id, termsText: 'I agree to the local test terms.' }
    case 'delete_form_field': {
      const deletable = all.find((field) => field.label === 'AI field to delete')
      return { id: deletable!.id }
    }
    case 'move_form_field':
      return { id: rootRespondent!.id, toIndex: 0 }
    case 'set_field_condition':
      return {
        id: secondField!.id,
        sourceFieldId: respondentField!.id,
        operator: 'is_not_empty',
        value: '',
      }
    case 'clear_field_conditions':
      return { id: secondField!.id }
    case 'manage_form_variable':
      return variable
        ? { operation: 'update', id: variable.id, name: 'Reviewed score', initialValue: 2 }
        : { operation: 'create', name: 'score', type: 'number', initialValue: 1 }
    case 'add_logic_rule':
      return {
        name: 'AI verified navigation',
        match: 'all',
        conditions: [{ fieldId: respondentField!.id, operator: 'is_not_empty', value: '' }],
        action: { kind: 'navigate', fieldId: rootRespondent!.id },
      }
    case 'delete_logic_rule':
      return { id: logicRule!.id }
    default:
      throw new Error(`No E2E arguments exist for ${name}`)
  }
}

test('ReveLith Chat routes all 17 Forms Builder tools to their handlers', async () => {
  test.setTimeout(300_000)
  const requests: string[] = []
  const results: string[] = []
  const offeredTools: Array<{ requested: string; names: string[] }> = []
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const body = JSON.parse(raw)
    const prompt = lastUserText(body)
    const requested =
      prompt.match(/RUN_FORM_TOOL:([a-z_]+)/)?.[1] ??
      (/add a required email field/i.test(prompt) ? 'add_form_field' : undefined)
    if (!requested) {
      response.writeHead(400).end(JSON.stringify({ error: { message: 'No test tool requested' } }))
      return
    }
    const offered = (body.tools ?? [])
      .map((tool: any) => tool.function?.name ?? tool.name)
      .filter((name: unknown): name is string => typeof name === 'string')
    offeredTools.push({ requested, names: offered })
    if (!offered.includes(requested)) {
      response.writeHead(400, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          error: { message: `The request did not include the requested ${requested} tool.` },
        }),
      )
      return
    }
    requests.push(requested)
    if (body.messages?.at(-1)?.role === 'tool') {
      results.push(String(body.messages.at(-1).content ?? ''))
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          choices: [{ message: { content: `Verified ${requested}` }, finish_reason: 'stop' }],
        }),
      )
      return
    }
    let args: Record<string, unknown>
    try {
      const setup = prompt.match(/arguments: (\{[^\n]*\})/)?.[1]
      args =
        requested === 'add_form_field' && setup
          ? (JSON.parse(setup) as Record<string, unknown>)
          : toolArgs(requested, formFrom(prompt))
    } catch (error) {
      response
        .writeHead(500, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: { message: String(error) } }))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: `call-${requests.length}`,
                  type: 'function',
                  function: { name: requested, arguments: JSON.stringify(args) },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Could not start local test model server.')
  const launched = await launchShell({
    onboardingSeen: true,
    aiSettings: {
      provider: 'custom',
      providers: {
        custom: {
          model: 'forms-tool-test',
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKey: '',
        },
      },
    },
    videoDir: 'forms-all-tools',
  })
  const { app } = launched
  try {
    await app.evaluate(async ({ BrowserWindow }) => {
      await BrowserWindow.getAllWindows()[0]?.webContents.executeJavaScript(
        'window.aiOffice.newFormsBuilder()',
      )
    })
    const run = <T>(script: string) =>
      app.evaluate(async ({ BrowserWindow }, source) => {
        const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) =>
          candidate.webContents.getURL().toLowerCase().includes('forms-builder'),
        )
        return view?.webContents.executeJavaScript(source) as Promise<T> | undefined
      }, script) as Promise<T>
    await expect
      .poll(() =>
        run<boolean>(
          'Boolean(document.querySelector(".revelith-app-chat textarea:not(:disabled)"))',
        ),
      )
      .toBe(true)

    const setupCalls = [
      { type: 'group', label: 'AI test group' },
      { type: 'legal_terms', label: 'AI terms' },
      { type: 'text', label: 'AI field to delete' },
      { type: 'text', label: 'AI respondent field' },
    ]
    const send = async (
      name: string,
      setup?: { type: string; label: string },
      naturalInstruction?: string,
    ) => {
      const instruction =
        naturalInstruction ??
        (setup
          ? `RUN_FORM_TOOL:${name}\narguments: ${JSON.stringify(setup)}`
          : `RUN_FORM_TOOL:${name}`)
      const accepted = await run<string>(
        `(async()=>{const input=document.querySelector('.revelith-app-chat textarea');const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(!input||!setter)return JSON.stringify({input:!!input});setter.call(input,${JSON.stringify(instruction)});input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,80));const buttons=[...document.querySelectorAll('.revelith-app-chat button')].map(item=>({label:item.getAttribute('aria-label'),text:item.innerText,disabled:item.disabled}));const button=[...document.querySelectorAll('.revelith-app-chat button')].find(item=>item.getAttribute('aria-label')==='Send');if(!button||button.disabled)return JSON.stringify({input:input.outerHTML,buttons});button.click();return JSON.stringify({sent:true,buttons})})()`,
      )
      expect(
        JSON.parse(accepted),
        `${name} prompt should be sent through ReveLith Chat`,
      ).toMatchObject({ sent: true })
      await expect
        .poll(
          () => run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'),
          { timeout: 8_000 },
        )
        .toContain(`Verified ${name}`)
    }

    for (const setup of setupCalls) await send('add_form_field', setup)
    // Each named tool is asked for through the normal Chat composer, traverses
    // the OpenAI-compatible transport, and runs its app handler. A deterministic
    // local test model avoids model-specific tool-planning variance and timeout.
    for (const name of toolNames.filter((name) => name !== 'add_form_field')) await send(name)
    // Also prove a normal user request is narrowed to the one needed tool.
    await send('add_form_field', undefined, 'Add a required email field.')

    const used = [...new Set(requests)]
    expect(used.sort()).toEqual([...toolNames].sort())
    expect(offeredTools.length).toBe(requests.length)
    expect(
      offeredTools.every(({ requested, names }) => {
        const offeredFormTools = toolNames.filter((name) => names.includes(name))
        return (
          (offeredFormTools.length === 1 && offeredFormTools[0] === requested) ||
          toolNames.every((name) => names.includes(name))
        )
      }),
      JSON.stringify(
        offeredTools.filter(({ requested, names }) => {
          const offeredFormTools = toolNames.filter((name) => names.includes(name))
          return (
            !(offeredFormTools.length === 1 && offeredFormTools[0] === requested) &&
            !toolNames.every((name) => names.includes(name))
          )
        }),
      ),
    ).toBe(true)
    expect(results).toHaveLength(setupCalls.length + toolNames.length)
    expect(
      results.filter((output) =>
        /^(?:No (?:field|variable|logic)|Provide |Choose |Invalid |Unsupported |.* must be |.* can only be used|Use up to )/i.test(
          output,
        ),
      ),
    ).toEqual([])
    expect(await run<number>('document.querySelectorAll(".ai-tool-step.error").length')).toBe(0)
  } finally {
    await closeAndSaveVideo(launched, 'forms-all-tools')
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
