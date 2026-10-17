import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Forked workers intermittently exit without an error on Windows. Threads
    // keep the desktop suite stable in both local pre-commit and CI runs.
    pool: 'threads',
    maxWorkers: 1,
    testTimeout: 20000,
  },
})
