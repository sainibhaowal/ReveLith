export type {
  AiChatRequest,
  AiChatResponse,
  AiProviderConfig,
  AiProviderId,
  AiProviderMeta,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  LegacyAiSettings,
} from './types'
export {
  AI_PROVIDERS,
  defaultAiSettings,
  resolveAiSettings,
} from './providers'
export { chatForProvider } from './chat'
export { generateImageForProvider } from './image'
export type { AiImageResult } from './image'
export { resolveLocalModelConfig } from './local-model'
export { setRescueFetch } from './fetch'
export { AiQuotaError, sseLines, streamForProvider } from './stream'
export type { StreamCallbacks } from './stream'
export {
  AI_CHAT_RESPONSE_TIMEOUT_MS,
  AI_CONNECT_TIMEOUT_MS,
  AI_IDLE_TIMEOUT_MS,
  AiTimeoutError,
  createStreamWatchdog,
} from './watchdog'
export type { StreamWatchdog } from './watchdog'
