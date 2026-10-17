import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { launchShell, closeAndSaveVideo, waitForPageWithUrl } from './helpers'

interface AidocsWindow {
  __aidocs?: {
    editor?: {
      getAttributes: (name: string) => Record<string, unknown>
      chain: () => { focus: () => { insertContent: (content: unknown) => { run: () => boolean } } }
    }
    save?: () => Promise<unknown>
  }
}

async function minimalDocx(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Chart layout check</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

function makeTestDir(prefix: string): string {
  const root = join(process.cwd(), '.tmp', 'e2e')
  mkdirSync(root, { recursive: true })
  return realpathSync(mkdtempSync(join(root, prefix)))
}

test('inserted chart exposes format controls and saves size, alignment, and chart kind', async () => {
  test.setTimeout(180_000)
  const dir = makeTestDir('revelith-e2e-chart-layout-')
  const docPath = join(dir, 'chart.docx')
  writeFileSync(docPath, await minimalDocx())
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'docs-chart-layout',
    openFile: docPath,
  })

  try {
    const page = await waitForPageWithUrl(launched.app, '://docs/')
    await page.waitForFunction(
      () => Boolean((window as unknown as AidocsWindow).__aidocs?.editor),
      undefined,
      { timeout: 30_000 },
    )

    await page.locator('.ribbon-tab', { hasText: 'Insert' }).click()
    await page.getByRole('button', { name: 'Chart', exact: true }).click()
    const dialog = page.locator('.modal-chart')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Radar', exact: true }).click()
    await dialog.getByRole('button', { name: 'Insert', exact: true }).click()

    const chart = page.locator('.doc-page .doc-protected-chart').first()
    await expect(chart).toBeVisible()
    await chart.click()
    const formatTab = page.locator('.ribbon-tab', { hasText: 'Chart Format' })
    await expect(formatTab).toBeVisible()
    await expect(formatTab).toHaveClass(/active/)

    await page.getByLabel('Width').fill('15 cm')
    await page.getByLabel('Width').press('Enter')
    await page.getByLabel('Height').fill('8 cm')
    await page.getByLabel('Height').press('Enter')
    await page.getByRole('button', { name: /^Center/ }).click()
    await expect(chart).toHaveCSS('text-align', 'center')

    const chartState = await page.evaluate(() => {
      const attrs = (window as unknown as AidocsWindow).__aidocs!.editor!.getAttributes(
        'docProtected',
      )
      const display = attrs.chartDisplay as { kind?: string; widthPx?: number; heightPx?: number }
      return { kind: display.kind, widthPx: display.widthPx, heightPx: display.heightPx }
    })
    expect(chartState).toEqual({ kind: 'radar', widthPx: 567, heightPx: 302 })

    const saveResult = await page.evaluate(() =>
      (window as unknown as AidocsWindow).__aidocs!.save!(),
    )
    expect(saveResult, await page.locator('.status-msg').textContent()).toBe(true)
    const zip = await JSZip.loadAsync(readFileSync(docPath))
    const documentXml = await zip.file('word/document.xml')!.async('string')
    const chartXml = await zip.file('word/charts/chart1.xml')!.async('string')
    expect(documentXml).toContain('<w:jc w:val="center"/>')
    expect(documentXml).toContain('cx="5400675"')
    expect(documentXml).toContain('cy="2876550"')
    expect(chartXml).toContain('<c:radarChart>')
  } finally {
    await closeAndSaveVideo(launched, 'docs-chart-layout')
    rmSync(dir, { recursive: true, force: true })
  }
})

test('newly inserted pictures can use and save the Word position presets', async () => {
  test.setTimeout(180_000)
  const dir = makeTestDir('revelith-e2e-picture-position-')
  const docPath = join(dir, 'picture.docx')
  writeFileSync(docPath, await minimalDocx())
  const launched = await launchShell({
    onboardingSeen: true,
    videoDir: 'docs-picture-position',
    openFile: docPath,
  })

  try {
    const page = await waitForPageWithUrl(launched.app, '://docs/')
    await page.waitForFunction(
      () => Boolean((window as unknown as AidocsWindow).__aidocs?.editor),
      undefined,
      { timeout: 30_000 },
    )
    await expect(page.getByText('Chart layout check', { exact: true })).toBeVisible()
    await page.getByText('Chart layout check', { exact: true }).click()
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    await page.evaluate((base64) => {
      const editor = (window as unknown as AidocsWindow).__aidocs!.editor!
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'docProtected',
          attrs: {
            docxIndex: null,
            blockType: 'image',
            label: 'Picture',
            imageDataUrl: `data:image/png;base64,${base64}`,
            imageWidthPx: 120,
            imageHeightPx: 120,
            genImage: { base64, mime: 'image/png', widthPx: 120, heightPx: 120 },
          },
        })
        .run()
    }, png)

    const picture = page.locator('.doc-page .doc-img-wrap img').first()
    await expect(picture).toBeVisible()
    await picture.click()
    await page.locator('.ribbon-tab', { hasText: 'Layout' }).click()
    const positionButton = page.getByRole('button', { name: 'Position', exact: true })
    await expect(positionButton).toBeEnabled()
    await positionButton.click()
    await page.locator('.pos-cell.ph-right.pv-bottom').click()
    const attrs = await page.evaluate(() =>
      (window as unknown as AidocsWindow).__aidocs!.editor!.getAttributes('docProtected'),
    )
    expect(attrs.imagePosH).toBe('right')
    expect(attrs.imagePosV).toBe('bottom')
    expect(await page.evaluate(() => (window as unknown as AidocsWindow).__aidocs!.save!())).toBe(
      true,
    )

    const zip = await JSZip.loadAsync(readFileSync(docPath))
    const documentXml = await zip.file('word/document.xml')!.async('string')
    expect(documentXml).toContain(
      '<wp:positionH relativeFrom="margin"><wp:align>right</wp:align></wp:positionH>',
    )
    expect(documentXml).toContain(
      '<wp:positionV relativeFrom="margin"><wp:align>bottom</wp:align></wp:positionV>',
    )
  } finally {
    await closeAndSaveVideo(launched, 'docs-picture-position')
    rmSync(dir, { recursive: true, force: true })
  }
})
