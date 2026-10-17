/**
 * Shared launcher for Electron E2E tests.
 *
 * Each test boots the built shell (`apps/shell/out`) against a scratch
 * userData dir (via REVELITH_USER_DATA) so runs never touch real settings
 * and never collide with a running install's single-instance lock.
 * Build first: `npm run build:all`.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import JSZip from 'jszip'

export const SHELL_DIR = resolve(__dirname, '../apps/shell')
export const ARTIFACTS_DIR = resolve(__dirname, 'artifacts')

/** Build an archive fixture without depending on a platform-specific `zip` executable. */
export async function zipDirectory(sourceDir: string, outputPath: string): Promise<void> {
  const zip = new JSZip()
  const addDirectory = async (directory: string, prefix = ''): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) await addDirectory(absolutePath, relativePath)
      else if (entry.isFile()) zip.file(relativePath, await readFile(absolutePath))
    }
  }
  await addDirectory(sourceDir)
  await writeFile(
    outputPath,
    await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
  )
}

/** Read an OOXML part without relying on a platform-specific `unzip` executable. */
export async function readZipEntry(filePath: string, entryName: string): Promise<Buffer> {
  const archive = await JSZip.loadAsync(await readFile(filePath))
  const entry = archive.file(entryName)
  if (!entry) throw new Error(`Missing ${entryName} in ${filePath}`)
  return Buffer.from(await entry.async('nodebuffer'))
}

export async function readZipText(filePath: string, entryName: string): Promise<string> {
  return (await readZipEntry(filePath, entryName)).toString('utf8')
}

export async function listZipEntries(filePath: string): Promise<string[]> {
  const archive = await JSZip.loadAsync(await readFile(filePath))
  return Object.keys(archive.files)
}

const SHELL_MAIN = join(SHELL_DIR, 'out/main/index.js')

interface LaunchOptions {
  /** reuse a previous scratch dir to simulate a second launch */
  userDataDir?: string
  /** UI language override (REVELITH_LANG); defaults to English for stable assertions */
  lang?: string
  /** pre-seed app-settings.json with onboardingSeen=true to start at the home screen */
  onboardingSeen?: boolean
  /** extra app-settings.json keys (e.g. defaultSaveDir) written before launch */
  settings?: Record<string, unknown>
  /** sanitized AI provider settings seeded into this isolated run's ai-settings.json */
  aiSettings?: Record<string, unknown>
  /** subdir of e2e/artifacts to store this launch's video in */
  videoDir: string
  /** absolute document path passed as argv, opened in an editor tab on launch */
  openFile?: string
  /** extra environment variables for the launched app */
  env?: Record<string, string>
}

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
  userDataDir: string
}

export async function launchShell(options: LaunchOptions): Promise<LaunchedApp> {
  if (!existsSync(SHELL_MAIN)) {
    throw new Error(`Missing build output at ${SHELL_MAIN} — run \`npm run build:all\` first`)
  }
  const e2eTempRoot = resolve(__dirname, '../.tmp/e2e')
  const e2eSystemTemp = join(e2eTempRoot, 'system-temp')
  await mkdir(e2eTempRoot, { recursive: true })
  await mkdir(e2eSystemTemp, { recursive: true })
  const userDataDir = options.userDataDir ?? (await mkdtemp(join(e2eTempRoot, 'revelith-e2e-')))
  if (options.onboardingSeen || options.settings) {
    await writeFile(
      join(userDataDir, 'app-settings.json'),
      JSON.stringify({
        ...(options.onboardingSeen ? { onboardingSeen: true } : {}),
        ...options.settings,
      }),
    )
  }
  if (options.aiSettings) {
    await writeFile(join(userDataDir, 'ai-settings.json'), JSON.stringify(options.aiSettings))
  }
  const require = createRequire(join(SHELL_DIR, 'package.json'))
  const executablePath = require('electron') as unknown as string
  // ELECTRON_RUN_AS_NODE (set by VS Code/CI hosts) would boot Electron as
  // plain Node with no windows — strip it so the app always starts as an app
  // Electron test launches must not inherit either the host's Node mode or its
  // crashpad IPC pipe. Both variables describe the parent Electron process and
  // can make a child Electron abort before its main process starts.
  const {
    ELECTRON_RUN_AS_NODE: _electronRunAsNode,
    CHROME_CRASHPAD_PIPE_NAME: _crashpadPipeName,
    ...hostEnv
  } = process.env
  // Linux CI runners restrict unprivileged user namespaces (no usable SUID
  // sandbox) and run under xvfb without GPU — without these the window opens
  // but the renderer never loads. The suite drives trusted local builds only.
  // Switches go before the app path so Chromium is guaranteed to consume them
  // and they never leak into the argv the app parses for documents to open.
  const args: string[] = []
  if (process.platform === 'linux') args.push('--no-sandbox', '--disable-gpu')
  if (process.platform === 'win32') args.push('--no-sandbox', '--disable-gpu')
  // Electron's Chromium singleton lock is created before the main module can
  // call app.setPath on some Windows builds. Pass the scratch profile at the
  // Chromium level as well so parallel/dev instances never collide.
  args.push(`--user-data-dir=${userDataDir}`)
  args.push(SHELL_DIR)
  if (options.openFile) args.push(options.openFile)
  const app = await electron.launch({
    executablePath,
    args,
    env: {
      ...hostEnv,
      REVELITH_USER_DATA: userDataDir,
      // The host's Windows TEMP can be ACL-restricted in developer/CI
      // sessions. Keep app-owned E2E scratch files in the ignored test area;
      // production runs continue using the operating system temp directory.
      TEMP: e2eSystemTemp,
      TMP: e2eSystemTemp,
      REVELITH_NO_SPARE_VIEW: '1',
      REVELITH_LANG: options.lang ?? 'en',
      ...(options.env ?? {}),
      ...(process.platform === 'linux' ? { ELECTRON_DISABLE_SANDBOX: '1' } : {}),
    },
    // Playwright's Electron screencast wedges the page CDP session on Linux
    // (page.url() stays empty, no lifecycle events, evaluate hangs) — record
    // only where it works
    recordVideo:
      process.platform === 'linux'
        ? undefined
        : {
            dir: join(ARTIFACTS_DIR, options.videoDir),
            size: { width: 1280, height: 800 },
          },
  })
  const page = await app.firstWindow()
  await waitForDocumentReady(app, page)
  return { app, page, userDataDir }
}

