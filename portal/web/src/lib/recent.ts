export interface RecentEntry {
  key: string
  name: string
  parent: string
  type: 'file' | 'folder'
  mime?: string
  size: number
  modified: string
  openedAt: number
}

const STORAGE_KEY = 'fortress.recent.v1'
const LIMIT = 50

export function loadRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is RecentEntry =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as RecentEntry).name === 'string' &&
        typeof (item as RecentEntry).key === 'string' &&
        ((item as RecentEntry).type === 'file' || (item as RecentEntry).type === 'folder'),
    )
  } catch {
    return []
  }
}

export function recordRecent(entry: Omit<RecentEntry, 'key' | 'openedAt'>): void {
  try {
    const key = entry.parent ? `${entry.parent}/${entry.name}` : entry.name
    const rest = loadRecent().filter((item) => item.key !== key)
    const next: RecentEntry[] = [{ ...entry, key, openedAt: Date.now() }, ...rest].slice(0, LIMIT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — recents are a nicety */
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
