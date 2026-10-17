import { _electron as electron, expect, test } from '@playwright/test'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

test('Drawboard Ask AI sends only selected element data to a loopback model', async () => {
  const requests: Array<{ body: Record<string, any>; userText: string }> = []
  let responseFinished = false
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let raw = ''
    for await (const chunk of request) raw += chunk.toString()
    const body = JSON.parse(raw) as Record<string, any>
    const userMessages = (body.messages ?? []).filter((message: any) => message.role === 'user')
    const userText = userMessages
      .map((message: any) =>
        typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      )
      .join('\n')
    requests.push({ body, userText })
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    const delta = (content: string) =>
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`,
      )
    delta('The selected rectangle ')
    await new Promise((resolve) => setTimeout(resolve, 900))
    delta('has clear bounds and is ready for a label.')
    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
    )
    response.write('data: [DONE]\n\n')
    response.end()
    responseFinished = true
  })
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Could not start the local Draw analysis model.')

  const userData = await mkdtemp(join(tmpdir(), 'revelith-draw-selection-ai-'))
  await writeFile(join(userData, 'app-settings.json'), JSON.stringify({ onboardingSeen: true }))
  await writeFile(
    join(userData, 'ai-settings.json'),
    JSON.stringify({
      provider: 'custom',
      providers: {
        custom: {
          model: 'selection-scope-test',
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKey: '',
        },
      },
    }),
  )

  const appPath = resolve('apps/whiteboard')
  const executablePath = createRequire(join(appPath, 'package.json'))('electron') as string
  const {
    ELECTRON_RUN_AS_NODE: _runAsNode,
    CHROME_CRASHPAD_PIPE_NAME: _crashpadPipe,
    ...hostEnv
  } = process.env
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    app = await electron.launch({
      executablePath,
      args: [...(process.platform === 'win32' ? ['--no-sandbox', '--disable-gpu'] : []), appPath],
      env: {
        ...hostEnv,
        REVELITH_USER_DATA: userData,
        ...(process.platform === 'linux' ? { ELECTRON_DISABLE_SANDBOX: '1' } : {}),
      },
    })
    const page = await app.firstWindow()
    await expect.poll(() => page.locator('.excalidraw').count()).toBe(1)
    const canvas = page.locator('.excalidraw canvas.interactive').first()
    await expect(canvas).toBeVisible()
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).toBeTruthy()

    await page.getByTestId('toolbar-rectangle').locator('xpath=..').click()
    const start = {
      x: canvasBox!.x + canvasBox!.width * 0.44,
      y: canvasBox!.y + canvasBox!.height * 0.42,
    }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 90, start.y + 65)
    await page.mouse.up()

    const ask = page.getByRole('button', { name: 'Ask AI about 1 selected Drawboard element' })
    await expect(ask).toBeVisible()
    await expect(ask).toHaveAttribute('title', /local AI endpoint/)
    await ask.click()

    await expect.poll(() => requests.length, { timeout: 20_000 }).toBeGreaterThan(0)
    const request = requests.at(-1)!
    expect(request.body.stream).toBe(true)
    expect(request.body.tools ?? []).toEqual([])
    expect(request.userText).toContain('Selected 1 element(s)')
    expect(request.userText).toContain('rectangle id=')
    expect(request.userText).toContain('bounds=')
    expect(request.userText).not.toContain('Selected 2 element(s)')
    await expect(page.locator('.revelith-board-chat')).toContainText('The selected rectangle')
    expect(responseFinished).toBe(false)
    await expect(page.locator('.revelith-board-chat .ai-msg-assistant')).toHaveClass(
      /ai-msg-streaming/,
    )
    await expect(page.locator('.revelith-board-chat')).toContainText(
      'The selected rectangle has clear bounds',
    )
    await expect.poll(() => responseFinished).toBe(true)
    await expect(page.locator('.revelith-board-chat')).toContainText('Board selection included')

    const shortcutsButton = page.locator('button[aria-label="Shortcuts"]')
    await expect(shortcutsButton).toHaveAttribute(
      'data-tip',
      /built-in Drawboard keyboard shortcut reference/,
    )
    await shortcutsButton.click()
    await expect(page.getByText(/Keyboard shortcuts/i).first()).toBeVisible()
    await expect
      .poll(() =>
        page.locator('[data-tip*="built-in Drawboard keyboard shortcut reference"]').textContent(),
      )
      .toMatch(/Shortcuts · \d+/)
  } finally {
    if (app) await app.close()
    server.closeAllConnections()
    await new Promise<void>((resolveClose, reject) =>
      server.close((error) => (error ? reject(error) : resolveClose())),
    )
    await rm(userData, { recursive: true, force: true })
  }
})
