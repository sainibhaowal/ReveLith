import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'assets', 'genoffice-0.11.0');

// Binary extensions that must NOT be text-processed
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns',
  '.ttf', '.woff', '.woff2', '.otf', '.eot',
  '.node', '.wasm', '.zip', '.tar', '.gz', '.tgz',
  '.exe', '.dll', '.so', '.dylib', '.pdf', '.docx', '.xlsx', '.pptx'
]);

function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

// Rebranding transformations
function rebrandText(content) {
  let res = content;

  // Specific URLs & scopes
  res = res.replaceAll('https://github.com/genspark-ai/genoffice', 'https://github.com/sainibhaowal/ReveLith');
  res = res.replaceAll('https://genoffice.ai', 'https://revelith.com');
  res = res.replaceAll('https://genspark.ai', 'https://revelith.com');
  res = res.replaceAll('@genspark-ai/', '@revelith/');
  res = res.replaceAll('@genoffice/', '@revelith/');

  // Reverse domain IDs & schemes
  res = res.replaceAll('io.genoffice.', 'io.revelith.');
  res = res.replaceAll('com.genoffice.', 'com.revelith.');
  res = res.replaceAll('genoffice-ipc:', 'revelith-ipc:');
  res = res.replaceAll('genoffice-media:', 'revelith-media:');

  // Font family names & font file references
  res = res.replaceAll('GenOffice Gothic KR', 'ReveLith Gothic KR');
  res = res.replaceAll('GenOffice Che Latin KR', 'ReveLith Che Latin KR');
  res = res.replaceAll('GenOffice SimSun Latin', 'ReveLith SimSun Latin');
  res = res.replaceAll('GenOffice Poppins', 'ReveLith Poppins');
  res = res.replaceAll('GenOffice Tamil', 'ReveLith Tamil');
  res = res.replaceAll('GenOffice UI Kana', 'ReveLith UI Kana');
  res = res.replaceAll('GenOfficeSansKR', 'RevelithSansKR');
  res = res.replaceAll('GenOfficeSerifKR', 'RevelithSerifKR');
  res = res.replaceAll('GenOfficeCheLatinKR', 'RevelithCheLatinKR');
  res = res.replaceAll('GenOfficeGothicKR', 'RevelithGothicKR');
  res = res.replaceAll('GenOfficePoppins', 'RevelithPoppins');
  res = res.replaceAll('GenOfficePUABlank', 'RevelithPUABlank');
  res = res.replaceAll('GenOfficeTamil', 'RevelithTamil');
  res = res.replaceAll('GenOfficeUIKanaJP', 'RevelithUIKanaJP');

  // General branding
  res = res.replaceAll('GenOffice', 'ReveLith');
  res = res.replaceAll('GENOFFICE', 'REVELITH');
  res = res.replaceAll('genoffice', 'revelith');
  res = res.replaceAll('GenSpark', 'ReveLith');
  res = res.replaceAll('Genspark', 'ReveLith');
  res = res.replaceAll('GENSPARK', 'REVELITH');
  res = res.replaceAll('genspark', 'revelith');
  res = res.replaceAll('GenMail', 'ReveMail');
  res = res.replaceAll('genmail', 'revemail');
  res = res.replaceAll('GENMAIL', 'REVEMAIL');

  // Preserve generator / generic words if accidentally affected
  res = res.replaceAll('revelithate', 'generate');
  res = res.replaceAll('revelithated', 'generated');
  res = res.replaceAll('revelithating', 'generating');
  res = res.replaceAll('revelithation', 'generation');
  res = res.replaceAll('revelithic', 'generic');

  return res;
}

function rebrandFileName(name) {
  let n = name;
  n = n.replaceAll('GenOfficeSansKR', 'RevelithSansKR');
  n = n.replaceAll('GenOfficeSerifKR', 'RevelithSerifKR');
  n = n.replaceAll('GenOfficeCheLatinKR', 'RevelithCheLatinKR');
  n = n.replaceAll('GenOfficeGothicKR', 'RevelithGothicKR');
  n = n.replaceAll('GenOfficePoppins', 'RevelithPoppins');
  n = n.replaceAll('GenOfficePUABlank', 'RevelithPUABlank');
  n = n.replaceAll('GenOfficeTamil', 'RevelithTamil');
  n = n.replaceAll('GenOfficeUIKanaJP', 'RevelithUIKanaJP');
  n = n.replaceAll('GenOffice', 'ReveLith');
  n = n.replaceAll('genoffice', 'revelith');
  n = n.replaceAll('genspark', 'revelith');
  return n;
}

function syncDirectory(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    // Skip git, node_modules, out, dist
    if (['.git', 'node_modules', 'out', 'dist'].includes(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const rebrandedName = rebrandFileName(entry.name);
    const destPath = path.join(destDir, rebrandedName);

    if (entry.isDirectory()) {
      syncDirectory(srcPath, destPath);
    } else {
      copyAndRebrandFile(srcPath, destPath);
    }
  }
}

function copyAndRebrandFile(srcPath, destPath) {
  const binary = isBinaryFile(srcPath);
  if (binary) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  } else {
    try {
      const raw = fs.readFileSync(srcPath, 'utf8');
      const transformed = rebrandText(raw);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, transformed, 'utf8');
    } catch {
      // Fallback to binary copy if encoding error
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Starting sync from assets/genoffice-0.11.0 to ReveLith...');

// 1. Sync apps
const apps = ['docs', 'html', 'markdown', 'pdf', 'sheets', 'shell', 'slides'];
for (const app of apps) {
  const src = path.join(SRC_DIR, 'apps', app);
  const dest = path.join(ROOT_DIR, 'apps', app);
  console.log(`Syncing app: ${app}...`);
  syncDirectory(src, dest);
}

// 2. Sync packages
const pkgs = fs.readdirSync(path.join(SRC_DIR, 'packages'), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

for (const pkg of pkgs) {
  const src = path.join(SRC_DIR, 'packages', pkg);
  const targetPkgName = pkg === 'cli' ? 'revelith-cli' : pkg;
  const dest = path.join(ROOT_DIR, 'packages', targetPkgName);
  console.log(`Syncing package: ${pkg} -> ${targetPkgName}...`);
  syncDirectory(src, dest);
}

// 3. Sync other directories
const otherDirs = ['docs', 'e2e', 'ee', 'fixtures', 'scripts', 'tools'];
for (const dir of otherDirs) {
  const src = path.join(SRC_DIR, dir);
  const dest = path.join(ROOT_DIR, dir);
  console.log(`Syncing directory: ${dir}...`);
  syncDirectory(src, dest);
}

console.log('Sync and rebranding complete!');
