/** Search result types and shared constants. */

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface ImageSearchResult {
  title: string
  imageUrl: string
  sourceUrl: string
  source: string
  width?: number
  height?: number
}

// Known stock-photo hosts skipped during image search (matches the upstream filter list)
export const COPYRIGHT_HOSTS = ['gettyimages', 'istockphoto', 'shutterstock', 'corbis']

const SECOND_LEVEL_SUFFIXES = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu'])

function registrableLabel(labels: string[]): string | undefined {
  if (labels.length < 2) return undefined
  const tld = labels[labels.length - 1]!
  const second = labels[labels.length - 2]!
  if (labels.length >= 3 && tld.length === 2 && SECOND_LEVEL_SUFFIXES.has(second))
    return labels[labels.length - 3]
  return second
}

export function isCopyrightHost(imageUrl: string): boolean {
  const host = safeHost(imageUrl).toLowerCase()
  if (!host) return false
  const labels = host.split('.')
  return COPYRIGHT_HOSTS.some((entry) => {
    const d = entry.toLowerCase()
    if (host === d || host.endsWith('.' + d)) return true
    return registrableLabel(labels) === d
  })
}

export function safeHost(url: unknown): string {
  try {
    return new URL(String(url)).hostname
  } catch {
    return ''
  }
}

/**
 * View untrusted JSON as a string-keyed record so properties can be probed
 * without `any`; non-object inputs read as an empty record.
 */
export function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

/** First element when the value is an array, otherwise undefined (loose JSON probing). */
export function firstItem(v: unknown): unknown {
  return Array.isArray(v) ? (v as unknown[])[0] : undefined
}

let explicitProxyUrl = ''

export function setGskProxyUrl(url: string): void {
  explicitProxyUrl = url
}

export function gskProxyUrl(): string {
  return explicitProxyUrl
}
