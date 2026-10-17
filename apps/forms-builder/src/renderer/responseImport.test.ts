import { describe, expect, it } from 'vitest'
import { decodeResponseAttachment, parseResponsePackageJson } from './responseImport'

describe('response package import', () => {
  it('reads local response exports with attachment bytes', () => {
    const file = {
      attachmentId: 'file-1',
      name: 'proof.pdf',
      mimeType: 'application/pdf',
      size: 5,
      lastModified: 1,
      dataBase64: 'JVBERi0=',
    }
    const result = parseResponsePackageJson(
      JSON.stringify({
        format: 'revelith-form-responses',
        version: 2,
        form: { id: 'form-1', title: 'Request' },
        responses: [
          {
            id: 'response-1',
            submittedAt: '2026-10-10T10:00:00.000Z',
            answers: { proof: [{ attachmentId: 'file-1', name: 'proof.pdf', size: 5 }] },
          },
        ],
        attachments: [file],
      }),
      'form-1',
    )

    expect(result.responses).toHaveLength(1)
    expect(result.attachments).toHaveLength(1)
    expect([...decodeResponseAttachment(result.attachments[0]!)]).toEqual([37, 80, 68, 70, 45])
  })

  it('reads a response returned by a standalone offline form', () => {
    const result = parseResponsePackageJson(
      JSON.stringify({
        format: 'revelith-offline-response',
        version: 1,
        form: { id: 'form-1', title: 'Request' },
        response: {
          id: 'offline-1',
          submittedAt: '2026-10-10T10:00:00.000Z',
          answers: { proof: [{ name: 'proof.pdf', type: 'application/pdf', size: 5 }] },
          attachments: [
            { name: 'proof.pdf', type: 'application/pdf', size: 5, dataBase64: 'JVBERi0=' },
          ],
        },
      }),
      'form-1',
    )

    expect(result.format).toBe('revelith-offline-response')
    expect(result.responses[0]?.answers.proof).toEqual([
      { name: 'proof.pdf', type: 'application/pdf', size: 5 },
    ])
    expect(result.attachments[0]?.mimeType).toBe('application/pdf')
  })

  it('rejects a response package for another form and invalid attachment bytes', () => {
    const packageJson = JSON.stringify({
      format: 'revelith-form-responses',
      version: 2,
      form: { id: 'another-form' },
      responses: [],
      attachments: [],
    })
    expect(() => parseResponsePackageJson(packageJson, 'form-1')).toThrow(/different form/)

    const invalid = parseResponsePackageJson(
      JSON.stringify({
        format: 'revelith-form-responses',
        version: 2,
        form: { id: 'form-1' },
        responses: [],
        attachments: [
          { attachmentId: 'file-1', name: 'broken.bin', mimeType: '', size: 4, dataBase64: '!!!!' },
        ],
      }),
      'form-1',
    )
    expect(() => decodeResponseAttachment(invalid.attachments[0]!)).toThrow(/valid Base64/)
  })
})
