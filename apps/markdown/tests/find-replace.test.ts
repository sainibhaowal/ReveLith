import { describe, expect, it } from 'vitest'
import { foldCase } from '../src/renderer/components/FindReplaceBar'

describe('Find and Replace helper', () => {
  it('folds case safely', () => {
    expect(foldCase('Hello World')).toBe('hello world')
    expect(foldCase('ABC 123')).toBe('abc 123')
  })
})
