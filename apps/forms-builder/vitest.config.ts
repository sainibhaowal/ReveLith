import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const appRequire = createRequire(new URL('./package.json', import.meta.url))
const reactRoot = dirname(appRequire.resolve('react/package.json'))
const reactDomRoot = dirname(appRequire.resolve('react-dom/package.json'))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { react: reactRoot, 'react-dom': reactDomRoot },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
  },
})
