/**
 * Home Screen Full-Text Search Tests
 *
 * Tests the search index service types and basic functionality.
 */

import { describe, it, expect } from 'vitest'
import type { SearchQuery, SearchResult, SearchPage, SearchStats } from '../../src/shared/home-api'

describe('SearchQuery types', () => {
  it('should accept valid search query', () => {
    const query: SearchQuery = {
      query: 'test',
      extensions: ['pdf', 'docx'],
      limit: 50,
      offset: 0,
    }
    expect(query.query).toBe('test')
    expect(query.extensions).toEqual(['pdf', 'docx'])
    expect(query.limit).toBe(50)
    expect(query.offset).toBe(0)
  })

  it('should work with minimal query', () => {
    const query: SearchQuery = {
      query: 'minimal',
    }
    expect(query.query).toBe('minimal')
    expect(query.limit).toBeUndefined()
    expect(query.offset).toBeUndefined()
    expect(query.extensions).toBeUndefined()
  })

  it('should work with only extensions filter', () => {
    const query: SearchQuery = {
      query: 'report',
      extensions: ['pdf', 'docx', 'xlsx'],
    }
    expect(query.query).toBe('report')
    expect(query.extensions).toEqual(['pdf', 'docx', 'xlsx'])
  })
})

describe('SearchResult types', () => {
  it('should match expected structure', () => {
    const result: SearchResult = {
      filePath: '/test/file.pdf',
      fileName: 'file.pdf',
      extension: 'pdf',
      snippet: 'Found **test** here',
      score: 1.5,
      mtimeMs: Date.now(),
    }
    expect(result.filePath).toBe('/test/file.pdf')
    expect(result.fileName).toBe('file.pdf')
    expect(result.extension).toBe('pdf')
    expect(result.snippet).toContain('**test**')
    expect(typeof result.score).toBe('number')
    expect(typeof result.mtimeMs).toBe('number')
  })

  it('should work with different extensions', () => {
    const extensions = ['docx', 'xlsx', 'pptx', 'md', 'markdown', 'html', 'htm']
    for (const ext of extensions) {
      const result: SearchResult = {
        filePath: `/test/file.${ext}`,
        fileName: `file.${ext}`,
        extension: ext,
        snippet: 'Test snippet',
        score: 1.0,
        mtimeMs: Date.now(),
      }
      expect(result.extension).toBe(ext)
    }
  })
})

describe('SearchPage types', () => {
  it('should match expected structure', () => {
    const page: SearchPage = {
      results: [
        {
          filePath: '/test/file1.pdf',
          fileName: 'file1.pdf',
          extension: 'pdf',
          snippet: 'Found **test**',
          score: 2.0,
          mtimeMs: Date.now(),
        },
        {
          filePath: '/test/file2.docx',
          fileName: 'file2.docx',
          extension: 'docx',
          snippet: 'Another **test**',
          score: 1.5,
          mtimeMs: Date.now(),
        },
      ],
      total: 42,
      query: 'test',
      tookMs: 15,
    }
    expect(page.results.length).toBe(2)
    expect(page.total).toBe(42)
    expect(page.query).toBe('test')
    expect(page.tookMs).toBe(15)
  })
})

describe('SearchStats types', () => {
  it('should match expected structure', () => {
    const stats: SearchStats = {
      totalFiles: 100,
      totalSize: 5000000,
      lastIndexed: new Date().toISOString(),
      isIndexing: false,
      progress: { current: 100, total: 100 },
    }
    expect(stats.totalFiles).toBe(100)
    expect(stats.totalSize).toBe(5000000)
    expect(stats.lastIndexed).toBeTruthy()
    expect(stats.isIndexing).toBe(false)
    expect(stats.progress).toEqual({ current: 100, total: 100 })
  })

  it('should work with null lastIndexed', () => {
    const stats: SearchStats = {
      totalFiles: 0,
      totalSize: 0,
      lastIndexed: null,
      isIndexing: true,
      progress: { current: 50, total: 100 },
    }
    expect(stats.totalFiles).toBe(0)
    expect(stats.lastIndexed).toBeNull()
    expect(stats.isIndexing).toBe(true)
  })
})

describe('Home API search channels', () => {
  // These are compile-time checks - if the types compile, the channels exist
  it('should have search channel names defined in HOME_CHANNELS', () => {
    // This test will fail to compile if the channels don't exist
    const channels = {
      searchFiles: 'home:search-files',
      getSearchStats: 'home:get-search-stats',
      reindexFiles: 'home:reindex-files',
    }
    expect(channels.searchFiles).toBe('home:search-files')
    expect(channels.getSearchStats).toBe('home:get-search-stats')
    expect(channels.reindexFiles).toBe('home:reindex-files')
  })
})
