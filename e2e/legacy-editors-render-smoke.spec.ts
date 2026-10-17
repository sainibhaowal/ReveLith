import { expect, test } from '@playwright/test'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const editors = [
  { kind: 'docs', method: 'newDoc' },
  { kind: 'sheets', method: 'newSheet' },
  { kind: 'slides', method: 'newSlide' },
  { kind: 'pdf', method: 'newPdf' },
  { kind: 'markdown', method: 'newMarkdown' },
  { kind: 'html', method: 'newHtml' },
] as const

test('all six existing editor renderers mount visible controls instead of a blank surface', async () => {
  test.setTimeout(180_000)
  const saveRoot = resolve(__dirname, '../.tmp/e2e-data')
  await mkdir(saveRoot, { recursive: true })
  const saveDir = await mkdtemp(join(saveRoot, 'legacy-render-smoke-'))
  const launched = await launchShell({
    onboardingSeen: true,
    settings: { defaultSaveDir: saveDir },
    videoDir: 'legacy-editors-render-smoke',
  })
  const { app, page } = launched
  try {
    for (const editor of editors) {
      await page.evaluate(async (method) => {
        const api = window.aiOffice as unknown as Record<
          string,
          (options?: { dir?: string }) => Promise<void>
        >
        await api[method]?.()
      }, editor.method)
      const editorPage = await waitForPageWithUrl(app, `://${editor.kind}/`, 30_000)
      await expect(editorPage.locator('body')).toBeVisible({ timeout: 15_000 })
      await expect
        .poll(
          () =>
            editorPage
              .locator('body')
              .innerText()
              .catch(() => ''),
          {
            timeout: 20_000,
            message: `${editor.kind} should render its UI`,
          },
        )
        .toMatch(/.{6}/s)
      const root = editorPage.locator('#root')
      if (await root.count()) await expect(root.locator(':scope > *').first()).toBeVisible()
    }
  } finally {
    await closeAndSaveVideo(launched, 'legacy-editors-render-smoke')
    await rm(saveDir, { recursive: true, force: true })
  }
})
