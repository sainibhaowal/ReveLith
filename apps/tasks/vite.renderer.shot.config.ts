// TEMPORARY: expose the tasks renderer as a standalone browser page.
// The app's own vite.renderer.config.ts omits `root`, so its dev server 404s.
// Safe to delete; not part of the app.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: { port: 6191, strictPort: true },
})
