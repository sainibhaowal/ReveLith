/**
 * Re-enabling Review → Spelling must restore red squiggles on EXISTING text
 * with no click or keystroke from the user (the earlier focus-cycle fix did
 * not actually do this). The test checks each native marker's rendered pixels
 * so unrelated page pixels cannot make the toggle pass or fail.
 */
import { test, expect } from '@playwright/test'
import { PNG } from 'pngjs'
import type { Page } from '@playwright/test'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

async function redUnder(page: Page, rect: { x: number; y: number; w: number; h: number }) {
  const doc = page.locator('.doc-page')
  const box = (await doc.boundingBox())!
  const png = PNG.sync.read(await doc.screenshot())
  const scale = png.width / box.width
  const x0 = Math.max(0, Math.round((rect.x - box.x) * scale))
  const x1 = Math.min(png.width, Math.round((rect.x + rect.w - box.x) * scale))
  const y0 = Math.max(0, Math.round((rect.y - box.y) * scale))
  const y1 = Math.min(png.height, Math.round((rect.y + rect.h + 6 - box.y) * scale))
  let maxRedPixelsInRow = 0
  for (let y = y0; y < y1; y++) {
    let row = 0
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4
      const r = png.data[i]!,
        g = png.data[i + 1]!,
        b = png.data[i + 2]!
      if (r > 140 && g < 110 && b < 110) row++
    }
    maxRedPixelsInRow = Math.max(maxRedPixelsInRow, row)
  }
  return maxRedPixelsInRow
}

async function wordRects(page: Page, word: string, count: number) {
  return page.evaluate(
    ({ word, count }) => {
      const root = document.querySelector('.doc-page')
      if (!root) return []
      const rects: Array<{ x: number; y: number; w: number; h: number }> = []
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node && rects.length < count; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        let from = 0
        while (rects.length < count) {
          const idx = text.indexOf(word, from)
          if (idx === -1) break
          const range = document.createRange()
          range.setStart(node, idx)
          range.setEnd(node, idx + word.length)
          const r = range.getBoundingClientRect()
          rects.push({ x: r.left, y: r.top, w: r.width, h: r.height })
          from = idx + word.length
        }
      }
      return rects
    },
    { word, count },
  )
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const POLL = { timeout: 15_000, intervals: [250, 500, 1000] }

const pageText = (page: Page) =>
  page.evaluate(() => document.querySelector('.doc-page')?.textContent ?? '')

test.describe.configure({ retries: 0 })

test('re-enabling spellcheck respells existing text without user input', async () => {
  test.setTimeout(120_000)
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'spellcheck-reenable' })
  const { app, page } = launched
  try {
    await page.locator('.quick-card').first().click()
    const editor = await waitForPageWithUrl(app, '://docs/')
    const docPage = editor.locator('.doc-page[contenteditable="true"]')
    await docPage.waitFor()
    await expect(docPage).toHaveAttribute('spellcheck', 'true')

    await docPage.click()
    await editor.keyboard.type('The quick brown fox lazyy over the old dog', { delay: 20 })
    await expect.poll(() => pageText(editor), POLL).toContain('The quick brown fox lazyy')

    const typoRects = await wordRects(editor, 'lazyy', 1)
    expect(typoRects).toHaveLength(1)
    await expect
      .poll(
        async () =>
          (await Promise.all(typoRects.map((rect) => redUnder(editor, rect)))).every((n) => n >= 8),
        POLL,
      )
      .toBe(true)
    const baseline = await Promise.all(typoRects.map((rect) => redUnder(editor, rect)))
    expect(
      baseline.every((count) => count >= 8),
      'the known misspelling has a native marker',
    ).toBe(true)
    const textBefore = await pageText(editor)

    const spelling = editor.getByRole('button', { name: 'Spelling' })
    await editor.getByRole('button', { name: 'Review' }).click()
    await spelling.waitFor()

    await spelling.click()
    await expect(docPage).toHaveAttribute('spellcheck', 'false')
    await editor.screenshot({ path: test.info().outputPath('spellcheck-off.png') })
    await expect
      .poll(
        async () =>
          (await Promise.all(typoRects.map((rect) => redUnder(editor, rect)))).every((n) => n < 8),
        {
          ...POLL,
          message: 'all existing word markers clear once spellcheck is off',
        },
      )
      .toBe(true)

    // re-enable via the ribbon only — no click into the text, no typing
    await spelling.click()
    await expect
      .poll(
        async () =>
          (await Promise.all(typoRects.map((rect) => redUnder(editor, rect)))).every((n) => n >= 8),
        {
          ...POLL,
          message: 'all existing words regain spelling markers after re-enabling',
        },
      )
      .toBe(true)
    const restored = await Promise.all(typoRects.map((rect) => redUnder(editor, rect)))
    expect(restored.every((count) => count >= 8)).toBe(true)

    // the markers return the moment the kick's trusted space lands; the kick
    // scrubs that space a beat later, so the "no trace" check must wait for it
    await expect
      .poll(() => pageText(editor), { ...POLL, message: 'the respell kick leaves no trace' })
      .toBe(textBefore)
    const textAfter = await pageText(editor)
    expect(textAfter).not.toContain('\u200b')
    expect(textAfter).not.toContain('  ')
  } finally {
    await closeAndSaveVideo(launched, 'spellcheck-reenable')
  }
})

test('toggling spellcheck never scrolls the view to the caret', async () => {
  test.setTimeout(120_000)
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'spellcheck-noscroll' })
  const { app } = launched
  try {
    await launched.page.locator('.quick-card').first().click()
    const editor = await waitForPageWithUrl(app, '://docs/')
    await editor.locator('.doc-page').waitFor()
    await wait(1500)

    // two pages of short lines, caret ends up on the last page
    await editor.locator('.doc-page').click()
    for (let i = 0; i < 58; i++) {
      await editor.keyboard.type(`ligne ${i}`, { delay: 0 })
      await editor.keyboard.press('Enter')
    }
    await wait(1000)
    const pages = await editor.locator('.page-gap-inline, .page-gap').count()
    expect(pages).toBeGreaterThan(0) // the caret really sits pages below the top

    // look at the top of the document while the caret stays at the end
    const scrollTo = (y: number) =>
      editor.evaluate((top) => {
        const s = document.querySelector('.editor-scroll')
        if (s) s.scrollTop = top
        return s?.scrollTop ?? -1
      }, y)
    await scrollTo(0)
    await wait(300)

    const spelling = editor.getByRole('button', { name: 'Spelling' })
    await editor.getByRole('button', { name: 'Review' }).click()
    await spelling.waitFor()
    const before = await editor.evaluate(
      () => document.querySelector('.editor-scroll')?.scrollTop ?? -1,
    )
    await spelling.click() // off
    await wait(800)
    await spelling.click() // on again → respell kick types at the (off-screen) caret
    await wait(2500)
    const after = await editor.evaluate(
      () => document.querySelector('.editor-scroll')?.scrollTop ?? -1,
    )
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2) // no jump to the caret's page
  } finally {
    await closeAndSaveVideo(launched, 'spellcheck-noscroll')
  }
})
