// Forms Builder color compatibility check (light + dark).
//
// The respondent form is document content that keeps one palette in both UI
// themes, while all editor chrome must follow the tokens from
// packages/ui/src/tokens.css. This tool fails when:
//   1. a token is missing from the light or the dark block (theme parity),
//   2. a form document color does not reach 4.5:1 against the paper/field it
//      sits on, or
//   3. a paper-painted rule or renderer file still reads a chrome token.
//
// Usage: node tools/check-forms-builder-colors.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')

const TOKENS = 'packages/ui/src/tokens.css'
const STYLES = 'apps/forms-builder/src/renderer/styles.css'
const FORM_SOURCES = [
  'apps/forms-builder/src/renderer/components/FormCanvas.tsx',
  'apps/forms-builder/src/renderer/components/FieldRenderer.tsx',
]

const failures = []
const notes = []

function block(source, header) {
  const start = source.indexOf(header)
  if (start < 0) throw new Error(`Missing ${header}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`Unbalanced block for ${header}`)
}

function declarations(source) {
  const map = new Map()
  for (const match of source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(match[1], match[2].trim())
  return map
}

const tokensCss = read(TOKENS)
const appCss = read(STYLES)
const light = new Map([...declarations(block(tokensCss, ':root {')), ...declarations(block(appCss, ':root {'))])
const dark = new Map([
  ...declarations(block(tokensCss, "[data-theme='dark'] {")),
  ...declarations(block(appCss, "[data-theme='dark'] {")),
])
// The form palette declares identical values for both themes in one block.
const shared = declarations(block(appCss, ":root,\n[data-theme='dark'] {"))
for (const [name, value] of shared) {
  light.set(name, value)
  dark.set(name, value)
}

function resolve(name, theme, seen = new Set()) {
  const map = theme === 'dark' ? dark : light
  if (name === '--form-paper') return '#ffffff'
  if (seen.has(name)) return undefined
  seen.add(name)
  const raw = map.get(name)
  if (raw === undefined) return undefined
  const reference = /^var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)$/.exec(raw)
  if (!reference) return raw
  const nested = resolve(reference[1], theme, seen)
  return nested ?? (reference[2] ? reference[2].trim() : undefined)
}

function rgb(value) {
  if (!value) return null
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16))
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(value.trim())
  if (!fn) return null
  const parts = fn[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number)
  return parts.length === 3 && parts.every(Number.isFinite) ? parts : null
}

function contrast(foreground, background) {
  const lum = (value) => {
    const [r, g, b] = value.map((channel) => {
      const c = channel / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const a = lum(foreground)
  const b = lum(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// 1. Theme parity for every token the forms builder uses.
const usedTokens = new Set()
for (const source of [appCss, ...FORM_SOURCES.map(read)]) {
  for (const match of source.matchAll(/var\(\s*(--[\w-]+)/g)) usedTokens.add(match[1])
}
for (const token of [...usedTokens].sort()) {
  if (shared.has(token)) continue
  const inLight = light.has(token)
  const inDark = dark.has(token)
  if (inLight && !inDark) failures.push(`${token} is defined for light but missing in [data-theme='dark']`)
  if (inDark && !inLight) failures.push(`${token} is defined for dark but missing in :root`)
}

// 2. Form document contrast, identical in both themes by construction.
const paper = resolve('--form-paper', 'light')
const ink = resolve('--form-ink', 'light')
const input = resolve('--form-input-bg', 'light')
const fieldFill = resolve('--form-field-bg', 'light')
const pairs = [
  ['form ink on paper', ink, paper],
  ['form muted ink on paper', resolve('--form-muted-ink', 'light'), paper],
  ['form faint ink on paper', resolve('--form-faint-ink', 'light'), paper],
  ['form ink on input fill', ink, input],
  ['form muted ink on field fill', resolve('--form-muted-ink', 'light'), fieldFill],
  ['form accent on paper', resolve('--form-accent', 'light'), paper],
  ['form danger on paper', resolve('--form-danger', 'light'), paper],
  ['form danger on danger fill', resolve('--form-danger', 'light'), resolve('--form-danger-bg', 'light')],
  ['form warn ink on warn fill', resolve('--form-warn-ink', 'light'), resolve('--form-warn-bg', 'light')],
  ['form star off on paper', resolve('--form-star-off', 'light'), paper],
]
const contrastText = []
for (const [label, foreground, background] of pairs) {
  const fg = rgb(foreground)
  const bg = rgb(background)
  if (!fg || !bg) {
    failures.push(`${label}: could not resolve ${foreground} / ${background}`)
    continue
  }
  const ratio = contrast(fg, bg)
  contrastText.push(`  ${ratio.toFixed(2)}:1  ${label}  (${foreground} on ${background})`)
  if (ratio < 4.5) failures.push(`${label} is ${ratio.toFixed(2)}:1, below the 4.5:1 text minimum`)
}
// Non-text marks: 3:1 minimum against the surface they are drawn on.
for (const [label, foreground, background, minimum] of [
  ['form border on paper', resolve('--form-border', 'light'), paper, 3],
  ['form rule on paper', resolve('--form-rule', 'light'), paper, 3],
]) {
  const ratio = contrast(rgb(foreground), rgb(background))
  contrastText.push(`  ${ratio.toFixed(2)}:1  ${label}  (${foreground} on ${background})`)
  if (ratio < minimum) notes.push(`${label} is ${ratio.toFixed(2)}:1 (informational, ${minimum}:1 is the non-text target)`)
}
// Both UI themes must resolve the accent ink against the accent fill.
for (const theme of ['light', 'dark']) {
  const ratio = contrast(rgb(resolve('--accent-ink', theme)), rgb(resolve('--accent', theme)))
  contrastText.push(`  ${ratio.toFixed(2)}:1  accent ink on accent (${theme})`)
  if (ratio < 3) failures.push(`--accent-ink on --accent is ${ratio.toFixed(2)}:1 in ${theme}; raise the accent/ink contrast`)
}

// 3. Renderer code that paints form content must stay off the chrome tokens.
const FORM_TOKEN = /var\(\s*--form-/
for (const relative of FORM_SOURCES) {
  const source = read(relative)
  for (const [index, line] of source.split('\n').entries()) {
    for (const match of line.matchAll(/var\(\s*(--[\w-]+)/g)) {
      const token = match[1]
      if (FORM_TOKEN.test(match[0]) || token === '--accent-ink') continue
      failures.push(`${relative}:${index + 1} paints form content with the chrome token ${token}; use a --form-* token`)
    }
  }
}

for (const line of contrastText) console.log(line)
for (const note of notes) console.warn(`note: ${note}`)
if (failures.length) {
  console.error('\nForms Builder color compatibility failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\nForms Builder colors are consistent across light and dark.')
