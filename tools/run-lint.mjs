import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ESLINT = join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js')
const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx'])
const BATCH_SIZE = 200
const MAX_BATCH_ARGUMENT_CHARS = 18_000

const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: ROOT,
  encoding: 'utf8',
})

if (listed.error) {
  console.error(`Unable to enumerate repository files for lint: ${listed.error.message}`)
  process.exit(1)
}
if (listed.status !== 0) process.exit(listed.status ?? 1)

const files = listed.stdout
  .split('\0')
  .filter((file) => file && SOURCE_EXTENSIONS.has(file.slice(file.lastIndexOf('.'))))
  .sort()

if (files.length === 0) {
  console.log('No JavaScript or TypeScript files to lint.')
  process.exit(0)
}

const batches = []
let batch = []
let batchChars = 0
for (const file of files) {
  if (
    batch.length > 0 &&
    (batch.length >= BATCH_SIZE || batchChars + file.length + 1 > MAX_BATCH_ARGUMENT_CHARS)
  ) {
    batches.push(batch)
    batch = []
    batchChars = 0
  }
  batch.push(file)
  batchChars += file.length + 1
}
if (batch.length > 0) batches.push(batch)

console.log(
  `Linting ${files.length} JavaScript/TypeScript files in ${batches.length} isolated batches.`,
)

let failed = false
for (const [index, batch] of batches.entries()) {
  console.log(`ESLint batch ${index + 1}/${batches.length} (${batch.length} files)`)
  const result = spawnSync(process.execPath, [ESLINT, '--no-warn-ignored', '--', ...batch], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
  })

  if (result.error) {
    console.error(`Unable to run ESLint: ${result.error.message}`)
    failed = true
  } else if (result.signal) {
    process.exit(1)
  } else if ((result.status ?? 1) !== 0) {
    failed = true
  }
}

process.exit(failed ? 1 : 0)
