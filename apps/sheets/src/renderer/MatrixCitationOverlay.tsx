import { useEffect, useRef, useCallback } from 'react'

interface MatrixCitationOverlayProps {
  editor: any // Univer editor instance
  onClose?: () => void
}

export function MatrixCitationOverlay({ editor, onClose }: MatrixCitationOverlayProps) {
  // const t = useI18n() // reserved for future use
  const overlayRef = useRef<HTMLDivElement>(null)

  // Listen for clicks on cells with revelith-source:// hyperlinks
  const handleCellClick = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement
    const cell = target.closest('.cell-with-citation')
    if (!cell) return

    const hyperlink = cell.getAttribute('data-revelith-source')
    if (!hyperlink) return

    event.preventDefault()
    event.stopPropagation()

    // Parse the revelith-source:// URL
    // Format: revelith-source://<encodedPath>?page=<n>&snippet=<encodedSnippet>
    try {
      const url = new URL(hyperlink)
      if (url.protocol !== 'revelith-source:') return

      const encodedPath = url.hostname + url.pathname
      const page = url.searchParams.get('page')
      const snippet = url.searchParams.get('snippet')

      if (!encodedPath) return

      const filePath = decodeURIComponent(encodedPath)
      const pageNum = page ? parseInt(page, 10) : 1
      const snippetText = snippet ? decodeURIComponent(snippet) : ''

      // Emit event to main process to open PDF at page
      const { ipcRenderer } = require('electron')
      ipcRenderer.send('sheets:open-source-citation', {
        filePath,
        page: pageNum,
        snippet: snippetText,
      })
    } catch (err) {
      console.error('Failed to parse citation link:', err)
    }
  }, [])

  useEffect(() => {
    if (!editor) return

    // Add click listener to the worksheet area
    const container = editor.getWorksheetContainer?.()
    if (!container) return

    container.addEventListener('click', handleCellClick)
    return () => container.removeEventListener('click', handleCellClick)
  }, [editor, handleCellClick])

  // Listen for hover to show citation preview tooltip
  const handleMouseOver = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement
    const cell = target.closest('.cell-with-citation')
    if (!cell) return

    const snippet = cell.getAttribute('data-citation-snippet')
    if (!snippet) return

    // Show tooltip with citation preview
    // This would integrate with the existing tooltip system
  }, [])

  useEffect(() => {
    const container = editor?.getWorksheetContainer?.()
    if (!container) return

    container.addEventListener('mouseover', handleMouseOver)
    return () => container.removeEventListener('mouseover', handleMouseOver)
  }, [editor, handleMouseOver])

  return null // This component doesn't render anything itself
}

export function useMatrixCitationOverlay(editor: any) {
  const handleCellClick = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement
    const cell = target.closest('[data-revelith-source]')
    if (!cell) return

    const hyperlink = cell.getAttribute('data-revelith-source') || cell.getAttribute('href')
    if (!hyperlink || !hyperlink.startsWith('revelith-source://')) return

    event.preventDefault()
    event.stopPropagation()

    try {
      const url = new URL(hyperlink)
      const encodedPath = url.hostname + url.pathname
      const page = url.searchParams.get('page')
      const snippet = url.searchParams.get('snippet')

      if (!encodedPath) return

      const filePath = decodeURIComponent(encodedPath)
      const pageNum = page ? parseInt(page, 10) : 1
      const snippetText = snippet ? decodeURIComponent(snippet) : ''

      const { ipcRenderer } = require('electron')
      ipcRenderer.send('sheets:open-source-citation', {
        filePath,
        page: pageNum,
        snippet: snippetText,
      })
    } catch (err) {
      console.error('Failed to parse citation link:', err)
    }
  }, [])

  useEffect(() => {
    if (!editor) return

    const container = editor.getWorksheetContainer?.()
    if (!container) return

    container.addEventListener('click', handleCellClick)
    return () => container.removeEventListener('click', handleCellClick)
  }, [editor, handleCellClick])
}
