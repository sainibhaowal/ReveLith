import type {
  AgentId,
  AgentTarget,
  SkillInstallState,
  SkillInstallStatus,
} from '@revelith/cli/agent-skills'
import type { InstallOutcome } from '@revelith/cli/install'

export type { AgentId, AgentTarget, SkillInstallState, SkillInstallStatus }

export interface CliStatus extends InstallOutcome {
  /** directory holding the revelith launcher (what `~/.revelith/launcher` points at) */
  launcherDir: string
  /** app runs from a dmg / AppImage mount: the launcher path will not survive a restart */
  ephemeral: boolean
  /** version of the bundled command line */
  version: string
}

/** One bundled skill as the Integrations pane sees it. */
export interface BundledSkillStatus {
  /** install folder name, taken from the skill's own front matter */
  name: string
  version: string
  /** lowest CLI version that skill describes */
  needsCli: string
  /** the skill's own one-line description, straight from its front matter */
  description?: string
  /** install state of THIS skill in every agent found on this machine */
  agents: Array<AgentTarget & { state: SkillInstallState }>
}

export interface IntegrationsStatus {
  cli: CliStatus
  /** version of the bundled skill (skills/revelith/SKILL.md front matter) */
  skillVersion: string
  /** lowest CLI version that skill describes */
  skillNeedsCli: string
  agents: Array<AgentTarget & { state: SkillInstallState }>
  /**
   * Every skill this build ships. `skillVersion` / `skillNeedsCli` / `agents`
   * above always describe the first (primary) entry, so existing callers and
   * saved states keep working; a build that ships one skill simply lists one.
   */
  skills?: BundledSkillStatus[]
}

export interface IntegrationsApi {
  /** probe the CLI link and every detected agent's skills directory (no writes) */
  status(): Promise<IntegrationsStatus>
  /** write the bundled skill into one agent's skills directory (or a picked folder) */
  installSkill(
    target: { agentId: AgentId; name?: string } | { dir: string; name?: string },
  ): Promise<SkillInstallState>
  /** remove a skill this app wrote */
  uninstallSkill(agentId: AgentId, name?: string): Promise<SkillInstallState>
  /** folder picker for "install elsewhere"; null when cancelled */
  pickSkillDir(title: string): Promise<string | null>
  /** save dialog + write of revelith-skill-<version>.zip; the saved path, null when cancelled */
  saveSkillZip(title: string, name?: string): Promise<string | null>
  /** put text on the clipboard (paths, the manual PATH command) */
  copyText(text: string): Promise<void>
}

export const INTEGRATIONS_CHANNELS = {
  status: 'integrations:status',
  installSkill: 'integrations:install-skill',
  uninstallSkill: 'integrations:uninstall-skill',
  pickSkillDir: 'integrations:pick-skill-dir',
  saveSkillZip: 'integrations:save-skill-zip',
  copyText: 'integrations:copy-text',
} as const
