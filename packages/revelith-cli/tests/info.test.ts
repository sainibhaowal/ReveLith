import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildBlankDocx } from '@revelith/docx-engine'
import { createBlankPptx } from '@revelith/pptx-engine'
import { parseArgs, booleanFlags, flagBool, flagString } from '../src/args.js'
import { CliError, EXIT, formatHuman, formatHumanError, toJsonError } from '../src/result.js'
import { CommandRegistry, commandHelp } from '../src/registry.js'
import { defaultRegistry, runCli, topLevelHelp } from '../src/cli.js'

let dir: string
/** Absolute path inside the scratch dir; contents supplied per test. */
const at = (name: string) => join(dir, name)

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'revelith-cli-'))
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('parseArgs', () => {
  it('reads --key value and --key=value alike', () => {
    expect(parseArgs(['--out', 'a.pptx']).flags.out).toBe('a.pptx')
    expect(parseArgs(['--out=a.pptx']).flags.out).toBe('a.pptx')
  })

  it('keeps a declared boolean from eating the next token', () => {
    // The whole point of the booleans set: `info` must stay the command
    const args = parseArgs(['--json', 'info', 'a.docx'], booleanFlags('json'))
    expect(args.flags.json).toBe(true)
    expect(args.positionals).toEqual(['info', 'a.docx'])
  })

  it('treats an unknown flag with a bare value as taking it', () => {
    expect(parseArgs(['--range', 'A1:D10']).flags.range).toBe('A1:D10')
  })

  it('makes a trailing flag a boolean when the next token is another flag', () => {
    const args = parseArgs(['--json', '--out', 'x'])
    expect(args.flags.json).toBe(true)
    expect(args.flags.out).toBe('x')
  })

  it('stops flag parsing at -- and keeps the rest positional', () => {
    const args = parseArgs(['info', '--', '--not-a-flag', '-weird-name'])
    expect(args.positionals).toEqual(['info', '--not-a-flag', '-weird-name'])
  })

  it('maps -h to help', () => {
    expect(parseArgs(['-h']).flags.help).toBe(true)
  })

  it('accessors distinguish a value from a switch', () => {
    const args = parseArgs(['--out', 'a', '--force'], booleanFlags('force'))
    expect(flagString(args, 'out')).toBe('a')
    expect(flagBool(args, 'force')).toBe(true)
    // present as a switch, so no string value
    expect(flagString(args, 'force')).toBeUndefined()
    expect(flagString(args, 'absent')).toBeUndefined()
  })
})

describe('result envelopes', () => {
  it('defaults the reason from the exit code', () => {
    expect(new CliError(EXIT.file, 'gone').reason).toBe('file_not_found')
    expect(new CliError(EXIT.usage, 'bad').reason).toBe('invalid_usage')
  })

  it('prefers an explicit reason over the default', () => {
    const e = new CliError(EXIT.usage, 'x', undefined, { reason: 'unknown_option' })
    expect(e.reason).toBe('unknown_option')
  })

  it('JSON error carries the code, reason and suggestion', () => {
    const e = new CliError(
      EXIT.conversion,
      'bad pdf',
      { page: 3 },
      { suggestion: 'try another file' },
    )
    const j = toJsonError('convert', e)
    expect(j).toMatchObject({
      status: 'error',
      command: 'convert',
      code: EXIT.conversion,
      error: 'conversion_failed',
      message: 'bad pdf',
      suggestion: 'try another file',
      detail: { page: 3 },
    })
  })

  it('human error names the binary and prints the hint', () => {
    const e = new CliError(EXIT.file, 'no such file', undefined, { suggestion: 'check the path' })
    const text = formatHumanError(e)
    expect(text).toContain('revelith: no such file')
    expect(text).toContain('hint: check the path')
  })

  it('human success reports output and warnings', () => {
    const text = formatHuman({
      summary: 'done',
      outputPath: '/tmp/a.docx',
      warnings: [{ code: 'x', message: 'careful', suggestion: 'check it' }],
      detail: { blocks: 3 },
    })
    expect(text).toContain('output: /tmp/a.docx')
    expect(text).toContain('warning: careful (check it)')
    expect(text).toContain('blocks: 3')
  })

  it('surfaces a batch breakdown instead of a raw object', () => {
    const text = formatHuman({
      summary: 's',
      detail: { batch: { total: 10, applied: 7, failed: 2, skipped: 1 } },
    })
    expect(text).toContain('batch: 7 of 10 ops applied, 2 failed, 1 skipped')
  })
})

describe('registry', () => {
  it('derives per-command help from the declaration', () => {
    const def = {
      name: 'x',
      summary: 'does x',
      usage: 'x <file>',
      options: [
        { name: 'out', description: 'where to write', value: 'path' },
        { name: 'force', description: 'overwrite' },
      ],
      run: async () => ({ summary: 'ok' }),
    }
    const help = commandHelp(def)
    expect(help).toContain('Usage: revelith x <file>')
    expect(help).toContain('--out <path>')
    expect(help).toContain('--force')
  })

  it('registers, finds and lists commands', () => {
    const r = new CommandRegistry()
    const def = { name: 'a', summary: 's', usage: 'a', run: async () => ({ summary: 'x' }) }
    expect(r.get('a')).toBeUndefined()
    r.register(def)
    expect(r.get('a')).toBe(def)
    expect(r.list()).toEqual([def])
  })
})

