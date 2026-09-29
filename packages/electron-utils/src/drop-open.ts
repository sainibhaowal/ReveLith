/**
 * Drag-and-drop "open this document in a new tab" bridge, installed from a
 * preload script (no Electron import: the module must stay loadable by a
 * sandboxed preload bundle).
 *
 * A file dropped onto an editor tab is a shell-level action, but the shell
 * renderer never receives the DOM drop event — the editor's own WebContentsView
 * does. The view therefore resolves the dropped paths and relays them to the
 * main process, which routes them to the right module.
 */

/** Path detail exposed to the renderer alongside a drop. */
export interface DroppedPathsDetail {
  paths: string[]
}

type DropListener = (paths: string[]) => void

/**
 * Resolve a `DataTransfer` / drag event to absolute file paths and deliver
 * them to `onPaths`. Text/URL drops and drags without files are ignored.
 */
export function installDropOpenBridge(
  options: {
    /** receives the resolved paths; defaults to window 'revelith:drop-open' */
    onPaths?: DropListener
    /** resolve a File to its absolute path; injected so the module stays Electron-free */
    resolvePath: (file: File) => string
    /** attach listeners here; defaults to window (preload runs before page scripts) */
    target?: Pick<Window, 'addEventListener' | 'removeEventListener'>
  } = { resolvePath: (file) => (file as File & { path?: string }).path ?? file.name },
): () => void {
  const target = options.target ?? window
  const emit =
    options.onPaths ??
    ((paths) => {
      window.dispatchEvent(
        new CustomEvent<DroppedPathsDetail>('revelith:drop-open', { detail: { paths } }),
      )
    })

  const handle = (event: DragEvent) => {
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length === 0) return
    const paths = files
      .map((file) => options.resolvePath(file))
      .filter((path): path is string => typeof path === 'string' && path.length > 0)
    if (paths.length === 0) return
    event.preventDefault()
    emit(paths)
  }

  // preventDefault is required or the window navigates to the dropped file
  const preventNavigation = (event: DragEvent) => {
    if ((event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault()
  }

  target.addEventListener('dragover', preventNavigation as EventListener)
  target.addEventListener('drop', handle as EventListener)
  return () => {
    target.removeEventListener('dragover', preventNavigation as EventListener)
    target.removeEventListener('drop', handle as EventListener)
  }
}
