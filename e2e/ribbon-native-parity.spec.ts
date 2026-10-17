import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { closeAndSaveVideo, launchShell, waitForPageWithUrl } from './helpers'

type RibbonApp = { slug: string; method: string; selector: string }

const newRibbonApps: RibbonApp[] = [
  { slug: 'forms-builder', method: 'newFormsBuilder', selector: '.forms-tool-button:visible' },
  { slug: 'tasks', method: 'newTasks', selector: '.tasks-ribbon-tool:visible' },
  {
    slug: 'drawboard',
    method: 'newDrawboard',
    selector: '.wb-rb:not(.wb-rb-ai-entry):not(:disabled):visible',
  },
]

async function measureRibbonTool(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((node) => {
      const icon = node.querySelector<HTMLElement>(
        '.rb-big-icon, .revelith-ribbon-tool-icon, .tool-icon-row',
      )
      const svg = icon?.querySelector('svg')
      const style = getComputedStyle(node)
      return {
        fontSize: style.fontSize,
        iconSlotHeight: icon ? getComputedStyle(icon).minHeight : 'missing',
        iconWidth: svg ? getComputedStyle(svg).width : 'missing',
        hasNativeTitle: node.hasAttribute('title'),
        tip: node.getAttribute('data-tip'),
      }
    })
}

async function captureRibbon(page: Page, slug: string, testInfo: TestInfo) {
  const clip = await page.evaluate(() => ({
    x: 0,
    y: 0,
    width: Math.max(1, Math.min(1280, window.innerWidth)),
    height: Math.max(1, Math.min(150, window.innerHeight)),
  }))
  await testInfo.attach(`${slug}-ribbon`, {
    body: await page.screenshot({ clip }),
    contentType: 'image/png',
  })
}

async function waitForRibbonToolPage(
  app: Awaited<ReturnType<typeof launchShell>>['app'],
  selector: string,
) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    for (const candidate of app.windows()) {
      if (
        await candidate
          .locator(selector)
          .first()
          .isVisible()
          .catch(() => false)
      )
        return candidate
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const urls = await Promise.all(app.windows().map((candidate) => candidate.url()))
  throw new Error(`No visible ribbon tool ${selector}; attached page URLs: ${urls.join(', ')}`)
}

test('new ribbon tools match the established Docs metrics and ReveLith ScreenTips', async (_fixtures, testInfo) => {
  test.setTimeout(180_000)
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'ribbon-native-parity' })
  const { app, page } = launched
  try {
    await page.evaluate(async () => {
      await window.aiOffice.newDoc()
    })
    const docs = await waitForPageWithUrl(app, '://docs/')
    const docsTool = docs.locator('.rb-big[data-tip]:visible').first()
    await expect(docsTool).toBeVisible()
    const reference = await measureRibbonTool(docs, '.rb-big[data-tip]:visible')
    await captureRibbon(docs, 'docs-reference', testInfo)
    expect(reference).toMatchObject({
      fontSize: '12px',
      iconSlotHeight: '28px',
      hasNativeTitle: false,
    })

    for (const ribbonApp of newRibbonApps) {
      await page.evaluate(async (method) => {
        const api = window.aiOffice as unknown as Record<string, () => Promise<void>>
        await api[method]?.()
      }, ribbonApp.method)
      const editor = await waitForRibbonToolPage(app, ribbonApp.selector)
      const tool = editor.locator(ribbonApp.selector).first()
      await expect(tool).toBeVisible()
      const measured = await measureRibbonTool(editor, ribbonApp.selector)
      expect(measured, ribbonApp.slug).toMatchObject({
        fontSize: reference.fontSize,
        iconSlotHeight: reference.iconSlotHeight,
        hasNativeTitle: false,
      })
      expect(
        measured.tip,
        `${ribbonApp.slug} ribbon tool should provide ScreenTip text`,
      ).toBeTruthy()
      await captureRibbon(editor, ribbonApp.slug, testInfo)

      // A different ScreenTip target clears the shared "hide after click"
      // state before the command hover is measured.
      await editor.locator('.revelith-app-ribbon-file').hover()
      await tool.hover()
      await expect
        .poll(
          () =>
            editor
              .locator('.ui-screentip')
              .evaluate((tip) => tip.style.visibility)
              .catch(() => 'missing'),
          { message: `${ribbonApp.slug} ScreenTip should appear after hovering a ribbon tool` },
        )
        .toBe('visible')
      await expect(editor.locator('.ui-screentip')).toContainText(measured.tip!)
    }
  } finally {
    await closeAndSaveVideo(launched, 'ribbon-native-parity')
  }
})
