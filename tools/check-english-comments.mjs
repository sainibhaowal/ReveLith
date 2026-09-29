#!/usr/bin/env node
/**
 * Repository-wide English-only guard.
 *
 * Comments and documentation prose are read by contributors and by the
 * reviewing agent, so a stray Chinese sentence in a comment is a defect even
 * when the surrounding code is correct. This fails on any CJK character in a
 * tracked code comment or doc file.
 *
 * Deliberately NOT flagged, because these are runtime data rather than prose:
 *   - i18n dictionaries (the translated strings themselves)
 *   - the AI prompt guides, which legitimately contain CJK examples
 *   - translated READMEs under an i18n directory
 *   - the language-switcher label that names those translations
 *
 * Usage: node tools/check-english-comments.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

/** CJK Unified Ideographs: the range a Chinese sentence lands in. */
const HAN = /[㐀-鿿]/

/** Directories whose CJK content is data, not prose. */
const DATA_PATHS = [/\/ai\/prompts\//, /\/i18n\//]

function git(commandArgs) {
  const result = spawnSync('git', commandArgs, { encoding: 'utf8' })
  if (result.status !== 0) {
    console.error(result.stderr)
    process.exit(result.status ?? 1)
  }
  return result
}

const root = git(['rev-parse', '--show-toplevel']).stdout.trim()
const tracked = git(['ls-files']).stdout.trim().split('\n').filter(Boolean)

/**
 * The comment text of one line, or undefined when the line is not a comment.
 * Bracket matching is deliberate: a `//` inside a string literal is code, and
 * a `#` inside a shell word is not a comment.
 */
function commentText(line, kind) {
  if (kind === 'doc') return line
  if (kind === 'hash') return line.match(/(?:^|[^'"])#(.*)$/)?.[1]
  return (
    line.match(/(?:^|[^:'"])\/\/(.*)$/)?.[1] ??
    line.match(/^\s*\*(.*)$/)?.[1] ??
    line.match(/\/\*(.*)$/)?.[1]
  )
}

const violations = []
for (const file of tracked) {
  const isCode = /\.(ts|tsx|mjs|cjs|js|rs)$/.test(file)
  const isHashCode = /\.(py|sh)$/.test(file)
  const isDoc = /\.(md|html?)$/.test(file) && !DATA_PATHS.some((re) => re.test(file))
  if (!isCode && !isHashCode && !isDoc) continue
  const kind = isDoc ? 'doc' : isHashCode ? 'hash' : 'slash'
  const lines = readFileSync(join(root, file), 'utf8').split('\n')
  lines.forEach((line, index) => {
    if (line.includes('lang-switcher')) return
    const text = commentText(line, kind)
    if (text !== undefined && HAN.test(text)) {
      violations.push(`  ${file}:${index + 1}: ${line.trim()}`)
    }
  })
}

if (violations.length > 0) {
  console.error(
    `Chinese text in code comments or docs (${violations.length}):\n${violations.join('\n')}\n` +
      'Comments and documentation must be English-only. Move the CJK text into a ' +
      'string literal (i18n resource, prompt file) or rewrite the comment in English.',
  )
  process.exit(1)
}
console.log('check-english-comments: OK')
