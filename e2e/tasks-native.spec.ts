import { expect, test } from '@playwright/test'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { closeAndSaveVideo, launchShell } from './helpers'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(__dirname, '..')
const tasksCli = resolve(repoRoot, 'apps/tasks/out/cli/index.js')
const tasksMcp = resolve(repoRoot, 'apps/tasks/out/cli/mcp.js')

async function inTasks<T>(app: Awaited<ReturnType<typeof launchShell>>['app'], script: string): Promise<T> {
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

async function setFirstDialogInput(app: Awaited<ReturnType<typeof launchShell>>['app'], value: string, index = 0): Promise<void> {
  await inTasks<void>(app, `(() => {
    const input = document.querySelectorAll('[role="dialog"] input')[${index}];
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing dialog input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing input setter');
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
}

async function setTaskTitle(app: Awaited<ReturnType<typeof launchShell>>['app'], value: string): Promise<void> {
  await inTasks<void>(app, `(() => {
    const input = document.querySelector('[aria-label="Task title"]');
    if (!(input instanceof HTMLTextAreaElement)) throw new Error('Missing task title');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing textarea setter');
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
}

test('AI Tasks native UI opens, manages projects/tasks, settings, import and export', async () => {
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'tasks-native-ui' })
  const { app, page } = launched
  try {
    await page.evaluate(() => (window as unknown as { aiOffice: { newTasks(): Promise<void> } }).aiOffice.newTasks())
    await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.contentView.children.some((candidate) =>
        (candidate as unknown as { webContents: { getURL(): string } }).webContents
          .getURL()
          .includes('/apps/tasks/out/renderer/index.html'),
      ) ?? false,
    )).toBe(true)
    await expect.poll(() => inTasks<string>(app, 'document.title')).toContain('Tasks')
    const freshBoardText = await inTasks<string>(app, 'document.body.innerText')
    expect(freshBoardText).toContain('No project selected')
    expect(freshBoardText).not.toContain('DEMO-1')

    await inTasks<void>(app, `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'New project')?.click())()`)
    await expect.poll(() => inTasks<boolean>(app, 'Boolean(document.querySelector(\'[role="dialog"][aria-label="New project"]\'))')).toBe(true)
    await setFirstDialogInput(app, 'E2E Native Project')
    await setFirstDialogInput(app, 'NATIVE', 1)
    await inTasks<void>(app, `(() => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === 'Create project')?.click())()`)
    await expect.poll(() => inTasks<string>(app, 'document.body.innerText')).toContain('E2E Native Project')

    await inTasks<void>(app, `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'New task')?.click())()`)
    await expect.poll(() => inTasks<boolean>(app, 'Boolean(document.querySelector(\'[role="dialog"][aria-label="New task"]\'))')).toBe(true)
    await setFirstDialogInput(app, 'E2E native task')
    await inTasks<void>(app, `(() => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === 'Create task')?.click())()`)
    await expect.poll(() => inTasks<string>(app, 'document.body.innerText')).toContain('E2E native task')

    await inTasks<void>(app, `(() => {
      const card = [...document.querySelectorAll('[role="button"]')].find((entry) => entry.getAttribute('aria-label')?.includes('E2E native task'));
      if (!(card instanceof HTMLElement)) throw new Error('Task card was not rendered');
      card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    })()`)
    await expect.poll(() => inTasks<boolean>(app, 'Boolean(document.querySelector(\'[aria-label^="Task "]\'))')).toBe(true)
    await setTaskTitle(app, 'E2E edited task')
    await expect.poll(() => inTasks<string>(app, 'document.body.innerText')).toContain('E2E edited task')
    await inTasks<void>(app, `(() => {
      window.confirm = () => true;
      document.querySelector('[aria-label="Delete task"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`)
    await expect.poll(() => inTasks<string>(app, 'document.body.innerText')).not.toContain('E2E edited task')

    await inTasks<void>(app, `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Settings')?.click())()`)
    await expect.poll(() => inTasks<boolean>(app, 'Boolean(document.querySelector(\'[role="dialog"][aria-label="Project settings"]\'))')).toBe(true)
    await setFirstDialogInput(app, 'E2E Native Project', 0)
    await inTasks<void>(app, `(() => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === 'Save changes')?.click())()`)

    for (const label of ['New column', 'Labels', 'Custom fields']) {
      await inTasks<void>(app, `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === ${JSON.stringify(label)})?.click())()`)
      await expect.poll(() => inTasks<boolean>(app, 'Boolean(document.querySelector(\'[role="dialog"]\'))')).toBe(true)
      await inTasks<void>(app, `(() => {
        const close = [...document.querySelectorAll('[role="dialog"] button')].find((button) => /^(Cancel|Done|Close)$/.test(button.textContent?.trim() ?? ''));
        if (!(close instanceof HTMLElement)) throw new Error('Dialog close button missing');
        close.click();
      })()`)
    }

    await inTasks<void>(app, `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'JSON')?.click())()`)
    await expect.poll(() => inTasks<string>(app, 'document.querySelector("footer")?.innerText ?? ""')).toContain('Exported')

    const importAvailable = await inTasks<boolean>(app, `(() => [...document.querySelectorAll('button')].some((entry) => entry.textContent?.trim() === 'Import CSV'))()`)
    expect(importAvailable).toBe(true)
  } finally {
    await closeAndSaveVideo(launched, 'tasks-native-ui')
  }
})

