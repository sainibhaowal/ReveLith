/**
 * Regenerate the checked-in Windows Explorer "New" templates under
 * apps/shell/build/shell-new/, which are what Explorer offers when a user
 * right-clicks a folder and picks New → ReveLith <type>.
 *
 * The bytes come from the engines themselves rather than a captured fixture, so
 * the templates cannot drift from what the app actually produces.
 *
 * Every ZIP timestamp is pinned to a fixed instant: a blank document has no
 * meaningful mtime, and without pinning a regeneration that changed nothing else
 * would still produce a different file and show up as a spurious diff.
 *
 *   npx tsx tools/gen-shell-new-templates.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { buildBlankDocx } from '../packages/docx-engine/src/blank'
import { createBlankPptx } from '../packages/pptx-engine/src/blank'
// The blank-workbook builder lives with the sheets app rather than in a shared
// package, because spreadsheets are the app's own document model.
import { blankXlsxBuffer } from '../apps/sheets/src/gateway/csv-import'

/** Fixed timestamp so a no-op regeneration is byte-identical. */
const EPOCH = new Date('2000-01-01T00:00:00Z')

async function main() {
  const output = new URL('../apps/shell/build/shell-new/', import.meta.url)
  await mkdir(output, { recursive: true })
  const templates = {
    docx: await buildBlankDocx(),
    xlsx: await blankXlsxBuffer(),
    pptx: await createBlankPptx(),
  }
  for (const [ext, bytes] of Object.entries(templates)) {
    const zip = await JSZip.loadAsync(bytes)
    zip.forEach((_, entry) => {
      entry.date = EPOCH
    })
    await writeFile(
      new URL(`blank.${ext}`, output),
      await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    )
    console.log(`blank.${ext} written`)
  }
}

void main()
