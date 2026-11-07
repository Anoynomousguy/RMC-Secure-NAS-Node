export type EntryType = 'file' | 'folder'

export interface Entry {
  name: string
  type: EntryType
  size: number
  modified: string
  mime?: string
}

export interface Listing {
  path: string
  entries: Entry[]
}

export interface Me {
  user: string
  role: 'admin' | 'user'
  root: string
  quota: { usedBytes: number; limitBytes: number }
}

export interface AdminUser {
  user: string
  root: string
  usedBytes: number
  limitBytes: number
  entries: number
}

export interface UsageDay {
  date: string
  bytes: number
}

export interface Usage {
  totalBytes: number
  byDay: UsageDay[]
}

export interface UploadResponse {
  uploaded?: Array<{ name?: string }>
  errors?: Array<{ name?: string; message?: string; error?: string }>
}

export type Section = 'home' | 'files' | 'recent' | 'shared' | 'bin' | 'admin'

export type ViewMode = 'list' | 'tiles'

export type SortKey = 'name' | 'modified'
export type SortDir = 'asc' | 'desc'
export interface Sort {
  key: SortKey
  dir: SortDir
}

export type FileAction = 'open' | 'download' | 'rename' | 'delete'
