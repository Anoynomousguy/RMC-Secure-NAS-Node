import type { Entry, Sort } from './types'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

export function parsePath(path: string): string[] {
  return path ? path.split('/').filter(Boolean) : []
}

export function parentOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

export function baseName(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function initials(name: string): string {
  const clean = name.replace(/[@]+/g, ' ').trim()
  const parts = clean.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 100 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

function parseDate(input: string | number | Date | null | undefined): Date | null {
  if (input == null || input === '') return null
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(input: string | number | Date | null | undefined): string {
  const date = parseDate(input)
  if (!date) return '—'
  const now = new Date()
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatFullDate(input: string | number | Date | null | undefined): string {
  const date = parseDate(input)
  if (!date) return ''
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function percentOf(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)))
}

export function quotaTone(pct: number): 'brand' | 'warning' | 'danger' {
  if (pct >= 100) return 'danger'
  if (pct >= 90) return 'warning'
  return 'brand'
}

export type FileKind =
  | 'folder'
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'code'
  | 'text'
  | 'file'

const EXTENSION_KINDS: Record<string, FileKind> = {
  doc: 'doc',
  docx: 'doc',
  odt: 'doc',
  rtf: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  ods: 'sheet',
  ppt: 'slides',
  pptx: 'slides',
  odp: 'slides',
  key: 'slides',
  pdf: 'pdf',
  txt: 'text',
  md: 'text',
  log: 'text',
  json: 'code',
  js: 'code',
  jsx: 'code',
  ts: 'code',
  tsx: 'code',
  py: 'code',
  rb: 'code',
  go: 'code',
  rs: 'code',
  java: 'code',
  c: 'code',
  cpp: 'code',
  h: 'code',
  css: 'code',
  html: 'code',
  sh: 'code',
  yml: 'code',
  yaml: 'code',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  bz2: 'archive',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  avif: 'image',
  heic: 'image',
  ico: 'image',
  mp4: 'video',
  mov: 'video',
  mkv: 'video',
  avi: 'video',
  webm: 'video',
  m4v: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  aac: 'audio',
}

export function fileKind(entry: Pick<Entry, 'type' | 'mime' | 'name'>): FileKind {
  if (entry.type === 'folder') return 'folder'
  const mime = entry.mime ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'sheet'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slides'
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return 'archive'
  if (mime.includes('word') || mime.includes('opendocument.text')) return 'doc'
  if (mime.startsWith('text/')) {
    if (mime.includes('html') || mime.includes('css') || mime.includes('javascript')) return 'code'
    return 'text'
  }
  const extension = entry.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_KINDS[extension] ?? 'file'
}

export function isImage(entry: Pick<Entry, 'type' | 'mime' | 'name'>): boolean {
  return fileKind(entry) === 'image'
}

export function filterEntries(entries: Entry[], query: string): Entry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return entries
  return entries.filter((entry) => entry.name.toLowerCase().includes(needle))
}

export function sortEntries(entries: Entry[], sort: Sort): Entry[] {
  const direction = sort.dir === 'asc' ? 1 : -1
  const compare = (a: Entry, b: Entry): number => {
    if (sort.key === 'name') {
      return direction * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    }
    const aTime = Date.parse(a.modified) || 0
    const bTime = Date.parse(b.modified) || 0
    return direction * (aTime - bTime)
  }
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return compare(a, b)
  })
}
