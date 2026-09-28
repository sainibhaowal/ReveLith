import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { BrowserWindow, WebContentsView, app, dialog, ipcMain } from 'electron'
import type { WebContents } from 'electron'

interface HtmlRuntimeConfig {
  preloadPath: string
  rendererUrl?: string
  rendererFile?: string
}

let runtime: HtmlRuntimeConfig = {
  preloadPath: '',
}

export function configureHtmlRuntime(cfg: HtmlRuntimeConfig): void {
  runtime = { ...runtime, ...cfg }
}
import { configuredDefaultSaveDir, showSaveDialogWithMemory } from '@revelith/electron-utils'
import { HTML_CHANNELS } from '../shared/ipc'
import type {
  ExportDocxRequest,
  ExportPdfRequest,
  ExportResult,
  SaveHtmlRequest,
  SaveHtmlResult,
} from '../shared/ipc'

interface TabSession {
  filePath: string | null
  dirty: boolean
  pendingSaveAck?: (saved: boolean) => void
  pendingCloseResult?: (saved: boolean) => void
}

const tabSessions = new Map<number, TabSession>()
let pendingOpenPath: string | null = null

export function setPendingHtmlOpen(filePath: string | null) {
  pendingOpenPath = filePath
}

export function htmlIsDirty(wcId: number): boolean {
  return tabSessions.get(wcId)?.dirty ?? false
}

export function requestHtmlSave(wc: WebContents, mode: 'save' | 'saveAs'): Promise<boolean> {
  return new Promise((resolve) => {
    const session = tabSessions.get(wc.id)
    if (!session) return resolve(false)
    session.pendingSaveAck = resolve
    wc.send(HTML_CHANNELS.saveRequest, mode)
  })
}

export function requestHtmlCloseSave(wc: WebContents): Promise<boolean> {
  return new Promise((resolve) => {
    const session = tabSessions.get(wc.id)
    if (!session) return resolve(false)
    session.pendingCloseResult = resolve
    wc.send(HTML_CHANNELS.closeSaveRequest)
  })
}

export function htmlFileRenamed(wc: WebContents, oldPath: string, newPath: string) {
  const session = tabSessions.get(wc.id)
  if (session && session.filePath === oldPath) {
    session.filePath = newPath
    wc.send(HTML_CHANNELS.fileRenamed, newPath)
  }
}

export function registerHtmlIpc() {
  ipcMain.handle(HTML_CHANNELS.consumePending, (event) => {
    const wcId = event.sender.id
    const p = pendingOpenPath
    pendingOpenPath = null
    const session: TabSession = { filePath: p, dirty: false }
    tabSessions.set(wcId, session)
    return { path: p }
  })

  ipcMain.handle(HTML_CHANNELS.readFile, async (_event, path: string) => {
    return await readFile(path, 'utf8')
  })

  ipcMain.handle(
    HTML_CHANNELS.save,
    async (event, req: SaveHtmlRequest): Promise<SaveHtmlResult> => {
      const wcId = event.sender.id
      const session = tabSessions.get(wcId)
      let targetPath = session?.filePath

      if (req.mode === 'saveAs' || !targetPath) {
        const parent = BrowserWindow.fromWebContents(event.sender)
        const defaultName = req.suggestedName ? `${req.suggestedName}.html` : 'Untitled.html'
        const startDir = targetPath ? dirname(targetPath) : configuredDefaultSaveDir(app)
        const res = await showSaveDialogWithMemory(dialog, parent, {
          title: 'Save HTML Document',
          defaultPath: targetPath || join(startDir, defaultName),
          filters: [{ name: 'HTML Document', extensions: ['html', 'htm'] }],
        })
        if (res.canceled || !res.filePath) return { ok: true, canceled: true }
        targetPath = res.filePath
      }

      try {
        await writeFile(targetPath, req.html, 'utf8')
        if (session) {
          session.filePath = targetPath
          session.dirty = false
        }
        return { ok: true, path: targetPath }
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to write HTML file' }
      }
    },
  )

  ipcMain.on(HTML_CHANNELS.dirtyChanged, (event, dirty: boolean) => {
    const session = tabSessions.get(event.sender.id)
    if (session) session.dirty = dirty
  })

  ipcMain.on(HTML_CHANNELS.saveRequestAck, (event, saved: boolean) => {
    const session = tabSessions.get(event.sender.id)
    session?.pendingSaveAck?.(saved)
  })

  ipcMain.on(HTML_CHANNELS.closeSaveResult, (event, saved: boolean) => {
    const session = tabSessions.get(event.sender.id)
    session?.pendingCloseResult?.(saved)
  })

  ipcMain.handle(
    HTML_CHANNELS.exportDocx,
    async (event, req: ExportDocxRequest): Promise<ExportResult> => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const res = await showSaveDialogWithMemory(dialog, parent, {
        title: 'Export to Word (.docx)',
        defaultPath: `${req.suggestedName}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      })
      if (res.canceled || !res.filePath) return { ok: true, canceled: true }
      try {
        const buffer = Buffer.from(req.base64, 'base64')
        await writeFile(res.filePath, buffer)
        return { ok: true, path: res.filePath }
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to export Word document' }
      }
    },
  )

  ipcMain.handle(
    HTML_CHANNELS.exportPdf,
    async (event, req: ExportPdfRequest): Promise<ExportResult> => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const res = await showSaveDialogWithMemory(dialog, parent, {
        title: 'Export to PDF',
        defaultPath: `${req.suggestedName}.pdf`,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      })
      if (res.canceled || !res.filePath) return { ok: true, canceled: true }
      try {
        const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
        try {
          await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(req.html))
          const pdfBytes = await win.webContents.printToPDF({
            printBackground: true,
            margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
          })
          await writeFile(res.filePath, pdfBytes)
          return { ok: true, path: res.filePath }
        } finally {
          win.destroy()
        }
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to export PDF' }
      }
    },
  )

  ipcMain.handle(
    HTML_CHANNELS.saveSingleFile,
    async (event, req: ExportPdfRequest): Promise<ExportResult> => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const res = await showSaveDialogWithMemory(dialog, parent, {
        title: 'Export as Single-File HTML',
        defaultPath: `${req.suggestedName}.html`,
        filters: [{ name: 'HTML Document', extensions: ['html'] }],
      })
      if (res.canceled || !res.filePath) return { ok: true, canceled: true }
      try {
        // Single-file contract: inline <style>/<script>, absolute http(s) images kept,
        // data: images embedded. Already self-contained by construction.
        const single = req.html.includes('</html>') ? req.html : `<!doctype html>\n${req.html}`
        await writeFile(res.filePath, single, 'utf8')
        return { ok: true, path: res.filePath }
      } catch (err: any) {
        return { ok: false, error: err?.message || 'Failed to export HTML' }
      }
    },
  )
}

export function createHtmlView(openPath?: string | null): WebContentsView {
  registerHtmlIpc()
  setPendingHtmlOpen(openPath ?? null)
  const view = new WebContentsView({
    webPreferences: {
      preload: runtime.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  if (runtime.rendererUrl) void view.webContents.loadURL(runtime.rendererUrl)
  else if (runtime.rendererFile) void view.webContents.loadFile(runtime.rendererFile)
  return view
}

export function startHtmlStandalone() {
  app.whenReady().then(() => {
    registerHtmlIpc()
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    })
    if (process.env.HTML_RENDERER_URL) {
      void win.loadURL(process.env.HTML_RENDERER_URL)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'))
    }
  })
}
