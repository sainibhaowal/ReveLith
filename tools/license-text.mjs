/**
 * License-text resolution for a single installed npm package.
 *
 * Kept separate from the allowlist check so the third-party notices generator
 * can reuse the same "which file is this package's license" logic. Packages are
 * inconsistent here: most ship LICENSE, some LICENCE or COPYING, some nest the
 * text, and Electron ships dist/LICENSE specifically.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Packages whose license does not live in a conventionally named root file. */
const LICENSE_PATH = { electron: 'dist/LICENSE' }

const LICENSE_FILE = /^(LICENSE|LICENCE|COPYING)(\.|$)/i

/**
 * The package's license text, or null when it publishes none.
 * Several license files are concatenated (a bundled dual license, or a
 * LICENSE plus a per-directory NOTICE), because dropping either half would
 * misrepresent the terms.
 */
export function licenseText(name, dir) {
  const override = LICENSE_PATH[name]
  if (override && existsSync(join(dir, override))) {
    return readFileSync(join(dir, override), 'utf8').trim()
  }
  const texts = readdirSync(dir)
    .filter((file) => LICENSE_FILE.test(file))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => readFileSync(join(dir, file), 'utf8').trim())
    .filter(Boolean)
  const unique = [...new Set(texts)]
  return unique.length > 0 ? unique.join('\n\n') : null
}
