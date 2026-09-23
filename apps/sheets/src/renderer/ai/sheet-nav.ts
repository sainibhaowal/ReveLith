/** sheetnav:// citation links in AI answers: [C42](sheetnav://C42) jumps the
    grid to the cited range. An optional Sheet! prefix targets another sheet:
    [total](sheetnav://Summary!B2). */

export const SHEET_NAV_SCHEME = 'sheetnav'

export interface SheetNavTarget {
  /** A1 range on the target sheet */
  readonly range: string
  /** Sheet name when the href carries a Sheet! prefix */
  readonly sheetName?: string | undefined
}

/** Parse a sheetnav: href; null when it is not a well-formed citation link */
export function parseSheetNavHref(href: string): SheetNavTarget | null {
  const prefix = `${SHEET_NAV_SCHEME}://`
  if (!href.startsWith(prefix)) return null
  const body = href.slice(prefix.length).trim()
  if (!body) return null
  const bang = body.lastIndexOf('!')
  if (bang < 0) {
    if (!/^[A-Za-z$]{1,3}[0-9]+(?::[A-Za-z$]{1,3}[0-9]+)?$/.test(body)) return null
    return { range: body.toUpperCase() }
  }
  const sheetName = body.slice(0, bang).trim().replace(/^'(.*)'$/, '$1').replace(/''/g, "'")
  const range = body.slice(bang + 1).trim()
  if (!sheetName || !/^[A-Za-z$]{1,3}[0-9]+(?::[A-Za-z$]{1,3}[0-9]+)?$/.test(range)) return null
  return { range: range.toUpperCase(), sheetName }
}