/**
 * Playwright can attach to the Electron window mid-navigation and miss the
 * load lifecycle events entirely (Linux timing) — waitForLoadState then hangs
 * on a page that is actually loaded. Polling through evaluate uses the live
 * CDP session instead of the missed events.
 */
async function waitForDocumentReady(
  app: ElectronApplication,
  page: Page,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // the pre-navigation about:blank document also reports readyState complete
    const ready = await page
      .evaluate(() =>
        document.readyState !== 'loading' && window.location.href !== 'about:blank'
          ? document.readyState
          : null,
      )
      .catch(() => null)
    if (ready) return
    await new Promise((r) => setTimeout(r, 100))
  }
  // process list tells renderer-spawn failures apart from slow loads
  const diag = await app
    .evaluate(({ app: electronApp, BrowserWindow }) => ({
      processes: electronApp.getAppMetrics().map((m) => m.type),
      contents: BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()),
    }))
    .catch((e) => String(e))
  throw new Error(`Shell window never loaded (url: ${page.url()}, diag: ${JSON.stringify(diag)})`)
}

/**
 * Close the app and return the recorded video path for the given page.
 *
 * Open editor tabs trigger a native Save/Don't Save/Cancel dialog on close,
 * which would block app.close() forever — stub the dialog to answer
 * "Don't Save" (button index 1) so shutdown stays unattended. If close still
 * hangs, force-kill the process after 20s and wait for close to finish.
 */
export async function closeAndSaveVideo(
  launched: LaunchedApp,
  name: string,
): Promise<string | undefined> {
  const video = launched.page.video()
  await launched.app
    .evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({
        response: 1,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox
    })
    .catch(() => {})
  const child = launched.app.process()
  const killTimer = setTimeout(() => {
    // SIGTERM can enter Electron's graceful quit path and leave it alive.
    // child.killed only means a signal was sent, not that the process exited.
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }, 20_000)
  try {
    await launched.app.close()
  } finally {
    clearTimeout(killTimer)
  }
  if (!video) return undefined
  const target = join(ARTIFACTS_DIR, 'videos', `${name}.webm`)
  try {
    await video.saveAs(target)
    return target
  } catch {
    return undefined
  }
}

export function screenshotPath(name: string): string {
  return join(ARTIFACTS_DIR, 'screenshots', `${name}.png`)
}

/**
 * Wait for a page whose URL contains `urlPart` (e.g. an editor WebContentsView).
 * Checks windows that already exist before listening, so it never races the
 * view being created between launch and the first waitForEvent call.
 */
export async function waitForPageWithUrl(
  app: ElectronApplication,
  urlPart: string,
  timeoutMs = 30_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    for (const candidate of app.windows()) {
      if (candidate.url().includes(urlPart)) return candidate
      // page.url() stays empty when attach raced navigation; ask the document
      const href = await candidate.evaluate(() => window.location.href).catch(() => '')
      if (href.includes(urlPart)) return candidate
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      const available = app.windows().map((candidate) => candidate.url())
      throw new Error(
        `No window with URL containing "${urlPart}". Available pages: ${available.join(', ')}`,
      )
    }
    await app.waitForEvent('window', { timeout: Math.min(remaining, 1_000) }).catch(() => {})
  }
}
