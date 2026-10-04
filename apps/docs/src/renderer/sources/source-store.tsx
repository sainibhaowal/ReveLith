import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { ipcRenderer } from 'electron'

export interface TextChunk {
  id: string
  text: string
  pageNumber?: number
  bbox?: { x: number; y: number; width: number; height: number }
}

export interface SourceItem {
  id: string
  docSessionId: string
  fileName: string
  filePath: string
  mimeType: string
  size: number
  addedAt: number
  contentHash: string
  extractedText: string
  chunks: TextChunk[]
  metadata: Record<string, unknown>
}

interface SourceStoreState {
  docSessionId: string | null
  sources: SourceItem[]
  groundedWrite: boolean
  filters: {
    dateRange: { from: number | null; to: number | null }
    categories: string[]
    types: string[]
    search: string
    sortBy: 'date' | 'name' | 'type' | 'size'
    sortOrder: 'asc' | 'desc'
  }
  addSource: (
    item: Omit<SourceItem, 'id' | 'docSessionId' | 'addedAt' | 'contentHash'>,
  ) => Promise<SourceItem>
  removeSource: (sourceId: string) => Promise<void>
  clearAll: () => Promise<void>
  setGroundedWrite: (enabled: boolean) => void
  setDocSessionId: (id: string | null) => void
  setFilters: (filters: Partial<SourceStoreState['filters']>) => void
  getFilteredSources: () => SourceItem[]
  getGroundedContext: (maxChars?: number) => string
}

const SourceStoreContext = createContext<SourceStoreState | null>(null)

export function SourceStoreProvider({
  children,
  initialDocSessionId,
}: {
  children: ReactNode
  initialDocSessionId?: string
}) {
  const [docSessionId, setDocSessionId] = useState<string | null>(initialDocSessionId ?? null)
  const [sources, setSources] = useState<SourceItem[]>([])
  const [groundedWrite, setGroundedWrite] = useState(false)
  const [filters, setFilters] = useState<SourceStoreState['filters']>({
    dateRange: { from: null, to: null },
    categories: [],
    types: [],
    search: '',
    sortBy: 'date',
    sortOrder: 'desc',
  })

  useEffect(() => {
    if (!docSessionId) {
      setSources([])
      return
    }
    loadSources()
  }, [docSessionId])

  const loadSources = async () => {
    if (!docSessionId) return
    try {
      const result = await ipcRenderer.invoke('docs:source-list', docSessionId)
      setSources(result)
    } catch (e) {
      console.error('Failed to load sources:', e)
    }
  }

  const addSource = async (
    item: Omit<SourceItem, 'id' | 'docSessionId' | 'addedAt' | 'contentHash'>,
  ): Promise<SourceItem> => {
    if (!docSessionId) throw new Error('No document session')
    const result = await ipcRenderer.invoke('docs:source-add', docSessionId, item)
    await loadSources()
    return result
  }

  const removeSource = async (sourceId: string): Promise<void> => {
    if (!docSessionId) return
    await ipcRenderer.invoke('docs:source-remove', docSessionId, sourceId)
    await loadSources()
  }

  const clearAll = async (): Promise<void> => {
    if (!docSessionId) return
    await ipcRenderer.invoke('docs:source-clear', docSessionId)
    await loadSources()
  }

  const getFilteredSources = useCallback(() => {
    let result = [...sources]

    if (filters.dateRange.from) {
      result = result.filter((s) => s.addedAt >= filters.dateRange.from!)
    }
    if (filters.dateRange.to) {
      result = result.filter((s) => s.addedAt <= filters.dateRange.to!)
    }
    if (filters.categories.length) {
      result = result.filter((s) => filters.categories.includes(s.metadata.category as string))
    }
    if (filters.types.length) {
      result = result.filter((s) => filters.types.includes(s.mimeType))
    }
    if (filters.search) {
      const q = filters.search.toLowerCase()
      result = result.filter(
        (s) =>
          s.fileName.toLowerCase().includes(q) ||
          s.extractedText.toLowerCase().includes(q) ||
          s.chunks.some((c) => c.text.toLowerCase().includes(q)),
      )
    }

    result.sort((a, b) => {
      const dir = filters.sortOrder === 'asc' ? 1 : -1
      switch (filters.sortBy) {
        case 'date':
          return dir * (a.addedAt - b.addedAt)
        case 'name':
          return dir * a.fileName.localeCompare(b.fileName)
        case 'type':
          return dir * a.mimeType.localeCompare(b.mimeType)
        case 'size':
          return dir * (a.size - b.size)
      }
    })

    return result
  }, [sources, filters])

  const getGroundedContext = useCallback(
    (maxChars = 8000) => {
      const filtered = getFilteredSources()
      let context = ''
      for (const s of filtered) {
        const chunk = s.extractedText.slice(0, Math.floor(maxChars / filtered.length))
        context += `\n\n[Source: ${s.fileName}]\n${chunk}`
        if (context.length >= maxChars) break
      }
      return context
    },
    [getFilteredSources],
  )

  const value: SourceStoreState = {
    docSessionId,
    sources,
    groundedWrite,
    filters,
    addSource,
    removeSource,
    clearAll,
    setGroundedWrite,
    setDocSessionId,
    setFilters: (f) => setFilters((prev) => ({ ...prev, ...f })),
    getFilteredSources,
    getGroundedContext,
  }

  return <SourceStoreContext.Provider value={value}>{children}</SourceStoreContext.Provider>
}

export function useSourceStore(): SourceStoreState {
  const ctx = useContext(SourceStoreContext)
  if (!ctx) throw new Error('useSourceStore must be used within SourceStoreProvider')
  return ctx
}
