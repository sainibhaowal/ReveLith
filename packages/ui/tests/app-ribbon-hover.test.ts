import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const ribbonCss = read('../src/app-ribbon.css')
const tokensCss = read('../src/tokens.css')

describe('shared ribbon hover colors', () => {
  it('uses the theme-aware subtle surface for action buttons and tabs', () => {
    expect(ribbonCss).toMatch(
      /\.revelith-app-ribbon-actions > button:hover\s*\{\s*background:\s*var\(--surface-subtle,\s*#f3f5f8\);\s*\}/,
    )
    expect(ribbonCss).toMatch(
      /\.revelith-app-ribbon-tabs button:hover\s*\{\s*background:\s*var\(--surface-subtle,\s*#f3f5f8\);/,
    )
  })

  it('keeps dark ribbon hovers subdued instead of falling back to a light fill', () => {
    expect(tokensCss).toMatch(/\[data-theme='dark'\]\s*\{[^}]*--surface-subtle:\s*#2a2a2a/s)
    expect(ribbonCss).not.toContain('var(--surface-hover, #f3f5f8)')
  })
})
