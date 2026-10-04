import { expect, it } from 'vitest'
import { launcherPath } from '../src/commands/install'

it('shows launcher path', () => {
  expect(launcherPath()).toBeTruthy()
})
