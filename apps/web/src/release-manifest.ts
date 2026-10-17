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

/**
 * Used only when /release.json cannot be fetched. The deploy workflow always
 * regenerates release.json from the latest GitHub release, so this must mirror
 * that release exactly — correct tag, correct asset filenames, correct casing.
 *
 * Casing is genuinely inconsistent upstream: the AppImage is `ReveLith-*` while
 * the deb and rpm are lowercase `revelith*`. Copy names verbatim from the
 * release assets or the links 404.
 *
 * Deliberately lists only assets that exist. A platform with no published build
 * is absent rather than pointing at a file that was never uploaded.
 */
export const FALLBACK_RELEASE: ReleaseManifest = {
  version: 'v0.9.6',
  downloads: [
    { os: 'Linux', format: 'ReveLith-0.9.6.AppImage', tag: 'AppImage', emoji: '↓', url: 'https://github.com/sainibhaowal/ReveLith/releases/download/v0.9.6/ReveLith-0.9.6.AppImage', recommended: true },
    { os: 'Debian / Ubuntu', format: 'revelith_0.9.6_amd64.deb', tag: 'DEB package', emoji: '◒', url: 'https://github.com/sainibhaowal/ReveLith/releases/download/v0.9.6/revelith_0.9.6_amd64.deb' },
    { os: 'Fedora / RPM Linux', format: 'revelith-0.9.6.x86_64.rpm', tag: 'RPM package', emoji: '◒', url: 'https://github.com/sainibhaowal/ReveLith/releases/download/v0.9.6/revelith-0.9.6.x86_64.rpm' },
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
