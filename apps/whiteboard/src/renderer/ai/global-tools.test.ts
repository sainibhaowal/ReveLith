/**
 * The three ReveLith global tools as both panels use them (via
 * withGlobalTools here, via createGlobalTools in the drawboard panel):
 * a real answer where a capability is wired up, an honest refusal where it is
 * not. These are the behaviours the newer apps were missing.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createGlobalTools,
  describeAttachmentList,
  globalTools,
  withGlobalTools,
  type ChatAttachmentMeta,
  type GlobalToolOptions,
} from '@revelith/app-chat'
import type { AgentToolCall } from '@revelith/agent-core'

const call = (name: string, input: Record<string, unknown>): AgentToolCall =>
  ({ id: `${name}-1`, name, input }) as AgentToolCall

const attachments: ChatAttachmentMeta[] = [
  { path: 'C:/docs/report.docx', name: 'report.docx', ext: 'docx', sizeBytes: 24_000 },
  { path: 'C:/pics/logo.png', name: 'logo.png', ext: 'png', sizeBytes: 4096 },
]

/** A minimal app skill with one private tool, to prove wrapping leaves it alone. */
function appSkill() {
  const executeTool = vi.fn(() => ({ output: 'app tool ran', summary: 'App tool' }))
  return {
    skill: {
      id: 'tasks',
      systemPrompt: 'You are ReveLith Tasks.',
      tools: [
        {
          name: 'create_task',
          description: 'Add a task',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      buildContext: () => 'board context',
      executeTool,
    },
    executeTool,
  }
}

describe('global tool definitions', () => {
  it('registers read_attachment, ask_clarification and analyze_media once each', () => {
    const names = globalTools().map((tool) => tool.name)
    expect(names).toEqual(['read_attachment', 'ask_clarification', 'analyze_media'])
  })

  it('never offers a tool twice, even when the skill is wrapped twice', () => {
    const { skill } = appSkill()
    const once = withGlobalTools(skill, { describeAttachments: () => 'list' })
    const twice = withGlobalTools(once, { describeAttachments: () => 'list' })
    const names = twice.tools.map((tool) => tool.name)
    expect(names).toEqual(['create_task', 'read_attachment', 'ask_clarification', 'analyze_media'])
    expect(new Set(names).size).toBe(names.length)
    // the app's own tools still route to the app's executor
    expect(twice.toolsForRequest).toBeUndefined()
  })

  it('keeps the app tools routed through the app skill', async () => {
    const { skill, executeTool } = appSkill()
    const wrapped = withGlobalTools(skill, {})
    const result = await wrapped.executeTool(call('create_task', { title: 'x' }))
    expect(result.output).toBe('app tool ran')
    expect(executeTool).toHaveBeenCalledTimes(1)
  })
})

describe('read_attachment', () => {
  const readerOptions = (): GlobalToolOptions => ({
    describeAttachments: () => describeAttachmentList(attachments),
    attachmentPath: (index) => attachments[index]?.path,
    readAttachment: async (index, offset) => {
      if (!attachments[index])
        return { ok: false, error: 'invalid attachment index (see the attachment list)' }
      if (attachments[index]!.ext === 'png') {
        return { ok: true, note: `${attachments[index]!.name} is an image attachment…` }
      }
      const start = offset
      const text = 'abcdefghij'.slice(start, start + 4)
      return { ok: true, text, totalChars: 10, offset: start }
    },
  })

  it('reports the range read and how to continue through a long file', async () => {
    const wrapped = withGlobalTools(appSkill().skill, readerOptions())
    const result = await wrapped.executeTool(call('read_attachment', { index: 0, offset: 0 }))
    expect(result.isError).toBeFalsy()
    expect(result.output).toContain('Attachment 0, total characters 10, this slice 0-4')
    expect(result.output).toContain('continue with offset=4')
    expect(result.output).toContain('abcd')
  })

  it('says when the slice reached the end of the file', async () => {
    const wrapped = withGlobalTools(appSkill().skill, readerOptions())
    const result = await wrapped.executeTool(call('read_attachment', { index: 0, offset: 6 }))
    expect(result.output).toContain('this slice 6-10 (end of file)')
  })

  it('answers a whole-file note (an image) without pretending to page it', async () => {
    const wrapped = withGlobalTools(appSkill().skill, readerOptions())
    const result = await wrapped.executeTool(call('read_attachment', { index: 1 }))
    expect(result.isError).toBeFalsy()
    expect(result.output).toBe('logo.png is an image attachment…')
  })

  it('rejects an index that is not in the attachment list', async () => {
    const wrapped = withGlobalTools(appSkill().skill, readerOptions())
    const result = await wrapped.executeTool(call('read_attachment', { index: 7 }))
    expect(result.isError).toBe(true)
    expect(result.output).toContain('invalid attachment index')
  })

  it('refuses plainly when the app has no reader, instead of inventing content', async () => {
    const wrapped = withGlobalTools(appSkill().skill, {})
    const result = await wrapped.executeTool(call('read_attachment', { index: 0 }))
    expect(result.isError).toBe(true)
    expect(result.output).toContain('no attachment reader')
  })
})

describe('ask_clarification', () => {
  const questions = [
    { id: 'audience', label: 'Who is this for?', options: ['Engineers', 'Executives'] },
  ]

  it('returns the card answers to the model', async () => {
    const askClarification = vi.fn(async () => ({ answers: 'Who is this for?: Engineers' }))
    const wrapped = withGlobalTools(appSkill().skill, { askClarification })
    const result = await wrapped.executeTool(call('ask_clarification', { questions }))
    expect(askClarification).toHaveBeenCalledWith([
      { id: 'audience', label: 'Who is this for?', options: ['Engineers', 'Executives'] },
    ])
    expect(result.isError).toBeFalsy()
    expect(result.output).toContain('The user answered the questions:')
    expect(result.output).toContain('Who is this for?: Engineers')
    expect(result.summary).toBe('Answered 1 question(s)')
  })

  it('instructs the model to decide for itself when the user skips the card', async () => {
    const wrapped = withGlobalTools(appSkill().skill, {
      askClarification: async () => ({ answers: '', cancelled: true }),
    })
    const result = await wrapped.executeTool(call('ask_clarification', { questions }))
    expect(result.isError).toBeFalsy()
    expect(result.output).toContain('skipped the questions')
    expect(result.summary).toBe('Clarification skipped')
  })

  it('drops questions with no options and refuses an empty questionnaire', async () => {
    const wrapped = withGlobalTools(appSkill().skill, { askClarification: vi.fn() })
    const result = await wrapped.executeTool(
      call('ask_clarification', { questions: [{ id: 'a', label: 'No options', options: [] }] }),
    )
    expect(result.isError).toBe(true)
    expect(result.output).toContain('at least one question with options')
  })

  it('falls back to plain text when the app has no card', async () => {
    const wrapped = withGlobalTools(appSkill().skill, {})
    const result = await wrapped.executeTool(call('ask_clarification', { questions }))
    expect(result.isError).toBeFalsy()
    expect(result.output).toContain('Wait for the answers before continuing')
  })
})

describe('analyze_media', () => {
  it('analyzes listed media and returns the text', async () => {
    const analyzeMedia = vi.fn(async () => ({ ok: true, text: 'A blue logo on white.' }))
    const wrapped = withGlobalTools(appSkill().skill, { analyzeMedia })
    const result = await wrapped.executeTool(
      call('analyze_media', {
        mediaUrls: ['https://example.com/a.png'],
        requirements: 'What is shown?',
      }),
    )
    expect(analyzeMedia).toHaveBeenCalledWith({
      mediaUrls: ['https://example.com/a.png'],
      requirements: 'What is shown?',
    })
    expect(result.output).toBe('A blue logo on white.')
    expect(result.summary).toBe('Analyzed 1 media item')
  })

  it('resolves an attachment index to its local path', async () => {
    const analyzeMedia = vi.fn(async () => ({ ok: true, text: 'ok' }))
    const wrapped = withGlobalTools(appSkill().skill, {
      analyzeMedia,
      attachmentPath: (index) => attachments[index]?.path,
    })
    await wrapped.executeTool(
      call('analyze_media', { attachmentIndex: 1, requirements: 'Read the label' }),
    )
    expect(analyzeMedia).toHaveBeenCalledWith({
      mediaUrls: ['C:/pics/logo.png'],
      requirements: 'Read the label',
    })
  })

  it('rejects a call with no media and reports a provider failure honestly', async () => {
    const wrapped = withGlobalTools(appSkill().skill, {
      analyzeMedia: async () => ({ ok: false, error: 'no media provider is configured' }),
    })
    const empty = await wrapped.executeTool(call('analyze_media', { requirements: 'Look' }))
    expect(empty.isError).toBe(true)
    expect(empty.output).toContain('needs requirements and at least one media')
    const failed = await wrapped.executeTool(
      call('analyze_media', { mediaUrls: ['x.png'], requirements: 'Look' }),
    )
    expect(failed.isError).toBe(true)
    expect(failed.output).toBe('no media provider is configured')
  })

  it('refuses plainly when the app has no media bridge', async () => {
    const wrapped = withGlobalTools(appSkill().skill, {})
    const result = await wrapped.executeTool(
      call('analyze_media', { mediaUrls: ['x.png'], requirements: 'Look' }),
    )
    expect(result.isError).toBe(true)
    expect(result.output).toContain('Media analysis is not available')
  })
})

describe('attachment context', () => {
  it('lists index, name, type and size for the model', () => {
    expect(describeAttachmentList(attachments)).toBe(
      'Attachment list (index | file name | type | size):\n' +
        '0 | report.docx | .docx | 23KB\n' +
        '1 | logo.png | .png | 4KB',
    )
    expect(describeAttachmentList([])).toBe('')
  })

  it('appends the list and the read-first instruction to the app context and prompt', () => {
    const wrapped = withGlobalTools(appSkill().skill, {
      describeAttachments: () => describeAttachmentList(attachments),
    })
    const context = wrapped.buildContext('summarize the report')
    expect(context).toContain('board context')
    expect(context).toContain('0 | report.docx | .docx | 23KB')
    expect(wrapped.systemPrompt).toContain('You are ReveLith Tasks.')
    expect(wrapped.systemPrompt).toContain('read it with read_attachment first')
  })

  it('leaves the prompt and context untouched without attachments support', () => {
    const wrapped = withGlobalTools(appSkill().skill, {})
    expect(wrapped.systemPrompt).toBe('You are ReveLith Tasks.')
    expect(wrapped.buildContext()).toBe('board context')
  })
})

describe('createGlobalTools', () => {
  it('only claims the three global tool names', async () => {
    const globals = createGlobalTools({})
    expect(globals.execute(call('create_task', {}))).toBeNull()
    expect(globals.execute(call('web_search', {}))).toBeNull()
    expect(globals.execute(call('read_attachment', { index: 0 }))).not.toBeNull()
    expect(globals.tools.map((tool) => tool.name)).toEqual([
      'read_attachment',
      'ask_clarification',
      'analyze_media',
    ])
    expect(globals.context()).toBe('')
  })
})
