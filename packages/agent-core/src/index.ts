export type {
  AgentImage,
  AgentMessage,
  AgentStreamCallbacks,
  AgentStreamHandle,
  AgentStreamRequest,
  AgentToolCall,
  AgentToolDef,
  AgentToolResult,
  AgentTransport,
  ToolDisplay,
  ToolExecution,
} from './types'
export { composeSkills } from './skill'
export type { AgentSkill, ExecutedToolCall } from './skill'
export {
  AgentLoop,
  COMPLETED_VIA_TOOLS_TEXT,
  DEFAULT_MAX_TURNS,
  TOOL_ABORTED_OUTPUT,
  missingRequiredFields,
  runtimePreamble,
  sanitizeAgentPayload,
} from './loop'
export type {
  AgentLoopEvents,
  AgentLoopOptions,
  AgentRunResult,
  CompactionOptions,
  ToolExecutedEvent,
} from './loop'
export { createIpcTransport, IPC_STREAM_SILENCE_TIMEOUT_MS } from './electron-transport'
export { streamText } from './stream-text'
export type { StreamTextOptions, StreamTextOutcome } from './stream-text'
export type { IpcStreamChunk, IpcStreamStart, IpcTransportOptions } from './electron-transport'

// Citations & Grounded Sources
export * from './citations/types'
export * from './citations/citation-engine'
export * from './citations/source-store'
export * from './citations/source-adapter'

// Hebbia Matrix Multi-Document Extraction
export * from './matrix/types'
export * from './matrix/matrix-extractor'
export * from './matrix/matrix-to-xlsx'
