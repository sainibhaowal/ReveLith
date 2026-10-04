import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  runHeadlessExport,
  validateHeadlessPaths,
  type HeadlessExporters,
} from '../src/main/headless-export'
import type { HeadlessExportRequest } from '@revelith/electron-utils'

/**
 * The `--headless-export` host (src/main/headless-export.ts): input checks,
 * extension routing and the exit-code mapping. The per-module exporters are
 * injected, so no Electron window is ever created here.
 */

/** Resolve a POSIX-style path so it matches what validateHeadlessPaths resolves on every OS. */
const p = (...parts: string[]) => resolve(...parts)

const request = (
  input: string,
  outPath = p('/out/a.pdf'),
  targetFormat: HeadlessExportRequest['targetFormat'] = 'pdf',
): HeadlessExportRequest => ({
  input,
  targetFormat,
  outPath,
  json: false,
})

/** Every path in `present` exists and is a file; everything else does not. */
const fsWith = (present: readonly string[], isFile = true) => ({
  exists: (path: string) => present.includes(path),
  isFile: () => isFile,
})

function stubExporters(): { exporters: HeadlessExporters; calls: string[] } {
  const calls: string[] = []
  const make = (name: string) => async (input: string, outPath: string, format: string) => {
    calls.push(`${name}:${input}->${outPath}:${format}`)
  }
  return {
    calls,
    exporters: {
      docs: make('docs'),
      sheets: make('sheets'),
      slides: make('slides'),
      markdown: make('markdown'),
      html: make('html'),
    },
  }
}

describe('validateHeadlessPaths', () => {
  it('routes a readable input to its module', () => {
    const result = validateHeadlessPaths(
      request(p('/docs/a.docx')),
      fsWith([p('/docs/a.docx'), p('/out')]),
    )
    expect(result).toEqual({
      ok: true,
      input: p('/docs/a.docx'),
      outPath: p('/out/a.pdf'),
      module: 'docs',
    })
  })

  it('rejects a target the input module does not render as bad args (exit 1)', () => {
    const fs = fsWith([p('/docs/a.docx'), p('/decks/a.pptx'), p('/out')])
    expect(
      validateHeadlessPaths(request(p('/decks/a.pptx'), p('/out/a.docx'), 'docx'), fs),
    ).toMatchObject({ ok: false, code: 1, message: expect.stringContaining('pdf') })
    expect(
      validateHeadlessPaths(request(p('/docs/a.docx'), p('/out/a.html'), 'html'), fs),
    ).toMatchObject({ ok: true, module: 'docs' })
  })

  it('reports a missing input as an input-file error (exit 2)', () => {
    expect(validateHeadlessPaths(request(p('/nope.docx')), fsWith([]))).toEqual({
      ok: false,
      code: 2,
      message: expect.stringContaining('nope.docx'),
    })
  })

  it('rejects a directory handed in as the input', () => {
    const result = validateHeadlessPaths(
      request(p('/docs/a.docx')),
      fsWith([p('/docs/a.docx'), p('/out')], false),
    )
    expect(result).toMatchObject({ ok: false, code: 2, message: expect.stringContaining('file') })
  })

  it('rejects an extension no module can render', () => {
    const result = validateHeadlessPaths(
      request(p('/docs/a.pdf')),
      fsWith([p('/docs/a.pdf'), p('/out')]),
    )
    expect(result).toMatchObject({ ok: false, code: 2 })
  })

  it('treats a missing output directory as a bad argument (exit 1)', () => {
    const result = validateHeadlessPaths(
      request(p('/docs/a.docx'), p('/gone/a.pdf')),
      fsWith([p('/docs/a.docx')]),
    )
    expect(result).toMatchObject({ ok: false, code: 1, message: expect.stringContaining('gone') })
  })
})

describe('runHeadlessExport', () => {
  it('calls the module that owns the extension and reports success', async () => {
    const { exporters, calls } = stubExporters()
    const outcome = await runHeadlessExport(
      request(p('/decks/a.pptx')),
      exporters,
      fsWith([p('/decks/a.pptx'), p('/out'), p('/out/a.pdf')]),
    )
    expect(calls).toEqual([`slides:${p('/decks/a.pptx')}->${p('/out/a.pdf')}:pdf`])
    expect(outcome).toEqual({ ok: true, input: p('/decks/a.pptx'), outPath: p('/out/a.pdf') })
  })

  it.each([
    ['/a.docx', 'docs'],
    ['/a.xlsx', 'sheets'],
    ['/a.pptx', 'slides'],
    ['/a.md', 'markdown'],
    ['/a.html', 'html'],
  ])('routes %s to the %s exporter', async (input, module) => {
    const { exporters, calls } = stubExporters()
    const resolved = p(input)
    await runHeadlessExport(
      request(resolved),
      exporters,
      fsWith([resolved, p('/out'), p('/out/a.pdf')]),
    )
    expect(calls[0]?.startsWith(`${module}:`)).toBe(true)
  })

  it('turns a thrown exporter error into a conversion failure (exit 3)', async () => {
    const { exporters } = stubExporters()
    exporters.docs = vi.fn(() => Promise.reject(new Error('renderer stopped')))
    const outcome = await runHeadlessExport(
      request(p('/a.docx')),
      exporters,
      fsWith([p('/a.docx'), p('/out')]),
    )
    expect(outcome).toEqual({ ok: false, code: 3, message: 'renderer stopped' })
  })

  it('fails when the exporter resolves but wrote nothing', async () => {
    const { exporters } = stubExporters()
    const outcome = await runHeadlessExport(
      request(p('/a.docx')),
      exporters,
      fsWith([p('/a.docx'), p('/out')]),
    )
    expect(outcome).toMatchObject({
      ok: false,
      code: 3,
      message: expect.stringContaining('a.pdf'),
    })
  })

  it('never reaches an exporter when the input is unusable', async () => {
    const { exporters, calls } = stubExporters()
    const outcome = await runHeadlessExport(request(p('/gone.docx')), exporters, fsWith([]))
    expect(calls).toEqual([])
    expect(outcome).toMatchObject({ ok: false, code: 2 })
  })
})
