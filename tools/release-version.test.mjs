import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveReleaseVersion } from './release-version.mjs'
import { selectLatestZeroTag } from './select-latest-zero-tag.mjs'

test('release version policy', async (t) => {
  await t.test('bumps patch from the latest 0.x tag', () => {
    assert.equal(
      resolveReleaseVersion({
        packageVersion: '0.9.6',
        tags: ['v0.9.5', 'v0.9.6'],
      }),
      '0.9.7',
    )
  })

  await t.test('bumps minor within 0.x and resets patch', () => {
    assert.equal(
      resolveReleaseVersion({
        releaseType: 'minor',
        packageVersion: '0.9.6',
        tags: ['v0.9.6'],
      }),
      '0.10.0',
    )
  })

  await t.test('uses the newer 0.x project version but ignores existing major tags', () => {
    assert.equal(
      resolveReleaseVersion({
        packageVersion: '0.10.100',
        tags: ['v0.10.100', 'v1.0.0'],
      }),
      '0.10.101',
    )
  })

  await t.test('accepts only a newer manually selected 0.x version', () => {
    assert.equal(
      resolveReleaseVersion({
        forceVersion: '0.11.0',
        packageVersion: '0.10.100',
        tags: ['v0.10.100'],
      }),
      '0.11.0',
    )
  })

  for (const version of ['1.0.0', 'v0.11.0', '0.10', '0.10.101-beta.1']) {
    await t.test(`rejects invalid forced version ${version}`, () => {
      assert.throws(
        () =>
          resolveReleaseVersion({
            forceVersion: version,
            packageVersion: '0.10.100',
            tags: ['v0.10.100'],
          }),
        /must be v0\.x\.x/,
      )
    })
  }

  await t.test('rejects a forced version that is not newer than the current 0.x version', () => {
    assert.throws(
      () =>
        resolveReleaseVersion({
          forceVersion: '0.10.99',
          packageVersion: '0.10.100',
          tags: ['v0.10.100'],
        }),
      /must be newer/,
    )
  })

  await t.test('rejects unsupported release types', () => {
    assert.throws(
      () =>
        resolveReleaseVersion({
          releaseType: 'major',
          packageVersion: '0.10.100',
          tags: [],
        }),
      /Use patch or minor/,
    )
  })

  await t.test('selects the numerically latest stable 0.x release and ignores 1.x', () => {
    assert.equal(
      selectLatestZeroTag([
        { tagName: 'v0.9.6', isDraft: false, isPrerelease: false },
        { tagName: 'v0.10.100', isDraft: false, isPrerelease: false },
        { tagName: 'v1.0.0', isDraft: false, isPrerelease: false },
        { tagName: 'v0.11.0', isDraft: true, isPrerelease: false },
      ]),
      'v0.10.100',
    )
  })
})
