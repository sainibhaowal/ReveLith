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
 *
 * This hook intercepts clicks on cells with revelith-source:// hyperlinks
 * and routes them through the desktop bridge instead of the default browser.
 */
export function useMatrixCitationOverlay(editor: any) {
  const handleCellClick = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement

    // Try multiple selectors to find cells with citations
    const cell =
      target.closest('[data-revelith-source]') ||
      target.closest('.univer-cell[data-hyperlink]') ||
      target.closest('a[href*="revelith-source://"]')

    if (!cell) return

    // Get hyperlink from various possible attributes
    const hyperlink =
      cell.getAttribute('data-revelith-source') ||
      cell.getAttribute('data-hyperlink') ||
      cell.getAttribute('href')

    if (!hyperlink || !hyperlink.startsWith('revelith-source://')) return

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
