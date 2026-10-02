import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SHELL_MENU_EXTS,
  SHELL_VERB_LABEL,
  SHELL_VERB_NAME,
  ensureShellMenu,
  isShellMenuRegistered,
  parseRegDefault,
  registerShellMenu,
  shellVerbCommand,
  shellVerbIcon,
  shellVerbKey,
  unregisterShellMenu,
  type RegRunner,
} from '../src/main/win-shell-menu'

const SHELL_DIR = fileURLToPath(new URL('..', import.meta.url))

function readBuildFile(name: string): string {
  return readFileSync(`${SHELL_DIR}/build/${name}`, 'utf8')
}

/** in-memory reg.exe stub keyed by registry key */
function stubRegistry(
  initial: Record<string, { label?: string; icon?: string; command?: string }> = {},
): {
  runner: RegRunner
  calls: string[][]
  store: Record<string, { label?: string; icon?: string; command?: string }>
} {
  const store: Record<string, { label?: string; icon?: string; command?: string }> = { ...initial }
  const calls: string[][] = []
  const runner: RegRunner = async (args) => {
    calls.push(args)
    const [op, key] = args
    if (op === 'query') {
      const isCommand = key.endsWith('\\command')
      const base = isCommand ? key.slice(0, -'\\command'.length) : key
      const entry = store[base]
      const value = isCommand ? entry?.command : entry?.label
      if (value === undefined)
        throw new Error('ERROR: The system was unable to find the specified registry key or value.')
      return { stdout: `\n${key}\n    (Default)    REG_SZ    ${value}\n` }
    }
    if (op === 'add') {
      const d = args.indexOf('/d')
      const value = d >= 0 ? args[d + 1] : ''
      const isCommand = key.endsWith('\\command')
      const base = isCommand ? key.slice(0, -'\\command'.length) : key
      const entry = store[base] ?? {}
      if (isCommand) entry.command = value
      else if (args.includes('/v')) entry.icon = value
      else entry.label = value
      store[base] = entry
      return { stdout: 'The operation completed successfully.' }
    }
    if (op === 'delete') {
      if (!(key in store))
        throw new Error('ERROR: The system was unable to find the specified registry key or value.')
      delete store[key]
      return { stdout: 'The operation completed successfully.' }
    }
    throw new Error(`unexpected op ${op}`)
  }
  return { runner, calls, store }
}

describe('verb key/command shapes', () => {
  it('targets SystemFileAssociations so the default app is never stolen', () => {
    for (const ext of SHELL_MENU_EXTS) {
      expect(shellVerbKey(ext)).toBe(
        `HKCU\\Software\\Classes\\SystemFileAssociations\\.${ext}\\shell\\${SHELL_VERB_NAME}`,
      )
    }
  })

  it('quotes the exe path and passes the file as %1', () => {
    expect(shellVerbCommand('C:\\Program Files\\ReveLith\\ReveLith.exe')).toBe(
      '"C:\\Program Files\\ReveLith\\ReveLith.exe" "%1"',
    )
    expect(shellVerbIcon('C:\\Program Files\\ReveLith\\ReveLith.exe')).toBe(
      'C:\\Program Files\\ReveLith\\ReveLith.exe,0',
    )
  })

  it('covers exactly the formats the app can open', () => {
    expect([...SHELL_MENU_EXTS]).toEqual([
      'docx',
      'xlsx',
      'xls',
      'csv',
      'pptx',
      'pdf',
      'md',
      'markdown',
    ])
  })
})

describe('parseRegDefault', () => {
  it('reads the English (Default) value', () => {
    expect(parseRegDefault('\nHKCU\\k\n    (Default)    REG_SZ    Open with ReveLith\n')).toBe(
      'Open with ReveLith',
    )
  })

  it('reads non-English reg.exe locales (German (Standard))', () => {
    expect(parseRegDefault('\nHKCU\\k\n    (Standard)    REG_SZ    Open with ReveLith\n')).toBe(
      'Open with ReveLith',
    )
  })

  it('returns null when the key/value is missing', () => {
    expect(
      parseRegDefault('ERROR: The system was unable to find the specified registry key or value.'),
    ).toBeNull()
    expect(parseRegDefault('')).toBeNull()
  })
})

