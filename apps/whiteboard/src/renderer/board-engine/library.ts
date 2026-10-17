// ReveLith Drawboard — library persistence (localStorage-backed, no new deps).
// The board `onLibraryChange` pushes items here; they are restored on boot.
const KEY = 'revelith-drawboard/library-v1'
const LEGACY_KEY = 'revelith-whiteboard/library-v1'

export function loadLibraryItems(): unknown[] {
  try {
    const current = localStorage.getItem(KEY)
    const raw = current ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return []
    if (current === null) {
      try {
        localStorage.setItem(KEY, raw)
      } catch {
        // Loading the old library still works when storage is temporarily read-only.
      }
    }
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray((parsed as { libraryItems?: unknown[] }).libraryItems)) {
      return (parsed as { libraryItems: unknown[] }).libraryItems
    }
    return []
  } catch {
    return []
  }
}

export function saveLibraryItems(items: unknown): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.isArray(items) ? items : []))
  } catch {
    // quota — library is best-effort
  }
}
