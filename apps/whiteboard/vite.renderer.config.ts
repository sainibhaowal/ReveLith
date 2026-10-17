import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const drawboardDevPort = process.env.DRAWBOARD_DEV_PORT ?? process.env.WHITEBOARD_DEV_PORT

// renderer-only dev server (embedded by the shell via DRAWBOARD_RENDERER_URL for HMR; no standalone Electron)
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { include: ['@excalidraw/excalidraw'] },
  server: {
    port: Number(drawboardDevPort) || 5182,
    strictPort: Boolean(drawboardDevPort),
  },
})
