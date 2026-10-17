// ReveLith Drawboard — external-link policy for the board chrome.
// The board engine ships hardcoded third-party URLs (help dialog, library
// publishing). This policy rewrites or removes them at the DOM boundary so
// nothing but ReveLith destinations is ever reachable. Canvas element links
// created by the user are left untouched.

export const REVELITH_REPO = 'https://github.com/sainibhaowal/ReveLith'
export const REVELITH_ISSUES = 'https://github.com/sainibhaowal/ReveLith/issues'

const BANNED_HOSTS = /excalidraw\.com|github\.com\/excalidraw|youtube\.com\/@excalidraw|youtu\.be/i

/** Board-chrome scopes only — never the drawing surface or user content. */
const CHROME_SCOPE =
  '.HelpDialog a[href], .Modal a[href], .dropdown-menu a[href], .layer-ui__library a[href], .library-menu a[href]'

export function scrubExternalLinks(root: ParentNode): { rewritten: number; removed: number } {
  let rewritten = 0
  let removed = 0
  const anchors = root.querySelectorAll(CHROME_SCOPE)
  anchors.forEach((node) => {
    const el = node as HTMLAnchorElement
    const href = el.getAttribute('href') ?? ''
    if (!BANNED_HOSTS.test(href)) return
    if (/youtube|blog/i.test(href)) {
      el.remove()
      removed += 1
      return
    }
    el.setAttribute('href', /issues/i.test(href) ? REVELITH_ISSUES : REVELITH_REPO)
    el.setAttribute('rel', 'noopener noreferrer')
    rewritten += 1
  })
  return { rewritten, removed }
}

/** Watch the whole drawboard document: dialogs render outside the board host. */
export function installLinkPolicy(): () => void {
  const root = document.body
  scrubExternalLinks(root)
  const observer = new MutationObserver(() => scrubExternalLinks(root))
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  })
  return () => observer.disconnect()
}
