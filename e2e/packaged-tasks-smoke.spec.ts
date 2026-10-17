import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { closeAndSaveVideo } from './helpers'

const repoRoot = resolve(__dirname, '..')
const packagedExe = resolve(repoRoot, 'apps/shell/release/win-unpacked/ReveLith.exe')

test('packaged ReveLith opens native AI Tasks', async () => {
  test.skip(process.platform !== 'win32', 'The packaged smoke target is the Windows executable')
  test.skip(!existsSync(packagedExe), 'Build the Windows package first')

  const userDataDir = await mkdtemp(join(repoRoot, '.tmp', 'packaged-tasks-e2e-'))
  const { ELECTRON_RUN_AS_NODE: _runAsNode, CHROME_CRASHPAD_PIPE_NAME: _crashpad, ...hostEnv } = process.env
  const app = await electron.launch({
    executablePath: packagedExe,
    args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userDataDir}`],
    env: {
      ...hostEnv,
      REVELITH_USER_DATA: userDataDir,
      REVELITH_NO_SPARE_VIEW: '1',
      REVELITH_LANG: 'en',
    },
    recordVideo: { dir: resolve(repoRoot, 'e2e/artifacts/packaged-tasks'), size: { width: 1280, height: 800 } },
  })
  const page = await app.firstWindow()
  await expect.poll(() => page.title()).toContain('ReveLith')
  const launched = { app, page, userDataDir }

  try {
    await page.evaluate(() => (window as unknown as { aiOffice: { newTasks(): Promise<void> } }).aiOffice.newTasks())
    await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.contentView.children.some((candidate) =>
        (candidate as unknown as { webContents: { getURL(): string } }).webContents
          .getURL()
          .includes('/modules/tasks/renderer/index.html'),
      ) ?? false,
    )).toBe(true)

    const readTaskUi = () => app.evaluate(async ({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) =>
        (candidate as unknown as { webContents: { getURL(): string } }).webContents
          .getURL()
          .includes('/modules/tasks/renderer/index.html'),
      ) as unknown as { webContents: { executeJavaScript(code: string): Promise<unknown> } } | undefined
      if (!view) return null
      return view.webContents.executeJavaScript(`(() => ({
        title: document.title,
        saveAs: [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Save As'),
        chat: Boolean(document.querySelector('.revelith-app-chat')),
      }))()`)
    })
    await expect.poll(readTaskUi).toEqual(expect.objectContaining({ title: expect.stringContaining('Tasks'), saveAs: true, chat: true }))
  } finally {
    await closeAndSaveVideo(launched, 'packaged-tasks')
    await rm(userDataDir, { recursive: true, force: true })
  }
})
