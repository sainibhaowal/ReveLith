import type { SourceItem } from './types'

export class DocumentSourceStore {
  private sources: Map<string, SourceItem[]> = new Map()

  public getSources(docSessionId: string): SourceItem[] {
    return [...(this.sources.get(docSessionId) || [])]
  }

  public addSource(source: SourceItem): void {
    const list = this.sources.get(source.docSessionId) || []
    const idx = list.findIndex((s) => s.id === source.id)
    if (idx >= 0) {
      list[idx] = { ...source, updatedAt: Date.now() }
    } else {
      list.push(source)
    }
    this.sources.set(source.docSessionId, list)
  }

  public removeSource(docSessionId: string, sourceId: string): boolean {
    const list = this.sources.get(docSessionId)
    if (!list) return false
    const next = list.filter((s) => s.id !== sourceId)
    if (next.length === list.length) return false
    this.sources.set(docSessionId, next)
    return true
  }

  public clearSession(docSessionId: string): void {
    this.sources.delete(docSessionId)
  }

  public searchSources(docSessionId: string, query: string): SourceItem[] {
    const list = this.getSources(docSessionId)
    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter((s) => {
      const matchTitle = s.title.toLowerCase().includes(q)
      const matchSummary = s.summary?.toLowerCase().includes(q)
      const matchAuthors = s.authors.some((a) =>
        `${a.firstName || ''} ${a.lastName}`.toLowerCase().includes(q),
      )
      const matchTags = s.tags?.some((t) => t.toLowerCase().includes(q))
      return matchTitle || matchSummary || matchAuthors || matchTags
    })
  }
}

export const globalDocumentSourceStore = new DocumentSourceStore()
