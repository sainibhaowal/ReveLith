import { expect, test, _electron as electron } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

test('packaged Windows app opens Forms Builder and saves/reopens a form', async () => {
  test.setTimeout(60_000)
  const repoRoot = resolve(__dirname, '..')
  const appPath = process.env.REVELITH_PACKAGED_EXE ?? resolve(repoRoot, 'apps/shell/release/win-unpacked/ReveLith.exe')
  const tempRoot = join(repoRoot, '.tmp', 'packaged-forms-builder')
  await mkdir(tempRoot, { recursive: true })
  const userData = await mkdtemp(join(tempRoot, 'profile-'))
  const savePath = join(userData, 'smoke.form')
  await writeFile(join(userData, 'app-settings.json'), JSON.stringify({ onboardingSeen: true }))
  const {
    ELECTRON_RUN_AS_NODE: _electronRunAsNode,
    CHROME_CRASHPAD_PIPE_NAME: _crashpadPipe,
    ...hostEnv
  } = process.env
  const app = await electron.launch({
    executablePath: appPath,
    args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userData}`],
    env: { ...hostEnv, REVELITH_USER_DATA: userData, REVELITH_NO_SPARE_VIEW: '1', REVELITH_LANG: 'en' },
    timeout: 30_000,
  })
  try {
    const page = await app.firstWindow()
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete')
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    const getFormViewId = () => app.evaluate(({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) => candidate.webContents.getURL().toLowerCase().includes('forms-builder'))
      return view?.webContents.id ?? null
    })
    await expect.poll(getFormViewId, { timeout: 20_000 }).not.toBeNull()
    const formViewId = await getFormViewId()
    await expect.poll(() => app.evaluate(({ webContents }, id) => webContents.fromId(id!)?.getURL() ?? '', formViewId)).toContain('forms-builder')

    const initial = await app.evaluate(async ({ webContents }, id) => {
      const child = webContents.fromId(id!)
      if (!child) throw new Error('Packaged Forms Builder renderer is missing')
      return child.executeJavaScript(`({ ribbon: !!document.querySelector('[data-revelith-ribbon]'), title: document.querySelector('[data-revelith-ribbon] [role="tablist"]')?.getAttribute('aria-label')?.replace(/ tools$/, ''), chat: document.querySelector('.revelith-app-chat')?.getAttribute('data-collapsed') })`)
    }, formViewId)
    expect(initial).toMatchObject({ ribbon: true, title: 'Untitled Form', chat: 'false' })

    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target })
    }, savePath)
    await app.evaluate(async ({ webContents }, id) => {
      const child = webContents.fromId(id!)
      if (!child) throw new Error('Packaged Forms Builder renderer is missing')
      await child.executeJavaScript(`document.querySelector('[data-revelith-ribbon] button') && [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Save As')?.click()`)
    }, formViewId)
    await expect.poll(() => stat(savePath).then(() => true).catch(() => false)).toBe(true)

    const content = { id: 'packaged-smoke', title: 'Packaged Smoke Form', description: 'Installed build verification', fields: [{ id: 'name', type: 'text', label: 'Name', required: true }], settings: {}, theme: {} }
    const saved = await app.evaluate(async ({ webContents }, args) => {
      const child = webContents.fromId(args.id!)
      if (!child) throw new Error('Packaged Forms Builder renderer is missing')
      return child.executeJavaScript(`window.electronAPI.saveDocument(${JSON.stringify(args.content)}, 'Packaged Smoke Form')`)
    }, { id: formViewId, content })
    expect(saved.filePath).toBe(savePath)
    expect(JSON.parse(await readFile(savePath, 'utf8'))).toEqual(content)

    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] })
    }, savePath)
    const reopened = await app.evaluate(async ({ webContents }, id) => {
      const child = webContents.fromId(id!)
      if (!child) throw new Error('Packaged Forms Builder renderer is missing')
      return child.executeJavaScript('window.electronAPI.openDocument()')
    }, formViewId)
    expect(reopened.filePath).toBe(savePath)
    expect(reopened.content).toEqual(content)
  } finally {
    await app.close()
    await rm(userData, { recursive: true, force: true })
  }
})
