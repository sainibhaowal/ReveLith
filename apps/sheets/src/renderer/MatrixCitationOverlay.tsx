import { useEffect, useCallback } from 'react'

function parseCitationLink(
  hyperlink: string,
): { filePath: string; page: number; snippet: string } | null {
  if (!hyperlink.startsWith('revelith-source://')) return null
  try {
    const url = new URL(hyperlink)
    const encodedPath = url.hostname + url.pathname
    if (!encodedPath) return null
    const pageParam = url.searchParams.get('page')
    const snippetParam = url.searchParams.get('snippet')
    return {
      filePath: decodeURIComponent(encodedPath),
      page: pageParam ? parseInt(pageParam, 10) || 1 : 1,
      snippet: snippetParam ? decodeURIComponent(snippetParam) : '',
    }
  } catch {
    return null
  }
}

/**
 * Matrix citations: clicking a cell carrying a revelith-source:// hyperlink
 * opens the source file through the sheets desktop bridge so the cited
 * passage can be verified at its page.
 */
export function useMatrixCitationOverlay(editor: any) {
  const handleCellClick = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement
    const cell = target.closest('[data-revelith-source]')
    if (!cell) return

    const hyperlink = cell.getAttribute('data-revelith-source') || cell.getAttribute('href')
    if (!hyperlink) return
    const citation = parseCitationLink(hyperlink)
    if (!citation) return

    event.preventDefault()
    event.stopPropagation()
    void window.desktopApi?.openSourceCitation?.(citation).catch((err: unknown) => {
      console.error('Failed to open source citation:', err)
    })
  }, [])

  useEffect(() => {
    if (!editor) return

    const container = editor.getWorksheetContainer?.()
    if (!container) return

    container.addEventListener('click', handleCellClick)
    return () => container.removeEventListener('click', handleCellClick)
  }, [editor, handleCellClick])
}
