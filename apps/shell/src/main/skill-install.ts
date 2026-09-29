import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** One-click skill install targets (best-effort, never throws). */
export interface SkillInstallResult {
  agent: string
  path: string
  ok: boolean
  error?: string
}

function agentDirs(): Array<{ agent: string; dir: string }> {
  const home = homedir()
  return [
    { agent: 'claude-code', dir: join(home, '.claude', 'skills', 'revelith') },
    { agent: 'codex', dir: join(home, '.codex', 'skills', 'revelith') },
    { agent: 'opencode', dir: join(home, '.config', 'opencode', 'skills', 'revelith') },
  ]
}

export function detectedAgents(): string[] {
  return agentDirs()
    .filter((a) => existsSync(join(a.dir, '..')))
    .map((a) => a.agent)
}

export interface SkillAgentStatus {
  agent: string
  /** skills directory for this agent */
  dir: string
  /** the agent's parent config dir exists on this machine */
  hostDetected: boolean
  /** SKILL.md already installed */
  installed: boolean
}

/** Per-agent install status for Settings → Integrations. Never throws. */
export function skillAgentStatus(): SkillAgentStatus[] {
  return agentDirs().map(({ agent, dir }) => {
    const hostDetected = existsSync(join(dir, '..'))
    let installed: boolean
    try {
      installed = existsSync(join(dir, 'SKILL.md'))
    } catch {
      installed = false
    }
    return { agent, dir, hostDetected, installed }
  })
}

/** Install the skill for one agent only (null when the agent id is unknown). Never throws. */
export function installSkillFor(agent: string, skillMdPath: string): SkillInstallResult | null {
  const target = agentDirs().find((a) => a.agent === agent)
  if (!target) return null
  try {
    if (!existsSync(skillMdPath))
      return { agent, path: target.dir, ok: false, error: 'skill source missing' }
    mkdirSync(target.dir, { recursive: true })
    copyFileSync(skillMdPath, join(target.dir, 'SKILL.md'))
    return { agent, path: join(target.dir, 'SKILL.md'), ok: true }
  } catch (err) {
    return {
      agent,
      path: target.dir,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function installRevelithSkill(skillMdPath: string): SkillInstallResult[] {
  return agentDirs().map(({ agent, dir }) => {
    try {
      if (!existsSync(skillMdPath))
        return { agent, path: dir, ok: false, error: 'skill source missing' }
      mkdirSync(dir, { recursive: true })
      copyFileSync(skillMdPath, join(dir, 'SKILL.md'))
      return { agent, path: join(dir, 'SKILL.md'), ok: true }
    } catch (err) {
      return {
        agent,
        path: dir,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })
}

export function listSkillFiles(skillDir: string): string[] {
  try {
    return readdirSync(skillDir)
  } catch {
    return []
  }
}
