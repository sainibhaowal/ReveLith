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

declare const __RELEASE_MANIFEST__: ReleaseManifest

/** Generated from public/release.json by Vite for this exact website build. */
export const BUILD_RELEASE: ReleaseManifest = __RELEASE_MANIFEST__

export async function getReleaseManifest(): Promise<ReleaseManifest> {
  const response = await fetch(`/release.json?cache=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Release manifest is unavailable')
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object') throw new Error('Invalid release manifest')
  const manifest = value as Partial<ReleaseManifest>
  if (typeof manifest.version !== 'string' || !Array.isArray(manifest.downloads))
    throw new Error('Invalid release manifest')
  if (manifest.version !== BUILD_RELEASE.version)
    throw new Error('Release manifest does not match this website build')
  return {
    version: manifest.version,
    downloads: manifest.downloads.filter((item): item is ReleaseDownload =>
      Boolean(item && typeof item.url === 'string' && typeof item.os === 'string'),
    ),
  }
}
