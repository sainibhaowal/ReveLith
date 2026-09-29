import type { AgentMessage, AgentToolCall, AgentToolDef } from '@revelith/agent-core'

export type AiProviderId =
  | 'ollama'
  | 'lmstudio'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'openai'
  | 'opencode-zen'
  | 'codex-app-server'
  | 'opper'
  | 'custom'

export interface AiProviderConfig {
  apiKey: string
  model: string
  /** used by custom/local providers and codex-app-server */
  baseUrl?: string | undefined
  /** OpenCode session affinity header (x-opencode-session) */
  sessionId?: string | undefined
}

export interface AiProviderMeta {
  id: AiProviderId
  label: string
  models: string[]
  defaultModel: string
  keyPlaceholder: string
  needsBaseUrl?: boolean
}

export interface ByokSettings {
  webSearchKey?: string
  imageGenKey?: string
  mediaAnalysisKey?: string
}

export type WebSearchProviderId = 'serper' | 'duckduckgo'

/**
 * AI Media & Search settings (Settings → AI Media & Search). Stored on this
 * device only, inside AiSettings. Keys are threaded into the main-process
 * search/image handlers; providers/models pick dedicated backends, falling
 * back to the active chat provider or the free search fallback when unset.
 */
export interface MediaSearchSettings {
  webSearch: {
    provider: WebSearchProviderId
    apiKey: string
  }
  imageGen: {
    /** '' = use the active chat provider (legacy behavior) */
    provider: AiProviderId | ''
    model: string
    apiKey: string
    baseUrl: string
  }
  imageAnalysis: {
    /** '' = use the active chat provider (legacy behavior) */
    provider: AiProviderId | ''
    model: string
  }
  videoAnalysis: {
    /** '' = use the active chat provider (legacy behavior) */
    provider: AiProviderId | ''
  }
}

export interface AiSettings {
  provider: AiProviderId
  providers: Record<AiProviderId, AiProviderConfig>
  byok?: ByokSettings
  mediaSearch?: MediaSearchSettings
}

/** pre-provider settings shape (single OpenAI-compatible endpoint); migrated into "custom" */
export interface LegacyAiSettings {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export interface AiChatRequest {
  settings: AiSettings
  system: string
  user: string
}

export interface AiChatResponse {
  ok: boolean
  content?: string
  error?: string
}

export interface AiStreamRequest {
  requestId: string
  settings: AiSettings
  system: string
  messages: AgentMessage[]
  tools?: AgentToolDef[]
  maxTokens?: number
}

export interface AiStreamChunk {
  requestId: string
  /** 'ping' = wire-level keepalive so the renderer can tell a live stream from a dead one */
  type: 'delta' | 'tool-call' | 'done' | 'error' | 'ping'
  text?: string
  /** complete parsed tool call (emitted once its arguments finish streaming) */
  toolCall?: AgentToolCall
  error?: string
  /** machine-readable error cause ('timeout', exhausted 'credits'); lets the renderer localize the message */
  errorCode?: 'timeout' | 'credits'
  /** normalized stop reason carried on 'done' ('max_tokens' = output cut off by the token limit) */
  stopReason?: string
}
