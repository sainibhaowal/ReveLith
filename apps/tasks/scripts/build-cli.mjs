import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const outDir = resolve('out/cli')
await mkdir(outDir, { recursive: true })

for (const entry of ['index', 'mcp']) {
  await build({
    entryPoints: [`src/cli/${entry}.ts`],
    outfile: `${outDir}/${entry}.js`,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    sourcemap: false,
    legalComments: 'none',
    absWorkingDir: process.cwd(),
  })
}
