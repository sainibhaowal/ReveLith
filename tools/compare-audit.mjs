import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = process.cwd()
const SRC_DIR = path.join(ROOT_DIR, 'assets', 'genoffice-0.11.0')

function rebrandFileName(name) {
  let n = name
  n = n.replaceAll('GenOfficeSansKR', 'RevelithSansKR')
  n = n.replaceAll('GenOfficeSerifKR', 'RevelithSerifKR')
  n = n.replaceAll('GenOfficeCheLatinKR', 'RevelithCheLatinKR')
  n = n.replaceAll('GenOfficeGothicKR', 'RevelithGothicKR')
  n = n.replaceAll('GenOfficePoppins', 'RevelithPoppins')
  n = n.replaceAll('GenOfficePUABlank', 'RevelithPUABlank')
  n = n.replaceAll('GenOfficeTamil', 'RevelithTamil')
  n = n.replaceAll('GenOfficeUIKanaJP', 'RevelithUIKanaJP')
  n = n.replaceAll('GenOffice', 'ReveLith')
  n = n.replaceAll('genoffice', 'revelith')
  n = n.replaceAll('genspark', 'revelith')
  return n
}

function getAllFiles(dir, baseDir = dir) {
  let results = []
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (['.git', 'node_modules', 'out', 'dist'].includes(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, baseDir))
    } else {
      results.push(path.relative(baseDir, fullPath))
    }
  }
  return results
}

const sections = [
  { name: 'apps/docs', src: 'apps/docs', dest: 'apps/docs' },
  { name: 'apps/html', src: 'apps/html', dest: 'apps/html' },
  { name: 'apps/markdown', src: 'apps/markdown', dest: 'apps/markdown' },
  { name: 'apps/pdf', src: 'apps/pdf', dest: 'apps/pdf' },
  { name: 'apps/sheets', src: 'apps/sheets', dest: 'apps/sheets' },
  { name: 'apps/shell', src: 'apps/shell', dest: 'apps/shell' },
  { name: 'apps/slides', src: 'apps/slides', dest: 'apps/slides' },
  { name: 'docs', src: 'docs', dest: 'docs' },
  { name: 'e2e', src: 'e2e', dest: 'e2e' },
  { name: 'ee', src: 'ee', dest: 'ee' },
  { name: 'fixtures', src: 'fixtures', dest: 'fixtures' },
  { name: 'scripts', src: 'scripts', dest: 'scripts' },
  { name: 'skills', src: 'skills', dest: 'skills' },
  { name: 'tools', src: 'tools', dest: 'tools' },
]

console.log('=== COMPARISON AUDIT: GenOffice v0.11.0 vs ReveLith ===\n')

let totalSrcFiles = 0
let totalMatched = 0
let totalMissing = 0
const missingReport = []

for (const sec of sections) {
  const srcPath = path.join(SRC_DIR, sec.src)
  const destPath = path.join(ROOT_DIR, sec.dest)
  const srcFiles = getAllFiles(srcPath)
  totalSrcFiles += srcFiles.length

  let secMatched = 0
  let secMissing = 0
  for (const relFile of srcFiles) {
    const parts = relFile.split(path.sep).map((p) => rebrandFileName(p))
    const destRelFile = parts.join(path.sep)
    const destFullPath = path.join(destPath, destRelFile)
    if (fs.existsSync(destFullPath)) {
      secMatched++
    } else {
      secMissing++
      missingReport.push({ section: sec.name, file: relFile, target: destRelFile })
    }
  }
  totalMatched += secMatched
  totalMissing += secMissing
  console.log(
    `[${sec.name.padEnd(16)}] GenOffice: ${srcFiles.length.toString().padStart(4)} files | Synced to ReveLith: ${secMatched.toString().padStart(4)} | Missing: ${secMissing}`,
  )
}

// Packages audit
console.log('\n--- PACKAGES AUDIT ---')
const srcPkgsDir = path.join(SRC_DIR, 'packages')
const srcPkgs = fs
  .readdirSync(srcPkgsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

for (const pkg of srcPkgs) {
  const targetPkg = pkg === 'cli' ? 'revelith-cli' : pkg
  const srcPath = path.join(srcPkgsDir, pkg)
  const destPath = path.join(ROOT_DIR, 'packages', targetPkg)
  const srcFiles = getAllFiles(srcPath)
  totalSrcFiles += srcFiles.length

  let secMatched = 0
  let secMissing = 0
  for (const relFile of srcFiles) {
    const parts = relFile.split(path.sep).map((p) => rebrandFileName(p))
    const destRelFile = parts.join(path.sep)
    const destFullPath = path.join(destPath, destRelFile)
    if (fs.existsSync(destFullPath)) {
      secMatched++
    } else {
      secMissing++
      missingReport.push({ section: `packages/${pkg}`, file: relFile, target: destRelFile })
    }
  }
  totalMatched += secMatched
  totalMissing += secMissing
  console.log(
    `[packages/${pkg.padEnd(14)}] GenOffice: ${srcFiles.length.toString().padStart(4)} files | Synced to ReveLith: ${secMatched.toString().padStart(4)} | Missing: ${secMissing}`,
  )
}

console.log('\n=== TOTAL AUDIT SUMMARY ===')
console.log(`Total GenOffice v0.11.0 source files: ${totalSrcFiles}`)
console.log(`Total matched in ReveLith:             ${totalMatched}`)
console.log(`Total missing:                         ${totalMissing}`)

if (missingReport.length > 0) {
  console.log('\nMissing details:')
  console.log(JSON.stringify(missingReport.slice(0, 20), null, 2))
}

// Also check ReveLith additions (features ReveLith has that GenOffice doesn't have)
console.log('\n--- REVELITH UNIQUE EXTENSIONS ---')
const revelithExtras = [
  'apps/web',
  'packages/emf-parser',
  'tools/sync-genoffice-to-revelith.mjs',
  'packages/ai-search/src/search-tools.ts',
  'packages/ai-search/src/media-tools.ts',
  'packages/ai-provider/src/search-settings.ts',
  'packages/ai-provider/src/media-protocols.ts',
  'packages/ai-provider/src/custom-models.ts',
]
for (const extra of revelithExtras) {
  const p = path.join(ROOT_DIR, extra)
  console.log(
    `[ReveLith Extra] ${extra.padEnd(45)}: ${fs.existsSync(p) ? 'EXISTS & ACTIVE' : 'NOT FOUND'}`,
  )
}
