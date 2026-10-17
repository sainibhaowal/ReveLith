import test from 'node:test'
import assert from 'node:assert/strict'
import { createReleaseManifest } from './create-release-manifest.mjs'

test('website release manifest', async (t) => {
  await t.test('shows only installable assets and builds exact, versioned download URLs', () => {
    const manifest = createReleaseManifest({
      tag: 'v0.10.101',
      repository: 'sainibhaowal/ReveLith',
      assets: [
        'ReveLith Setup 0.10.101.exe',
        'ReveLith Setup 0.10.101-arm64.exe',
        'latest.yml',
        'ReveLith Setup 0.10.101.exe.blockmap',
      ],
    })

    assert.equal(manifest.version, 'v0.10.101')
    assert.equal(manifest.downloads.length, 2)
    assert.equal(manifest.downloads[0].format, 'ReveLith Setup 0.10.101-arm64.exe')
    assert.equal(manifest.downloads[0].os, 'Windows 11 (ARM64)')
    assert.equal(manifest.downloads[0].recommended, false)
    assert.equal(
      manifest.downloads[0].url,
      'https://github.com/sainibhaowal/ReveLith/releases/download/v0.10.101/ReveLith%20Setup%200.10.101-arm64.exe',
    )
  })

  await t.test('rejects major releases and a release without installer files', () => {
    assert.throws(
      () => createReleaseManifest({ tag: 'v1.0.0', repository: 'owner/repo', assets: ['app.exe'] }),
      /only support stable 0\.x releases/,
    )
    assert.throws(
      () =>
        createReleaseManifest({
          tag: 'v0.10.101',
          repository: 'owner/repo',
          assets: ['latest.yml'],
        }),
      /has no installer assets/,
    )
  })
})
