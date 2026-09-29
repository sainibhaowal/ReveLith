/**
 * Builtin number format ids 14 and 22 — the asterisked short-date entries in
 * the Format Cells dialog — are rendered from the operating system's regional
 * short-date setting, not from a fixed pattern. The region drives the pattern,
 * not the UI language: an English UI on a yyyy/m/d region still shows yyyy/m/d.
 *
 * So the pattern has to be read from the locale at startup and compared against
 * what a workbook stores, rather than assumed.
 */

export const DEFAULT_SHORT_DATE = 'm/d/yyyy'

const PART_TOKENS: Record<string, ((value: string) => string) | undefined> = {
  // A two-digit year field in the locale means the pattern should use "yy"
  year: (value) => (value.length === 2 ? 'yy' : 'yyyy'),
  // A zero-prefixed month field means "mm", otherwise "m"
  month: (value) => (value.startsWith('0') ? 'mm' : 'm'),
  day: (value) => (value.startsWith('0') ? 'dd' : 'd'),
}

/**
 * The short-date pattern the system would use for `systemLocale`.
 *
 * The language has to be derived from the region before asking Intl for a date
 * format. Passing the raw tag ("en-CN") or one with a script subtag makes Intl
 * fall back to bare "en", which yields a US pattern on a Chinese machine and the
 * comparison in `shortDateNumFmtId` then never matches.
 */
export function shortDatePatternForSystemLocale(systemLocale: string): string {
  try {
    const region = new Intl.Locale(systemLocale).region ?? 'US'
    const language = new Intl.Locale('und', { region }).maximize().language
    const parts = new Intl.DateTimeFormat(`${language}-${region}`, {
      calendar: 'gregory',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date(2016, 2, 9))
    const pattern = parts
      .map((part) => PART_TOKENS[part.type]?.(part.value) ?? part.value.replace(/[^./\- ,]/g, ''))
      .join('')
    // Guard against a locale whose formatted parts are not date parts at all;
    // falling back beats writing a pattern the save side cannot map back.
    return /^(?=.*y)(?=.*m)(?=.*d)[ymd./\- ,]+$/.test(pattern) ? pattern : DEFAULT_SHORT_DATE
  } catch {
    return DEFAULT_SHORT_DATE
  }
}

let systemShortDate = DEFAULT_SHORT_DATE

export function setSystemShortDate(pattern: string): void {
  systemShortDate = pattern
}

export function getSystemShortDate(): string {
  return systemShortDate
}

/**
 * The builtin id to write for a pattern, or undefined when the pattern is a
 * custom one and must be stored as a numFmt.
 *
 * Storing the builtin id is what keeps the cell locale-reactive: a workbook
 * opened on another machine re-renders the date in that machine's format.
 */
export function shortDateNumFmtId(pattern: string): number | undefined {
  const shortDate = getSystemShortDate()
  if (pattern === shortDate) return 14
  // "hh:mm" is the current load-side resolution; "h:mm" is what documents saved
  // before the leading-zero calibration still carry.
  if (pattern === `${shortDate} hh:mm` || pattern === `${shortDate} h:mm`) return 22
  return undefined
}
