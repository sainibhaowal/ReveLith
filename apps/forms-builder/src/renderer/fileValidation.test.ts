import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectFileContent, validateFileContent } from './fileValidation'
import JSZip from 'jszip'

describe('offline upload content checks', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('recognizes actual PDF bytes instead of trusting the name or MIME label', async () => {
    const genuine = new File(['%PDF-1.7\n'], 'report.pdf', { type: 'application/pdf' })
    const renamedText = new File(['just plain text'], 'report.pdf', { type: 'application/pdf' })
    expect((await inspectFileContent(genuine)).detected).toBe('pdf')
    await expect(validateFileContent(renamedText, '.pdf')).rejects.toThrow(/content|looks like/i)
  })

  it('detects common image signatures and refuses unrecognized files for explicit known-format rules', async () => {
    const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'pixel.png', {
      type: 'image/png',
    })
    const textClaimingImage = new File(['not an image'], 'pixel.png', { type: 'image/png' })
    expect((await validateFileContent(png, 'image/*')).detected).toBe('png')
    await expect(validateFileContent(textClaimingImage, 'image/*')).rejects.toThrow()
  })

  it('checks Office ZIP package parts and rejects an ordinary ZIP renamed as DOCX', async () => {
    const valid = new JSZip()
    valid.file('[Content_Types].xml', '<Types><Override PartName="/word/document.xml"/></Types>')
    valid.file('_rels/.rels', '<Relationships/>')
    valid.file('word/document.xml', '<document/>')
    const validBytes = await valid.generateAsync({ type: 'uint8array' })
    expect(
      (await inspectFileContent(new File([validBytes.buffer as ArrayBuffer], 'form.docx')))
        .consistent,
    ).toBe(true)

    const invalid = new JSZip()
    invalid.file('readme.txt', 'just a ZIP')
    const invalidBytes = await invalid.generateAsync({ type: 'uint8array' })
    await expect(
      validateFileContent(new File([invalidBytes.buffer as ArrayBuffer], 'form.docx'), '.docx'),
    ).rejects.toThrow(/Office package|manifest/i)
  })

  it('accepts a Windows upload only when the Defender bridge confirms a clean result', async () => {
    const file = new File(['%PDF-1.7\nSafe sample'], 'safe.pdf', { type: 'application/pdf' })
    const scanFile = vi.fn(async () => ({ status: 'clean' as const }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { scanFile } })
    await expect(validateFileContent(file, '.pdf')).resolves.toMatchObject({
      detected: 'pdf',
      consistent: true,
    })
    expect(scanFile).toHaveBeenCalledOnce()

    for (const status of ['threat', 'unavailable'] as const) {
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value: { scanFile: vi.fn(async () => ({ status, detail: `scan ${status}` })) },
      })
      await expect(validateFileContent(file, '.pdf')).rejects.toThrow(`scan ${status}`)
    }
  })
})
