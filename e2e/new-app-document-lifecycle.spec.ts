import { expect, test } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { launchShell } from './helpers'

const cases = [
  { kind: 'forms', slug: 'forms-builder', launch: 'newFormsBuilder', ext: 'form', title: 'Lifecycle Form', untitled: 'Untitled Form', first: { id: 'form-e2e', title: 'Lifecycle Form', description: '', fields: [], settings: {}, theme: {} }, second: { id: 'form-e2e', title: 'Updated Lifecycle Form', description: '', fields: [], settings: {}, theme: {} } },
  { kind: 'tasks', slug: 'tasks', launch: 'newTasks', ext: 'tasks', title: 'Lifecycle Tasks', untitled: 'Untitled Task Board', first: { version: 1, tasks: [{ id: 'task-e2e', title: 'Lifecycle task', notes: '', status: 'todo', priority: 'medium', due: '', createdAt: 1 }] }, second: { version: 1, tasks: [{ id: 'task-e2e', title: 'Updated lifecycle task', notes: '', status: 'doing', priority: 'high', due: '', createdAt: 1 }] } },
  { kind: 'drawboard', slug: 'drawboard', launch: 'newDrawboard', ext: 'draw', title: 'Lifecycle Drawing', untitled: 'Untitled Drawing', first: { version: 1, ops: [{ kind: 'text', color: '#000000', size: 18, at: [10, 20], text: 'Lifecycle board' }] }, second: { version: 1, ops: [{ kind: 'text', color: '#000000', size: 18, at: [10, 20], text: 'Updated lifecycle board' }] } },
] as const

