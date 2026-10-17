import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pattern = /^v0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function selectLatestZeroTag(releases) {
  const stable = releases
    .filter((release) => !release.isDraft && !release.isPrerelease && pattern.test(release.tagName))
    .sort((left, right) => {
      const a = left.tagName.match(pattern)
      const b = right.tagName.match(pattern)
      return Number(b[1]) - Number(a[1]) || Number(b[2]) - Number(a[2])
    })
  if (!stable.length) throw new Error('No stable v0.x.x release is available to deploy.')
  return stable[0].tagName
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    console.log(selectLatestZeroTag(JSON.parse(process.env.RELEASES_JSON ?? '[]')))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