describe('registerShellMenu', () => {
  it('writes label, icon and command for every ext via reg.exe', async () => {
    const { runner, calls, store } = stubRegistry()
    const exe = 'C:\\Program Files\\ReveLith\\ReveLith.exe'
    await registerShellMenu({ exePath: exe, runner, platform: 'win32' })
    expect(calls).toHaveLength(SHELL_MENU_EXTS.length * 3)
    expect(calls[0]).toEqual(['add', shellVerbKey('docx'), '/ve', '/d', SHELL_VERB_LABEL, '/f'])
    expect(calls[1]).toEqual(['add', shellVerbKey('docx'), '/v', 'Icon', '/d', `${exe},0`, '/f'])
    expect(calls[2]).toEqual([
      'add',
      `${shellVerbKey('docx')}\\command`,
      '/ve',
      '/d',
      `"${exe}" "%1"`,
      '/f',
    ])
    for (const ext of SHELL_MENU_EXTS) {
      expect(store[shellVerbKey(ext)]?.label).toBe(SHELL_VERB_LABEL)
      expect(store[shellVerbKey(ext)]?.command).toBe(`"${exe}" "%1"`)
    }
  })

  it('is a no-op off Windows', async () => {
    const { runner, calls } = stubRegistry()
    await registerShellMenu({ exePath: 'x', runner, platform: 'linux' })
    expect(calls).toHaveLength(0)
  })
})

describe('unregisterShellMenu', () => {
  it('deletes every verb key and tolerates missing keys', async () => {
    const { runner, calls, store } = stubRegistry({
      [shellVerbKey('docx')]: { label: SHELL_VERB_LABEL },
    })
    await unregisterShellMenu({ runner, platform: 'win32' })
    expect(calls).toHaveLength(SHELL_MENU_EXTS.length)
    expect(calls[0]).toEqual(['delete', shellVerbKey('docx'), '/f'])
    expect(store).toEqual({})
  })

  it('is a no-op off Windows', async () => {
    const { runner, calls } = stubRegistry()
    await unregisterShellMenu({ runner, platform: 'darwin' })
    expect(calls).toHaveLength(0)
  })
})

describe('isShellMenuRegistered', () => {
  const exe = 'C:\\ReveLith\\ReveLith.exe'
  const full = Object.fromEntries(
    SHELL_MENU_EXTS.map((ext) => [
      shellVerbKey(ext),
      { label: SHELL_VERB_LABEL, command: `"${exe}" "%1"` },
    ]),
  )

  it('is true when every verb points at the exe', async () => {
    const { runner } = stubRegistry(full)
    await expect(isShellMenuRegistered({ exePath: exe, runner, platform: 'win32' })).resolves.toBe(
      true,
    )
  })

  it('is false when any ext is missing', async () => {
    const partial = { ...full }
    delete partial[shellVerbKey('pdf')]
    const { runner } = stubRegistry(partial)
    await expect(isShellMenuRegistered({ exePath: exe, runner, platform: 'win32' })).resolves.toBe(
      false,
    )
  })

  it('is false when the command points at a stale exe path', async () => {
    const stale = {
      ...full,
      [shellVerbKey('md')]: { label: SHELL_VERB_LABEL, command: '"D:\\old\\ReveLith.exe" "%1"' },
    }
    const { runner } = stubRegistry(stale)
    await expect(isShellMenuRegistered({ exePath: exe, runner, platform: 'win32' })).resolves.toBe(
      false,
    )
  })

  it('command comparison is case-insensitive (registry canonicalizes case)', async () => {
    const { runner } = stubRegistry(full)
    await expect(
      isShellMenuRegistered({ exePath: exe.toLowerCase(), runner, platform: 'win32' }),
    ).resolves.toBe(true)
  })

  it('is false off Windows', async () => {
    const { runner } = stubRegistry(full)
    await expect(isShellMenuRegistered({ exePath: exe, runner, platform: 'linux' })).resolves.toBe(
      false,
    )
  })
})

