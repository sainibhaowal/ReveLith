import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The deploy workflow generates this file from the selected GitHub release
// before building. Embed it so the first render uses the same version and
// download links as /release.json, even before a network fetch.
const releaseManifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/release.json'), 'utf8'),
)
if (typeof releaseManifest.version !== 'string' || !Array.isArray(releaseManifest.downloads)) {
  throw new Error('public/release.json is not a valid release manifest.')
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __RELEASE_MANIFEST__: JSON.stringify(releaseManifest),
  },
  plugins: [react(), tailwindcss()],
})
