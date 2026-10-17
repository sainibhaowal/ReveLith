import { _electron as electron, expect, test, type Locator } from '@playwright/test'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const drawboardAppPath = resolve(
  existsSync(resolve('apps/drawboard/package.json')) ? 'apps/drawboard' : 'apps/whiteboard',
)

type E2EDrawSettings = {
  provider?: string
  media?: { imageProvider?: string; providers?: Record<string, { apiKey?: string }> }
}
type E2EDrawApi = {
  getAiSettings(): Promise<E2EDrawSettings>
  addAttachmentPaths(
    paths: string[],
  ): Promise<{ accepted: Array<{ path: string }>; rejected: string[] }>
  readAttachment(
    path: string,
    offset: number,
    maxChars: number,
  ): Promise<{ ok: boolean; text?: string }>
}

async function expectNeutralRibbonHover(button: Locator) {
  await button.hover()
  const expectedBackground = await button.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.cssText = 'position:fixed;left:-10000px;top:-10000px;background:var(--hover)'
    document.body.append(probe)
    const background = getComputedStyle(probe).backgroundColor
    probe.remove()
    return background
  })
  await expect
    .poll(() =>
      button.evaluate((node) => {
        const style = getComputedStyle(node)
        const icon = node.querySelector('.revelith-ribbon-tool-icon')
        const paintTarget = node.classList.contains('is-ai-entry') ? node : icon
        return {
          paint: paintTarget
            ? getComputedStyle(paintTarget).backgroundColor
            : style.backgroundColor,
          border: style.borderTopColor,
          boxShadow: style.boxShadow,
          transform: style.transform,
        }
      }),
    )
    .toEqual({
      paint: expectedBackground,
      border: 'rgba(0, 0, 0, 0)',
      boxShadow: 'none',
      transform: 'none',
    })
}

async function expectGrayTabHover(button: Locator) {
  await button.hover()
  const expectedBackground = await button.evaluate((node) => {
    const probe = document.createElement('span')
    probe.style.cssText =
      'position:fixed;left:-10000px;top:-10000px;background:var(--surface-subtle)'
    node.append(probe)
    const background = getComputedStyle(probe).backgroundColor
    probe.remove()
    return background
  })
  await expect
    .poll(() =>
      button.evaluate((node) => {
        const style = getComputedStyle(node)
        return { background: style.backgroundColor, boxShadow: style.boxShadow }
      }),
    )
    .toEqual({ background: expectedBackground, boxShadow: 'none' })
}

