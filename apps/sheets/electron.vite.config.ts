import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    // @revelith/* workspace packages ship TS source (no build step, no
    // compiled entry point) : externalizing them makes Node's ESM loader try
    // to resolve their relative imports at runtime and fail. Bundle those;
    // externalize everything else (Electron, zod, node builtins).
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@revelith/ai-provider',
          '@revelith/agent-core',
          '@revelith/ai-search',
          '@revelith/docx-engine',
          '@revelith/file-parse',
          '@revelith/electron-utils',
          '@revelith/i18n',
        ],
      }),
    ],
  },
  preload: {
    // Sandboxed preload scripts cannot require arbitrary npm packages at runtime.
    plugins: [],
  },
  renderer: {
    plugins: [react()],
  },
})
