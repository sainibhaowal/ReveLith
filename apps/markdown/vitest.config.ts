import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { defineConfig } from 'vitest/config'

const appRequire = createRequire(new URL('./package.json', import.meta.url))
const reactRoot = dirname(appRequire.resolve('react/package.json'))
const reactDomRoot = dirname(appRequire.resolve('react-dom/package.json'))

const TIPTAP_DEDUPE = [
  'react',
  'react-dom',
  '@tiptap/core',
  '@tiptap/pm',
  '@tiptap/react',
  '@tiptap/extensions',
  '@tiptap/extension-list',
  '@tiptap/extension-table',
  '@tiptap/extension-image',
  '@tiptap/suggestion',
  '@tiptap/markdown',
  '@tiptap/extension-highlight',
  '@tiptap/extension-code-block',
]

export default defineConfig({
  resolve: {
    alias: { 'react-dom': reactDomRoot, react: reactRoot },
    dedupe: TIPTAP_DEDUPE,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    testTimeout: 20000,
    // The selector shim is otherwise externalized from the repo root.
    server: { deps: { inline: ['use-sync-external-store'] } },
  },
})
