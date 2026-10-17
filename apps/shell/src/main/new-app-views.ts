import { WebContentsView, app } from 'electron'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export type ReveLithAppKind = 'forms' | 'tasks' | 'drawboard'

export interface ReveLithAppDocument {
  slug: string
  title: string
  untitled: string
  /** extension new documents are saved with (also the save-dialog filter) */
  extension: string
  /** older extensions that still open this kind (renames keep old files working) */
  legacyExtensions?: readonly string[]
  devUrl: string
}

export const REVELITH_APP_DOCUMENTS: Record<ReveLithAppKind, ReveLithAppDocument> = {
  forms: {
    slug: 'forms-builder',
    title: 'AI Forms',
    untitled: 'Untitled Form',
    extension: 'form',
    devUrl: 'FORMS_RENDERER_URL',
  },
  tasks: {
    slug: 'tasks',
    title: 'AI Tasks',
    untitled: 'Untitled Task Board',
    extension: 'tasks',
    devUrl: 'TASKS_RENDERER_URL',
  },
  drawboard: {
    slug: 'drawboard',
    title: 'AI Draw',
    untitled: 'Untitled Drawing',
    extension: 'draw',
    // Accept files from both previous extensions; new saves use `.draw`.
    legacyExtensions: ['drawboard', 'whiteboard'],
    devUrl: 'DRAWBOARD_RENDERER_URL',
  },
}

/** Every extension this kind opens, the current one first. */
export function newAppExtensions(kind: ReveLithAppKind): string[] {
  const info = REVELITH_APP_DOCUMENTS[kind]
  return [info.extension, ...(info.legacyExtensions ?? [])]
}

export function newAppKindForPath(filePath: string): ReveLithAppKind | undefined {
  const lower = filePath.toLowerCase()
  return (Object.keys(REVELITH_APP_DOCUMENTS) as ReveLithAppKind[]).find((kind) =>
    newAppExtensions(kind).some((ext) => lower.endsWith(`.${ext}`)),
  )
}

export function newAppTitle(kind: ReveLithAppKind): string {
  return REVELITH_APP_DOCUMENTS[kind].title
}

export function createNewAppView(kind: ReveLithAppKind, openPath?: string): WebContentsView {
  const info = REVELITH_APP_DOCUMENTS[kind]
  const workspaceSlug =
    kind === 'drawboard' && !existsSync(join(app.getAppPath(), '..', info.slug, 'package.json'))
      ? 'whiteboard'
      : info.slug
  const outDir = app.isPackaged
    ? join(process.resourcesPath, 'modules', info.slug)
    : join(app.getAppPath(), '..', workspaceSlug, 'out')
  const view = new WebContentsView({
    webPreferences: {
      preload: join(outDir, 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // Local recovery drafts outlive a WebContents. Its numeric id can be reused
  // after the app restarts, which makes a genuinely new app tab load an older
  // tab's draft. Give each editor instance an independent, restart-safe key.
  const sessionId = randomUUID()
  view.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url)
      if (target.protocol === 'https:' || target.protocol === 'http:')
        void import('electron').then(({ shell }) => shell.openExternal(target.href))
    } catch {
      /* malformed or non-web URL */
    }
    return { action: 'deny' }
  })
  const devUrl =
    process.env[info.devUrl] ??
    (kind === 'drawboard' ? process.env.WHITEBOARD_RENDERER_URL : undefined)
  if (devUrl) {
    const url = new URL(devUrl)
    url.searchParams.set('session', sessionId)
    if (openPath) url.searchParams.set('openPath', openPath)
    else url.searchParams.set('newDocument', '1')
    void view.webContents.loadURL(url.href)
  } else {
    void view.webContents.loadFile(join(outDir, 'renderer', 'index.html'), {
      query: { session: sessionId, ...(openPath ? { openPath } : { newDocument: '1' }) },
    })
  }
  return view
}
