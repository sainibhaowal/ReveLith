import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Pin resolution to this repo's workspace sources (matches tsconfig paths)
  resolve: {
    alias: {
      // Subpath before the bare name: string aliases are prefix replacements
      '@revelith/pptx-engine/table-grid': resolve(
        here,
        '../../packages/pptx-engine/src/table-grid.ts',
      ),
      '@revelith/pptx-engine/identity': resolve(here, '../../packages/pptx-engine/src/identity.ts'),
      '@revelith/pptx-engine/named-action': resolve(
        here,
        '../../packages/pptx-engine/src/named-action.ts',
      ),
      '@revelith/pptx-engine/background-promote': resolve(
        here,
        '../../packages/pptx-engine/src/background-promote.ts',
      ),
      '@revelith/pptx-engine/custgeom': resolve(here, '../../packages/pptx-engine/src/custgeom.ts'),
      '@revelith/pptx-engine': resolve(here, '../../packages/pptx-engine/src/index.ts'),
      '@revelith/pptx-ops/op-docs': resolve(here, '../../packages/pptx-ops/src/op-docs.ts'),
      '@revelith/pptx-ops/font-size': resolve(here, '../../packages/pptx-ops/src/font-size.ts'),
      '@revelith/pptx-ops': resolve(here, '../../packages/pptx-ops/src/index.ts'),
      '@revelith/pptx-render/preset-geometry': resolve(
        here,
        '../../packages/pptx-render/src/preset-geometry.ts',
      ),
      '@revelith/pptx-render': resolve(here, '../../packages/pptx-render/src/index.ts'),
      '@revelith/pipelines/slides/layout-audit': resolve(
        here,
        '../../packages/pipelines/src/slides/layout-audit.ts',
      ),
      '@revelith/pipelines/slides': resolve(here, '../../packages/pipelines/src/slides/index.ts'),
      '@revelith/docx-engine/metafile': resolve(here, '../../packages/docx-engine/src/metafile.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    testTimeout: 20000,
  },
})
