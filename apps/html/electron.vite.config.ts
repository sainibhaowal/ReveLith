import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  // @revelith/i18n and @revelith/electron-utils ship as TS source — must be bundled
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@revelith/i18n', '@revelith/electron-utils'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@revelith/i18n', '@revelith/electron-utils'] })],
  },
  renderer: {
    plugins: [react()],
    server: {
      port: Number(process.env.HTML_DEV_PORT) || 5178,
      strictPort: Boolean(process.env.HTML_DEV_PORT),
    },
  },
})
