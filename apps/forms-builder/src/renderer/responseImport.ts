import type { FormSubmission } from './types'

export interface PackagedResponseAttachment {
  attachmentId?: string
  name: string
  mimeType: string
  size: number
  lastModified: number
  dataBase64: string
}

export interface ParsedResponsePackage {
  format: 'revelith-form-responses' | 'revelith-offline-response'
  formId: string
  responses: FormSubmission[]
  attachments: PackagedResponseAttachment[]
}

const MAX_RESPONSE_COUNT = 10_000
const MAX_ATTACHMENT_COUNT = 10_000
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseAttachment(value: unknown, requireId: boolean): PackagedResponseAttachment {
  if (!record(value)) throw new Error('A response attachment entry is malformed.')
  const attachmentId = value.attachmentId
  const name = value.name
  const mimeType = value.mimeType ?? value.type
  const size = value.size
  const lastModified = value.lastModified ?? 0
  const dataBase64 = value.dataBase64
  if ((requireId && (typeof attachmentId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(attachmentId)))
    || typeof name !== 'string' || !name || name.length > 255
    || typeof mimeType !== 'string' || mimeType.length > 255
    || !Number.isSafeInteger(size) || Number(size) < 0 || Number(size) > MAX_ATTACHMENT_BYTES
    || !Number.isSafeInteger(lastModified) || Number(lastModified) < 0
    || typeof dataBase64 !== 'string' || dataBase64.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 + 8) {
    throw new Error('A response attachment has invalid metadata or exceeds the 100 MB import limit.')
  }
  return { ...(typeof attachmentId === 'string' ? { attachmentId } : {}), name, mimeType, size: Number(size), lastModified: Number(lastModified), dataBase64 }
}

function parseSubmission(value: unknown): FormSubmission {
  if (!record(value) || typeof value.id !== 'string' || !value.id || value.id.length > 160
    || typeof value.submittedAt !== 'string' || !Number.isFinite(Date.parse(value.submittedAt))
    || !record(value.answers)) {
    throw new Error('A response entry is malformed or missing its answers.')
  }
  return { id: value.id, submittedAt: value.submittedAt, answers: value.answers }
}

function parseAttachments(value: unknown, requireId: boolean): PackagedResponseAttachment[] {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENT_COUNT) throw new Error('This response package contains too many attachments.')
  const attachments = value.map((item) => parseAttachment(item, requireId))
  const totalBytes = attachments.reduce((total, item) => total + item.size, 0)
  if (totalBytes > MAX_ATTACHMENT_BYTES) throw new Error('Attachments in a response package exceed the 100 MB import limit.')
  return attachments
}

export function parseResponsePackageJson(json: string, expectedFormId: string): ParsedResponsePackage {
  let root: unknown
  try { root = JSON.parse(json) as unknown } catch { throw new Error('This file is not valid response JSON.') }
  if (!record(root) || !record(root.form) || typeof root.form.id !== 'string') throw new Error('This file is not a ReveLith response package.')
  if (root.form.id !== expectedFormId) throw new Error('These responses belong to a different form. Open the matching form before importing them.')

  if (root.format === 'revelith-form-responses' && root.version === 2) {
    if (!Array.isArray(root.responses) || root.responses.length > MAX_RESPONSE_COUNT) {
      throw new Error('This response package exceeds the supported response or attachment count.')
    }
    return {
      format: root.format,
      formId: root.form.id,
      responses: root.responses.map(parseSubmission),
      attachments: parseAttachments(root.attachments, true),
    }
  }

  if (root.format === 'revelith-offline-response' && root.version === 1) {
    if (!record(root.response)) throw new Error('This offline response package is missing its response.')
    const response = parseSubmission(root.response)
    const rawAttachments = root.response.attachments ?? []
    return {
      format: root.format,
      formId: root.form.id,
      responses: [response],
      attachments: parseAttachments(rawAttachments, false),
    }
  }

  throw new Error('Unsupported response package version. Export a response JSON file from ReveLith Forms Builder or an offline form.')
}

export function decodeResponseAttachment(attachment: PackagedResponseAttachment): Uint8Array {
  let binary: string
  try { binary = atob(attachment.dataBase64) } catch { throw new Error(`The response file “${attachment.name}” is not valid Base64 data.`) }
  if (binary.length !== attachment.size) throw new Error(`The response file “${attachment.name}” does not match its declared size.`)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}
