/** Consume a shell's fresh-document marker once, so later reloads can recover this session's draft. */
export function consumeNewDocumentFlag(href: string, replaceUrl: (href: string) => void): boolean {
  const url = new URL(href)
  if (url.searchParams.get('newDocument') !== '1') return false
  url.searchParams.delete('newDocument')
  try {
    replaceUrl(url.href)
  } catch {
    /* a restricted host may not permit history replacement */
  }
  return true
}
