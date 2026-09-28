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