test('standalone Draw IPC loads shared settings and reads supported attachment files', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'revelith-draw-standalone-e2e-'))
  const inputFile = join(userData, 'drawing-notes.txt')
  const exportDirectory = join(userData, 'exports')
  const exportPaths = [
    'drawing.png',
    'drawing.svg',
    'drawing.draw',
    'quick-save.draw',
    'save-as.draw',
  ].map((name) => join(exportDirectory, name))
  await mkdir(exportDirectory, { recursive: true })
  await writeFile(inputFile, 'A standalone Draw attachment can be read by the AI agent.')
  const require = createRequire(join(drawboardAppPath, 'package.json'))
  const executablePath = require('electron') as string
  const {
    ELECTRON_RUN_AS_NODE: _electronRunAsNode,
    CHROME_CRASHPAD_PIPE_NAME: _crashpadPipeName,
    ...hostEnv
  } = process.env
  const app = await electron.launch({
    executablePath,
    args: [
      ...(process.platform === 'win32' ? ['--no-sandbox', '--disable-gpu'] : []),
      drawboardAppPath,
    ],
    env: {
      ...hostEnv,
      REVELITH_USER_DATA: userData,
      ...(process.platform === 'linux' ? { ELECTRON_DISABLE_SANDBOX: '1' } : {}),
    },
  })
  try {
    await app.evaluate(({ dialog }, paths: string[]) => {
      let nextPath = 0
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: paths[nextPath++]!,
      })) as typeof dialog.showSaveDialog
      dialog.showOpenDialog = (async () => ({
        canceled: true,
        filePaths: [],
      })) as typeof dialog.showOpenDialog
    }, exportPaths)
    const page = await app.firstWindow()
    await expect
      .poll(() => page.evaluate(() => window.location.href))
      .toContain(join(drawboardAppPath, 'out/renderer/index.html').replace(/\\/g, '/'))
    await expect.poll(() => page.locator('.excalidraw').count()).toBe(1)
    const reveLithAiButton = page.locator('.wb-rb-ai-entry').filter({ hasText: 'ReveLith AI' })
    await expectNeutralRibbonHover(reveLithAiButton)
    const editTab = page.getByRole('tab', { name: 'Edit', exact: true })
    await expectGrayTabHover(editTab)
    const homeTab = page.getByRole('tab', { name: 'Home', exact: true })
    await expectGrayTabHover(homeTab)
    const accentColor = await homeTab.evaluate((node) => {
      const probe = document.createElement('span')
      probe.style.cssText = 'position:fixed;left:-10000px;top:-10000px;color:var(--accent, #2563eb)'
      node.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    })
    await expect(homeTab).toHaveCSS('color', accentColor)
    await page.getByRole('tab', { name: 'Export', exact: true }).click()
    await expectNeutralRibbonHover(page.getByRole('button', { name: 'SVG', exact: true }))
    await page.locator('.excalidraw .main-menu-trigger').click()
    const menuSurface = await page
      .locator('.excalidraw .dropdown-menu-container')
      .evaluate((node) => {
        const style = getComputedStyle(node)
        return { background: style.backgroundColor, opacity: style.opacity, zIndex: style.zIndex }
      })
    expect(menuSurface.background).toBe('rgb(255, 255, 255)')
    expect(menuSurface.opacity).toBe('1')
    expect(menuSurface.zIndex).toBe('20')
    await page.locator('.excalidraw .main-menu-trigger').click()
    const boardCanvas = page.locator('.excalidraw canvas.interactive').first()
    await boardCanvas.click({ button: 'right', position: { x: 240, y: 180 } })
    const contextMenu = page.locator('.excalidraw .context-menu')
    await expect(contextMenu).toBeVisible()
    const contextMenuSurface = await contextMenu.evaluate((node) => {
      const style = getComputedStyle(node)
      return { background: style.backgroundColor, opacity: style.opacity, zIndex: style.zIndex }
    })
    expect(contextMenuSurface).toEqual({
      background: 'rgb(255, 255, 255)',
      opacity: '1',
      zIndex: '20',
    })
    await page.keyboard.press('Escape')
    await page.getByTestId('toolbar-rectangle').locator('xpath=..').click()
    const canvasBox = await boardCanvas.boundingBox()
    expect(canvasBox).toBeTruthy()
    const drawStart = {
      x: canvasBox!.x + canvasBox!.width * 0.45,
      y: canvasBox!.y + canvasBox!.height * 0.45,
    }
    await page.mouse.move(drawStart.x, drawStart.y)
    await page.mouse.down()
    await page.mouse.move(drawStart.x + 80, drawStart.y + 60)
    await page.mouse.up()
    const stylePanel = page.locator('.excalidraw .FixedSideContainer .Island').last()
    await expect(stylePanel).toBeVisible()
    const stylePanelSurface = await stylePanel.evaluate((node) => {
      const style = getComputedStyle(node)
      return { background: style.backgroundColor, opacity: style.opacity, zIndex: style.zIndex }
    })
    expect(stylePanelSurface).toEqual({
      background: 'rgb(255, 255, 255)',
      opacity: '1',
      zIndex: '20',
    })
    await page.getByRole('tab', { name: 'View', exact: true }).click()
    await page.emulateMedia({ colorScheme: 'light' })
    await page.locator('button[data-tip="Light canvas"]').click()
    await expect
      .poll(() =>
        page.locator('.excalidraw').evaluate((node) => node.classList.contains('theme--dark')),
      )
      .toBe(false)
    await page.locator('button[data-tip="Dark canvas"]').click()
    await expect
      .poll(() =>
        page.locator('.excalidraw').evaluate((node) => node.classList.contains('theme--dark')),
      )
      .toBe(true)
    await page.locator('button[data-tip="Follow system theme"]').click()
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect
      .poll(() =>
        page.locator('.excalidraw').evaluate((node) => node.classList.contains('theme--dark')),
      )
      .toBe(true)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect
      .poll(() =>
        page.locator('.excalidraw').evaluate((node) => node.classList.contains('theme--dark')),
      )
      .toBe(false)
    await expect(page.getByText('Draw hit an error')).toHaveCount(0)
    await expect.poll(() => page.locator('.board-tool-browser-toggle').count()).toBe(1)
    await page.locator('.board-tool-browser-toggle').click()
    await expect
      .poll(() => page.locator('.board-tool-browser-name').count())
      .toBeGreaterThanOrEqual(33)
    const toolBrowserClose = page.getByRole('button', { name: 'Close tool browser' })
    const toolBrowserCloseBox = await toolBrowserClose.boundingBox()
    expect(toolBrowserCloseBox?.width).toBeGreaterThanOrEqual(48)
    const visibleTools = await page.locator('.board-tool-browser-name').allTextContents()
    expect(visibleTools).toContain('build drawboard scene')
    expect(visibleTools).toEqual(
      expect.arrayContaining([
        'build flow diagram',
        'build sequence diagram',
        'build use case diagram',
        'build requirement diagram',
        'build uml class diagram',
        'build er diagram',
        'build state diagram',
        'build mind map',
        'build chart diagram',
        'build gantt diagram',
        'build heatmap chart',
        'build text diagram',
        'render mermaid diagram',
      ]),
    )
    expect(visibleTools).toContain('read drawboard')
    expect(visibleTools).toContain('web search')

    await page.getByRole('button', { name: 'About drawing skills' }).click()
    await expect(page.getByRole('heading', { name: 'Drawing skills' })).toBeVisible()
    await expect(page.locator('.board-skill-card')).toHaveCount(13)
    await expect(page.locator('.board-skill-card p')).toHaveCount(13)
    expect(await page.locator('.board-skill-card h4').allTextContents()).toEqual([
      'Architectural concept boards',
      'Technical and engineering drawings',
      'Isometric and perspective scenes',
      'Vector illustration craft',
      'System architecture and flow diagrams',
      'Requirements engineering models',
      'UML sequence diagrams',
      'UML use-case diagrams',
      'UML class and ER models',
      'Data chart selection',
      'Mermaid source diagrams',
      'Monospaced ASCII diagrams',
      'Product and UI design boards',
    ])
    await page.getByRole('button', { name: 'Back to drawing tools' }).click()
    await expect(page.locator('.board-tool-browser-name')).toHaveCount(visibleTools.length)

    await page.locator('.board-tool-browser-item').filter({ hasText: 'generate image' }).click()
    const setup = page.locator('[aria-labelledby="board-image-setup-title"]')
    await expect(setup).toBeVisible()
    await expect(page.locator('.board-tool-browser')).toHaveCount(0)
    const setupCloseBox = await setup.getByRole('button', { name: 'Close setup' }).boundingBox()
    expect(setupCloseBox?.width).toBeGreaterThanOrEqual(48)
    const setupLayout = await setup.evaluate((node) => {
      const bounds = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        viewportWidth: window.innerWidth,
        background: style.backgroundColor,
        opacity: style.opacity,
      }
    })
    expect(setupLayout.left).toBeGreaterThanOrEqual(0)
    expect(setupLayout.right).toBeLessThanOrEqual(setupLayout.viewportWidth)
    expect(setupLayout.width).toBeGreaterThan(0)
    expect(setupLayout.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(setupLayout.opacity).toBe('1')
    await expect(setup).toContainText('Choose an image provider')
    await expect(setup).toContainText('Test provider')
    await setup.locator('input[type="password"]').fill('e2e-placeholder-key')
    await setup.getByRole('button', { name: 'Save provider' }).click()
    await expect(setup).toContainText('Image provider saved and ready')
    const savedMedia = await page.evaluate(async () => {
      const api = (window as Window & { electronAPI?: E2EDrawApi }).electronAPI
      const settings = await api?.getAiSettings()
      const provider = settings?.media?.imageProvider
      return provider ? settings?.media?.providers?.[provider]?.apiKey : null
    })
    expect(savedMedia).toBe('e2e-placeholder-key')
    await setup.getByRole('button', { name: 'Close' }).click()

    await app.evaluate(({ ipcMain }) => {
      let turn = 0
      ipcMain.removeHandler('ai:stream')
      ipcMain.handle('ai:stream', (event, request: { requestId: string }) => {
        turn += 1
        if (turn === 1) {
          event.sender.send('ai:stream-chunk', {
            requestId: request.requestId,
            type: 'tool-call',
            toolCall: {
              id: 'draw-production-e2e',
              name: 'add_board_text',
              input: { text: 'Draw E2E verified', x: 140, y: 120 },
            },
          })
        } else if (turn === 3) {
          event.sender.send('ai:stream-chunk', {
            requestId: request.requestId,
            type: 'tool-call',
            toolCall: {
              id: 'draw-production-shape',
              name: 'add_board_shape',
              input: { shape: 'arrow', x1: 300, y1: 240, x2: 430, y2: 300, color: '#2563eb' },
            },
          })
        } else if (turn === 5) {
          event.sender.send('ai:stream-chunk', {
            requestId: request.requestId,
            type: 'tool-call',
            toolCall: {
              id: 'draw-production-stroke',
              name: 'add_freedraw',
              input: {
                points: [
                  [520, 220],
                  [550, 270],
                  [590, 230],
                ],
                color: '#16a34a',
                width: 4,
              },
            },
          })
        } else {
          event.sender.send('ai:stream-chunk', {
            requestId: request.requestId,
            type: 'delta',
            text: 'The note is on the board.',
          })
        }
        event.sender.send('ai:stream-chunk', { requestId: request.requestId, type: 'done' })
      })
    })

    await page.locator('.board-tool-browser-item').filter({ hasText: 'add board text' }).click()
    await expect(page.getByRole('textbox', { name: 'Ask ReveLith' })).toHaveValue(/add_board_text/)
    await page
      .getByRole('textbox', { name: 'Ask ReveLith' })
      .fill('Use add_board_text to add Draw E2E verified at x 140 and y 120.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.locator('.board-chat-log')).toContainText('Added board text')
    const statusbar = page.locator('.wb-statusbar')
    await expect(statusbar).toContainText(/\d+ element\(s\)/)
    const baselineElementCount = Number(
      (await statusbar.innerText()).match(/(\d+) element\(s\)/)?.[1],
    )
    expect(Number.isFinite(baselineElementCount)).toBe(true)
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __drawboardToolTrail?: string[] }).__drawboardToolTrail ?? [],
        ),
      )
      .toContain('add_board_text (done)')
    const result = await page.evaluate(async (path) => {
      const api = (window as unknown as Window & { electronAPI: E2EDrawApi }).electronAPI
      const settings = await api.getAiSettings()
      const added = await api.addAttachmentPaths([path])
      const read = await api.readAttachment(path, 0, 500)
      return {
        provider: settings.provider,
        accepted: added.accepted.length,
        rejected: added.rejected.length,
        read,
      }
    }, inputFile)
    expect(result.provider).toBeTruthy()
    expect(result.accepted).toBe(1)
    expect(result.rejected).toBe(0)
    expect(result.read.ok).toBe(true)
    expect(result.read.text).toContain('can be read by the AI agent')

    const trackChanges = page.getByRole('tab', { name: 'Review', exact: true })
    await trackChanges.click()
    const trackingOff = page.getByRole('button', { name: 'Tracking off', exact: true })
    await expect(trackingOff).toHaveAttribute('aria-pressed', 'false')
    await trackingOff.click()
    const trackingOn = page.getByRole('button', { name: 'Tracking on', exact: true })
    await expect(trackingOn).toHaveAttribute('aria-pressed', 'true')
    const recoveryTracking = await page.evaluate(() => {
      const entry = Object.entries(localStorage).find(([key]) =>
        key.startsWith('revelith-drawboard/scene-v2/'),
      )
      return entry ? JSON.parse(entry[1]).trackingEnabled : null
    })
    expect(recoveryTracking).toBe(true)

    await page.locator('.board-tool-browser-toggle').click()
    await page.getByRole('searchbox', { name: 'Search tools' }).fill('add_board_shape')
    await page.locator('.board-tool-browser-item').filter({ hasText: 'add board shape' }).click()
    const composer = page.getByRole('textbox', { name: 'Ask ReveLith' })
    await composer.fill('Use add_board_shape to add one blue arrow on the board.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.locator('.board-chat-log')).toContainText('Added arrow')
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __drawboardToolTrail?: string[] }).__drawboardToolTrail ?? [],
        ),
      )
      .toContain('add_board_shape (done)')
    await expect(
      page.getByRole('button', { name: 'Pending changes (1)', exact: true }),
    ).toBeEnabled()
    await expect(page.getByText('Added · arrow')).toBeVisible()
    await expect(page.getByText('Draw hit an error')).toHaveCount(0)
    await expect(statusbar).toContainText(`${baselineElementCount + 1} element(s)`)

    await page.getByRole('tab', { name: 'Export', exact: true }).click()
    let boardFileElementCount = 0
    for (const [index, [label, extension]] of [
      ['PNG', '.png'],
      ['SVG', '.svg'],
      ['Drawboard file', '.draw'],
    ].entries()) {
      await page.getByRole('button', { name: label, exact: true }).click()
      const filePath = exportPaths[index]!
      await expect.poll(async () => readFile(filePath).catch(() => null)).not.toBeNull()
      const exported = await readFile(filePath)
      expect(filePath.toLowerCase().endsWith(extension)).toBe(true)
      if (extension === '.png')
        expect([...exported.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      else if (extension === '.svg') expect(exported.toString('utf8')).toContain('<svg')
      else {
        const document = JSON.parse(exported.toString('utf8')) as {
          version?: number
          elements?: unknown[]
        }
        expect(document.version).toBe(2)
        expect(document.elements?.length).toBeGreaterThanOrEqual(2)
        const exportedTypes = (document.elements ?? []).map(
          (element) => (element as { type?: unknown }).type,
        )
        expect(exportedTypes).toContain('text')
        expect(exportedTypes).toContain('arrow')
        boardFileElementCount = document.elements?.length ?? 0
      }
    }
    await page.evaluate(() => {
      const target = window as Window & {
        __drawClipboardWriteCount?: number
        __drawClipboardTypes?: string[]
      }
      Object.defineProperty(window, 'ClipboardItem', {
        configurable: true,
        value: class {
          constructor(items: Record<string, Blob>) {
            target.__drawClipboardTypes = Object.keys(items)
          }
        },
      })
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          write: async (items: unknown[]) => {
            target.__drawClipboardWriteCount = items.length
          },
        },
      })
    })
    await page.getByRole('button', { name: 'Copy PNG', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __drawClipboardWriteCount?: number }).__drawClipboardWriteCount,
        ),
      )
      .toBe(1)
    expect(
      await page.evaluate(
        () => (window as Window & { __drawClipboardTypes?: string[] }).__drawClipboardTypes ?? [],
      ),
    ).toContain('image/png')

    await page.getByRole('tab', { name: 'View', exact: true }).click()
    const grid = page.getByRole('button', { name: 'Grid', exact: true })
    await grid.click()
    await expect(grid).toHaveAttribute('aria-pressed', 'true')
    await grid.click()
    await expect(grid).toHaveAttribute('aria-pressed', 'false')
    const snap = page.getByRole('button', { name: 'Snap', exact: true })
    await snap.click()
    await expect(snap).toHaveAttribute('aria-pressed', 'true')
    await snap.click()
    await expect(snap).toHaveAttribute('aria-pressed', 'false')

    await page.getByRole('tab', { name: 'Review', exact: true }).click()
    const pendingButton = page.getByRole('button', { name: 'Pending changes (1)', exact: true })
    await pendingButton.click()
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ''))
      .toBe('wb-review-list')
    await page.getByRole('button', { name: 'Reject added arrow' }).click()
    await expect(page.getByText('rejected', { exact: true })).toBeVisible()
    await expect(statusbar).toContainText(`${baselineElementCount} element(s)`)

    await page.locator('.board-tool-browser-toggle').click()
    await page.getByRole('searchbox', { name: 'Search tools' }).fill('add_freedraw')
    await page.locator('.board-tool-browser-item').filter({ hasText: 'add freedraw' }).click()
    await composer.fill('Use add_freedraw to draw a short green stroke.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.locator('.board-chat-log')).toContainText('Drew stroke')
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __drawboardToolTrail?: string[] }).__drawboardToolTrail ?? [],
        ),
      )
      .toContain('add_freedraw (done)')
    await page.getByRole('button', { name: 'Accept added freedraw' }).click()
    await expect(page.getByText('accepted', { exact: true })).toBeVisible()
    await expect(statusbar).toContainText(`${baselineElementCount + 1} element(s)`)

    await page.getByRole('tab', { name: 'Export', exact: true }).click()
    const imageInput = page.locator('#wb-insert-image')
    let imageInsertError: string | null = null
    page.on('dialog', async (dialog) => {
      imageInsertError = dialog.message()
      await dialog.accept()
    })
    await imageInput.evaluate((input) => {
      const target = window as Window & { __drawImageChangeCount?: number }
      target.__drawImageChangeCount = 0
      input.addEventListener('change', () => {
        target.__drawImageChangeCount = (target.__drawImageChangeCount ?? 0) + 1
      })
    })
    const imageChooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Image', exact: true }).click()
    await (
      await imageChooser
    ).setFiles(join(drawboardAppPath, 'src/renderer/assets/send-enter-off.png'))
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { __drawImageChangeCount?: number }).__drawImageChangeCount,
        ),
      )
      .toBe(1)
    await expect
      .poll(
        async () =>
          imageInsertError !== null ||
          (await statusbar.innerText()).includes(`${baselineElementCount + 2} element(s)`),
      )
      .toBe(true)
    if (imageInsertError) throw new Error(`Image insert failed: ${imageInsertError}`)
    await expect(statusbar).toContainText(`${baselineElementCount + 2} element(s)`)
    await expect(page.getByText('Draw hit an error')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Review', exact: true }).click()
    await page.getByRole('button', { name: 'Tracking on', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Tracking off', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await page.getByRole('tab', { name: 'Home', exact: true }).click()
    const chatPanel = page.locator('.revelith-board-chat')
    await expect(chatPanel).toHaveAttribute('data-collapsed', 'false')
    await page.getByRole('button', { name: 'ReveLith AI', exact: true }).click()
    await expect(chatPanel).toHaveAttribute('data-collapsed', 'true')
    await page.getByRole('button', { name: 'Expand ReveLith chat', exact: true }).click()
    await expect(chatPanel).toHaveAttribute('data-collapsed', 'false')
    for (const [label, expected] of [
      ['Summarize', 'Inspect the current state and summarize what is here.'],
      ['Flowchart', 'Build a clean flowchart on the board for: '],
      ['Brainstorm', 'Brainstorm on the board: '],
    ] as const) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await expect(composer).toHaveValue(expected)
    }

    const autosave = page.getByRole('button', { name: 'AutoSave', exact: true })
    const autosaveBefore = await autosave.getAttribute('aria-pressed')
    await autosave.click()
    await expect(autosave).toHaveAttribute(
      'aria-pressed',
      autosaveBefore === 'true' ? 'false' : 'true',
    )
    await autosave.click()
    await expect(autosave).toHaveAttribute('aria-pressed', autosaveBefore ?? 'false')

    await page.getByRole('tab', { name: 'Edit', exact: true }).click()
    const selectAll = page.getByRole('button', { name: 'Select all', exact: true })
    const deselect = page.getByRole('button', { name: 'Deselect', exact: true })
    await expect(selectAll).toBeEnabled()
    await selectAll.click()
    await expect(statusbar).toContainText(`${baselineElementCount + 2} selected`)
    await expect(deselect).toBeEnabled()
    await deselect.click()
    await expect(statusbar).toContainText('Nothing selected')
    await selectAll.click()
    await expect(statusbar).toContainText(`${baselineElementCount + 2} selected`)

    await page.getByRole('tab', { name: 'Style', exact: true }).click()
    const ribbonStylePanel = page.getByRole('tabpanel', { name: 'Style tools' })
    for (const label of [
      'Thin',
      'Bold',
      'Heavy',
      '25%',
      '50%',
      '100%',
      'Small',
      'Medium',
      'Large',
      'Hand',
      'Normal',
      'Code',
    ]) {
      const button = ribbonStylePanel.getByRole('button', { name: label, exact: true })
      await expect(button).toBeEnabled()
      await button.click()
    }
    await expect(statusbar).toContainText(`${baselineElementCount + 2} element(s)`)

    await page.getByRole('tab', { name: 'Arrange', exact: true }).click()
    const arrangePanel = page.getByRole('tabpanel', { name: 'Arrange tools' })
    for (const label of [
      'Front',
      'Forward',
      'Backward',
      'Back',
      'Align left',
      'Align center',
      'Align right',
      'Align top',
      'Align middle',
      'Align bottom',
      'Distribute horizontally',
      'Distribute vertically',
      'Group',
      'Ungroup',
      'Lock',
      'Unlock',
      'Flip H',
      'Flip V',
    ]) {
      const button = arrangePanel.getByRole('button', { name: label, exact: true })
      await expect(button).toBeEnabled()
      await button.click()
    }
    await expect(statusbar).toContainText(`${baselineElementCount + 2} element(s)`)

    await page.getByRole('tab', { name: 'View', exact: true }).click()
    const viewPanel = page.getByRole('tabpanel', { name: 'View tools' })
    for (const label of ['Zoom in', 'Zoom out', '100%', 'Fit'])
      await viewPanel.getByRole('button', { name: label, exact: true }).click()
    const present = viewPanel.getByRole('button', { name: 'Present', exact: true })
    await present.click()
    await expect(present).toHaveAttribute('aria-pressed', 'true')
    await present.click()
    await expect(present).toHaveAttribute('aria-pressed', 'false')
    const dark = viewPanel.getByRole('button', { name: 'Dark', exact: true })
    await dark.click()
    await expect(dark).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.revelith-board-host')).toHaveAttribute('data-theme', 'dark')
    await viewPanel.getByRole('button', { name: 'Light', exact: true }).click()
    await viewPanel.getByRole('button', { name: 'Auto', exact: true }).click()
    await expect(viewPanel.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    for (const color of ['#ffffff', '#f6f7f9', '#fef9c3', '#dcfce7', '#dbeafe', '#fae8ff']) {
      await viewPanel
        .getByRole('button', { name: `Canvas background ${color}`, exact: true })
        .click()
    }
    const settings = viewPanel.getByRole('button', { name: 'Settings', exact: true })
    await settings.click()
    await expect(page.getByLabel('Language')).toBeVisible()
    await settings.click()
    await expect(page.getByLabel('Language')).toHaveCount(0)

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(async () => readFile(exportPaths[3]!).catch(() => null)).not.toBeNull()
    await page.getByRole('tab', { name: 'File', exact: true }).click()
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await page.getByRole('button', { name: 'Save As', exact: true }).click()
    await expect.poll(async () => readFile(exportPaths[4]!).catch(() => null)).not.toBeNull()

    await page.getByRole('tab', { name: 'Edit', exact: true }).click()
    const editPanel = page.getByRole('tabpanel', { name: 'Edit tools' })
    await editPanel.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(statusbar).toContainText('0 element(s)')
    await editPanel.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(statusbar).toContainText(`${baselineElementCount + 2} element(s)`)
    await editPanel.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(statusbar).toContainText('0 element(s)')
    await page.getByRole('tab', { name: 'File', exact: true }).click()
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await expect(statusbar).toContainText('0 element(s)')
    const importChooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await (await importChooser).setFiles(exportPaths[2]!)
    await expect(statusbar).toContainText(`${boardFileElementCount} element(s)`)
    await expect(page.getByText('Draw hit an error')).toHaveCount(0)
  } finally {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBox = (async () => ({
          response: 1,
          checkboxChecked: false,
        })) as typeof dialog.showMessageBox
      })
      .catch(() => {})
    await app.close()
    await rm(userData, { recursive: true, force: true })
  }
})

