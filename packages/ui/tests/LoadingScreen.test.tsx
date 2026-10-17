import { describe, expect, it } from 'vitest'
import { LoadingScreen } from '../src/LoadingScreen'

describe('LoadingScreen', () => {
  it('shows the app-specific identity and loading message accessibly', () => {
    const element = LoadingScreen({
      title: 'ReveLith Tasks',
      message: 'Loading your tasks',
    }) as unknown as {
      props: Record<string, unknown>
    }
    const children = element.props.children
    const textContent = (node: unknown): string => {
      if (typeof node === 'string' || typeof node === 'number') return String(node)
      if (Array.isArray(node)) return node.map(textContent).join('')
      if (node && typeof node === 'object' && 'props' in node) {
        return textContent((node as { props: { children?: unknown } }).props.children)
      }
      return ''
    }

    expect(element.props.role).toBe('status')
    expect(element.props['aria-live']).toBe('polite')
    expect(element.props['aria-label']).toBe('ReveLith Tasks: Loading your tasks')
    expect(textContent(children)).toContain('ReveLith Tasks')
    expect(textContent(children)).toContain('Loading your tasks')
    expect(textContent(children)).toBe('ReveLith TasksLoading your tasks...')
  })
})
