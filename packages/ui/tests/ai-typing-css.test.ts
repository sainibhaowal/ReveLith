/**
 * The "Thinking…" shimmer is design, not an implementation detail: the four
 * newer apps once rendered a third variant (a blue sweep in this file, a
 * gray-to-black sweep in app-chat) while the older apps swept to a light
 * highlight, so the same chat looked different per app. These checks keep one
 * definition, in the shared file, driven by the shared tokens.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const typingCss = read('../src/ai-typing.css')
const tokensCss = read('../src/tokens.css')
const appChat = read('../../../apps/app-chat/src/index.tsx')

describe('shared thinking indicator', () => {
  it('sweeps the label through the shared highlight tokens', () => {
    const label = typingCss.slice(typingCss.indexOf('.ai-typing-label'))
    expect(label).toContain('color: var(--ai-shimmer-base')
    expect(label).toContain('var(--ai-shimmer-hi')
    expect(label).toContain('background-size: 70% 100%')
    expect(label).toContain('animation: revelith-ai-thinking-shimmer 1.2s infinite alternate linear')
  })

  it('keeps its keyframes under package-scoped names', () => {
    // the older apps define ai-thinking-shimmer / ai-dot-* themselves; reusing
    // those names here could reach into them depending on bundle order
    expect(typingCss).toContain('@keyframes revelith-ai-thinking-shimmer')
    expect(typingCss).not.toContain('@keyframes ai-thinking-shimmer')
  })

  it('lights the dots with the brand token and animates both of them', () => {
    expect(typingCss).toMatch(/\.ai-typing-dot-grow,\s*\.ai-typing-dot-shrink \{[^}]*var\(--color-brand-secondary/)
    expect(typingCss).toContain('animation: revelith-ai-dot-grow 2s infinite')
    expect(typingCss).toContain('animation: revelith-ai-dot-shrink 2s infinite')
  })

  it('defines the shimmer tokens for light, dark and the system fallback', () => {
    const definitions = tokensCss.match(/--ai-shimmer-base:/g) ?? []
    const highlights = tokensCss.match(/--ai-shimmer-hi:/g) ?? []
    expect(definitions).toHaveLength(3)
    expect(highlights).toHaveLength(3)
    expect(tokensCss).toContain('--ai-shimmer-base: #666666')
    expect(tokensCss).toContain('--ai-shimmer-hi: #d9d9d9')
    expect(tokensCss).toContain('--ai-shimmer-base: #8a8a8a')
    expect(tokensCss).toContain('--ai-shimmer-hi: #d0d0d0')
  })

  it('leaves the animation to the shared file (no app-chat override)', () => {
    expect(appChat).not.toContain('.ai-typing-label')
    expect(appChat).not.toContain('@keyframes ai-thinking-shimmer')
    expect(appChat).not.toContain('@keyframes ai-dot-grow')
    // only the wrapper the older apps define lives in the panel's own CSS
    expect(appChat).toContain('.revelith-app-chat .ai-typing-row{display:inline-flex;align-items:baseline;gap:8px}')
  })
})