test('Windows packaged Draw release opens with its bundled AI and theme controls', async () => {
  test.skip(process.platform !== 'win32', 'Windows installer payload acceptance')
  const userData = await mkdtemp(join(tmpdir(), 'revelith-draw-packaged-e2e-'))
  const executablePath = join(drawboardAppPath, 'release/win-unpacked/ReveLith Draw.exe')
  const {
    ELECTRON_RUN_AS_NODE: _electronRunAsNode,
    CHROME_CRASHPAD_PIPE_NAME: _crashpadPipeName,
    ...hostEnv
  } = process.env
  const app = await electron.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-gpu'],
    env: { ...hostEnv, REVELITH_USER_DATA: userData },
  })
  try {
    const page = await app.firstWindow()
    await expect.poll(() => page.locator('.excalidraw').count()).toBe(1)
    await expect(page.locator('.board-tool-browser-toggle')).toBeVisible()
    await page.locator('.excalidraw .main-menu-trigger').click()
    const packagedMenuSurface = await page
      .locator('.excalidraw .dropdown-menu-container')
      .evaluate((node) => {
        const style = getComputedStyle(node)
        return { background: style.backgroundColor, opacity: style.opacity, zIndex: style.zIndex }
      })
    expect(packagedMenuSurface).toEqual({
      background: 'rgb(255, 255, 255)',
      opacity: '1',
      zIndex: '20',
    })
    await page.locator('.excalidraw .main-menu-trigger').click()
    const settings = await page.evaluate(() =>
      (window as Window & { electronAPI?: E2EDrawApi }).electronAPI?.getAiSettings(),
    )
    expect(settings).toBeTruthy()
    await page.locator('.board-tool-browser-toggle').click()
    await expect
      .poll(() => page.locator('.board-tool-browser-name').count())
      .toBeGreaterThanOrEqual(33)
    await expect(
      page.locator('.board-tool-browser-name').filter({ hasText: 'build drawboard scene' }),
    ).toBeVisible()
    await expect(
      page.locator('.board-tool-browser-name').filter({ hasText: 'build sequence diagram' }),
    ).toBeVisible()
    await expect(page.getByText('Draw hit an error')).toHaveCount(0)
  } finally {
    await app.close()
    await rm(userData, { recursive: true, force: true })
  }
})

