import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    // @revelith/* workspace packages ship TS source (no build step, no compiled
    // entry point) — externalizing them makes Node's ESM loader try to resolve
    // their relative imports at runtime and fail. Bundle those; externalize
    // everything else (Electron, zod, node builtins).
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@revelith/agent-core',
          '@revelith/ai-provider',
          '@revelith/app-chat',
          '@revelith/ui',
        ],
      }),
    ],
  },
  preload: {
    // Sandboxed preload scripts cannot require arbitrary npm packages at runtime,
    // so the chat bridge must be bundled, not externalized.
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@revelith/agent-core',
          '@revelith/ai-provider',
          '@revelith/app-chat',
          '@revelith/ui',
        ],
      }),
    ],
  },
  renderer: {
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    server: {
      port: Number(process.env.TASKS_DEV_PORT) || 5181,
      strictPort: Boolean(process.env.TASKS_DEV_PORT),
    },
  },
})
