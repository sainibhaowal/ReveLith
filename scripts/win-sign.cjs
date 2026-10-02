/**
 * Windows code signing for ReveLith release packaging.
 *
 * Invoked as: node scripts/win-sign.cjs <mode> <path-to-binary>
 *   mode: "test" | "production"
 *
 * electron-builder.cjs delegates every Windows binary it signs
 * (ReveLith.exe, the NSIS uninstaller/installer) to this script, and the
 * release workflow pre-signs the static extraResources binaries
 * (xlsx-sidecar.exe, win-ocr.exe) with it, since electron-builder does not
 * sign extraResources.
 *
 * Env-var contract:
 *   test mode: generates an ephemeral self-signed PFX when none is provided.
 *     REVELITH_WIN_TEST_PFX_B64 / REVELITH_WIN_TEST_PFX_PASSWORD — optional
 *       base64 PFX + password to reuse instead of generating one.
 *   production mode (exactly one backend must be configured):
 *     Azure Trusted Signing (preferred):
 *       AZURE_TRUSTED_SIGNING_ENDPOINT, AZURE_CODE_SIGNING_ACCOUNT,
 *       AZURE_CERTIFICATE_PROFILE
 *     PFX file (fallback, e.g. DigiCert KeyLocker export / EV token staging):
 *       CSC_LINK (path to .pfx), CSC_KEY_PASSWORD
 *
 * Unset mode (local/fork builds) never reaches this script: electron-builder
 * packages everything unsigned instead. When a mode IS set, failures are
 * loud — silently shipping unsigned binaries would reintroduce the
 * SmartScreen/WDAC blocks on child processes this exists to fix.
 */
'use strict'

const { execFileSync } = require('node:child_process')
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}

function findSigntool() {
  const candidates = []
  if (process.env.SIGNTOOL_PATH) candidates.push(process.env.SIGNTOOL_PATH)
  const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin'
  try {
    const { readdirSync } = require('node:fs')
    if (existsSync(kits)) {
      const versions = readdirSync(kits)
        .filter((v) => /^\d+\.\d+/.test(v))
        .sort()
        .reverse()
      for (const v of versions) {
        candidates.push(join(kits, v, 'x64', 'signtool.exe'))
        candidates.push(join(kits, v, 'x86', 'signtool.exe'))
      }
    }
  } catch {
    /* fall through to PATH lookup */
  }
  candidates.push('signtool.exe') // PATH (Windows SDK / CI image)
  for (const c of candidates) {
    if (c === 'signtool.exe') return c // resolved via PATH at exec time
    if (existsSync(c)) return c
  }
  throw new Error(
    'signtool.exe not found (install the Windows SDK or set SIGNTOOL_PATH). ' +
      'Every REVELITH_WIN_SIGN_MODE build must sign; refusing to continue unsigned.',
  )
}

function signWithPfx(target, pfxPath, password) {
  const signtool = findSigntool()
  const args = ['sign', '/fd', 'sha256', '/tr', 'http://timestamp.digicert.com', '/td', 'sha256']
  if (password) args.push('/p', password)
  args.push('/f', pfxPath, target)
  run(signtool, args)
}

function signWithAzureTrustedSigning(target) {
  const endpoint = process.env.AZURE_TRUSTED_SIGNING_ENDPOINT
  const account = process.env.AZURE_CODE_SIGNING_ACCOUNT
  const profile = process.env.AZURE_CERTIFICATE_PROFILE
  if (!endpoint || !account || !profile) {
    throw new Error(
      'production signing needs AZURE_TRUSTED_SIGNING_ENDPOINT + ' +
        'AZURE_CODE_SIGNING_ACCOUNT + AZURE_CERTIFICATE_PROFILE (or CSC_LINK + CSC_KEY_PASSWORD).',
    )
  }
  run('dotnet', [
    'tool',
    'install',
    '--global',
    'AzureSignTool',
    '--version',
    process.env.AZURE_SIGN_TOOL_VERSION || '5.*',
  ])
  run('azuresigntool', [
    'sign',
    '-kvu',
    endpoint,
    '-kva',
    account,
    '-kvc',
    profile,
    '-kvi',
    process.env.AZURE_CLIENT_ID || '',
    '-kvs',
    process.env.AZURE_CLIENT_SECRET || '',
    '-kvt',
    process.env.AZURE_TENANT_ID || '',
    '-tr',
    'http://timestamp.digicert.com',
    '-v',
    target,
  ])
}

function ensureTestPfx() {
  if (process.env.REVELITH_WIN_TEST_PFX_B64) {
    const dir = mkdtempSync(join(tmpdir(), 'revelith-test-sign-'))
    const pfx = join(dir, 'test.pfx')
    writeFileSync(pfx, Buffer.from(process.env.REVELITH_WIN_TEST_PFX_B64, 'base64'))
    return { pfx, password: process.env.REVELITH_WIN_TEST_PFX_PASSWORD || '' }
  }
  // Ephemeral self-signed code-signing cert via PowerShell (no openssl needed
  // on the runner). Exported with a random password into RUNNER_TEMP so concurrent
  // jobs on one runner never share a file.
  const password = `revelith-test-${Date.now().toString(36)}`
  const dir =
    process.env.RUNNER_TEMP && existsSync(process.env.RUNNER_TEMP)
      ? mkdtempSync(join(process.env.RUNNER_TEMP, 'revelith-test-sign-'))
      : mkdtempSync(join(tmpdir(), 'revelith-test-sign-'))
  const pfx = join(dir, 'test.pfx')
  run('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    [
      `$cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=ReveLith Test'`,
      `-KeyUsage DigitalSignature -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')`,
      `-CertStoreLocation 'Cert:\\CurrentUser\\My'`,
      `-NotAfter (Get-Date).AddDays(30);`,
      `$pw = ConvertTo-SecureString -String '${password}' -Force -AsPlainText;`,
      `Export-PfxCertificate -Cert $cert -FilePath '${pfx}' -Password $pw | Out-Null;`,
      `Remove-Item $cert.PSPath;`,
    ].join(' '),
  ])
  return { pfx, password }
}

function main() {
  const [mode, target] = process.argv.slice(2)
  if ((mode !== 'test' && mode !== 'production') || !target) {
    console.error('usage: node scripts/win-sign.cjs <test|production> <path-to-binary>')
    process.exit(2)
  }
  if (!existsSync(target)) throw new Error(`sign target missing: ${target}`)

  if (mode === 'test') {
    const { pfx, password } = ensureTestPfx()
    try {
      signWithPfx(target, pfx, password)
    } finally {
      try {
        rmSync(pfx, { force: true })
      } catch {
        /* best effort cleanup */
      }
    }
    return
  }

  // production: Azure Trusted Signing wins when configured, PFX otherwise
  if (
    process.env.AZURE_TRUSTED_SIGNING_ENDPOINT &&
    process.env.AZURE_CODE_SIGNING_ACCOUNT &&
    process.env.AZURE_CERTIFICATE_PROFILE
  ) {
    signWithAzureTrustedSigning(target)
    return
  }
  if (process.env.CSC_LINK) {
    signWithPfx(target, process.env.CSC_LINK, process.env.CSC_KEY_PASSWORD || '')
    return
  }
  throw new Error(
    'REVELITH_WIN_SIGN_MODE=production but no signing backend is configured ' +
      '(AZURE_TRUSTED_SIGNING_* or CSC_LINK + CSC_KEY_PASSWORD).',
  )
}

main()
