import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // pdfjs-dist's legacy build reaches for DOMMatrix, which jsdom does not
    // implement. Without this the text-extraction tests die with
    // "ReferenceError: DOMMatrix is not defined".
    setupFiles: ['./tests/setup.ts'],
    environment: 'jsdom',
    testTimeout: 20000,
  },
})
