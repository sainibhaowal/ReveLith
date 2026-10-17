import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
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
  const linuxArmAppImages = new Map()

  // electron-builder's Linux AppImage artifact name omits the architecture.
  // The x64 and ARM64 runners therefore produce different files with the same
  // basename. Give the ARM build an explicit suffix and keep its updater feed
  // and blockmap pointing at the renamed AppImage.
  for (const path of files) {
    const normalizedPath = path.replaceAll('\\', '/')
    const name = normalizedPath.split('/').at(-1)
    if (!normalizedPath.includes('/desktop-linux-arm64/') || !name.endsWith('.AppImage')) continue
    if (!/(?:-|\.)arm64\.AppImage$/i.test(name)) {
      linuxArmAppImages.set(name, name.replace(/\.AppImage$/i, '-arm64.AppImage'))
    }
  }

  for (const path of files.sort()) {
    const normalizedPath = path.replaceAll('\\', '/')
    const originalName = normalizedPath.split('/').at(-1)
    const isLinuxArmArtifact = normalizedPath.includes('/desktop-linux-arm64/')
    const name = isLinuxArmArtifact
      ? [...linuxArmAppImages].reduce((result, [from, to]) => {
          if (result === from || result.startsWith(`${from}.blockmap`)) {
            return result.replace(from, to)
          }
          return result
        }, originalName)
      : originalName
    const extension = extname(name).toLowerCase()
    if (!allowedExtensions.has(extension) || name.toLowerCase() === 'builder-debug.yml') continue
    if (!['release', 'release-arm64'].includes(normalizedPath.split('/').at(-2))) continue

    const artifact = normalizedPath.match(/(?:^|\/)(desktop-[^/]+)\//)?.[1] ?? ''
    const isArm64Artifact = artifact.endsWith('arm64')
    let outputName = name
    if (isArm64Artifact && name === 'latest.yml') outputName = 'latest-arm64.yml'
    if (isArm64Artifact && name === 'latest-linux.yml') outputName = 'latest-linux-arm64.yml'

    const outputPath = join(destination, outputName)
    const rewriteArmFeed = artifact === 'desktop-linux-arm64' && /\.ya?ml$/i.test(outputName)
    if (outputNames.has(outputName)) {
      const existing = await readFile(outputPath)
      const incoming = await readFile(path)
      if (existing.equals(incoming)) continue
      throw new Error(`Conflicting release asset basename: ${outputName}`)
    }
    if (rewriteArmFeed && linuxArmAppImages.size) {
      let contents = await readFile(path, 'utf8')
      for (const [from, to] of linuxArmAppImages) contents = contents.replaceAll(from, to)
      await writeFile(outputPath, contents)
    } else {
      await copyFile(path, outputPath)
    }
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
