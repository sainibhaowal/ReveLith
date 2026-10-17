import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareReleaseAssets } from './prepare-release-assets.mjs'

async function fixture() {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'revelith-release-assets-'))
  const source = join(temporaryDirectory, 'artifacts')
  const destination = join(temporaryDirectory, 'prepared')
  return { source, destination, temporaryDirectory }
}

async function asset(root, artifact, folder, name, content) {
  const directory = join(root, artifact, folder)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, name), content)
}

test('release asset collection', async (t) => {
  await t.test('keeps architecture feeds separate and excludes nested/debug files', async () => {
    const { source, destination, temporaryDirectory } = await fixture()
    try {
      await asset(source, 'desktop-win-x64', 'release', 'latest.yml', 'x64 feed')
      await asset(source, 'desktop-win-x64', 'release', 'ReveLith Setup.exe', 'x64 installer')
      await asset(source, 'desktop-win-arm64', 'release-arm64', 'latest.yml', 'arm feed')
      await asset(
        source,
        'desktop-win-arm64',
        'release-arm64',
        'ReveLith Setup-arm64.exe',
        'arm installer',
      )
      await asset(source, 'desktop-win-x64', 'win-unpacked', 'app-update.yml', 'internal file')
      await asset(source, 'desktop-win-x64', 'release', 'builder-debug.yml', 'debug metadata')

      const names = await prepareReleaseAssets(source, destination)
      assert.deepEqual(names, [
        'ReveLith Setup-arm64.exe',
        'ReveLith Setup.exe',
        'latest-arm64.yml',
        'latest.yml',
      ])
      assert.equal(await readFile(join(destination, 'latest-arm64.yml'), 'utf8'), 'arm feed')
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })

  await t.test('keeps Linux ARM64 AppImage and its update feed distinct from x64', async () => {
    const { source, destination, temporaryDirectory } = await fixture()
    try {
      await asset(source, 'desktop-linux-x64', 'release', 'latest-linux.yml', 'x64')
      await asset(
        source,
        'desktop-linux-arm64',
        'release',
        'latest-linux.yml',
        'path: ReveLith-0.10.101.AppImage\nfiles:\n  - url: ReveLith-0.10.101.AppImage\n',
      )
      await asset(
        source,
        'desktop-linux-x64',
        'release',
        'ReveLith-0.10.101.AppImage',
        'x64 installer',
      )
      await asset(
        source,
        'desktop-linux-arm64',
        'release',
        'ReveLith-0.10.101.AppImage',
        'arm installer',
      )
      await asset(
        source,
        'desktop-linux-arm64',
        'release',
        'ReveLith-0.10.101.AppImage.blockmap',
        'arm blockmap',
      )

      const names = await prepareReleaseAssets(source, destination)
      assert.deepEqual(names, [
        'ReveLith-0.10.101-arm64.AppImage',
        'ReveLith-0.10.101-arm64.AppImage.blockmap',
        'ReveLith-0.10.101.AppImage',
        'latest-linux-arm64.yml',
        'latest-linux.yml',
      ])
      assert.match(
        await readFile(join(destination, 'latest-linux-arm64.yml'), 'utf8'),
        /ReveLith-0\.10\.101-arm64\.AppImage/,
      )
      assert.equal(
        await readFile(join(destination, 'ReveLith-0.10.101-arm64.AppImage'), 'utf8'),
        'arm installer',
      )
      assert.equal(
        await readFile(join(destination, 'ReveLith-0.10.101.AppImage'), 'utf8'),
        'x64 installer',
      )
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })

  await t.test('publishes architecture-specific RPMs without a basename collision', async () => {
    const { source, destination, temporaryDirectory } = await fixture()
    try {
      await asset(source, 'desktop-linux-x64', 'release', 'revelith-0.11.0.x86_64.rpm', 'x64 rpm')
      await asset(
        source,
        'desktop-linux-arm64',
        'release',
        'revelith-0.11.0.aarch64.rpm',
        'arm64 rpm',
      )

      const names = await prepareReleaseAssets(source, destination)
      assert.deepEqual(names, ['revelith-0.11.0.aarch64.rpm', 'revelith-0.11.0.x86_64.rpm'])
      assert.equal(
        await readFile(join(destination, 'revelith-0.11.0.x86_64.rpm'), 'utf8'),
        'x64 rpm',
      )
      assert.equal(
        await readFile(join(destination, 'revelith-0.11.0.aarch64.rpm'), 'utf8'),
        'arm64 rpm',
      )
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })

  await t.test('requires at least one installer', async () => {
    const { source, destination, temporaryDirectory } = await fixture()
    try {
      await asset(source, 'desktop-win-x64', 'release', 'latest.yml', 'metadata')
      await assert.rejects(prepareReleaseAssets(source, destination), /No desktop installer/)
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  })
})