test('AI Tasks untitled board keeps local recovery and handles Save, Discard, and Cancel on close', async () => {
  const dir = await mkdtemp(join(repoRoot, '.tmp', 'tasks-close-e2e-'))
  const filePath = join(dir, 'saved-on-close.tasks')
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'tasks-untitled-close' })
  const { app, page } = launched

  const createProject = async (name: string, key: string) => {
    await inTasks<void>(app, `(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'New project')?.click())()`)
    await expect.poll(() => inTasks<boolean>(app, 'Boolean(document.querySelector(\'[role="dialog"][aria-label="New project"]\'))')).toBe(true)
    await setFirstDialogInput(app, name)
    await setFirstDialogInput(app, key, 1)
    await inTasks<void>(app, `(() => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.trim() === 'Create project')?.click())()`)
    await expect.poll(() => inTasks<string>(app, 'document.body.innerText')).toContain(name)
  }

  try {
    await page.evaluate(() => (window as unknown as { aiOffice: { newTasks(): Promise<void> } }).aiOffice.newTasks())
    const findTaskTab = async () => page.evaluate(async () => (await window.aiOfficeTabs.list()).find((tab) => tab.kind === 'tasks'))
    await expect.poll(findTaskTab).toMatchObject({ title: 'Untitled Task Board' })
    await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.contentView.children.some((candidate) =>
        (candidate as unknown as { webContents: { getURL(): string } }).webContents
          .getURL()
          .includes('/apps/tasks/out/renderer/index.html'),
      ) ?? false,
    )).toBe(true)
    await expect.poll(() => inTasks<boolean>(app, 'Boolean(document.querySelector(".tasks-app-shell"))')).toBe(true)
    await expect.poll(() => inTasks<string>(app, `Object.keys(localStorage).find((key) => key.startsWith('revelith-tasks/board-v2/')) ?? ''`)).not.toBe('')
    const recoveryKey = await inTasks<string>(app, `Object.keys(localStorage).find((key) => key.startsWith('revelith-tasks/board-v2/')) ?? ''`)
    expect(recoveryKey).not.toBe('')
    const initialDocumentState = await inTasks<{ title: string; dirty: boolean; autoSaveTip: string }>(app, `(() => ({
      title: document.querySelector('[data-revelith-ribbon] [role="tablist"]')?.getAttribute('aria-label')?.replace(/ tools$/, ''),
      dirty: window.revelithIsDocumentDirty?.() ?? true,
      autoSaveTip: document.querySelector('.tasks-autosave-toggle')?.getAttribute('data-tip') ?? '',
    }))()`)
    expect(initialDocumentState).toEqual({
      title: 'Untitled Task Board',
      dirty: false,
      autoSaveTip: expect.stringContaining('kept locally'),
    })

    await createProject('Discarded project', 'DROP')
    await expect.poll(findTaskTab).toMatchObject({ dirty: true })
    const recovery = await inTasks<{ projects: { name: string }[] }>(app, `JSON.parse(localStorage.getItem(${JSON.stringify(recoveryKey)}) ?? '{}').state`)
    expect(recovery.projects.map((project) => project.name)).toContain('Discarded project')

    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false }) })
    const tab = await findTaskTab()
    if (!tab) throw new Error('Untitled Tasks tab was not opened')
    await page.evaluate((id) => window.aiOfficeTabs.close(id), tab.id)
    await expect.poll(findTaskTab).not.toBeNull()

    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }) })
    await page.evaluate((id) => window.aiOfficeTabs.close(id), tab.id)
    await expect.poll(findTaskTab).toBeUndefined()

    await page.evaluate(() => (window as unknown as { aiOffice: { newTasks(): Promise<void> } }).aiOffice.newTasks())
    await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.contentView.children.some((candidate) =>
        (candidate as unknown as { webContents: { getURL(): string } }).webContents
          .getURL()
          .includes('/apps/tasks/out/renderer/index.html'),
      ) ?? false,
    )).toBe(true)
    await expect.poll(() => inTasks<string>(app, `localStorage.getItem(${JSON.stringify(recoveryKey)}) ?? ''`)).toBe('')
    await createProject('Saved project', 'SAVE')
    await expect.poll(findTaskTab).toMatchObject({ dirty: true })

    await app.evaluate(({ dialog }, target) => {
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
    }, filePath)
    const saveTab = await findTaskTab()
    if (!saveTab) throw new Error('Second Tasks tab was not opened')
    await page.evaluate((id) => window.aiOfficeTabs.close(id), saveTab.id)
    await expect.poll(() => stat(filePath).then(() => true).catch(() => false)).toBe(true)
    expect(JSON.parse(await readFile(filePath, 'utf8')).state.projects.map((project: { name: string }) => project.name)).toContain('Saved project')
    await expect.poll(findTaskTab).toBeUndefined()
  } finally {
    await closeAndSaveVideo(launched, 'tasks-untitled-close')
    await rm(dir, { recursive: true, force: true })
  }
})

