import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAFE_VERSION = /^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function parseVersion(value) {
  const match = SAFE_VERSION.exec(value)
  if (!match) return null
  return { text: value, minor: Number(match[1]), patch: Number(match[2]) }
}

function compareVersions(left, right) {
  return left.minor - right.minor || left.patch - right.patch
}

export function resolveReleaseVersion({
  forceVersion = '',
  releaseType = 'patch',
  packageVersion,
  tags = [],
}) {
  if (releaseType !== 'patch' && releaseType !== 'minor') {
    throw new Error(`Unsupported release type: ${releaseType}. Use patch or minor.`)
  }

  const baselineCandidates = ['0.9.6', packageVersion, ...tags.map((tag) => tag.replace(/^v/, ''))]
    .map(parseVersion)
    .filter(Boolean)
  const latest = baselineCandidates.reduce((best, candidate) =>
    !best || compareVersions(candidate, best) > 0 ? candidate : best,
  )

  if (forceVersion) {
    const forced = parseVersion(forceVersion)
    if (!forced) {
      throw new Error(`Release versions must be v0.x.x; received ${forceVersion}.`)
    }
    if (compareVersions(forced, latest) <= 0) {
      throw new Error(`Release version ${forceVersion} must be newer than v${latest.text}.`)
    }
    if (tags.includes(`v${forceVersion}`)) {
      throw new Error(`Git tag v${forceVersion} already exists.`)
    }
    return forced.text
  }

  const next =
    releaseType === 'minor'
      ? { minor: latest.minor + 1, patch: 0 }
      : { minor: latest.minor, patch: latest.patch + 1 }
  return `0.${next.minor}.${next.patch}`
}

function main() {
  const packageVersion = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ).version
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
  const version = resolveReleaseVersion({
    forceVersion: process.env.FORCE_VERSION?.trim() ?? '',
    releaseType: process.env.RELEASE_TYPE ?? 'patch',
    packageVersion,
    tags,
  })
  console.log(version)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
