// ReveLith Drawboard — standalone main process (dev / direct launch).
// When hosted inside ReveLith Shell via WebContentsView, the shell owns
// `new-app:*` document IPC. These handlers only serve standalone runs and
// never override shell handlers (separate process).
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { promises as fs, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { registerStandaloneAiIpc } from './drawboard-ai-ipc'

const TITLE = 'ReveLith Draw'
const isDev = !!process.env['ELECTRON_RENDERER_URL']
const REVELITH_REPO = 'https://github.com/sainibhaowal/ReveLith'
const REVELITH_ISSUES = `${REVELITH_REPO}/issues`

let mainWindow: BrowserWindow | null = null
let currentFilePath: string | null = null

async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}`
  await fs.writeFile(tmp, data, 'utf8')
  await fs.rename(tmp, filePath)
}

function appSettingsPath(): string {
  return join(app.getPath('userData'), 'app-settings.json')
}

function readAppSettings(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(appSettingsPath(), 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function writeAppSettings(patch: Record<string, unknown>): void {
  const path = appSettingsPath()
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, JSON.stringify({ ...readAppSettings(), ...patch }, null, 2), 'utf8')
  renameSync(temporary, path)
}

function registerStandaloneSharedHandlers(): void {
  // Share model and media provider settings with the ReveLith shell.
  // This app has no Home window, so also expose the small shell settings used
  // by the renderer directly.
  app.setPath(
    'userData',
    process.env.REVELITH_USER_DATA || join(app.getPath('appData'), 'ReveLith'),
  )
  registerStandaloneAiIpc()

  ipcMain.handle('app:get-theme', () => {
    const theme = readAppSettings().theme
    return theme === 'light' || theme === 'dark' ? theme : 'system'
  })
  ipcMain.handle('app:get-language', () => {
    const language = readAppSettings().language
    return typeof language === 'string' && language ? language : app.getLocale()
  })
  ipcMain.handle('app:get-auto-save-default', () => {
    const settings = readAppSettings()
    const updatedAt = settings.autoSaveDefaultUpdatedAt
    return {
      on: settings.autoSaveDefault === true,
      updatedAt: typeof updatedAt === 'number' && updatedAt > 0 ? updatedAt : 0,
    }
  })
  ipcMain.handle('app:get-ai-panel-prefs', () => {
    const settings = readAppSettings()
    return {
      side: settings.aiPanelSide === 'right' ? 'right' : 'left',
      fontSize: ['default', 'large', 'xlarge', 'custom'].includes(String(settings.aiPanelFontSize))
        ? settings.aiPanelFontSize
        : 'default',
      customFontSize:
        typeof settings.aiPanelCustomFontSize === 'number'
          ? Math.max(10, Math.min(32, Math.round(settings.aiPanelCustomFontSize)))
          : 14,
      spellcheck: settings.aiPanelSpellcheck !== false,
    }
  })
  ipcMain.handle('app:set-ai-panel-prefs', (_event, patch: unknown) => {
    const value = patch && typeof patch === 'object' ? (patch as Record<string, unknown>) : {}
    const allowed: Record<string, unknown> = {}
    if (value.side === 'left' || value.side === 'right') allowed.aiPanelSide = value.side
    if (['default', 'large', 'xlarge', 'custom'].includes(String(value.fontSize)))
      allowed.aiPanelFontSize = value.fontSize
    if (typeof value.customFontSize === 'number' && Number.isFinite(value.customFontSize)) {
      allowed.aiPanelCustomFontSize = Math.max(10, Math.min(32, Math.round(value.customFontSize)))
    }
    if (typeof value.spellcheck === 'boolean') allowed.aiPanelSpellcheck = value.spellcheck
    writeAppSettings(allowed)
    const settings = readAppSettings()
    return {
      side: settings.aiPanelSide === 'right' ? 'right' : 'left',
      fontSize: ['default', 'large', 'xlarge', 'custom'].includes(String(settings.aiPanelFontSize))
        ? settings.aiPanelFontSize
        : 'default',
      customFontSize:
        typeof settings.aiPanelCustomFontSize === 'number'
          ? Math.max(10, Math.min(32, Math.round(settings.aiPanelCustomFontSize)))
          : 14,
      spellcheck: settings.aiPanelSpellcheck !== false,
    }
  })
}

function registerStandaloneDocumentHandlers(): void {
  // Guard: register once per process.
  if ((global as { __drawboardIpc?: boolean }).__drawboardIpc) return
  ;(global as { __drawboardIpc?: boolean }).__drawboardIpc = true

  ipcMain.handle('new-app:get-document', async () => null)
  ipcMain.handle('new-app:new-document', async (_e, title: string) => {
    currentFilePath = null
    mainWindow?.setTitle(typeof title === 'string' && title ? title : TITLE)
    return true
  })
  ipcMain.handle('new-app:open-document', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Open drawing',
      filters: [
        {
          name: 'ReveLith Draw',
          extensions: ['draw', 'drawboard', 'whiteboard', 'wb', 'excalidraw', 'json'],
        },
        { name: 'All files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (picked.canceled || !picked.filePaths[0]) return null
    const filePath = picked.filePaths[0]!
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const content = JSON.parse(raw)
      currentFilePath = filePath
      return { kind: 'drawboard', filePath, title: filePath.split(/[\\/]/).pop() ?? TITLE, content }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle(
    'new-app:save-document',
    async (_e, payload: unknown, title: string, saveAs = false, prompt = true) => {
      let target = saveAs || !currentFilePath ? null : currentFilePath
      if (!target && prompt === false && currentFilePath) target = currentFilePath
      if (!target) {
        if (!prompt) return { canceled: true as const }
        const picked = await dialog.showSaveDialog({
          title: typeof title === 'string' && title ? title : TITLE,
          defaultPath: `${typeof title === 'string' && title ? title : 'Untitled Drawing'}.draw`,
          filters: [
            { name: 'ReveLith Draw', extensions: ['draw', 'drawboard'] },
            { name: 'Legacy drawing', extensions: ['whiteboard'] },
            { name: 'Board file', extensions: ['draw', 'drawboard', 'whiteboard', 'json'] },
            { name: 'JSON', extensions: ['json'] },
          ],
        })
        if (picked.canceled || !picked.filePath) return { canceled: true as const }
        target = picked.filePath
      }
      try {
        await writeFileAtomic(target, JSON.stringify(payload ?? {}))
        currentFilePath = target
        return { filePath: target, title: target.split(/[\\/]/).pop() ?? title }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    },
  )
  ipcMain.handle(
    'drawboard:save-export-file',
    async (_event, fileName: unknown, bytes: unknown) => {
      if (typeof fileName !== 'string') return { error: 'Invalid export file name.' }
      const extension = /\.(png|svg|draw)$/i.exec(fileName)?.[1]?.toLowerCase()
      if (!extension) return { error: 'Export as PNG, SVG, or a ReveLith Draw file.' }
      const data =
        bytes instanceof ArrayBuffer
          ? Buffer.from(bytes)
          : ArrayBuffer.isView(bytes)
            ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
            : null
      if (!data) return { error: 'The exported file data is invalid.' }
      const safeName =
        fileName
          .split(/[\\/]/)
          .pop()!
          // eslint-disable-next-line no-control-regex -- replace Windows-forbidden filename control characters.
          .replace(/[<>:"|?*\x00-\x1f]/g, '-')
          .trim() || `drawing.${extension}`
      const defaultName = safeName.toLowerCase().endsWith(`.${extension}`)
        ? safeName
        : `${safeName}.${extension}`
      const extensionLabel = extension === 'draw' ? 'ReveLith Draw' : extension.toUpperCase()
      const options = {
        title: `Export ${extensionLabel}`,
        defaultPath: join(app.getPath('documents'), defaultName),
        filters: [{ name: extensionLabel, extensions: [extension] }],
      }
      const picked = mainWindow
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options)
      if (picked.canceled || !picked.filePath) return { canceled: true as const }
      const target = picked.filePath.toLowerCase().endsWith(`.${extension}`)
        ? picked.filePath
        : `${picked.filePath}.${extension}`
      try {
        await writeFileAtomic(target, data)
        return { filePath: target }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    },
  )
  ipcMain.handle('new-app:set-document-state', async () => {})
  ipcMain.handle('new-app:set-document-path', async (_e, filePath: string) => {
    if (typeof filePath === 'string') currentFilePath = filePath
    return true
  })
}

function sendMenuAction(action: string): void {
  mainWindow?.webContents.send('drawboard:menu-action', action)
}

/**
 * Native application menu (docs pattern). Editing keys the engine already
 * owns (undo/redo/open/select) stay accelerator-free here so nothing fires
 * twice; Ctrl+S is free engine-wide and saves app-wide.
 */
function buildApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Drawing', click: () => sendMenuAction('file:new') },
        { label: 'Open…', click: () => sendMenuAction('file:open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('file:save') },
        { label: 'Save As…', click: () => sendMenuAction('file:save-as') },
        { label: 'Import…', click: () => sendMenuAction('file:import') },
        { type: 'separator' },
        { label: 'Export PNG', click: () => sendMenuAction('file:export-png') },
        { label: 'Export SVG', click: () => sendMenuAction('file:export-svg') },
        { label: 'Export Board File', click: () => sendMenuAction('file:export-board') },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', click: () => sendMenuAction('edit:undo') },
        { label: 'Redo', click: () => sendMenuAction('edit:redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { label: 'Select All', click: () => sendMenuAction('edit:select-all') },
        { label: 'Duplicate', click: () => sendMenuAction('edit:duplicate') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', click: () => sendMenuAction('view:zoom-in') },
        { label: 'Zoom Out', click: () => sendMenuAction('view:zoom-out') },
        { label: 'Reset Zoom', click: () => sendMenuAction('view:zoom-reset') },
        { label: 'Fit on Screen', click: () => sendMenuAction('view:zoom-fit') },
        { type: 'separator' },
        { label: 'Toggle Grid', click: () => sendMenuAction('view:grid') },
        { label: 'Toggle Snap', click: () => sendMenuAction('view:snap') },
        { label: 'Presentation Mode', click: () => sendMenuAction('view:present') },
        { type: 'separator' },
        { label: 'Light Canvas', click: () => sendMenuAction('view:theme-light') },
        { label: 'Dark Canvas', click: () => sendMenuAction('view:theme-dark') },
        { label: 'Follow System Theme', click: () => sendMenuAction('view:theme-system') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: () => void shell.openExternal(REVELITH_REPO) },
        { label: 'Report an Issue', click: () => void shell.openExternal(REVELITH_ISSUES) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function startDrawboardStandalone(): void {
  registerStandaloneSharedHandlers()
  registerStandaloneDocumentHandlers()
  buildApplicationMenu()

  const createWindow = (): void => {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 860,
      title: TITLE,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    })
    mainWindow.once('ready-to-show', () => mainWindow?.show())
    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  }

  void app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
