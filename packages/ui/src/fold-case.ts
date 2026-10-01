/**
 * Length-preserving case folding for full-text search.
 *
 * The PDF search index stores a folded copy of each page's text next to the
 * original and maps a hit back to the original by character offset, so the fold
 * MUST keep the string length. `toLowerCase()` does not: it expands 'İ'
 * (U+0130) to two code units, which would shift every later offset on the page
 * and make snippets point at the wrong words.
 *
 * A character whose lowercase form is longer therefore keeps its own form
 * rather than being approximated: 'İ' stays 'İ' instead of becoming 'i', so a
 * search for the letter i does not match a page that only contains the dotted
 * capital, and both stay addressable by their own offsets.
 */

/**
 * Code points that need a same-length case fold `toLowerCase` will not do.
 * Greek final sigma is a case variant of sigma, not a different letter, so
 * folding it is correct; the rest are left alone on purpose.
 */
const SAME_LENGTH_FOLD: Record<string, string> = {
  ς: 'σ', // GREEK SMALL LETTER FINAL SIGMA
}

/**
 * Fold `text` for case-insensitive comparison. The result always has the same
 * length as the input.
 */
export function foldCase(text: string): string {
  if (!text) return text
  const lowered = text.toLowerCase()
  if (lowered.length === text.length) return lowered
  // rare path: only reached when the text contains a length-changing capital
  let out = ''
  for (const ch of text) {
    const mapped = SAME_LENGTH_FOLD[ch]
    if (mapped !== undefined) {
      out += mapped
      continue
    }
    const lower = ch.toLowerCase()
    out += lower.length === ch.length ? lower : ch
  }
  return out
}