test('Windows packaged ReveLith Shell opens Draw with the full shared AI backend', async () => {
  test.skip(process.platform !== 'win32', 'Windows Shell installer payload acceptance')
  const userData = await mkdtemp(join(tmpdir(), 'revelith-shell-draw-e2e-'))
  await writeFile(join(userData, 'app-settings.json'), JSON.stringify({ onboardingSeen: true }))
  const exportDirectory = join(userData, 'draw-exports')
  await mkdir(exportDirectory, { recursive: true })
  const exportPaths = ['shell-drawing.png', 'shell-drawing.svg', 'shell-drawing.draw'].map((name) =>
    join(exportDirectory, name),
  )
  const executablePath = resolve('apps/shell/release/win-unpacked/ReveLith.exe')
  const {
    ELECTRON_RUN_AS_NODE: _electronRunAsNode,
    CHROME_CRASHPAD_PIPE_NAME: _crashpadPipeName,
    ...hostEnv
  } = process.env
  const app = await electron.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-gpu'],
    env: {
      ...hostEnv,
      REVELITH_USER_DATA: userData,
      REVELITH_NO_SPARE_VIEW: '1',
    },
  })
  try {
    const page = await app.firstWindow()
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete')
    await page.evaluate(async () => {
      await (
        window as unknown as Window & { aiOffice: { newDrawboard(): Promise<void> } }
      ).aiOffice.newDrawboard()
    })
    const getDrawSettings = async () =>
      app.evaluate(async ({ BrowserWindow }) => {
        const found = BrowserWindow.getAllWindows()[0]?.contentView.children.find((item) =>
          (item as unknown as { webContents?: { getURL(): string } }).webContents
            ?.getURL()
            .includes('drawboard'),
        )
        const view = found as unknown as
          | {
              webContents: {
                getURL(): string
                executeJavaScript<T = unknown>(js: string): Promise<T>
              }
            }
          | undefined
        if (!view) return null
        return view.webContents.executeJavaScript('window.electronAPI.getAiSettings()')
      })
    await expect.poll(getDrawSettings).not.toBeNull()
    const hasToolBrowser = () =>
      app.evaluate(async ({ BrowserWindow }) => {
        const found = BrowserWindow.getAllWindows()[0]?.contentView.children.find((item) =>
          (item as unknown as { webContents?: { getURL(): string } }).webContents
            ?.getURL()
            .includes('drawboard'),
        )
        const view = found as unknown as
          | {
              webContents: {
                getURL(): string
                executeJavaScript<T = unknown>(js: string): Promise<T>
              }
            }
          | undefined
        return view
          ? view.webContents.executeJavaScript(
              'Boolean(document.querySelector(".board-tool-browser-toggle"))',
            )
          : false
      })
    await expect.poll(hasToolBrowser).toBe(true)
    const drawTools = await app.evaluate(async ({ BrowserWindow }) => {
      const found = BrowserWindow.getAllWindows()[0]?.contentView.children.find((item) =>
        (item as unknown as { webContents?: { getURL(): string } }).webContents
          ?.getURL()
          .includes('drawboard'),
      )
      const view = found as unknown as
        | {
            webContents: {
              getURL(): string
              executeJavaScript<T = unknown>(js: string): Promise<T>
            }
          }
        | undefined
      if (!view) return 0
      return view.webContents.executeJavaScript(`new Promise((resolve) => {
        document.querySelector('.board-tool-browser-toggle')?.click();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.querySelectorAll('.board-tool-browser-name').length)));
      })`)
    })
    expect(drawTools).toBeGreaterThanOrEqual(33)

    const runInDraw = (script: string) =>
      app.evaluate(async ({ BrowserWindow }, js: string) => {
        const found = BrowserWindow.getAllWindows()[0]?.contentView.children.find((item) =>
          (item as unknown as { webContents?: { getURL(): string } }).webContents
            ?.getURL()
            .includes('drawboard'),
        )
        const view = found as unknown as
          { webContents: { executeJavaScript<T = unknown>(code: string): Promise<T> } } | undefined
        return view ? view.webContents.executeJavaScript(js) : null
      }, script)
    await app.evaluate(({ dialog }, paths: string[]) => {
      let nextPath = 0
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: paths[nextPath++]!,
      })) as typeof dialog.showSaveDialog
    }, exportPaths)
    await runInDraw(`(() => {
      [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent?.trim() === 'Export')?.click();
      return true;
    })()`)
    await expect
      .poll(() =>
        runInDraw(
          `document.querySelector('[role="tabpanel"][aria-label="Export tools"]')?.hidden === false`,
        ),
      )
      .toBe(true)
    for (const [index, [label, extension]] of [
      ['PNG', '.png'],
      ['SVG', '.svg'],
      ['Drawboard file', '.draw'],
    ].entries()) {
      const clicked = await runInDraw(`(() => {
        const panel = document.querySelector('[role="tabpanel"][aria-label="Export tools"]');
        const button = [...(panel?.querySelectorAll('button') ?? [])].find((item) => item.querySelector('.wb-rb-label')?.textContent?.trim() === '${label}');
        button?.click(); return Boolean(button);
      })()`)
      expect(clicked).toBe(true)
      const filePath = exportPaths[index]!
      await expect.poll(async () => readFile(filePath).catch(() => null)).not.toBeNull()
      const exported = await readFile(filePath)
      expect(filePath.toLowerCase().endsWith(extension)).toBe(true)
      if (extension === '.png')
        expect([...exported.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      else if (extension === '.svg') expect(exported.toString('utf8')).toContain('<svg')
      else expect((JSON.parse(exported.toString('utf8')) as { version?: number }).version).toBe(2)
    }
  } finally {
    await app.close()
    await rm(userData, { recursive: true, force: true })
  }
})

