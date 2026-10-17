import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { defineConfig } from 'vitest/config'

const appRequire = createRequire(new URL('./package.json', import.meta.url))
const reactRoot = dirname(appRequire.resolve('react/package.json'))
const reactDomRoot = dirname(appRequire.resolve('react-dom/package.json'))

export default defineConfig({
  resolve: {
    // Workspace-linked UI components otherwise resolve React from the root,
    // which can differ from the React/DOM pair used by the Sheets renderer.
    alias: { 'react-dom': reactDomRoot, react: reactRoot },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    maxWorkers: 4,
  },
})
