import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { defineConfig } from 'vitest/config'

const appRequire = createRequire(new URL('./package.json', import.meta.url))
const reactRoot = dirname(appRequire.resolve('react/package.json'))
const reactDomRoot = dirname(appRequire.resolve('react-dom/package.json'))

export default defineConfig({
  resolve: {
    alias: { 'react-dom': reactDomRoot, react: reactRoot },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    testTimeout: 20000,
  },
})
