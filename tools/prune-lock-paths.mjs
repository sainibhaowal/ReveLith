/**
 * Drop the stale per-workspace lock entries for a package so npm re-resolves
 * them from the updated version ranges (npm keeps honouring a pinned
 * `apps/<x>/node_modules/...` entry even after the manifest changes).
 */
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'package-lock.json'
const lock = JSON.parse(readFileSync(file, 'utf8'))
const prefix = process.argv[2]
if (!prefix) throw new Error('usage: node tools/prune-lock-paths.mjs <path-prefix>')

let removed = 0
for (const key of Object.keys(lock.packages)) {
  if (key === prefix || key.startsWith(`${prefix}/`)) {
    delete lock.packages[key]
    removed += 1
  }
}
writeFileSync(file, JSON.stringify(lock, null, 2) + '\n')
console.log(`removed ${removed} lock entries under ${prefix}`)
