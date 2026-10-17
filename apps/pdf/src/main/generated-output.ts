import { existsSync } from 'node:fs'
import { join, posix } from 'node:path'

/** Pick a safe, unused PDF path inside the configured ReveLith save directory. */
export function uniqueGeneratedPdfPath(
  dir: string,
  suggestedName: string,
  pathExists: (path: string) => boolean = existsSync,
): string {
  // Control characters are intentionally rejected from generated file names.
  // eslint-disable-next-line no-control-regex
  const invalidFileNameCharacters = /[/\\:*?"<>|\u0000-\u001f]/g
  // Parse both slash styles consistently, then sanitize. Windows basename()
  // treats colons in otherwise ordinary suggestions as drive/stream syntax.
  let fileName = posix
    .basename(String(suggestedName || 'merged.pdf').replace(/\\/g, '/'))
    .replace(invalidFileNameCharacters, '_')
    .trim()
  if (!fileName || fileName === '.' || fileName === '..') fileName = 'merged.pdf'
  if (!/\.pdf$/i.test(fileName)) fileName += '.pdf'

  const stem = fileName.slice(0, -4)
  let candidate = join(dir, fileName)
  for (let i = 2; pathExists(candidate); i++) candidate = join(dir, `${stem}-${i}.pdf`)
  return candidate
}
