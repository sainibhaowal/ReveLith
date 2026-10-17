import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    server: {
      port: Number(process.env.FORMS_DEV_PORT) || 5180,
      strictPort: Boolean(process.env.FORMS_DEV_PORT),
    },
  },
})
