import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: {
    port: Number(process.env.FORMS_DEV_PORT) || 5180,
    strictPort: Boolean(process.env.FORMS_DEV_PORT),
  },
})
