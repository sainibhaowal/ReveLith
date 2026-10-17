/**
 * @vitest-environment jsdom
 *
 * The composer's send BUTTON, in both panels. AiComposer's send button hands
 * React's click event straight to its own handler, so a handler declared as
 * `(text: string = input)` receives a MouseEvent and dies on `.trim()` — Enter
 * kept working while the button did nothing. These tests click the real button
 * in the real panels and insist a message goes out.
 *
 * The same mounts also pin the attach control: ONE control, using the brand
 * paperclip art the older apps ship, not a hand-drawn stand-in.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppAgentSkill } from '@revelith/app-chat'
import { AppChatPanel, isLocalAiEndpoint, toolActivityLabel } from '@revelith/app-chat'

// The panel only needs these two board modules at call time; loading the real
// ones drags Excalidraw's runtime (and its JSON assets) into jsdom.
vi.mock('../board-engine/ai-tools', () => ({
  executeBoardTool: vi.fn(async () => ({ output: 'ok', summary: 'ok' })),
  verifyBoardResponse: () => null,
}))
vi.mock('../board-engine/images', () => ({
  readBoardImages: async () => ({ images: [], notice: null }),
  readBoardImageDimensions: async () => ({ width: 100, height: 100 }),
  describeImages: () => 'none',
  describeSelection: (_api: unknown, ids: readonly string[]) =>
    ids.length
      ? `Selected ${ids.length} element(s):\n- text id=${ids[0]} bounds=10,20,80,65 text="selected text only"`
      : 'No board elements selected.',
  toAgentImages: () => [],
  placeImagesOnBoard: () => ({ placed: 0, summary: '' }),
}))

const { DrawboardChatPanel } = await import('./DrawboardChatPanel')
const { DrawboardRibbon } = await import('../ribbon/DrawboardRibbon')
import type { BoardHistory } from '../board-engine/history'
import type { ExcalidrawImperativeAPI as BoardApi } from '@excalidraw/excalidraw/types'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let streams: unknown[]
let bridge: ReturnType<typeof installShellBridge>

const noop = () => undefined

type TestStreamChunk = { requestId: string; type: 'delta' | 'done'; text?: string }

function installShellBridge(
  settings: unknown = {
    provider: 'lmstudio',
    providers: { lmstudio: { baseUrl: 'http://127.0.0.1:1234/v1' } },
  },
): {
  streams: unknown[]
  emit: (chunk: TestStreamChunk) => void
  complete: (requestId: string, text: string) => void
} {
  const streams: unknown[] = []
  let listener: ((chunk: TestStreamChunk) => void) | null = null
  const api = {
    getAiSettings: async () => settings,
    aiStream: async (request: unknown) => {
      streams.push(request)
    },
    aiStreamCancel: async () => undefined,
    onAiStream: (handler: (chunk: TestStreamChunk) => void) => {
      listener = handler
      return () => {
        if (listener === handler) listener = null
      }
    },
    getTheme: async () => 'light' as const,
    onThemeChanged: () => noop,
    getAiPanelPrefs: async () => ({ side: 'left' }),
    setAiPanelPrefs: async (patch: unknown) => patch,
    onAiPanelPrefsChanged: () => noop,
    webSearch: async () => ({ results: [], method: 'test' }),
    getGskStatus: async () => ({ loggedIn: false }),
    imageSearch: async () => ({ images: [], method: 'test' }),
    fetchImage: async () => null,
    generateImage: async () => ({ error: 'not used' }),
  }
  ;(window as unknown as { electronAPI: unknown }).electronAPI = api
  return {
    streams,
    emit: (chunk) => listener?.(chunk),
    complete: (requestId, text) => {
      listener?.({ requestId, type: 'delta', text })
      listener?.({ requestId, type: 'done' })
    },
  }
}

const appSkill = (): AppAgentSkill => ({
  id: 'tasks',
  systemPrompt: 'You are ReveLith Tasks.',
  tools: [],
  buildContext: () => 'UNRELATED BOARD CONTEXT',
  executeTool: () => ({ output: 'ok', summary: 'ok' }),
})

const boardApiStub = (): { current: BoardApi | null } => ({
  current: {
    getSceneElements: () => [],
    updateScene: noop,
    addFiles: noop,
    getAppState: () => ({}),
    updateLibrary: noop,
  } as unknown as BoardApi,
})

const historyStub = (): BoardHistory =>
  ({
    undo: noop,
    redo: noop,
    canUndo: () => false,
    canRedo: () => false,
  }) as unknown as BoardHistory

const render = (node: React.ReactElement) => {
  act(() => {
    root.render(node)
  })
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

const buttons = (selector: string) => [...host.querySelectorAll(selector)] as HTMLButtonElement[]
const byLabel = (scope: ParentNode, label: string) =>
  [...scope.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === label,
  ) as HTMLButtonElement | undefined

/** Set a controlled textarea the way a real keystroke does. */
const typeInto = (textarea: HTMLTextAreaElement | null | undefined, value: string) => {
  expect(textarea).toBeTruthy()
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(textarea, value)
    textarea!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  bridge = installShellBridge()
  streams = bridge.streams
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete (window as unknown as { electronAPI?: unknown }).electronAPI
})

