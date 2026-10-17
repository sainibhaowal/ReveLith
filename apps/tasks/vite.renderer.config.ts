import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.TASKS_DEV_PORT) || 5181,
    strictPort: Boolean(process.env.TASKS_DEV_PORT),
  },
})