describe('ensureShellMenu', () => {
  it('skips unpackaged and non-Windows runs without touching reg.exe', async () => {
    const dev = stubRegistry()
    await expect(
      ensureShellMenu({ exePath: 'x', packaged: false, runner: dev.runner, platform: 'win32' }),
    ).resolves.toBe('skipped')
    await expect(
      ensureShellMenu({ exePath: 'x', packaged: true, runner: dev.runner, platform: 'darwin' }),
    ).resolves.toBe('skipped')
    expect(dev.calls).toHaveLength(0)
  })

  it('reports already when the verbs are in place', async () => {
    const exe = 'C:\\ReveLith\\ReveLith.exe'
    const full = Object.fromEntries(
      SHELL_MENU_EXTS.map((ext) => [
        shellVerbKey(ext),
        { label: SHELL_VERB_LABEL, command: `"${exe}" "%1"` },
      ]),
    )
    const { runner, calls } = stubRegistry(full)
    await expect(
      ensureShellMenu({ exePath: exe, packaged: true, runner, platform: 'win32' }),
    ).resolves.toBe('already')
    expect(calls.every(([op]) => op === 'query')).toBe(true)
  })

  it('registers when the verbs are missing', async () => {
    const { runner } = stubRegistry()
    await expect(
      ensureShellMenu({
        exePath: 'C:\\ReveLith\\ReveLith.exe',
        packaged: true,
        runner,
        platform: 'win32',
      }),
    ).resolves.toBe('registered')
  })

  it('never throws: reg.exe failures become failed', async () => {
    const runner: RegRunner = async () => {
      throw new Error('access denied')
    }
    await expect(
      ensureShellMenu({ exePath: 'x', packaged: true, runner, platform: 'win32' }),
    ).resolves.toBe('failed')
  })
})

describe('packaging consistency', () => {
  it('installer.nsh registers exactly SHELL_MENU_EXTS and removes the same set', () => {
    const nsh = readBuildFile('installer.nsh')
    const added = [...nsh.matchAll(/REVELITH_ADD_SHELL_VERB "([^"]+)"/g)].map((m) => m[1])
    const removed = [...nsh.matchAll(/REVELITH_REMOVE_SHELL_VERB "([^"]+)"/g)].map((m) => m[1])
    expect(added).toEqual([...SHELL_MENU_EXTS])
    expect(removed).toEqual([...SHELL_MENU_EXTS])
  })

  it('electron-builder fileAssociations cover exactly SHELL_MENU_EXTS', () => {
    const config = readFileSync(`${SHELL_DIR}/electron-builder.cjs`, 'utf8')
    const exts = [...config.matchAll(/ext: '([^']+)'/g)].map((m) => m[1]).sort()
    expect(exts).toEqual([...SHELL_MENU_EXTS].sort())
  })

  it('the nsis block includes the shell-menu script', () => {
    const config = readFileSync(`${SHELL_DIR}/electron-builder.cjs`, 'utf8')
    expect(config).toContain("include: 'build/installer.nsh'")
    expect(existsSync(`${SHELL_DIR}/build/installer.nsh`)).toBe(true)
  })

  it('customInstall/customUnInstall hooks exist exactly once each', () => {
    const nsh = readBuildFile('installer.nsh')
    expect(nsh.match(/!macro customInstall/g)).toHaveLength(1)
    expect(nsh.match(/!macro customUnInstall/g)).toHaveLength(1)
  })

  it('the installer writes the same label and verb name as the runtime module', () => {
    const nsh = readBuildFile('installer.nsh')
    expect(nsh).toContain(`shell\\${SHELL_VERB_NAME}`)
    expect(nsh).toContain(`"" "${SHELL_VERB_LABEL}"`)
  })
})

describe('installer.nsh compiles under makensis', () => {
  const hasMakensis = (() => {
    try {
      execFileSync('makensis', ['/VERSION'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()

  it.skipIf(!hasMakensis)('customInstall/customUnInstall expand with installer defines', () => {
    const harness =
      'OutFile "nul"\n' +
      '!define PRODUCT_FILENAME "ReveLith"\n' +
      '!define APP_EXECUTABLE_FILENAME "ReveLith.exe"\n' +
      'Var INSTDIR\n' +
      '!include "installer.nsh"\n' +
      'Section "test"\n' +
      '  !insertmacro customInstall\n' +
      'SectionEnd\n' +
      'Section "uninstall"\n' +
      '  !insertmacro customUnInstall\n' +
      'SectionEnd\n'
    const dir = `${tmpdir()}\\revelith-nsh-check`
    mkdirSync(dir, { recursive: true })
    writeFileSync(`${dir}\\harness.nsi`, harness)
    copyFileSync(`${SHELL_DIR}/build/installer.nsh`, `${dir}\\installer.nsh`)
    execFileSync('makensis', [`${dir}\\harness.nsi`], { stdio: 'pipe' })
  })
})
