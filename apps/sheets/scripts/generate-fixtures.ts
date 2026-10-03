import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildCompatibilityFixture,
  buildEditFixture,
  buildStructureFixture,
  buildSheetsFixture,
  buildKitchenSinkFixture,
  buildMacroFixture,
} from '../tests/fixture-builder'

const FIXTURES: ReadonlyArray<[string, () => Promise<Buffer>]> = [
  ['compatibility-basic.xlsx', buildCompatibilityFixture],
  ['compatibility-edit.xlsx', buildEditFixture],
  ['compatibility-structure.xlsx', buildStructureFixture],
  ['compatibility-sheets.xlsx', buildSheetsFixture],
  ['compatibility-kitchen-sink.xlsx', buildKitchenSinkFixture],
  ['compatibility-macro.xlsm', buildMacroFixture],
]

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(HERE, '..', 'fixtures', 'generated')

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true })
  for (const [name, build] of FIXTURES) {
    await writeFile(resolve(OUTPUT_DIR, name), await build())
    process.stdout.write(`Generated fixtures/generated/${name}\n`)
  }
}

void main()
