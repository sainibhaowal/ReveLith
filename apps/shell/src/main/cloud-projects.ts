type CloudProjectKind = 'docs' | 'sheets' | 'slides'
type CloudProjectsSnapshot = {
  available: boolean
  projects: unknown[]
  syncedAt: number
}

const KINDS: readonly CloudProjectKind[] = ['docs', 'sheets', 'slides']

/** 'slides_agent_git' / 'docs_agent' / 'sheets_agent_new' → module kind */
export function kindFromType(type: string): CloudProjectKind | 'other' {
  return KINDS.find((k) => type.startsWith(k)) ?? 'other'
}

/** Legacy local-cache key; hosted project syncing has been removed. */
export function cloudStoreOwner(): string {
  return ''
}

/** Hosted project lists are no longer read; leave any old local cache untouched. */
export function readCloudProjectsStore(storePath: string): CloudProjectsSnapshot | null {
  void storePath
  return null
}

/** No remote project source is configured after removing the hosted integration. */
export function syncCloudProjects(_storePath: string): Promise<CloudProjectsSnapshot> {
  return Promise.resolve({ available: false, projects: [], syncedAt: 0 })
}