test('new app tabs save and reopen files, autosave to the chosen path, and protect dirty tabs on close', async () => {
  // Electron test processes can be denied by Windows security software when
  // they create atomic-save siblings below the global OS temp directory. Keep
  // this scratch path inside the ignored repository test workspace instead.
  const saveRoot = resolve(__dirname, '../.tmp/e2e')
  await mkdir(saveRoot, { recursive: true })
  const saveDir = await mkdtemp(join(saveRoot, 'revelith-new-app-docs-'))
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'new-app-document-lifecycle' })

  try {
    for (const item of cases) {
      // Draw is still built from the legacy `apps/whiteboard` workspace in
      // this checkout, even though its public app slug is `drawboard`.
      const workspaceSlugs = item.slug === 'drawboard' ? ['drawboard', 'whiteboard'] : [item.slug]
      await page.evaluate(async (method) => {
        const api = window.aiOffice as unknown as Record<string, () => Promise<void>>
        await api[method]?.()
      }, item.launch)

      const childForApp = () => app.evaluate(({ BrowserWindow }, slugs) => {
        const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) =>
          slugs.some((slug) => candidate.webContents.getURL().includes(`/apps/${slug}/out/renderer/index.html`)),
        )
        return view?.webContents.id ?? null
      }, workspaceSlugs)
      await expect.poll(childForApp).not.toBeNull()

      const session = await app.evaluate(({ BrowserWindow }, slugs) => {
        const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) =>
          slugs.some((slug) => candidate.webContents.getURL().includes(`/apps/${slug}/out/renderer/index.html`)),
        )
        if (!view) throw new Error('Missing app view')
        return { id: view.webContents.id, title: view.webContents.getTitle(), href: view.webContents.getURL() }
      }, workspaceSlugs)
      expect(workspaceSlugs.some((slug) => session.href.includes(`/apps/${slug}/out/renderer/index.html`))).toBe(true)

      const chatState = async () => app.evaluate(({ webContents }, webContentsId) => {
        const child = webContents.fromId(webContentsId)
        if (!child) throw new Error('Missing integrated app renderer')
        return child.executeJavaScript(`(() => ({
          dock: document.querySelector('.revelith-app-chat')?.getAttribute('data-collapsed'),
          ribbonButton: [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'ReveLith Chat'),
        }))()`)
      }, session.id)
      await page.waitForTimeout(500)
      const initialChat = await chatState()
      // Tasks replaces the chat dock with its task-detail pane when a task is
      // already selected in a restored board. The dedicated Tasks E2E covers
      // the chat dock itself; this lifecycle test only toggles it when present.
      if (initialChat.dock !== undefined) {
        expect(initialChat).toEqual({ dock: 'false', ribbonButton: false })
        await app.evaluate(async ({ webContents }, webContentsId) => {
          const child = webContents.fromId(webContentsId)
          if (!child) throw new Error('Missing integrated app renderer')
          await child.executeJavaScript(`document.querySelector('[aria-label="Collapse chat"]')?.click()`)
        }, session.id)
        await expect.poll(chatState).toEqual({ dock: 'true', ribbonButton: false })
        await app.evaluate(async ({ webContents }, webContentsId) => {
          const child = webContents.fromId(webContentsId)
          if (!child) throw new Error('Missing integrated app renderer')
          await child.executeJavaScript(`document.querySelector('[aria-label="Expand ReveLith chat"]')?.click()`)
        }, session.id)
        await expect.poll(chatState).toEqual({ dock: 'false', ribbonButton: false })
      }

      const filePath = join(saveDir, `${item.kind}-lifecycle.${item.ext}`)
      await app.evaluate(({ dialog }, targetPath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath })
      }, filePath)

      const initialUi = await app.evaluate(({ webContents }, webContentsId) => {
        const child = webContents.fromId(webContentsId)
        if (!child) throw new Error('Missing integrated app renderer')
        return child.executeJavaScript(`(() => ({
          title: document.querySelector('[data-revelith-ribbon] [role="tablist"]')?.getAttribute('aria-label')?.replace(/ tools$/, ''),
          saveAs: [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Save As'),
        }))()`)
      }, session.id)
      expect(initialUi).toEqual({ title: item.untitled, saveAs: true })
      // Save As is a File-ribbon command. Activate that ribbon tab first so
      // the click targets the mounted command instead of the hidden tab panel.
      await app.evaluate(async ({ webContents }, webContentsId) => {
        const child = webContents.fromId(webContentsId)
        if (!child) throw new Error('Missing integrated app renderer')
        await child.executeJavaScript(`(() => [...document.querySelectorAll('button[role="tab"]')].find((button) => button.textContent?.trim() === 'File')?.click())()`)
      }, session.id)
      await expect.poll(async () => app.evaluate(({ webContents }, webContentsId) => webContents.fromId(webContentsId)?.executeJavaScript(`(() => { const tab = [...document.querySelectorAll('button[role="tab"]')].find((button) => button.textContent?.trim() === 'File'); return tab ? tab.getAttribute('aria-selected') : 'true' })()`), session.id)).toBe('true')
      await app.evaluate(async ({ webContents }, webContentsId) => {
        const child = webContents.fromId(webContentsId)
        if (!child) throw new Error('Missing integrated app renderer')
        await child.executeJavaScript(`(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save As')?.click())()`)
      }, session.id)
      await expect.poll(async () => (await import('node:fs/promises')).stat(filePath).then(() => true).catch(() => false)).toBe(true)

      const saved = await app.evaluate(async ({ webContents }, args) => {
        const child = webContents.fromId(args.webContentsId)
        if (!child) throw new Error('Missing integrated app renderer')
        return child.executeJavaScript(`window.electronAPI.saveDocument(${JSON.stringify(args.content)}, ${JSON.stringify(args.title)})`)
      }, { webContentsId: session.id, content: item.first, title: item.title })
      expect(saved.filePath).toBe(filePath)
      expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual(item.first)

      const dirtyState = await app.evaluate(async ({ webContents }, args) => {
        const child = webContents.fromId(args.webContentsId)
        if (!child) throw new Error('Missing integrated app renderer')
        await child.executeJavaScript(`window.electronAPI.setDocumentState(true, ${JSON.stringify(args.title)})`)
        return child.executeJavaScript('window.electronAPI.saveDocument(' + JSON.stringify(args.content) + ', ' + JSON.stringify(args.title) + ', false, false)')
      }, { webContentsId: session.id, content: item.second, title: item.title })
      expect(dirtyState.filePath).toBe(filePath)
      expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual(item.second)

      const tab = await page.evaluate(async (kind) => {
        const tabs = await window.aiOfficeTabs.list()
        return tabs.find((candidate) => candidate.kind === kind)
      }, item.kind)
      expect(tab?.filePath).toBe(filePath)

      await app.evaluate(({ dialog }, targetPath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [targetPath] })
      }, filePath)
      const opened = await app.evaluate(async ({ webContents }, webContentsId) => {
        const child = webContents.fromId(webContentsId)
        if (!child) throw new Error('Missing integrated app renderer')
        return child.executeJavaScript('window.electronAPI.openDocument()')
      }, session.id)
      expect(opened.filePath).toBe(filePath)
      expect(opened.content).toEqual(item.second)
      await app.evaluate(async ({ webContents }, args) => {
        const child = webContents.fromId(args.webContentsId)
        if (!child) throw new Error('Missing integrated app renderer')
        await child.executeJavaScript(`window.electronAPI.setDocumentPath(${JSON.stringify(args.filePath)}, ${JSON.stringify(args.title)})`)
        return child.executeJavaScript('window.electronAPI.getDocument()')
      }, { webContentsId: session.id, filePath, title: item.title }).then((loaded) => expect(loaded.content).toEqual(item.second))

      await app.evaluate(async ({ webContents }, args) => {
        const child = webContents.fromId(args.webContentsId)
        if (!child) throw new Error('Missing integrated app renderer')
        return child.executeJavaScript(`window.electronAPI.setDocumentState(true, ${JSON.stringify(args.title)})`)
      }, { webContentsId: session.id, title: item.title })
      await expect.poll(() => page.evaluate(async (kind) => (await window.aiOfficeTabs.list()).find((candidate) => candidate.kind === kind)?.dirty ?? false, item.kind)).toBe(true)
      await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false }) })
      await page.evaluate((id) => window.aiOfficeTabs.close(id), tab!.id)
      await expect.poll(() => page.evaluate(async (kind) => (await window.aiOfficeTabs.list()).some((candidate) => candidate.kind === kind), item.kind)).toBe(true)
      await app.evaluate(async ({ webContents }, webContentsId) => {
        const child = webContents.fromId(webContentsId)
        if (child) await child.executeJavaScript('window.electronAPI.setDocumentState(false, "Saved")')
      }, session.id)
    }
  } finally {
    await app.close()
    await rm(saveDir, { recursive: true, force: true })
  }
})
