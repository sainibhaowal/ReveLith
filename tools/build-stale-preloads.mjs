#!/usr/bin/env node
/**
 * Rebuild app preloads whose sources are newer than the built artifact.
 *
 * In dev the shell loads each editor module's preload straight from
 * apps/<app>/out/preload/. `npm run dev` only starts the renderer Vite servers
 * and never rebuilds preloads, so after a pull the artifact can silently miss
 * a newly added preload API — the failure shows up only in the renderer console
 * as "... is not a function", with no build error anywhere.
 *
 * Runs as the root `predev` hook: a fresh tree is a fast no-op, a stale module
 * gets a full `electron-vite build` (the only entry point that emits the
 * preload bundle).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

/** Every editor module the shell can host. */
const APPS = ['docs', 'sheets', 'slides', 'pdf', 'markdown', 'html']

/** Newest mtime (ms) under dir; 0 when the dir is missing. */
function newestMtime(dir) {
  if (!existsSync(dir)) return 0
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs)
  }
  return newest
}

function fileMtime(path) {
  return existsSync(path) ? statSync(path).mtimeMs : 0
}

const PACKAGE_CONFIG_FILES = ['package.json', 'tsconfig.json']

function workspaceDependencyMtime(dir) {
  return Math.max(
    newestMtime(join(dir, 'src')),
    ...PACKAGE_CONFIG_FILES.map((file) => fileMtime(join(dir, file))),
  )
}

/** name -> { dir, manifest } for every workspace package. */
const workspacePackages = new Map()
for (const entry of readdirSync('packages', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = join('packages', entry.name)
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (manifest.name) workspacePackages.set(manifest.name, { dir, manifest })
  } catch {
    /* not a package */
  }
}

/**
 * Transitive workspace packages an app depends on. The shared packages ship as
 * TypeScript source and are BUNDLED into each app, so a change to one of them
 * invalidates the app's built output just as surely as a change in the app.
 */
function workspaceDependencyDirs(app) {
  const manifest = JSON.parse(readFileSync(join('apps', app, 'package.json'), 'utf8'))
  const pending = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
  const seen = new Set()
  const dirs = []
  while (pending.length > 0) {
    const name = pending.pop()
    const workspace = workspacePackages.get(name)
    if (!workspace || seen.has(name)) continue
    seen.add(name)
    dirs.push(workspace.dir)
    pending.push(
      ...Object.keys(workspace.manifest.dependencies ?? {}),
      ...Object.keys(workspace.manifest.devDependencies ?? {}),
    )
  }
  return dirs
}

const stale = APPS.filter((app) => {
  const artifact = join('apps', app, 'out', 'preload', 'index.js')
  const built = existsSync(artifact) ? statSync(artifact).mtimeMs : 0
  // shared/ counts too: preloads import the IPC channel and type modules from there
  const src = Math.max(
    newestMtime(join('apps', app, 'src', 'preload')),
    newestMtime(join('apps', app, 'src', 'shared')),
    fileMtime(join('apps', app, 'package.json')),
    fileMtime(join('apps', app, 'electron.vite.config.ts')),
    fileMtime(join('apps', app, 'tsconfig.json')),
    fileMtime('package.json'),
    fileMtime('tsconfig.base.json'),
    ...workspaceDependencyDirs(app).map(workspaceDependencyMtime),
  )
  return src > built
})

/**
 * Run `npm run build -w <app>`.
 *
 * Invokes npm's own CLI with the current Node binary rather than the `npm`
 * shim: on Windows only npm.cmd/npm.ps1 exist, so spawning `npm` without a
 * shell fails with ENOENT, and going through a shell would concatenate the
 * arguments unescaped (Node warns about exactly that). npm_execpath is set by
 * npm for every script it runs, including this one via the root predev hook.
 */
function runBuild(app) {
  const npmCli = process.env.npm_execpath
  if (npmCli && existsSync(npmCli)) {
    return spawnSync(process.execPath, [npmCli, 'run', 'build', '-w', `@revelith/${app}`], {
      stdio: 'inherit',
    })
  }
  // Fallback for a direct `node tools/build-stale-preloads.mjs` invocation,
  // where npm_execpath is absent. shell is required on Windows only.
  return spawnSync('npm', ['run', 'build', '-w', `@revelith/${app}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

if (stale.length) {
  console.log(`Rebuilding stale preloads: ${stale.join(', ')}`)
  for (const app of stale) {
    const r = runBuild(app)
    if (r.error) {
      console.error(r.error)
      process.exit(1)
    }
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
}
