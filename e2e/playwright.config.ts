import { defineConfig } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Keep E2E-created files under the workspace. On some Windows developer/CI
// profiles, the inherited OS temp directory is not writable by the app process.
const e2eSystemTemp = resolve(process.cwd(), '.tmp', 'e2e', 'system-temp')
mkdirSync(e2eSystemTemp, { recursive: true })
process.env.TEMP = e2eSystemTemp
process.env.TMP = e2eSystemTemp
process.env.TMPDIR = e2eSystemTemp

/**
 * E2E config for the ReveLith Electron shell.
 *
 * Tests launch the real built app (electron.launch), so they run serially —
 * parallel Electron instances fight over the GPU cache and dock on macOS.
 * Run with: `npm run test:e2e` (after `npm run build:all`).
 */
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // flat, platform-suffix-free names: baselines are Linux-CI-only (the visual
  // suite skips elsewhere), and {arg} already carries the corpus doc name
  snapshotPathTemplate: '{testDir}/visual-baselines/{arg}{ext}',
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
})
