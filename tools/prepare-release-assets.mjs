import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const allowedExtensions = new Set([
  '.exe',
  '.deb',
  '.appimage',
  '.rpm',
  '.dmg',
  '.zip',
  '.yml',
  '.blockmap',
])
const installerExtensions = new Set(['.exe', '.deb', '.appimage', '.rpm', '.dmg', '.zip'])

async function collectFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectFiles(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

export async function prepareReleaseAssets(sourceDirectory, destinationDirectory) {
  const source = resolve(sourceDirectory)
  const destination = resolve(destinationDirectory)
  await mkdir(destination, { recursive: true })
  const files = await collectFiles(source)
  const outputNames = new Set()

  for (const path of files.sort()) {
    const name = path.split(/[\\/]/).at(-1)
    const extension = extname(name).toLowerCase()
    if (!allowedExtensions.has(extension) || name.toLowerCase() === 'builder-debug.yml') continue
    if (!['release', 'release-arm64'].includes(path.split(/[\\/]/).at(-2))) continue

    const artifact = path.match(/[\\/]desktop-[^\\/]+[\\/]/)?.[0] ?? ''
    const isArm64Artifact = artifact.endsWith('arm64/') || artifact.endsWith('arm64\\')
    let outputName = name
    if (isArm64Artifact && name === 'latest.yml') outputName = 'latest-arm64.yml'
    if (isArm64Artifact && name === 'latest-linux.yml') outputName = 'latest-linux-arm64.yml'

    const outputPath = join(destination, outputName)
    if (outputNames.has(outputName)) {
      const existing = await readFile(outputPath)
      const incoming = await readFile(path)
      if (existing.equals(incoming)) continue
      throw new Error(`Conflicting release asset basename: ${outputName}`)
    }
    await copyFile(path, outputPath)
    outputNames.add(outputName)
  }

  const installerCount = [...outputNames].filter((name) =>
    installerExtensions.has(extname(name).toLowerCase()),
  ).length
  if (!installerCount)
    throw new Error('No desktop installer assets were found in the build artifacts.')
  return [...outputNames].sort()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const names = await prepareReleaseAssets(
      process.argv[2] ?? 'release-artifacts',
      process.argv[3] ?? 'release-assets',
    )
    console.log(`Prepared ${names.length} unique release assets.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
