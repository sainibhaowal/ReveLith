import { writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { launcherPath } from '../src/commands/install'

it('shows launcher path', () => {
  const path = launcherPath()
  writeFileSync('C:/Users/Ravin/AppData/Local/Temp/launcher-path.txt', path || 'NULL')
  expect(path).toBeTruthy()
})