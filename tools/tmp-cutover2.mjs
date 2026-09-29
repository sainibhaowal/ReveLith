import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Cut the edit contract over to the package, by declaration boundary.
 *
 * The four schemas leave the IPC module and are imported from
 * @revelith/xlsx-gateway instead, so the contract has one definition. Their
 * five in-module uses keep working because the import brings the same names
 * into scope, and they pick up the wider package versions — which is the point.
 * The four inferred types become re-exports, so the 27 consumers of this module
 * see the package's types rather than a second inference of the same name.
 *
 * Boundaries come from the next top-level declaration, not from brace matching:
 * a schema is a single expression, and the declaration after it is an exact
 * end. Matching brackets across `.strict()` / `.refine()` chains is where a
 * textual edit silently cuts the wrong span.
 */
const file = 'apps/sheets/src/shared/desktop-api.ts'
const lines = readFileSync(file, 'utf8').split('\n')
const TOP_LEVEL = /^(?:export )?(?:const|type|function|interface|class|enum) /

const TARGETS = [
  'workbookStyleEditSchema',
  'workbookChartEditSchema',
  'workbookVisualEditSchema',
  'richRunSchema',
]

/** Lines [start, end) covering one declaration, plus a directly-preceding comment. */
function spanOf(name) {
  const start = lines.findIndex((l) => new RegExp(`^(?:export )?const ${name}\\s*=`).test(l))
  if (start === -1) throw new Error(`${name} not found`)
  let end = start + 1
  while (end < lines.length && !TOP_LEVEL.test(lines[end])) end++
  // a doc comment sitting directly above the declaration belongs to it
  let first = start
  while (first > 0 && /^\s*(?:\/\/|\/\*|\*)/.test(lines[first - 1])) first--
  return { first, end, start }
}

const spans = TARGETS.map((n) => ({ name: n, ...spanOf(n) }))
// sanity: no overlaps, and each span really contains its own declaration
spans.sort((a, b) => a.first - b.first)
for (let i = 1; i < spans.length; i++) {
  if (spans[i].first < spans[i - 1].end) {
    throw new Error(`spans overlap: ${spans[i - 1].name} / ${spans[i].name}`)
  }
}
for (const s of spans) {
  if (s.end - s.first < 3) throw new Error(`${s.name}: span too small (${s.end - s.first} lines)`)
  console.log(`  ${s.name}: lines ${s.first + 1}..${s.end} (${s.end - s.first} lines)`)
}

// delete from the bottom up so earlier indices stay valid
let out = [...lines]
for (const s of [...spans].reverse()) {
  out.splice(s.first, s.end - s.first)
}
let text = out.join('\n')

// drop the now-duplicated inferred type aliases
for (const t of [
  'WorkbookStyleEdit',
  'WorkbookChartEdit',
  'WorkbookVisualEdit',
  'WorkbookRichRun',
]) {
  const re = new RegExp(`^export type ${t} = z\\.infer<[^>]*>[^\\n]*\\n`, 'm')
  if (!re.test(text)) throw new Error(`type alias ${t} not found`)
  text = text.replace(re, '')
}

const anchor = "import { ADDABLE_SHAPE_TYPES } from '@revelith/xlsx-gateway/shared/shape-types'\n"
if (!text.includes(anchor)) throw new Error('shape-types anchor not found')
text = text.replace(
  anchor,
  `${anchor}import {
  richRunSchema,
  workbookChartEditSchema,
  workbookStyleEditSchema,
  workbookVisualEditSchema,
} from '@revelith/xlsx-gateway/shared/edit-schemas'
`,
)

text =
  text.replace(/\n\n+$/, '\n') +
  `
// The edit contract is defined once, in @revelith/xlsx-gateway, and re-exported
// here because the IPC surface is what the preload and renderer import.
export type {
  WorkbookChartEdit,
  WorkbookRichRun,
  WorkbookStyleEdit,
  WorkbookVisualEdit,
} from '@revelith/xlsx-gateway/shared/edit-schemas'
`

writeFileSync(file, text)
console.log('  cutover written')
