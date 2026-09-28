/**
 * Word-parity text statistics.
 *
 * Word's CJK rule: Words = Asian characters (counted one by one, punctuation
 * included) + non-Asian words (whitespace/punct-delimited). The dialog also
 * reports the two addends separately : Chinese users care about the
 * Asian-character figure.
 */

// Han (incl. radicals/compat/ext-B+), kana, hangul, bopomofo, CJK symbols
// and punctuation (U+3001 up: the ideographic space stays whitespace),
// fullwidth forms
const ASIAN_PATTERN =
  '[ᄀ-ᇿ⺀-⿟、-〿぀-ヿ㄀-ㄯ㄰-㆏㇀-ㇿ㐀-䶿一-鿿가-힯豈-﫿！-｠￠-￦]|[\\uD840-\\uD87F][\\uDC00-\\uDFFF]'

const NON_ASIAN_WORD_PATTERN = "[A-Za-z0-9À-ɏ]+(?:['\\-][A-Za-z0-9À-ɏ]+)*"

export function asianCharCount(text: string): number {
  if (!text) return 0
  const re = new RegExp(ASIAN_PATTERN, 'g')
  let count = 0
  while (re.exec(text) !== null) {
    count++
  }
  return count
}

export function nonAsianWordCount(text: string): number {
  if (!text) return 0
  const re = new RegExp(NON_ASIAN_WORD_PATTERN, 'g')
  let count = 0
  while (re.exec(text) !== null) {
    count++
  }
  return count
}

/** Word's Words figure: asian chars + non-asian words */
export function countWords(text: string): number {
  if (!text) return 0
  return asianCharCount(text) + nonAsianWordCount(text)
}
