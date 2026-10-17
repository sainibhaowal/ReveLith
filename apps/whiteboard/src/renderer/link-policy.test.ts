import { describe, expect, it } from 'vitest'
import { REVELITH_ISSUES, REVELITH_REPO, scrubExternalLinks } from './board-engine/link-policy'

function helpDialogDom(): HTMLDivElement {
  const root = document.createElement('div')
  root.innerHTML = `
    <div class="HelpDialog">
      <div class="HelpDialog__header">
        <a class="HelpDialog__btn" href="https://docs.excalidraw.com">Documentation</a>
        <a class="HelpDialog__btn" href="https://plus.excalidraw.com/blog">Read our blog</a>
        <a class="HelpDialog__btn" href="https://github.com/excalidraw/excalidraw/issues">Found an issue? Submit</a>
        <a class="HelpDialog__btn" href="https://youtube.com/@excalidraw">YouTube</a>
      </div>
      <div class="Modal">
        <a href="https://libraries.excalidraw.com">Publish</a>
        <a href="https://github.com/someone/project">User link in dialog</a>
      </div>
    </div>`
  return root
}

describe('ReveLith link policy', () => {
  it('removes video/blog buttons and redirects docs/issues to ReveLith', () => {
    const root = helpDialogDom()
    const result = scrubExternalLinks(root)
    const hrefs = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).not.toContain('https://youtube.com/@excalidraw')
    expect(hrefs).not.toContain('https://plus.excalidraw.com/blog')
    expect(hrefs).toContain(REVELITH_REPO)
    expect(hrefs).toContain(REVELITH_ISSUES)
    expect(result.removed).toBe(2)
    expect(result.rewritten).toBe(3)
  })

  it('leaves user content and canvas links untouched', () => {
    const root = document.createElement('div')
    root.innerHTML = `<div class="excalidraw-hyperlinkContainer"><a href="https://example.com/x">user link</a></div>`
    const result = scrubExternalLinks(root)
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.com/x')
    expect(result).toEqual({ rewritten: 0, removed: 0 })
  })
})
