import type { AgentToolCall, AgentToolDef, ToolExecution } from './types'

/**
 * One tool call actually executed during a run, as seen by verifyResponse.
 * Canonical definition lives in ./types (re-exported here for callers that
 * import it alongside AgentSkill); both names resolve to one type.
 */
export type { ExecutedToolCall } from './types'
import type { ExecutedToolCall } from './types'

/**
 * A skill packages one capability domain for the agent loop: its system
 * prompt section, its tools, per-turn context, and the tool executor.
 * AI Docs ships a docx skill; Excel / PPT skills plug in the same way.
 */
export interface AgentSkill {
  id: string
  /** system prompt section describing this skill's rules and tools */
  systemPrompt: string
  tools: AgentToolDef[]
  /**
   * Fresh context sections attached to every user turn (e.g. document
   * skeleton + selection). Return '' when there is nothing to attach.
   */
  buildContext?(): string
  /**
   * signal: aborted when the user hits stop. Long-running tools (e.g.
   * generate_deck with internal LLM calls) should check signal.aborted in
   * their loops and stop promptly.
   */
  executeTool(call: AgentToolCall, signal?: AbortSignal): ToolExecution | Promise<ToolExecution>
  /**
   * Post-run guard against claimed-action hallucination: inspects the final
   * assistant text against the tools that actually ran and returns a
   * corrective instruction when the reply narrates an action that never
   * happened (the loop then runs one extra turn); null when the reply is
   * fine. Prompt rules alone are soft — this is the mechanical backstop.
   */
  verifyResponse?(finalText: string, executed: readonly ExecutedToolCall[]): string | null
}

/**
 * Merge several skills into one (tool names must be globally unique).
 * `intro` becomes the shared preamble of the combined system prompt.
 */
export function composeSkills(id: string, intro: string, skills: AgentSkill[]): AgentSkill {
  // Recomputed per access: a sub-skill may expose `tools` through a getter
  // keyed on runtime capability, and the loop reads the composed skill's tools
  // before every model request.
  const ownerOf = (name: string): AgentSkill | undefined =>
    skills.find((skill) => skill.tools.some((tool) => tool.name === name))
  return {
    id,
    // live like tools: a sub-skill's prompt may vary with the same capability its tools key on
    get systemPrompt() {
      return [intro, ...skills.map((s) => s.systemPrompt)].filter(Boolean).join('\n\n')
    },
    get tools() {
      const all = skills.flatMap((s) => s.tools)
      const seen = new Set<string>()
      for (const tool of all) {
        if (seen.has(tool.name)) throw new Error(`duplicate tool name: ${tool.name}`)
        seen.add(tool.name)
      }
      return all
    },
    buildContext: () =>
      skills
        .map((s) => s.buildContext?.() ?? '')
        .filter(Boolean)
        .join('\n\n'),
    executeTool: (call, signal) => {
      const skill = ownerOf(call.name)
      if (!skill) {
        return { output: `Unknown tool: ${call.name}`, isError: true, summary: call.name }
      }
      return skill.executeTool(call, signal)
    },
    verifyResponse: (finalText, executed) => {
      for (const skill of skills) {
        const correction = skill.verifyResponse?.(finalText, executed)
        if (correction) return correction
      }
      return null
    },
  }
}
