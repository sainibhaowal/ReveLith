import JSZip from 'jszip'

export type DetectedFileKind = 'pdf' | 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'zip' | 'text' | 'unknown'

export interface FileInspection {
  detected: DetectedFileKind
  extension: string
  consistent: boolean
  verified: boolean
  message?: string
}

const EXTENSION_KIND: Record<string, DetectedFileKind> = {
  pdf: 'pdf', png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp', bmp: 'bmp', zip: 'zip', docx: 'zip', xlsx: 'zip', pptx: 'zip', odt: 'zip', ods: 'zip', odp: 'zip', txt: 'text', csv: 'text', md: 'text', json: 'text', xml: 'text', html: 'text',
}
const MIME_KIND: Record<string, DetectedFileKind> = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'application/zip': 'zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'zip', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'zip', 'text/plain': 'text', 'text/csv': 'text', 'application/json': 'text', 'text/markdown': 'text', 'text/html': 'text',
}

function detect(bytes: Uint8Array): DetectedFileKind {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'pdf'
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.slice(0, 6)))) return 'gif'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp'
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp'
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [3, 5, 7].includes(bytes[2]!) && [4, 6, 8].includes(bytes[3]!)) return 'zip'
  if (bytes.length && !bytes.includes(0)) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return 'text' } catch { /* binary or legacy-encoded content */ }
  }
  return 'unknown'
}

/** Checks file bytes against recognizable formats; MIME and extension are treated as claims only. */
export async function inspectFileContent(file: Pick<File, 'name' | 'type' | 'slice' | 'size'>): Promise<FileInspection> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const expectedKinds = [EXTENSION_KIND[extension], MIME_KIND[file.type.toLowerCase()]].filter((kind): kind is DetectedFileKind => Boolean(kind))
  const bytes = new Uint8Array(await file.slice(0, 8192).arrayBuffer())
  const detected = detect(bytes)
  if (detected === 'zip' && /\.(docx|xlsx|pptx|odt|ods|odp)$/i.test(file.name)) {
    const packageResult = await inspectOfficePackage(file)
    if (!packageResult.ok) return { detected, extension, consistent: false, verified: true, message: packageResult.message }
  }
  const verified = detected !== 'unknown'
  const inconsistent = verified && expectedKinds.some((expected) => expected !== detected)
  const consistent = !inconsistent
  const expected = expectedKinds.find((kind) => kind !== detected)
  return { detected, extension, consistent, verified, ...(inconsistent ? { message: `The file content looks like ${detected}, but its extension or declared type indicates ${expected}.` } : !verified && expectedKinds.length ? { message: 'The file type could not be confirmed from its contents.' } : {}) }
}

