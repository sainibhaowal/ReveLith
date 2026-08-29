export interface ReleaseDownload {
  os: string
  format: string
  tag: string
  emoji: string
  url: string
  recommended?: boolean
}

export interface ReleaseManifest {
  version: string
  downloads: ReleaseDownload[]
}

export const FALLBACK_RELEASE: ReleaseManifest = {
  version: 'v1.2.4',
  downloads: [
    { os: 'Windows 10 / 11', format: 'ReveLith.Setup.1.2.4.exe', tag: 'Installer', emoji: '↓', url: 'https://github.com/sainibhaowal/ReveLith/releases/download/v1.2.4/ReveLith.Setup.1.2.4.exe', recommended: true },
    { os: 'macOS Apple Silicon', format: 'ReveLith-1.2.4-arm64.dmg', tag: 'DMG installer', emoji: '⌘', url: 'https://github.com/sainibhaowal/ReveLith/releases/download/v1.2.4/ReveLith-1.2.4-arm64.dmg' },
    { os: 'Linux', format: 'ReveLith-1.2.4.AppImage', tag: 'AppImage', emoji: '◒', url: 'https://github.com/sainibhaowal/ReveLith/releases/download/v1.2.4/ReveLith-1.2.4.AppImage' },
    { os: 'Debian / Ubuntu', format: 'ReveLith_1.2.4_amd64.deb', tag: 'DEB package', emoji: '◒', url: 'https://github.com/sainibhaowal/ReveLith/releases/download/v1.2.4/ReveLith_1.2.4_amd64.deb' },
    { os: 'Fedora / RPM Linux', format: 'ReveLith-1.2.4.x86_64.rpm', tag: 'RPM package', emoji: '◒', url: 'https://github.com/sainibhaowal/ReveLith/releases/download/v1.2.4/ReveLith-1.2.4.x86_64.rpm' },
  ],
}

export async function getReleaseManifest(): Promise<ReleaseManifest> {
  const response = await fetch(`/release.json?cache=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Release manifest is unavailable')
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object') throw new Error('Invalid release manifest')
  const manifest = value as Partial<ReleaseManifest>
  if (typeof manifest.version !== 'string' || !Array.isArray(manifest.downloads)) throw new Error('Invalid release manifest')
  return { version: manifest.version, downloads: manifest.downloads.filter((item): item is ReleaseDownload => Boolean(item && typeof item.url === 'string' && typeof item.os === 'string')) }
}
