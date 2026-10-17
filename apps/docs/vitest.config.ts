import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// resolve sibling source packages by path (not via node_modules), so a git
// worktree whose node_modules is linked to another checkout still tests
// against this checkout's edits (same convention as packages/pdf2docx)
const local = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  resolve: {
    // The workspace has multiple compatible React versions installed; tests
    // render shared @revelith/ui components with ReactDOM, so keep hooks and
    // the renderer on one React module just as the Docs Vite build does.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@revelith/docx-engine/lazy-media': local('../../packages/docx-engine/src/lazy-media.ts'),
      '@revelith/docx-engine': local('../../packages/docx-engine/src/index.ts'),
      '@revelith/font-metrics': local('../../packages/font-metrics/src/index.ts'),
      // subpath before the bare name: string aliases are prefix replacements
      '@revelith/electron-utils/headless-export': local(
        '../../packages/electron-utils/src/headless-export.ts',
      ),
      '@revelith/electron-utils/atomic-write': local(
        '../../packages/electron-utils/src/atomic-write.ts',
      ),
      '@revelith/electron-utils': local('../../packages/electron-utils/src/index.ts'),
      '@revelith/ai-provider/browser': local('../../packages/ai-provider/src/browser.ts'),
      '@revelith/ai-provider': local('../../packages/ai-provider/src/index.ts'),
      '@revelith/i18n': local('../../packages/i18n/src/index.ts'),
      '@revelith/ui': local('../../packages/ui/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    maxWorkers: 4,
    testTimeout: 20000,
  },
})
