/**
 * How an MCP client starts `revelith mcp`. Shared by the app's Settings snippet
 * and `revelith mcp install` so the two cannot drift. Clients spawn without a
 * shell, so on Windows neither revelith.cmd nor `cmd /c` is safe (a path with
 * a space splits); the entry does what revelith.cmd does instead: the app
 * binary as Node on the bundled CLI. Pure string code: the renderer imports it.
 */
export interface McpLaunch {
  command: string
  args: string[]
  env?: Record<string, string>
}

const isWindowsPath = (p: string) => p.includes('\\')

/** The app's snippet: the bare name once revelith is on the PATH, else the launcher itself. */
export function mcpLaunch(cli: { status: string; launcherDir: string }): McpLaunch {
  const dir = cli.launcherDir
  if (isWindowsPath(dir)) return windowsAppLaunch(dir)
  return { command: cli.status === 'present' ? 'revelith' : `${dir}/revelith`, args: ['mcp'] }
}

function windowsAppLaunch(dir: string): McpLaunch {
  return {
    command: `${dir}\\..\\..\\ReveLith.exe`,
    args: [`${dir}\\revelith.cjs`, 'mcp'],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  }
}

export interface LauncherLaunchOptions {
  platform?: string
  /** test seam for the packaged-app probe */
  exists?: (path: string) => boolean
}

/**
 * `mcp install`: always the absolute launcher, never the bare name. On Windows
 * the packaged app is run as Node (same entry as the app's snippet); a checkout
 * has no ReveLith.exe beside it and runs the bundle on the system node, as the
 * bin/revelith.cmd script does.
 */
export function mcpLaunchFromLauncher(
  launcher: string,
  opts: LauncherLaunchOptions = {},
): McpLaunch {
  const win = isWindowsPath(launcher) || opts.platform === 'win32'
  if (!win) return { command: launcher, args: ['mcp'] }
  const sep = isWindowsPath(launcher) ? '\\' : '/'
  const dir = launcher.slice(0, Math.max(launcher.lastIndexOf('\\'), launcher.lastIndexOf('/')))
  const exists = opts.exists ?? (() => false)
  if (exists(`${dir}${sep}..${sep}..${sep}ReveLith.exe`)) return windowsAppLaunch(dir)
  // In dev mode, the launcher (revelith.cmd) handles running the bundle.
  // Return the launcher directly, same as non-Windows.
  return { command: launcher, args: ['mcp'] }
}
