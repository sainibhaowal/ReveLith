/**
 * ECMA-376 Part 1 §22.4.2.4: characters that are illegal in XML — and CR, which
 * an XML parser would fold into LF — are stored inside cell text as `_xHHHH_`.
 * A literal `_x` that would itself read as an escape is written `_x005F_`.
 *
 * Formula text never carries these escapes: it is stored as an expression, not
 * as a shared string, so escaping it would corrupt the formula.
 */

/** Decode `_xHHHH_` sequences. Surrogate escapes are left as-is. */
export function decodeXlsxEscapes(text: string): string {
  if (!text.includes('_x')) return text
  return text.replace(/_x([0-9A-Fa-f]{4})_/g, (match, hex: string) => {
    const code = Number.parseInt(hex, 16)
    // A lone surrogate has no single-character representation. Passing it
    // through keeps the text intact instead of producing a replacement char.
    return code >= 0xd800 && code <= 0xdfff ? match : String.fromCharCode(code)
  })
}

export function encodeXlsxEscapes(text: string): string {
  return (
    text
      // escape a literal "_x" that would otherwise start a bogus sequence
      .replace(/_(?=x[0-9A-Fa-f]{4}_)/g, '_x005F_')
      .replace(
        // eslint-disable-next-line no-control-regex -- the control range is precisely what is being escaped here
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\r]/g,
        (character) => `_x${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`,
      )
  )
}