describe('runCli', () => {
  it('prints the command list with no arguments', async () => {
    const out = await runCli([])
    expect(out.code).toBe(EXIT.ok)
    expect(out.stdout).toContain('Usage:')
    expect(out.stdout).toContain('info')
  })

  it('rejects an unknown command with a usage exit code', async () => {
    const out = await runCli(['frobnicate'])
    expect(out.code).toBe(EXIT.usage)
    expect(out.stderr).toContain('unknown command: frobnicate')
    expect(out.stdout).toBe('')
  })

  it('reports an unknown command as JSON when asked', async () => {
    const out = await runCli(['--json', 'frobnicate'])
    const j = JSON.parse(out.stderr)
    expect(j.status).toBe('error')
    expect(j.error).toBe('unknown_command')
    expect(j.code).toBe(EXIT.usage)
  })

  it('shows per-command help for --help', async () => {
    const out = await runCli(['info', '--help'])
    expect(out.code).toBe(EXIT.ok)
    expect(out.stdout).toContain('Usage: revelith info <file>')
  })

  it('top-level help lists every registered command', () => {
    const help = topLevelHelp(defaultRegistry())
    expect(help).toContain('info')
  })
})

describe('info', () => {
  it('describes a real .docx produced by the engine', async () => {
    const p = at('blank.docx')
    writeFileSync(p, await buildBlankDocx())
    const out = await runCli(['info', p, '--json'])
    expect(out.code).toBe(EXIT.ok)
    const j = JSON.parse(out.stdout)
    expect(j.status).toBe('ok')
    expect(j.command).toBe('info')
    expect(j.detail.format).toBe('docx')
    expect(j.detail.size_bytes).toBeGreaterThan(0)
    // the summary must be a sentence, not an object
    expect(typeof j.summary).toBe('string')
    expect(j.detail).toHaveProperty('blocks')
    expect(j.detail).toHaveProperty('comments')
  })

  it('describes a real .pptx produced by the engine', async () => {
    const p = at('blank.pptx')
    writeFileSync(p, await createBlankPptx())
    const out = await runCli(['info', p, '--json'])
    expect(out.code).toBe(EXIT.ok)
    const j = JSON.parse(out.stdout)
    expect(j.detail.format).toBe('pptx')
    expect(j.detail.slides).toBe(1)
    // 12192000 EMU = 13.333in, 6858000 EMU = 7.5in
    expect(j.detail.slide_size_in).toEqual({ width: 13.33, height: 7.5 })
  })

  it('counts rows and columns in a comma CSV', async () => {
    const p = at('a.csv')
    writeFileSync(p, 'name,qty\nwidget,3\ngadget,4\n')
    const j = JSON.parse((await runCli(['info', p, '--json'])).stdout)
    expect(j.detail).toMatchObject({ rows: 3, columns: 2, delimiter: ',' })
  })

  it('does not count a trailing newline as an empty row', async () => {
    const p = at('nl.csv')
    writeFileSync(p, 'a,b\n1,2\n')
    const j = JSON.parse((await runCli(['info', p, '--json'])).stdout)
    expect(j.detail.rows).toBe(2)
  })

  it('sniffs a semicolon CSV instead of assuming comma', async () => {
    // a comma-less file read as comma would report 1 column
    const p = at('semi.csv')
    writeFileSync(p, 'name;qty\nwidget;3\n')
    const j = JSON.parse((await runCli(['info', p, '--json'])).stdout)
    expect(j.detail.delimiter).toBe(';')
    expect(j.detail.columns).toBe(2)
  })

  it('ignores a delimiter that appears inside quotes', async () => {
    const p = at('quoted.csv')
    writeFileSync(p, 'name,note\nwidget,"a, b, c"\n')
    const j = JSON.parse((await runCli(['info', p, '--json'])).stdout)
    expect(j.detail.columns).toBe(2)
  })

  it('handles an escaped double quote inside a quoted field', async () => {
    const p = at('escaped.csv')
    writeFileSync(p, 'a,b\n"say ""hi"", ok",2\n')
    const j = JSON.parse((await runCli(['info', p, '--json'])).stdout)
    // 2 real columns: the inner "" must not toggle quoting off
    expect(j.detail.columns).toBe(2)
  })

  it('counts markdown headings', async () => {
    const p = at('a.md')
    writeFileSync(p, '# One\n\ntext\n\n## Two\n')
    const j = JSON.parse((await runCli(['info', p, '--json'])).stdout)
    expect(j.detail.headings).toBe(2)
    expect(j.detail.lines).toBe(5)
  })

  it('refuses a format it cannot describe honestly', async () => {
    const p = at('a.xlsx')
    writeFileSync(p, 'not really a workbook')
    const out = await runCli(['info', p, '--json'])
    expect(out.code).toBe(EXIT.usage)
    const j = JSON.parse(out.stderr)
    expect(j.error).toBe('unsupported')
    // must not invent a sheet count
    expect(j.detail).not.toHaveProperty('sheets')
  })

  it('refuses an unknown extension', async () => {
    const p = at('a.zzz')
    writeFileSync(p, 'x')
    expect((await runCli(['info', p])).stderr).toContain('unsupported file type')
  })

  it('reports a missing file specifically, not as unsupported', async () => {
    const out = await runCli(['info', at('nope.docx'), '--json'])
    expect(out.code).toBe(EXIT.file)
    expect(JSON.parse(out.stderr).error).toBe('file_not_found')
  })

  it('reports a missing operand as a usage error', async () => {
    const out = await runCli(['info', '--json'])
    expect(out.code).toBe(EXIT.usage)
    expect(JSON.parse(out.stderr).error).toBe('missing_argument')
  })

  it('treats a directory as a file error', async () => {
    const out = await runCli(['info', dir, '--json'])
    expect(out.code).toBe(EXIT.file)
  })

  it('emits human text by default and nothing on stdout for errors', async () => {
    const p = at('b.md')
    writeFileSync(p, '# T\n')
    const out = await runCli(['info', p])
    expect(out.stdout).toContain('md —')
    expect(out.stdout).toContain('lines:')
    expect(out.stderr).toBe('')
  })
})
