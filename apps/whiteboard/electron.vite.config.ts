import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const drawboardDevPort = process.env.DRAWBOARD_DEV_PORT ?? process.env.WHITEBOARD_DEV_PORT

export default defineConfig({
  // Workspace packages are shipped as TypeScript source, so bundle them into
  // Draw's main process instead of leaving Node to require raw .ts files.
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@revelith/agent-core',
          '@revelith/ai-provider',
          '@revelith/ai-search',
          '@revelith/electron-utils',
          '@revelith/file-parse',
        ],
      }),
    ],
  },
  preload: {},
  renderer: {
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: ['@excalidraw/excalidraw'] },
    build: { commonjsOptions: { include: [/node_modules/] } },
    server: {
      port: Number(drawboardDevPort) || 5182,
      strictPort: Boolean(drawboardDevPort),
    },
  },
})