test('Windows packaged ReveLith draws a natural-language scene with the configured Codex CLI', async () => {
  test.skip(process.platform !== 'win32', 'Windows live Codex acceptance')
  test.skip(
    process.env.REVELITH_LIVE_CODEX_E2E !== '1',
    'Set REVELITH_LIVE_CODEX_E2E=1 to use the signed-in Codex CLI',
  )
  test.setTimeout(3 * 60 * 1000)
  const savedPath = join(process.env.APPDATA ?? '', 'ReveLith', 'ai-settings.json')
  let saved: { providers?: { codex?: { model?: string; cliPath?: string } } }
  try {
    saved = JSON.parse(await readFile(savedPath, 'utf8')) as typeof saved
  } catch {
    test.skip(true, 'No saved ReveLith AI settings are available on this machine')
  }
  const codex = saved!.providers?.codex
  if (!codex?.model) test.skip(true, 'No saved Codex CLI model is configured')

  // Copy only the non-secret Codex model/CLI selection into this isolated run;
  // Codex authentication remains in the user's existing CLI login.
  const userData = await mkdtemp(join(tmpdir(), 'revelith-live-codex-draw-e2e-'))
  await writeFile(join(userData, 'app-settings.json'), JSON.stringify({ onboardingSeen: true }))
  const codexHome = join(userData, 'codex-home')
  await mkdir(codexHome)
  const savedCodexHome = join(process.env.USERPROFILE ?? '', '.codex')
  // Electron E2E runs under a restricted Windows profile that can read the
  // user's Codex auth but cannot write its sqlite/temp state. Give this test a
  // private writable Codex home; it is removed with the isolated app profile.
  await copyFile(join(savedCodexHome, 'auth.json'), join(codexHome, 'auth.json'))
  await copyFile(join(savedCodexHome, 'config.toml'), join(codexHome, 'config.toml'))
  await writeFile(
    join(userData, 'ai-settings.json'),
    JSON.stringify({
      provider: 'codex',
      providers: {
        codex: {
          apiKey: '',
          model: codex.model,
          ...(codex.cliPath ? { cliPath: codex.cliPath } : {}),
        },
      },
    }),
  )
  const executablePath = resolve('apps/shell/release/win-unpacked/ReveLith.exe')
  const {
    ELECTRON_RUN_AS_NODE: _electronRunAsNode,
    CHROME_CRASHPAD_PIPE_NAME: _crashpadPipeName,
    ...hostEnv
  } = process.env
  const app = await electron.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-gpu'],
    env: {
      ...hostEnv,
      CODEX_HOME: codexHome,
      REVELITH_USER_DATA: userData,
      REVELITH_NO_SPARE_VIEW: '1',
    },
  })
  try {
    const page = await app.firstWindow()
    console.log('Codex acceptance: packaged Shell window loaded.')
    await page.evaluate(async () => {
      await (
        window as unknown as Window & { aiOffice: { newDrawboard(): Promise<void> } }
      ).aiOffice.newDrawboard()
    })
    const runInDraw = (script: string) =>
      app.evaluate(async ({ BrowserWindow }, js) => {
        const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((item) =>
          (item as unknown as { webContents?: { getURL(): string } }).webContents
            ?.getURL()
            .includes('drawboard'),
        ) as unknown as
          { webContents: { executeJavaScript<T = unknown>(code: string): Promise<T> } } | undefined
        if (!child) return null
        return child.webContents.executeJavaScript(js)
      }, script)
    await expect
      .poll(() =>
        runInDraw(
          'Boolean(document.querySelector("textarea[aria-label=\\"Ask ReveLith\\"]:not(:disabled)"))',
        ),
      )
      .toBe(true)
    console.log('Codex acceptance: Draw chat is ready.')
    const submitted = await runInDraw(`(() => {
      const input = document.querySelector('textarea[aria-label="Ask ReveLith"]');
      if (!(input instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(input, 'Create a polished three-step horizontal water purification process diagram with three aligned colored cards labeled Raw Water, Filtration, and Safe Water. Connect them with clear arrows and make the labels readable. Use the drawing tools to create the diagram.');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const send = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Send');
      if (!(send instanceof HTMLButtonElement) || send.disabled) return false;
      send.click(); return true;
    })()`)
    expect(submitted).toBe(true)
    console.log('Codex acceptance: natural-language request submitted.')
    await expect
      .poll(
        () =>
          runInDraw(
            `Boolean((window.__drawboardToolTrail ?? []).length || document.querySelector('.ai-msg-error-text'))`,
          ),
        {
          timeout: 90_000,
          message: 'Codex should start a Draw tool or report a provider error within 90 seconds',
        },
      )
      .toBe(true)
    await expect
      .poll(() => runInDraw('document.querySelector(".wb-statusbar")?.innerText ?? ""'), {
        timeout: 90_000,
      })
      .toMatch(/[1-9]\d* element/)
    await expect
      .poll(
        () =>
          runInDraw(
            `(window.__drawboardToolTrail ?? []).some((item) => /^inspect_board_visual \\(done\\)$|^inspect_board_visual \\(failed\\)$/.test(item))`,
          ),
        {
          timeout: 90_000,
          message: 'Codex should finish visual review of the generated drawing',
        },
      )
      .toBe(true)
    const evidence = (await runInDraw(`(async () => {
      const failed = [...document.querySelectorAll('.ai-step-title')].find((node) => node.textContent?.includes('Visual inspection failed'));
      if (failed) failed.click();
      const visualFailure = failed
        ? await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.querySelector('.ai-step-detail')?.innerText ?? ''))))
        : '';
      return {
        activity: document.querySelector('.board-chat-log')?.innerText ?? '',
        trail: window.__drawboardToolTrail ?? [],
        status: document.querySelector('.wb-statusbar')?.innerText ?? '',
        visualFailure,
      };
    })()`)) as { activity: string; trail: string[]; status: string; visualFailure: string } | null
    console.log('Codex acceptance response:', JSON.stringify(evidence))
    expect(evidence?.trail?.some((item: string) => item.endsWith('(done)'))).toBe(true)
    expect(evidence?.activity).toMatch(/Built scene|Added board|Read drawing|Zoomed to fit/i)
    expect(
      evidence?.trail?.some(
        (item: string) =>
          item.endsWith('(done)') && !/^(read_drawboard|inspect_board_visual) /.test(item),
      ),
    ).toBe(true)
    expect(evidence?.status).toMatch(/[1-9]\d* element/)
    expect(evidence?.trail).toContain('inspect_board_visual (done)')
    expect(evidence?.visualFailure).toBe('')
    await runInDraw(`document.querySelector('button[aria-label="Stop"]')?.click()`)
  } finally {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBox = (async () => ({
          response: 1,
          checkboxChecked: false,
        })) as typeof dialog.showMessageBox
      })
      .catch(() => {})
    await app.close()
    await rm(userData, { recursive: true, force: true })
  }
})
