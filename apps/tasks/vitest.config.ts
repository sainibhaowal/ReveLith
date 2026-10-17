import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Component tests render the shared chat panels and ribbon, and a workspace
// package (@revelith/ui, @revelith/app-chat) must resolve React to the SAME
// copy this app renders with — two copies leave hooks with a null dispatcher
// ("Cannot read properties of null (reading 'useState')"). ReveLith renderers
// are built against the paired React runtime in apps/node_modules, so point
// every React import at it.
const appRequire = createRequire(new URL('./package.json', import.meta.url))
const reactRoot = dirname(appRequire.resolve('react/package.json'))
const reactDomRoot = dirname(appRequire.resolve('react-dom/package.json'))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react$/, replacement: resolve(reactRoot, 'index.js') },
      { find: /^react-dom$/, replacement: resolve(reactDomRoot, 'index.js') },
      { find: /^react-dom\/client$/, replacement: resolve(reactDomRoot, 'client.js') },
      // The workspace hoists Testing Library to the repository root. Its
      // CommonJS entry is externalized by Vitest and then resolves the root's
      // mismatched react-dom. Use its ESM entry so Vite applies the aliases.
      { find: /^@testing-library\/react$/, replacement: resolve(__dirname, '../../node_modules/@testing-library/react/dist/@testing-library/react.esm.js') },
      { find: /^@testing-library\/dom$/, replacement: resolve(__dirname, '../../node_modules/@testing-library/dom/dist/@testing-library/dom.esm.js') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    testTimeout: 15_000,
    // @testing-library/react is hoisted at the workspace root. Inline it so
    // Vitest transforms its CommonJS react-dom import through the aliases
    // above instead of loading the root's incompatible React DOM copy.
    server: {
      deps: {
        inline: ['@testing-library/react', '@testing-library/dom', 'react-dom'],
      },
    },
  },
})
