import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

// UI tests run from the workspace root, where ReactDOM may be an older peer
// copy. Resolve the paired runtime through a renderer workspace instead.
const rendererRequire = createRequire(new URL('../../apps/sheets/package.json', import.meta.url))
const reactModules = resolve(rendererRequire.resolve('react/package.json'), '..')
const reactDomModules = resolve(rendererRequire.resolve('react-dom/package.json'), '..')

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react$/, replacement: resolve(reactModules, 'index.js') },
      { find: /^react-dom$/, replacement: resolve(reactDomModules, 'index.js') },
      { find: /^react-dom\/client$/, replacement: resolve(reactDomModules, 'client.js') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  test: {
    // .tsx too: the shared chat components are covered by rendering tests that
    // opt into jsdom per file with the @vitest-environment pragma.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
})
