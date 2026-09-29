import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Remove the two border primitives that the cutover orphaned.
 *
 * styleEditBorderSchema was only ever used by workbookStyleEditSchema, which now
 * lives in the package; editableBorderStyleSchema was only used by that. Both
 * are module-local with no external consumer, so they are dead rather than
 * public API.
 */
const file = 'apps/sheets/src/shared/desktop-api.ts'
let s = readFileSync(file, 'utf8')
const before = s

const DEAD = [
  `/// OOXML border line styles the editor can write.
export const editableBorderStyleSchema = z.enum([
  'thin',
  'medium',
  'thick',
  'dashed',
  'dotted',
  'double',
  'hair',
  'dashDot',
  'dashDotDot',
  'mediumDashed',
  'mediumDashDot',
  'mediumDashDotDot',
  'slantDashDot',
])

`,
  `/// One border edge delta: an object sets the edge, null removes it.
const styleEditBorderSchema = z.union([
  z
    .object({
      style: editableBorderStyleSchema,
      color: hexColorSchema.optional(),
    })
    .strict(),
  z.null(),
])

`,
]

for (const block of DEAD) {
  if (!s.includes(block)) throw new Error(`block not found:\n${block.slice(0, 60)}`)
  s = s.replace(block, '')
}

if (s === before) throw new Error('nothing removed')
writeFileSync(file, s)
console.log('  removed 2 orphaned border primitives')
