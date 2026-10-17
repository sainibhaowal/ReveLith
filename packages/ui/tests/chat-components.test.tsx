/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiMessageActions } from '../src/AiMessageActions'
import { AiToolActivity, type ToolActivity } from '../src/AiToolActivity'
import { AiClarifyCard, type ClarifyQuestion } from '../src/AiClarifyCard'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (node: ReactElement) => {
  act(() => {
    root.render(node)
  })
}

const click = (element: Element | null | undefined) => {
  expect(element).toBeTruthy()
  act(() => {
    ;(element as HTMLButtonElement).click()
  })
}

const LABELS = { copy: 'Copy reply', regenerate: 'Regenerate', rollback: 'Roll back' }
const buttonByLabel = (label: string) =>
  [...host.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === label,
  ) as HTMLButtonElement | undefined

describe('AiMessageActions', () => {
  it('renders nothing when there is no reply and no action to offer', () => {
    render(createElement(AiMessageActions, { labels: LABELS }))
    expect(host.querySelector('.ai-msg-toolbar')).toBeNull()
  })

  it('offers copy only when there is text, and reports the click', () => {
    const onCopy = vi.fn()
    render(createElement(AiMessageActions, { text: 'hello', labels: LABELS, onCopy }))
    const copy = buttonByLabel('Copy reply')
    expect(copy).toBeTruthy()
    expect(copy!.getAttribute('data-tip')).toBe('Copy reply')
    // no regenerate or rollback unless the host supplies handlers
    expect(buttonByLabel('Regenerate')).toBeUndefined()
    expect(host.querySelector('.ai-rollback-btn')).toBeNull()
    click(copy)
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('shows the confirmed tick while copied is set', () => {
    render(
      createElement(AiMessageActions, {
        text: 'hi',
        labels: LABELS,
        onCopy: vi.fn(),
        copied: true,
      }),
    )
    expect(buttonByLabel('Copy reply')!.querySelector('polyline')).toBeTruthy()
  })

  it('renders regenerate and roll back only when given, and honours disabled', () => {
    render(
      createElement(AiMessageActions, {
        text: 'hi',
        labels: LABELS,
        onRegenerate: vi.fn(),
        onRollback: vi.fn(),
        disabled: true,
      }),
    )
    expect(buttonByLabel('Regenerate')!.disabled).toBe(true)
    const rollback = host.querySelector('.ai-rollback-btn') as HTMLButtonElement
    expect(rollback.textContent).toContain('Roll back')
    expect(rollback.disabled).toBe(true)
    // the hairline only exists alongside the roll-back action
    expect(host.querySelector('.ai-rollback-sep')).toBeTruthy()
  })

  it('can offer roll back with no reply text at all', () => {
    render(createElement(AiMessageActions, { labels: LABELS, onRollback: vi.fn() }))
    expect(host.querySelector('.ai-rollback-btn')).toBeTruthy()
    expect(buttonByLabel('Copy reply')).toBeUndefined()
  })

  it('omits the separator when no icon action precedes roll back', () => {
    render(
      createElement(AiMessageActions, {
        labels: LABELS,
        onRollback: vi.fn(),
        onRegenerate: vi.fn(),
      }),
    )
    expect(host.querySelector('.ai-rollback-sep')).toBeTruthy()
    expect(host.querySelector('.ai-msg-tool-btn')).toBeTruthy()
  })
})

describe('AiToolActivity', () => {
  const labels = { working: 'Working', worked: (steps: number) => `Worked ${steps} steps` }
  const finished = (count: number): ToolActivity[] =>
    Array.from({ length: count }, (_, index) => ({
      name: `tool_${index}`,
      summary: `Step ${index}`,
      output: `out ${index}`,
    }))

  it('renders nothing for an empty run', () => {
    render(createElement(AiToolActivity, { tools: [], labels }))
    expect(host.querySelector('.ai-work-group')).toBeNull()
  })

  it('shows the working label and opens itself while a tool runs', () => {
    render(
      createElement(AiToolActivity, {
        tools: [{ name: 'draw', summary: 'Drawing', running: true }],
        labels,
      }),
    )
    expect(host.querySelector('.ai-work-group-label')!.textContent).toBe('Working')
    expect(host.querySelector('.ai-work-group-body')!.className).toContain('open')
    // while it is open the step icons carry the state, so no spinner
    expect(host.querySelector('.ai-tool-chip-spinner')).toBeNull()
  })

  it('shows a spinner when the user collapses a still-running group', () => {
    render(
      createElement(AiToolActivity, {
        tools: [{ name: 'draw', summary: 'Drawing', running: true }],
        labels,
      }),
    )
    click(host.querySelector('.ai-work-group-summary'))
    expect(host.querySelector('.ai-work-group-body')!.className).not.toContain('open')
    // collapsed and still running: the spinner is the only remaining signal
    expect(host.querySelector('.ai-tool-chip-spinner')).toBeTruthy()
    expect(host.querySelector('.ai-work-group-label')!.textContent).toBe('Working')
  })

  it('collapses to the step count once every tool has finished', () => {
    render(createElement(AiToolActivity, { tools: finished(3), labels }))
    expect(host.querySelector('.ai-work-group-label')!.textContent).toBe('Worked 3 steps')
    expect(host.querySelector('.ai-work-group-body')!.className).not.toContain('open')
    expect(host.querySelectorAll('.ai-step-row')).toHaveLength(3)
    expect(host.querySelector('.ai-tool-chip-spinner')).toBeNull()
  })

  it('lets a manual toggle override the automatic state', () => {
    render(createElement(AiToolActivity, { tools: finished(2), labels }))
    click(host.querySelector('.ai-work-group-summary'))
    expect(host.querySelector('.ai-work-group-body')!.className).toContain('open')
    click(host.querySelector('.ai-work-group-summary'))
    expect(host.querySelector('.ai-work-group-body')!.className).not.toContain('open')
  })

  it('marks each step status and expands a finished row to its output', () => {
    render(
      createElement(AiToolActivity, {
        tools: [
          { name: 'ok', summary: 'Fine', output: 'the output' },
          { name: 'bad', summary: 'Failed', isError: true, output: 'boom' },
        ],
        labels,
      }),
    )
    expect(host.querySelectorAll('.ai-step-icon.done')).toHaveLength(1)
    expect(host.querySelectorAll('.ai-step-icon.error')).toHaveLength(1)
    const titles = [...host.querySelectorAll('.ai-step-title.clickable')]
    expect(titles).toHaveLength(2)
    click(titles[0])
    expect(host.querySelector('.ai-tool-output-pre')!.textContent).toBe('the output')
  })

  it('uses a custom detail body when supplied, and offers it even while running', () => {
    render(
      createElement(AiToolActivity, {
        tools: [{ name: 'draw', summary: 'Drawing', running: true, input: { x: 1 } }],
        labels,
        renderDetail: (tool) =>
          createElement('div', { className: 'custom-detail' }, JSON.stringify(tool.input)),
      }),
    )
    // the default body would wait for the tool to finish; a custom one does not
    const title = host.querySelector('.ai-step-title.clickable')
    expect(title).toBeTruthy()
    click(title)
    expect(host.querySelector('.custom-detail')!.textContent).toBe('{"x":1}')
  })

  it('gives a step with no output a plain title, not an expander', () => {
    render(
      createElement(AiToolActivity, {
        tools: [{ name: 'quiet', summary: 'Nothing to show' }],
        labels,
      }),
    )
    expect(host.querySelector('.ai-step-title.clickable')).toBeNull()
    expect(host.querySelector('.ai-step-title')!.textContent).toBe('Nothing to show')
  })
})

describe('AiClarifyCard', () => {
  const questions: ClarifyQuestion[] = [
    {
      id: 'audience',
      label: 'Who is this for?',
      options: ['Engineers', 'Executives'],
      description: 'Sets the tone',
    },
    { id: 'tone', label: 'Which tone?', options: ['Formal', 'Playful'], multi: true },
  ]
  const optionByText = (text: string) =>
    [...host.querySelectorAll('.ai-clarify-opt')].find((button) =>
      button.textContent?.includes(text),
    ) as HTMLButtonElement | undefined

  it('renders one question at a time with progress and the decide-for-me row', () => {
    render(createElement(AiClarifyCard, { questions, onSubmit: vi.fn(), onSkip: vi.fn() }))
    expect(host.querySelector('.ai-clarify-label')!.textContent).toBe('Who is this for?')
    expect(host.querySelector('.ai-clarify-desc')!.textContent).toBe('Sets the tone')
    expect(host.querySelector('.ai-clarify-head-progress')!.textContent).toBe('1 / 2')
    // the card adds "decide for me" itself; the model only supplies real options
    expect(host.querySelectorAll('.ai-clarify-opt')).toHaveLength(3)
    expect(optionByText('Decide for me')).toBeTruthy()
  })

  it('submits the picked single-select answer after the short advance beat', () => {
    vi.useFakeTimers()
    try {
      const onSubmit = vi.fn()
      render(
        createElement(AiClarifyCard, { questions: [questions[0]!], onSubmit, onSkip: vi.fn() }),
      )
      click(optionByText('Engineers'))
      expect(onSubmit).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(onSubmit).toHaveBeenCalledTimes(1)
      const [answers, qa] = onSubmit.mock.calls[0] as [string, Array<{ q: string; a: string }>]
      expect(answers).toBe('Who is this for?: Engineers')
      expect(qa).toEqual([{ q: 'Who is this for?', a: 'Engineers' }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a multi-select question open until Next, then accepts a free-text answer', () => {
    const onSubmit = vi.fn()
    render(createElement(AiClarifyCard, { questions: [questions[1]!], onSubmit, onSkip: vi.fn() }))
    // multi: checkbox glyph + badge, and the pick does not advance on its own
    expect(host.querySelector('.ai-clarify-multi-badge')!.textContent).toBe('Multiple choice')
    click(optionByText('Formal'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(host.querySelector('.ai-clarify-count')!.textContent).toBe('1 selected')
    const other = host.querySelector('.ai-clarify-other') as HTMLInputElement
    act(() => {
      // React tracks the node's own value descriptor; a plain assignment is
      // swallowed before onChange runs.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(other, 'Dry and technical')
      other.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click(host.querySelector('.ai-clarify-submit'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect((onSubmit.mock.calls[0] as [string])[0]).toBe('Which tone?: Formal、Dry and technical')
  })

  it('disables submit until something is chosen and reports a skip', () => {
    const onSkip = vi.fn()
    render(createElement(AiClarifyCard, { questions: [questions[1]!], onSubmit: vi.fn(), onSkip }))
    expect((host.querySelector('.ai-clarify-submit') as HTMLButtonElement).disabled).toBe(true)
    click(host.querySelector('.ai-clarify-skip'))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('walks to the next question through the header pager after answering', () => {
    render(createElement(AiClarifyCard, { questions, onSubmit: vi.fn(), onSkip: vi.fn() }))
    const next = host.querySelector(
      '.ai-clarify-head-arrows button[aria-label="Next"]',
    ) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    vi.useFakeTimers()
    try {
      click(optionByText('Engineers'))
      act(() => {
        vi.advanceTimersByTime(300)
      })
    } finally {
      vi.useRealTimers()
    }
    expect(host.querySelector('.ai-clarify-head-progress')!.textContent).toBe('2 / 2')
    expect(host.querySelector('.ai-clarify-label')!.textContent).toBe('Which tone?')
  })

  it('renders nothing without questions', () => {
    render(createElement(AiClarifyCard, { questions: [], onSubmit: vi.fn(), onSkip: vi.fn() }))
    expect(host.querySelector('.ai-clarify-card')).toBeNull()
  })
})
