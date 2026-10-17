import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Component tests render the shared chat panels, and a workspace package
// (@revelith/ui) must resolve React to the SAME copy this app renders with —
// two copies leave hooks with a null dispatcher ("reading 'useState'").
// ReveLith renderers are built against the paired React runtime in
// apps/node_modules, so point every React import at it.
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
