/**
 * Renderer delivery for packaged editor modules: a custom standard+secure
 * scheme that serves one module's built renderer from its resources folder.
 *
 * A packaged app has no http origin, so `fetch`/module scripts/CSP of a
 * `file://` document behave differently from a dev server; serving the same
 * bytes over a privileged scheme makes the packaged renderer behave like the
 * dev one (and keeps absolute asset paths inside the bundle).
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { protocol } from 'electron'

export const RENDERER_SCHEME = 'revelith'
export const RENDERER_HOST = 'app'

/** Scheme descriptor to pass to protocol.registerSchemesAsPrivileged, before app ready. */
export const RENDERER_SCHEME_PRIVILEGE = {
  scheme: RENDERER_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
} as const

/**
 * Second privileged scheme used by the Word/PDF export pipelines to read the
 * media they produce (images baked into a .docx, page rasters for a print).
 * Same privileges as the renderer scheme: a secure document must not pull
 * resources from a non-secure origin.
 */
export const DOCX_MEDIA_SCHEME = 'revelith-media'

export const DOCX_MEDIA_SCHEME_PRIVILEGE = {
  scheme: DOCX_MEDIA_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
} as const

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/**
 * URL of a module's renderer entry.
 *
 * `devUrl` (set from ELECTRON_RENDERER_URL in dev) wins when present; otherwise
 * the module is loaded from the privileged scheme over its resources folder, so
 * the app needs no local server. `query` rides along for views that are created
 * with parameters (e.g. an initial file).
 */
export function rendererUrl(
  devUrl: string | undefined,
  module: string,
  query?: Record<string, string>,
): string {
  if (devUrl) {
    if (!query) return devUrl
    const url = new URL(devUrl)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    return url.toString()
  }
  const search = query ? `?${new URLSearchParams(query).toString()}` : ''
  return `${RENDERER_SCHEME}://${RENDERER_HOST}/${encodeURIComponent(module)}/${search}`
}

/**
 * Register the privileged scheme. Must run before `app.whenReady()` and at most
 * once per process (Electron throws on a duplicate registration).
 */
export function registerRendererScheme(): void {
  protocol.registerSchemesAsPrivileged([RENDERER_SCHEME_PRIVILEGE])
}

/** protocol.handle implementation shared by every module renderer. */
function createHandler(roots: Record<string, string>) {
  return (request: Request): Response => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response(null, { status: 400 })
    }
    if (url.host !== RENDERER_HOST) return new Response(null, { status: 404 })
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const module = segments[0] ?? ''
    const root = roots[module]
    if (!root) return new Response(null, { status: 404 })
    const rel = segments.slice(1).join('/')
    const file = resolveWithin(root, rel)
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      return new Response(null, { status: 404 })
    }
    return new Response(readFileSync(file), {
      headers: {
        'Content-Type': MIME_BY_EXT[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    })
  }
}

/**
 * Serve each module's built renderer over the privileged scheme. `roots` maps a
 * module name to its built renderer directory (resources/modules/<name> in a
 * packaged app, apps/<name>/out/renderer in the monorepo).
 */
export function installRendererProtocol(roots: Record<string, string>): void {
  const handler = createHandler(roots)
  // a re-registration in the same process (module reloaded) must not throw
  if (protocol.isProtocolHandled(RENDERER_SCHEME)) protocol.unhandle(RENDERER_SCHEME)
  protocol.handle(RENDERER_SCHEME, handler)
}

/** file:// URL of a built entry inside a module renderer (used for headless export). */
export function rendererFileUrl(root: string, entry = 'index.html'): string {
  return pathToFileURL(join(root, entry)).href
}

/** Resolve `rel` under `root`, refusing anything that escapes it. */
function resolveWithin(root: string, rel: string): string | null {
  if (rel === '' || rel.includes('\0')) return null
  const base = resolve(root)
  const target = resolve(base, normalize(rel))
  if (target !== base && !target.startsWith(base + sep)) return null
  return target
}
