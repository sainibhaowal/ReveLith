import { describe, expect, it } from 'vitest'
import { isAttachmentReference, matchesAcceptedFiles } from './attachments'

describe('local response attachment contracts', () => {
  it('matches extension, exact MIME, and wildcard MIME restrictions', () => {
    const file = (name: string, type: string) => ({ name, type }) as File
    expect(matchesAcceptedFiles(file('notes.PDF', 'application/pdf'), '.pdf,.docx')).toBe(true)
    expect(matchesAcceptedFiles(file('photo.png', 'image/png'), 'image/*')).toBe(true)
    expect(matchesAcceptedFiles(file('notes.txt', 'text/plain'), 'application/pdf')).toBe(false)
    expect(matchesAcceptedFiles(file('notes.txt', 'text/plain'), '')).toBe(true)
  })

  it('accepts only attachment metadata references as file answers', () => {
    expect(
      isAttachmentReference({
        attachmentId: 'file-1',
        name: 'notes.txt',
        mimeType: 'text/plain',
        size: 12,
        lastModified: 0,
      }),
    ).toBe(true)
    expect(isAttachmentReference({ name: 'notes.txt' })).toBe(false)
    expect(isAttachmentReference(null)).toBe(false)
  })
})
