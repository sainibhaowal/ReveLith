/**
 * Capped response reader. A remote image URL is prompt-injectable (it arrives
 * from AI tool calls), so the byte count is bounded before anything is decoded
 * or written to disk: a hostile or misconfigured endpoint must not be able to
 * stream gigabytes into the editor.
 */

/**
 * Upper bound for a single downloaded image (20 MB). Larger than any browser
 * asset, small enough that a runaway response cannot exhaust memory.
 */
export const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024

/**
 * Read a Response body, throwing when it exceeds `max` bytes. Streams in
 * chunks so an oversized body is abandoned early instead of buffered whole.
 */
export async function readBodyCapped(response: Response, max: number): Promise<Uint8Array> {
  const body = response.body
  if (!body) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.byteLength > max) throw new Error(`response exceeded ${max} bytes`)
    return buffer
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > max) {
        await reader.cancel().catch(() => {})
        throw new Error(`response exceeded ${max} bytes`)
      }
      chunks.push(value)
    }
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}
