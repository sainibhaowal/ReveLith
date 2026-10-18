import { join } from 'node:path'
import { revelithUserDataDir } from './gui'

/**
 * The CLI's search / image / media commands reuse the providers chosen in
 * the app's AI settings. That
 * settings file lives in the shell's Electron userData directory, which revelith
 * has to locate without Electron.
 */
export function aiSettingsPath(env: NodeJS.ProcessEnv): string {
  return env.REVELITH_AI_SETTINGS || join(revelithUserDataDir(env), 'ai-settings.json')
}

/** First http(s) proxy in the usual environment variables, as the app's main process reads them. */
export function proxyUrlFromEnv(env: NodeJS.ProcessEnv): string | null {
  return (
    [
      env.HTTPS_PROXY,
      env.https_proxy,
      env.HTTP_PROXY,
      env.http_proxy,
      env.ALL_PROXY,
      env.all_proxy,
    ].find((v) => v && /^https?:\/\//.test(v)) ?? null
  )
}

let prepared = false

/** Once per process: route user-configured provider requests through the configured proxy. */
export async function prepareNetwork(env: NodeJS.ProcessEnv): Promise<void> {
  if (prepared) return
  prepared = true
  const proxy = proxyUrlFromEnv(env)
  if (proxy) {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new ProxyAgent(proxy))
  }
}
