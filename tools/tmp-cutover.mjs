import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Cut the edit contract over to the package.
 *
 * The four schemas are removed from the IPC module and imported from
 * @revelith/xlsx-gateway instead, so the contract has exactly one definition.
 * Their five in-module uses keep working unchanged because the import brings
 * the same names into scope — and they get the wider package versions, which is
 * the point.
 *
 * The 4 inferred types are re-exported rather than re-inferred, so the 27
 * consumers of this module see the package's types, not a second inference of
 * the same name.
 */
const file = 'apps/sheets/src/shared/desktop-api.ts'
let s = readFileSync(file, 'utf8')
const before = s

/** Remove a `const NAME = ...` definition by balancing to its statement end. */
function removeDefinition(text, name) {
  const re = new RegExp(`^(?:export )?const ${name}\\s*=`, 'm')
  const m = re.exec(text)
  if (!m) throw new Error(`${name} not found`)
  const start = m.index
  // include the leading `export ` if present
  const lineStart = text.lastIndexOf('\n', start) + 1
  let i = text.indexOf('=', start) + 1
  let depth = 0
  let inStr = null
  for (; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === inStr) inStr = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c
      continue
    }
    if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') {
      depth--
      if (depth === 0) break
    }
  }
  let end = i + 1
  // a trailing `.strict()` / `.default()` / `.max()` chain
  while (end < text.length && /[.\w]/.test(text[end])) {
    if (text[end] === '(') {
      let d2 = 0
      let j = end
      for (; j < text.length; j++) {
        if (text[j] === '(') d2++
        else if (text[j] === ')') {
          d2--
          if (d2 === 0) break
        }
      }
      end = j + 1
    } else end++
  }
  // swallow the trailing newline and any blank line after it
  while (end < text.length && (text[end] === '\n' || text[end] === '\r')) end++
  return text.slice(0, lineStart) + text.slice(end)
}

const SCHEMAS = [
  'workbookStyleEditSchema',
  'workbookChartEditSchema',
  'workbookVisualEditSchema',
  'richRunSchema',
]
for (const name of SCHEMAS) {
  const size = s.length
  s = removeDefinition(s, name)
  console.log(`  removed ${name} (${size - s.length} chars)`)
}

// the inferred types become re-exports of the package's
for (const t of [
  'WorkbookStyleEdit',
  'WorkbookChartEdit',
  'WorkbookVisualEdit',
  'WorkbookRichRun',
]) {
  const re = new RegExp(`^export type ${t} = z\\.infer<[^>]*>[^\\n]*\\n`, 'm')
  if (!re.test(s)) throw new Error(`type alias ${t} not found`)
  s = s.replace(re, '')
}

// one import for the schemas, one re-export for the types
const anchor = "import { ADDABLE_SHAPE_TYPES } from '@revelith/xlsx-gateway/shared/shape-types'\n"
if (!s.includes(anchor)) throw new Error('shape-types anchor not found')
s = s.replace(
  anchor,
  `${anchor}import {
  richRunSchema,
  workbookChartEditSchema,
  workbookStyleEditSchema,
  workbookVisualEditSchema,
} from '@revelith/xlsx-gateway/shared/edit-schemas'
`,
)

const reexport = `\n// The edit contract is defined once, in @revelith/xlsx-gateway. Re-exported
// here because the IPC surface is what the preload and renderer import.
export type {
  WorkbookChartEdit,
  WorkbookRichRun,
  WorkbookStyleEdit,
  WorkbookVisualEdit,
} from '@revelith/xlsx-gateway/shared/edit-schemas'
`
s = s.replace(/\n\n+$/, '\n') + reexport

if (s === before) throw new Error('nothing changed')
writeFileSync(file, s)
console.log('  cutover complete')
