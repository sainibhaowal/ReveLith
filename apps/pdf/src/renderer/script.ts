/**
 * Script classification for the OCR text layer.
 *
 * The viewer joins recognized "words" with a space. That is right for
 * space-separated scripts and wrong for the ones that do not use spaces: a
 * CJK line recognized as several engine words would gain phantom spaces and
 * break search. Hangul is deliberately included with the space-separated
 * scripts — Korean does use spaces between words.
 */

/** Unicode script of a code point, coarse but sufficient for the space rule. */
export type Script =
  | 'latin'
  | 'greek'
  | 'cyrillic'
  | 'hebrew'
  | 'arabic'
  | 'devanagari'
  | 'thai'
  | 'han'
  | 'kana'
  | 'hangul'
  | 'other'

interface Range {
  from: number
  to: number
  script: Script
}

/** Coarse block table; anything unlisted is 'other' (treated as spaced). */
const RANGES: readonly Range[] = [
  { from: 0x0041, to: 0x024f, script: 'latin' }, // Latin-1 supplement … Latin Extended-B
  { from: 0x1e00, to: 0x1eff, script: 'latin' }, // Latin Extended Additional
  { from: 0x0370, to: 0x03ff, script: 'greek' },
  { from: 0x1f00, to: 0x1fff, script: 'greek' }, // Greek Extended
  { from: 0x0400, to: 0x052f, script: 'cyrillic' },
  { from: 0x0590, to: 0x05ff, script: 'hebrew' },
  { from: 0x0600, to: 0x06ff, script: 'arabic' },
  { from: 0x0750, to: 0x077f, script: 'arabic' },
  { from: 0x0900, to: 0x097f, script: 'devanagari' },
  { from: 0x0e00, to: 0x0e7f, script: 'thai' },
  { from: 0x3040, to: 0x309f, script: 'kana' }, // Hiragana
  { from: 0x30a0, to: 0x30ff, script: 'kana' }, // Katakana
  { from: 0x3400, to: 0x4dbf, script: 'han' }, // CJK Extension A
  { from: 0x4e00, to: 0x9fff, script: 'han' }, // CJK Unified Ideographs
  { from: 0xf900, to: 0xfaff, script: 'han' }, // CJK Compatibility Ideographs
  { from: 0xac00, to: 0xd7af, script: 'hangul' }, // Hangul syllables
  { from: 0xff01, to: 0xff60, script: 'han' }, // fullwidth ASCII forms
  { from: 0xffe0, to: 0xffe6, script: 'han' }, // fullwidth currency marks
  { from: 0xff61, to: 0xff9f, script: 'kana' }, // halfwidth katakana
]

/** Script of one code point. */
export function scriptOf(code: number | undefined): Script {
  if (code === undefined) return 'other'
  for (const range of RANGES) {
    if (code >= range.from && code <= range.to) return range.script
  }
  return 'other'
}

/** Scripts written without spaces between words. Hangul is NOT one of them. */
export function isNoSpaceScript(script: Script): boolean {
  return script === 'han' || script === 'kana' || script === 'thai'
}
