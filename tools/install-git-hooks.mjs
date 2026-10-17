import { spawnSync } from 'node:child_process'

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8', windowsHide: true })
}

const root = git(['rev-parse', '--show-toplevel'])
if (root.status !== 0) process.exit(0)

const configured = git(['config', '--local', '--get', 'core.hooksPath'])
const current = configured.status === 0 ? configured.stdout.trim() : ''
if (current === '.githooks') process.exit(0)

if (current) {
  console.warn(
    `Preserving existing core.hooksPath=${current}; configure it to .githooks to enable ReveLith's pre-commit gate.`,
  )
  process.exit(0)
}

const installed = git(['config', '--local', 'core.hooksPath', '.githooks'])
if (installed.status !== 0) {
  console.error(installed.stderr || 'Unable to configure the repository Git hooks path.')
  process.exit(installed.status ?? 1)
}
console.log('ReveLith Git hooks enabled (.githooks).')
