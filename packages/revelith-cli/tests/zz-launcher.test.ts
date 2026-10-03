import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { launcherPath } from '../src/commands/install'

it('shows launcher path', () => {
  const path = launcherPath()
  writeFileSync(join(tmpdir(), 'launcher-path.txt'), path || 'NULL')
  expect(path).toBeTruthy()
})
