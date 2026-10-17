const { existsSync, readdirSync, statSync } = require('fs')
const { execSync } = require('child_process')
const { join, resolve } = require('path')

const crate = join(__dirname, '../native/xlsx-engine')
const targetDir = process.env.CARGO_TARGET_DIR
  ? resolve(process.env.CARGO_TARGET_DIR)
  : join(crate, 'target')
const executable = process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar'
const sidecar = join(targetDir, 'release', executable)

function rustInputs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'target' ? [] : rustInputs(path)
    return /\.(rs|toml)$/.test(entry.name) ? [path] : []
  })
}

const inputs = [
  ...rustInputs(crate),
  join(crate, 'Cargo.lock'),
].filter(existsSync)
const needsBuild =
  !existsSync(sidecar) || inputs.some((input) => statSync(input).mtimeMs > statSync(sidecar).mtimeMs)

if (!needsBuild) {
  console.log('Prebuilt xlsx-sidecar.exe found. Skipping cargo build.')
  process.exit(0)
}

console.log(`${existsSync(sidecar) ? 'Native sources changed; rebuilding' : 'Building'} xlsx-sidecar via cargo...`)
execSync(
  'cargo build --release --manifest-path native/xlsx-engine/Cargo.toml --config native/xlsx-engine/.cargo/config.toml',
  { stdio: 'inherit' },
)