test('AI Tasks CLI and MCP stdio mutate the same local board file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'revelith-tasks-cli-e2e-'))
  const boardPath = join(dir, 'native.tasks')
  try {
    const add = await execFileAsync(process.execPath, [tasksCli, 'add', 'CLI native task', '--file', boardPath], { cwd: repoRoot })
    expect(add.stdout).toContain('Created')
    const csvPath = join(dir, 'import.csv')
    await writeFile(csvPath, 'title,status\nCLI imported task,Backlog', 'utf8')
    const imported = await execFileAsync(process.execPath, [tasksCli, 'import', 'csv', csvPath, '--file', boardPath], { cwd: repoRoot })
    expect(imported.stdout).toContain('1 task(s)')
    const exported = await execFileAsync(process.execPath, [tasksCli, 'export', 'json', '--file', boardPath], { cwd: repoRoot })
    expect(exported.stdout).toContain('CLI native task')
    const list = await execFileAsync(process.execPath, [tasksCli, 'tasks', '--file', boardPath], { cwd: repoRoot })
    expect(list.stdout).toContain('CLI native task')

    const mcp = spawn(process.execPath, [tasksMcp, '--file', boardPath], { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] })
    const responses: Record<string, unknown>[] = []
    let buffer = ''
    mcp.stdout.setEncoding('utf8')
    mcp.stdout.on('data', (chunk: string) => {
      buffer += chunk
      for (let newline = buffer.indexOf('\n'); newline !== -1; newline = buffer.indexOf('\n')) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) responses.push(JSON.parse(line) as Record<string, unknown>)
      }
    })
    const responseFor = async (request: Record<string, unknown>) => {
      const id = request.id
      mcp.stdin.write(`${JSON.stringify(request)}\n`)
      await expect.poll(() => responses.some((entry) => entry.id === id)).toBe(true)
      return responses.find((entry) => entry.id === id)!
    }
    await responseFor({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    const listed = await responseFor({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const tools = ((listed.result as { tools: { name: string }[] }).tools ?? []).map((tool) => tool.name)
    expect(tools).toContain('create_task')
    const called = await responseFor({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'create_task', arguments: { title: 'MCP native task' } },
    })
    expect(JSON.stringify(called)).toContain('Created')
    mcp.kill()
    await new Promise<void>((resolveExit) => mcp.once('exit', () => resolveExit()))

    const board = JSON.parse(await readFile(boardPath, 'utf8')) as { state: { tasks: { title: string }[] } }
    expect(board.state.tasks.some((task) => task.title === 'MCP native task')).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('AI Tasks saves and reopens a native .tasks document through the shell bridge', async () => {
  const dir = await mkdtemp(join(repoRoot, '.tmp', 'tasks-document-e2e-'))
  const filePath = join(dir, 'native.tasks')
  await writeFile(filePath, '{}', 'utf8')
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'tasks-document-lifecycle' })
  const { app, page } = launched
  try {
    await page.evaluate(() => (window as unknown as { aiOffice: { newTasks(): Promise<void> } }).aiOffice.newTasks())
    await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.contentView.children.some((candidate) =>
        (candidate as unknown as { webContents: { getURL(): string } }).webContents
          .getURL()
          .includes('/apps/tasks/out/renderer/index.html'),
      ) ?? false,
    )).toBe(true)

    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
    }, filePath)
    await inTasks<void>(app, `(() => {
      const key = Object.keys(localStorage).find((entry) => entry.startsWith('revelith-tasks/board-v2/'));
      if (!key || !window.electronAPI) throw new Error('Tasks bridge or local board is unavailable');
      void window.electronAPI.saveDocument(JSON.parse(localStorage.getItem(key)), 'Native Tasks', true, true)
        .then((result) => { window.__tasksSaveResult = result })
        .catch((error) => { window.__tasksSaveResult = { error: String(error) } });
    })()`)
    await expect.poll(() => inTasks<{ canceled?: boolean; error?: string; filePath?: string } | null>(app, 'window.__tasksSaveResult ?? null')).not.toBeNull()
    const saved = await inTasks<{ canceled?: boolean; error?: string; filePath?: string }>(app, 'window.__tasksSaveResult')
    expect(saved.error).toBeUndefined()
    expect(saved.filePath).toBe(filePath)
    await expect.poll(() => stat(filePath).then(() => true).catch(() => false)).toBe(true)
    const savedText = await readFile(filePath, 'utf8')
    expect(JSON.parse(savedText)).toMatchObject({ version: 2, state: { projects: expect.any(Array) } })

    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] })
    }, filePath)
    const opened = await inTasks<{ filePath: string; content: unknown }>(app, 'window.electronAPI.openDocument()')
    expect(opened.filePath).toBe(filePath)
    expect(opened.content).toEqual(JSON.parse(savedText))
  } finally {
    await closeAndSaveVideo(launched, 'tasks-document-lifecycle')
    await rm(dir, { recursive: true, force: true })
  }
})
