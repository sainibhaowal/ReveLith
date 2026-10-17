import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION_PATTERN = /^v0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const INSTALLER_PATTERN = /\.(exe|deb|appimage|rpm|dmg|zip)$/i

export function createReleaseManifest({ tag, repository, assets }) {
  if (!VERSION_PATTERN.test(tag)) {
    throw new Error(`Website downloads only support stable 0.x releases; received ${tag}.`)
  }
  if (!/^[^/]+\/[^/]+$/.test(repository)) throw new Error('A GitHub owner/repository is required.')

  const names = [...new Set(assets.filter((name) => INSTALLER_PATTERN.test(name)))].sort()
  if (!names.length) throw new Error(`Release ${tag} has no installer assets.`)

  const downloads = names.map((format) => {
    const lower = format.toLowerCase()
    const arm = lower.includes('arm64') || lower.includes('aarch64')
    const os = lower.endsWith('.exe')
      ? arm
        ? 'Windows 11 (ARM64)'
        : 'Windows 10 / 11'
      : lower.endsWith('.dmg')
        ? lower.includes('x64') || lower.includes('intel')
          ? 'macOS (Intel)'
          : 'macOS (Apple Silicon)'
        : lower.endsWith('.deb') || lower.endsWith('.rpm') || lower.endsWith('.appimage')
          ? arm
            ? 'Linux (ARM64)'
            : 'Linux'
          : 'Desktop archive'
    const tagLabel = lower.endsWith('.exe')
      ? 'Windows installer'
      : lower.endsWith('.dmg')
        ? 'DMG installer'
        : lower.endsWith('.deb')
          ? 'DEB package'
          : lower.endsWith('.rpm')
            ? 'RPM package'
            : lower.endsWith('.appimage')
              ? 'AppImage'
              : 'Desktop archive'

    return {
      os,
      format,
      tag: tagLabel,
      emoji: '↓',
      url: `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(format)}`,
      recommended: lower.endsWith('.exe') && !arm,
    }
  })

  return { version: tag, downloads }
}

function main() {
  const manifest = createReleaseManifest({
    tag: process.env.RELEASE_TAG ?? '',
    repository: process.env.GITHUB_REPOSITORY ?? '',
    assets: JSON.parse(process.env.RELEASE_ASSETS ?? '[]'),
  })
  writeFileSync('apps/web/public/release.json', `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Wrote ${manifest.version} manifest with ${manifest.downloads.length} installer(s).`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