describe('DrawboardChatPanel composer', () => {
  const mount = (selectionIds: string[] = []) =>
    render(
      createElement(DrawboardChatPanel, {
        skill: appSkill(),
        apiRef: boardApiStub(),
        history: historyStub(),
        selectionIds,
        onClearSelection: noop,
        onBoardMutated: noop,
        suggestion: null,
        onSuggestionConsumed: noop,
        open: true,
        onExpand: noop,
        onCollapse: noop,
      }),
    )

  it('sends when the SEND BUTTON is clicked, not just on Enter', async () => {
    mount()
    await flush()
    const panel = host.querySelector('.revelith-board-chat')!
    const textarea = panel.querySelector('textarea')
    expect(textarea?.disabled).toBe(false)

    typeInto(textarea, 'draw a red box')
    const send = byLabel(panel, 'Send')
    expect(send, 'send button exists').toBeTruthy()
    expect(send!.disabled, 'send button is enabled once there is text').toBe(false)

    // a real click: React hands the MouseEvent to the handler
    act(() => {
      send!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    expect(panel.querySelector('.ai-msg-user')?.textContent).toBe('draw a red box')
    expect(textarea!.value, 'composer clears after sending').toBe('')
  })

  it('renders each arriving Drawboard token live and keeps the streaming caret until completion', async () => {
    mount()
    await flush()
    const panel = host.querySelector('.revelith-board-chat')!
    typeInto(panel.querySelector('textarea'), 'Create a simple flowchart')
    act(() => byLabel(panel, 'Send')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await flush()

    const request = streams.at(-1) as { requestId: string }
    bridge.emit({ requestId: request.requestId, type: 'delta', text: 'Creating the first ' })
    await flush()
    const reply = panel.querySelector('.ai-msg-assistant')!
    expect(reply.classList.contains('ai-msg-streaming')).toBe(true)
    expect(reply.textContent).toContain('Creating the first')

    bridge.emit({ requestId: request.requestId, type: 'delta', text: 'two steps now.' })
    await flush()
    expect(reply.textContent).toContain('Creating the first two steps now.')
    expect(reply.classList.contains('ai-msg-streaming')).toBe(true)

    bridge.emit({ requestId: request.requestId, type: 'done' })
    await flush()
    expect(reply.classList.contains('ai-msg-streaming')).toBe(false)
  })

  it('uses truthful action-specific progress labels for AI work', () => {
    expect(toolActivityLabel('create_task')).toBe('Creating task')
    expect(toolActivityLabel('write_document')).toBe('Writing document')
    expect(toolActivityLabel('inspect_board_visual')).toBe('Inspecting board visual')
    expect(toolActivityLabel('an_unrecognized_action')).toBe('Working on an unrecognized action')
  })

  it('offers exactly one attach control, with the ReveLith paperclip art', async () => {
    mount()
    await flush()
    const panel = host.querySelector('.revelith-board-chat')!
    const attach = buttons('.revelith-board-chat .ai-attach-btn')
    expect(attach).toHaveLength(1)
    const art = attach[0]!.querySelector('img')
    expect(art?.getAttribute('src')).toContain('attach-icon')
    // no hand-drawn stand-ins left behind
    expect(panel.querySelector('.ai-attach-btn svg')).toBeNull()
  })

  it('keeps selection out of ordinary chat and sends only the selected scope on explicit Ask AI', async () => {
    mount(['selected-1'])
    await flush()
    const panel = host.querySelector('.revelith-board-chat')!
    expect(
      [...panel.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Selection context Off'),
      ),
    ).toBe(true)
    typeInto(panel.querySelector('textarea'), 'What is on the board?')
    act(() => byLabel(panel, 'Send')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await flush()
    const ordinary = streams.at(-1) as { messages?: Array<{ text: string }>; tools?: unknown[] }
    expect(ordinary.messages?.at(-1)?.text).not.toContain('selected text only')
    const ordinaryRequest = streams.at(-1) as { requestId: string }
    bridge.complete(ordinaryRequest.requestId, 'Previous board chat reply.')
    await flush()
    const scopedPanel = host.querySelector('.revelith-board-chat')!
    const ask = [...scopedPanel.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === 'Ask AI about 1 selected Drawboard element',
    )
    expect(ask).toBeTruthy()
    expect(ask!.title).toContain('local AI endpoint')
    act(() => ask!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await flush()
    const scoped = streams.at(-1) as {
      system?: string
      messages?: Array<{ text: string }>
      tools?: unknown[]
    }
    expect(scoped.tools).toEqual([])
    expect(scoped.system).toContain('Analyze only the explicitly selected Drawboard content')
    expect(scoped.system).not.toContain('build_sequence_diagram')
    expect(scoped.messages?.at(-1)?.text).toContain('selected text only')
    expect(scoped.messages?.at(-1)?.text).not.toContain('not selected')
    expect(scoped.messages).toHaveLength(1)
    expect(scoped.messages?.[0]?.text).not.toContain('UNRELATED BOARD CONTEXT')
    expect(scoped.messages?.[0]?.text).not.toContain('Previous board chat reply.')
  })

  it('blocks selected-content analysis for a cloud provider without sending the selection', async () => {
    const api = (window as unknown as { electronAPI: { getAiSettings: () => Promise<unknown> } })
      .electronAPI
    api.getAiSettings = async () => ({
      provider: 'openai',
      providers: { openai: { baseUrl: 'https://api.openai.com/v1' } },
    })
    mount(['private-selection'])
    await flush()
    const panel = host.querySelector('.revelith-board-chat')!
    const ask = byLabel(panel, 'Ask AI about 1 selected Drawboard element')
    expect(ask).toBeTruthy()
    act(() => ask!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await flush()

    expect(streams).toHaveLength(0)
    expect(panel.textContent).toContain('Selected-content analysis is local-only')
    expect(panel.textContent).toContain('No selection data was sent')
    expect(panel.textContent).not.toContain('selected text only')
  })
})

describe('Drawboard shortcuts help', () => {
  it('exposes a visible info shortcut button that opens the native shortcut reference', () => {
    const onShowShortcuts = vi.fn()
    const callbacks = { onSave: noop, onUndo: noop, onRedo: noop, onToggleAutosave: noop }
    render(
      createElement(DrawboardRibbon, {
        title: 'Untitled Drawboard',
        status: 'Saved',
        quick: { ...callbacks, canUndo: false, canRedo: false, autosave: true },
        file: { onNew: noop, onOpen: noop, onSave: noop, onSaveAs: noop, onImport: noop },
        edit: {
          canUndo: false,
          canRedo: false,
          onUndo: noop,
          onRedo: noop,
          hasSelection: false,
          hasContent: false,
          onSelectAll: noop,
          onDeselect: noop,
          onDuplicate: noop,
          onDelete: noop,
          onClear: noop,
          onShowShortcuts,
        },
        arrange: {
          canArrange: false,
          canAlign: false,
          canDistribute: false,
          isLocked: false,
          onArrange: noop,
          onAlign: noop,
          onDistribute: noop,
          onGroup: noop,
          onUngroup: noop,
          onLock: noop,
          onFlip: noop,
        },
        style: {
          canStyle: false,
          onStrokeWidth: noop,
          onOpacity: noop,
          onTextSize: noop,
          onFontFamily: noop,
        },
        view: {
          onZoomIn: noop,
          onZoomOut: noop,
          onZoomReset: noop,
          onZoomFit: noop,
          grid: false,
          onToggleGrid: noop,
          snap: false,
          onToggleSnap: noop,
          presenting: false,
          onTogglePresent: noop,
          themeMode: 'system',
          onThemeMode: noop,
          onPickBackground: noop,
          onToggleSettings: noop,
        },
        exp: { onExportPng: noop, onExportSvg: noop, onExportBoard: noop, onCopyPng: noop },
        ai: { aiOpen: false, onToggleAi: noop, onPrompt: noop },
        review: { enabled: false, revisions: [], onToggle: noop, onAccept: noop, onReject: noop },
      }),
    )
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Shortcuts"]')
    expect(button).toBeTruthy()
    expect(button!.dataset.tip).toContain('complete built-in')
    act(() => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onShowShortcuts).toHaveBeenCalledTimes(1)
  })
})

describe('AppChatPanel composer', () => {
  const mount = () =>
    render(
      createElement(AppChatPanel, {
        skill: appSkill(),
        title: 'ReveLith Chat',
        open: true,
        onExpand: noop,
        onCollapse: noop,
        command: null,
      }),
    )

  it('sends when the SEND BUTTON is clicked', async () => {
    mount()
    await flush()
    const panel = host.querySelector('.revelith-app-chat')!
    const textarea = panel.querySelector('textarea')
    typeInto(textarea, 'add a task called Ship it')
    const send = byLabel(panel, 'Send')
    expect(send?.disabled).toBe(false)

    act(() => {
      send!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    expect(panel.querySelector('.ai-msg-user')?.textContent).toBe('add a task called Ship it')
  })

  it('offers one attach control with the ReveLith paperclip art', async () => {
    mount()
    await flush()
    const attach = buttons('.revelith-app-chat .ai-attach-btn')
    expect(attach).toHaveLength(1)
    expect(attach[0]!.querySelector('img')?.getAttribute('src')).toContain('attach-icon')
  })

  it('uses the brand icon-only send art, swapping the disabled tile while empty', async () => {
    mount()
    await flush()
    const panel = host.querySelector('.revelith-app-chat')!
    const send = byLabel(panel, 'Send')!
    // empty composer: the "off" tile, as in docs/sheets
    expect(send.querySelector('img')?.getAttribute('src')).toContain('send-enter-off')
    typeInto(panel.querySelector('textarea'), 'ready to go')
    expect(
      byLabel(panel, 'Send')!.querySelector('img')?.getAttribute('src'),
      'with text the brand "enter" tile is shown',
    ).toContain('send-enter-on')
    // no text label left on the button (icon-only composer)
    expect(byLabel(panel, 'Send')!.textContent).toBe('')
  })

  it('renders a document attachment list the model is told about', async () => {
    // the reader/context wiring itself is covered in global-tools.test.ts; here
    // only the panel's promise that one button drives both kinds of attachment
    mount()
    await flush()
    const panel = host.querySelector('.revelith-app-chat')!
    expect(panel.querySelector('.ai-attach-btn img')).toBeTruthy()
    expect(panel.querySelectorAll('.ai-attachment-card')).toHaveLength(0)
  })

  it('runs selected-content commands with only scoped context and no tools', async () => {
    const executeTool = vi.fn(() => ({ output: 'should not run', summary: 'unexpected' }))
    const skill: AppAgentSkill = {
      ...appSkill(),
      tools: [
        {
          name: 'mutate_board',
          description: 'Change the board',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      executeTool,
    }
    const common = {
      skill,
      title: 'ReveLith Chat',
      open: true,
      onExpand: noop,
      onCollapse: noop,
    }
    render(createElement(AppChatPanel, { ...common, command: null }))
    await flush()
    const panel = host.querySelector('.revelith-app-chat')!
    typeInto(
      panel.querySelector('textarea'),
      'Keep this previous chat private from selection analysis.',
    )
    act(() => byLabel(panel, 'Send')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await flush()
    const previous = streams[0] as { requestId: string }
    bridge.complete(previous.requestId, 'Previous conversation reply.')
    await flush()

    render(
      createElement(AppChatPanel, {
        ...common,
        command: {
          id: 'selected-only',
          instruction: 'Analyze this selected item only.',
          submit: true,
          readOnly: true,
          localOnly: true,
          excludeAttachments: true,
          context: 'Selected item: Field A; bounds 1,2,3,4.',
          scopeLabel: 'Field A (Text)',
        },
      }),
    )
    await flush()
    const request = streams.at(-1) as { messages?: Array<{ text: string }>; tools?: unknown[] }
    expect(request.tools).toEqual([])
    expect(request.messages).toHaveLength(1)
    expect(request.messages?.[0]?.text).toContain('Selected item: Field A; bounds 1,2,3,4.')
    expect(request.messages?.[0]?.text).not.toContain('Keep this previous chat private')
    expect(host.querySelectorAll('.ai-msg-user')[1]?.textContent).toContain('Field A (Text)')
    expect(executeTool).not.toHaveBeenCalled()
  })

  it('refuses selected-content requests for cloud endpoints without sending selection data', async () => {
    bridge = installShellBridge({
      provider: 'openai',
      providers: { openai: { baseUrl: 'https://api.openai.com/v1' } },
    })
    streams = bridge.streams
    render(
      createElement(AppChatPanel, {
        skill: appSkill(),
        title: 'ReveLith Chat',
        open: true,
        onExpand: noop,
        onCollapse: noop,
        command: {
          id: 'remote-selection-blocked',
          instruction: 'Analyze this selected item only.',
          submit: true,
          readOnly: true,
          localOnly: true,
          excludeAttachments: true,
          context: 'PRIVATE_SELECTION_SENTINEL',
          scopeLabel: 'Private item',
        },
      }),
    )
    await flush()

    expect(streams).toHaveLength(0)
    expect(host.textContent).toContain('Selected-content analysis is local-only')
    expect(host.textContent).toContain('No selection data was sent')
    expect(host.textContent).not.toContain('PRIVATE_SELECTION_SENTINEL')
    expect(host.textContent).not.toContain('Private item')
  })

  it('recognizes only explicit loopback AI endpoints as local', () => {
    expect(
      isLocalAiEndpoint({
        provider: 'custom',
        providers: { custom: { baseUrl: 'http://localhost:1234/v1' } },
      } as never),
    ).toBe(true)
    expect(
      isLocalAiEndpoint({
        provider: 'custom',
        providers: { custom: { baseUrl: 'http://127.0.0.2:1234/v1' } },
      } as never),
    ).toBe(true)
    expect(
      isLocalAiEndpoint({
        provider: 'custom',
        providers: { custom: { baseUrl: 'http://[::1]:1234/v1' } },
      } as never),
    ).toBe(true)
    expect(
      isLocalAiEndpoint({
        provider: 'custom',
        providers: { custom: { baseUrl: 'https://api.example.com/v1' } },
      } as never),
    ).toBe(false)
    expect(isLocalAiEndpoint({ provider: 'openai', providers: { openai: {} } } as never)).toBe(
      false,
    )
  })
})
