import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, clipboard, dialog, ipcMain, type BrowserWindow } from 'electron'
import {
  agentTarget,
  bundledSkillFrom,
  buildSkillZip,
  detectAgents,
  installSkill,
  LEDGER_KEY,
  ledgerFromSettings,
  readInstallState,
  uninstallSkill,
  type BundledSkill,
  type SkillLedger,
} from '@revelith/cli/agent-skills'
import { inspectCliLink } from '@revelith/cli/install'
import { readAppSettings, writeAppSetting } from './app-settings'
import { isEphemeralInstall } from './cli-link'
import {
  INTEGRATIONS_CHANNELS,
  type AgentId,
  type IntegrationsStatus,
  type SkillInstallState,
} from '../shared/integrations-api'

export interface IntegrationsDeps {
  settingsPath: () => string
  /** the shell window dialogs attach to */
  window: () => BrowserWindow | null
  /** directory holding revelith / revelith.cmd and, packaged, skills/revelith/SKILL.md */
  cliDir: string
  /** skills/revelith/SKILL.md (repo file in dev, Resources/cli/skills/... packaged) */
  skillPath: string
  /** any further bundled skills (skills/<name>/SKILL.md); the folder name comes from each file's front matter */
  extraSkillPaths?: string[]
  /** packages/cli/package.json (its version is the CLI version) */
  cliPackageJson: string
}

/** Settings → Integrations: probe, install, uninstall, zip. No write happens without a click in that pane. */
export function registerIntegrationsIpc(deps: IntegrationsDeps): void {
  /** Every skill this build ships, primary first. */
  const bundledList = (): BundledSkill[] =>
    [deps.skillPath, ...(deps.extraSkillPaths ?? [])]
      .filter((path): path is string => Boolean(path))
      .map((path) => bundledSkillFrom(readFileSync(path)))
  const bundled = (): BundledSkill => bundledList()[0]!
  /** Pick one skill by folder name; unknown names fall back to the primary. */
  const pickSkill = (name?: unknown): BundledSkill => {
    const all = bundledList()
    if (typeof name !== 'string' || !name) return all[0]!
    return all.find((skill) => skill.name === name) ?? all[0]!
  }
  const cliRequirement = (text: string): string =>
    /^\s+cli:\s*['"]?>=\s*(\d+\.\d+\.\d+)/m.exec(text)?.[1] ?? ''
  const ledger = (): SkillLedger => ledgerFromSettings(readAppSettings(deps.settingsPath()))
  const saveLedger = (l: SkillLedger) => writeAppSetting(deps.settingsPath(), LEDGER_KEY, l)
  const stateOf = (skillsDir: string, name?: unknown): SkillInstallState =>
    readInstallState(skillsDir, pickSkill(name), ledger())

  ipcMain.handle(INTEGRATIONS_CHANNELS.status, (): IntegrationsStatus => {
    const skill = bundled()
    const l = ledger()
    const launcher = join(deps.cliDir, process.platform === 'win32' ? 'revelith.cmd' : 'revelith')
    return {
      cli: {
        ...inspectCliLink({ launcher }),
        launcherDir: deps.cliDir,
        ephemeral: app.isPackaged && isEphemeralInstall(process.resourcesPath, process.env),
        version: cliVersion(deps.cliPackageJson),
      },
      skillVersion: skill.version,
      skillNeedsCli: cliRequirement(skill.text),
      // Every skill this build ships, each with its own install state per
      // agent, so the pane can list and install all of them.
      skills: bundledList().map((entry) => ({
        name: entry.name,
        version: entry.version,
        needsCli: cliRequirement(entry.text),
        description:
          /^\s*description:\s*(.+)$/m
            .exec(entry.text)?.[1]
            ?.trim()
            .replace(/^['"]|['"]$/g, '') ?? '',
        agents: detectAgents().map((target) => ({
          ...target,
          state: readInstallState(target.skillsDir, entry, l),
        })),
      })),
      agents: detectAgents().map((a) => ({ ...a, state: readInstallState(a.skillsDir, skill, l) })),
    }
  })

  ipcMain.handle(
    INTEGRATIONS_CHANNELS.installSkill,
    (_e, target: { agentId?: AgentId; dir?: string; name?: string }): SkillInstallState => {
      const skillsDir = target.dir ?? agentTarget(target.agentId!)?.skillsDir
      if (!skillsDir) throw new Error('unknown skill target')
      const l = ledger()
      installSkill(skillsDir, pickSkill(target.name), l)
      saveLedger(l)
      return stateOf(skillsDir, target.name)
    },
  )

  ipcMain.handle(
    INTEGRATIONS_CHANNELS.uninstallSkill,
    (_e, agentId: AgentId, name?: string): SkillInstallState => {
      const target = agentTarget(agentId)
      if (!target) throw new Error('unknown skill target')
      const l = ledger()
      if (uninstallSkill(target.skillsDir, l, pickSkill(name).name)) saveLedger(l)
      return stateOf(target.skillsDir, name)
    },
  )

  // dialog titles come from the renderer, which owns the UI language
  ipcMain.handle(
    INTEGRATIONS_CHANNELS.pickSkillDir,
    async (_e, title: string): Promise<string | null> => {
      const opts: Electron.OpenDialogOptions = {
        title: String(title ?? ''),
        properties: ['openDirectory', 'createDirectory'],
      }
      const win = deps.window()
      const r = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
  )

  ipcMain.handle(
    INTEGRATIONS_CHANNELS.saveSkillZip,
    async (_e, title: string, name?: string): Promise<string | null> => {
      const skill = pickSkill(name)
      const opts: Electron.SaveDialogOptions = {
        title: String(title ?? ''),
        defaultPath: join(app.getPath('downloads'), `revelith-skill-${skill.version}.zip`),
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      }
      const win = deps.window()
      const r = await (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts))
      if (r.canceled || !r.filePath) return null
      writeFileSync(r.filePath, await buildSkillZip(skill))
      return r.filePath
    },
  )

  ipcMain.handle(INTEGRATIONS_CHANNELS.copyText, (_e, text: string): void => {
    if (typeof text === 'string') clipboard.writeText(text)
  })
}

function cliVersion(packageJson: string): string {
  try {
    return String(JSON.parse(readFileSync(packageJson, 'utf-8')).version ?? '')
  } catch {
    return ''
  }
}