/** Inspect the ZIP directory and required package parts without extracting files to disk. */
async function inspectOfficePackage(file: Pick<File, 'name' | 'slice' | 'size'>): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    if (file.size > 100 * 1024 * 1024) return { ok: false, message: 'Office packages larger than 100 MB cannot be verified safely.' }
    const archive = await JSZip.loadAsync(await file.slice(0, file.size).arrayBuffer(), { createFolders: false })
    const entries = Object.values(archive.files).filter((entry) => !entry.dir)
    if (entries.length > 20_000) return { ok: false, message: 'The Office package contains too many entries to verify safely.' }
    let expandedBytes = 0
    for (const entry of entries) {
      const originalName = entry.unsafeOriginalName ?? entry.name
      const declaredSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
      expandedBytes += declaredSize
      if (expandedBytes > 500 * 1024 * 1024) return { ok: false, message: 'The Office package expands beyond the 500 MB safety limit.' }
      if (originalName.startsWith('/') || originalName.split('/').includes('..')) return { ok: false, message: 'The Office package contains an unsafe path.' }
    }
    const names = new Set(entries.map((entry) => entry.name))
    const readVerifiedText = async (path: string, maxBytes: number): Promise<string | null> => {
      const entry = archive.file(path)
      if (!entry) return null
      const metadata = (entry as unknown as { _data?: { uncompressedSize?: number; crc32?: number } })._data
      if ((metadata?.uncompressedSize ?? 0) > maxBytes) throw new Error('Package XML part exceeds its safety limit.')
      const stream = (entry as unknown as { internalStream: (type: 'uint8array') => { on: (event: string, callback: (value: Uint8Array | Error) => void) => unknown; resume: () => void; _worker: { error: (error: Error) => void } } }).internalStream('uint8array')
      return new Promise<string>((resolve, reject) => {
        const chunks: Uint8Array[] = []
        let size = 0
        let failed = false
        stream.on('data', (value) => {
          if (failed || value instanceof Error) return
          size += value.byteLength
          if (size > maxBytes) {
            failed = true
            const error = new Error('Expanded package XML part exceeds its safety limit.')
            stream._worker.error(error)
            reject(error)
            return
          }
          chunks.push(value)
        })
        stream.on('error', (value) => { if (!failed) { failed = true; reject(value instanceof Error ? value : new Error('Package XML could not be decompressed.')) } })
        stream.on('end', () => {
          if (failed) return
          const content = new Uint8Array(size)
          let offset = 0
          for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength }
          if (metadata?.crc32 !== undefined && crc32(content) !== metadata.crc32) { failed = true; reject(new Error('Package XML checksum did not match.')); return }
          try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(content)) } catch (error) { reject(error) }
        })
        stream.resume()
      })
    }
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (['docx', 'xlsx', 'pptx'].includes(extension ?? '')) {
      if (!names.has('[Content_Types].xml') || !names.has('_rels/.rels')) return { ok: false, message: 'This ZIP does not contain the required Office package manifest and relationships.' }
      const mainPart = extension === 'docx' ? 'word/document.xml' : extension === 'xlsx' ? 'xl/workbook.xml' : 'ppt/presentation.xml'
      if (!names.has(mainPart)) return { ok: false, message: `This ${extension.toUpperCase()} package is missing ${mainPart}.` }
      const contentTypes = await readVerifiedText('[Content_Types].xml', 2 * 1024 * 1024)
      const documentXml = await readVerifiedText(mainPart, 50 * 1024 * 1024)
      if (!contentTypes || !documentXml || !/<(?:\w+:)?Types\b/.test(contentTypes) || !contentTypes.includes(`/${mainPart}`) || !/<(?:\w+:)?(?:document|workbook|presentation)\b/.test(documentXml)) return { ok: false, message: 'The Office package manifest or main document part is malformed.' }
    } else {
      const mime = await readVerifiedText('mimetype', 256)
      const expected = extension === 'odt' ? 'application/vnd.oasis.opendocument.text' : extension === 'ods' ? 'application/vnd.oasis.opendocument.spreadsheet' : 'application/vnd.oasis.opendocument.presentation'
      if (mime?.trim() !== expected || !names.has('content.xml') || !(await readVerifiedText('content.xml', 50 * 1024 * 1024))) return { ok: false, message: `This ${extension.toUpperCase()} file is missing a valid mimetype or content.xml.` }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: 'The Office file is not a valid readable ZIP package (it may be damaged, encrypted, or incomplete).' }
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = -1
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ -1) >>> 0
}

/** Explicit accept rules reject detectable mismatches, while unknown formats remain usable with a warning. */
export async function validateFileContent(file: File, accept?: string): Promise<FileInspection> {
  const inspection = await inspectFileContent(file)
  if (!inspection.consistent) throw new Error(inspection.message)
  if (window.electronAPI?.scanFile) {
    const scan = await window.electronAPI.scanFile(new Uint8Array(await file.arrayBuffer()))
    if (scan.status !== 'clean') throw new Error(scan.detail || 'The file could not be confirmed malware-free and was not accepted.')
  }
  const rules = (accept ?? '').split(',').map((rule) => rule.trim().toLowerCase()).filter(Boolean)
  const requestedKind = rules.map((rule) => rule.startsWith('.') ? EXTENSION_KIND[rule.slice(1)] : rule.endsWith('/*') ? undefined : MIME_KIND[rule]).find(Boolean)
  const imageOnly = rules.includes('image/*')
  if (requestedKind && !inspection.verified) throw new Error(`This upload requires verifiable ${requestedKind} file content, but the file type could not be confirmed.`)
  if (imageOnly && (!inspection.verified || !['png', 'jpeg', 'gif', 'webp', 'bmp'].includes(inspection.detected))) throw new Error('This upload requires a recognizable image file, but its image content could not be confirmed.')
  if (inspection.verified && requestedKind && requestedKind !== inspection.detected) throw new Error(`This upload requires ${requestedKind} content, but the file contains ${inspection.detected} data.`)
  return inspection
}

