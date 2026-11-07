import type { AdminUser, Entry, Listing, Me, UploadResponse, Usage } from './types'

const AUTHELIA_URL = (import.meta.env.VITE_AUTHELIA_URL as string | undefined)?.trim() || '/'

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function isAuthError(err: unknown): err is ApiError {
  return err instanceof ApiError && (err.status === 401 || err.status === 403)
}

export function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return 'Something went wrong.'
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, { credentials: 'same-origin', ...init })
  } catch {
    throw new ApiError(0, 'Could not reach the server.', 'network')
  }
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`
    let code: string | undefined
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } }
      if (body?.error?.message) message = body.error.message
      code = body?.error?.code
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message, code)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function fileQuery(path: string, user?: string | null): string {
  const params = new URLSearchParams({ path })
  if (user) params.set('user', user)
  return params.toString()
}

export function authPortalUrl(): string {
  return AUTHELIA_URL
}

export const api = {
  me: () => request<Me>('/api/me'),

  health: () => request<{ status: string; version: string }>('/api/health'),

  files: (path: string, user?: string | null) =>
    request<Listing>(`/api/files?${fileQuery(path, user)}`),

  contentUrl: (path: string, user?: string | null) =>
    `/api/files/content?${fileQuery(path, user)}`,

  createFolder: (path: string, name: string) =>
    request<unknown>('/api/files/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, name }),
    }),

  rename: (path: string, name: string) =>
    request<unknown>('/api/files/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, name }),
    }),

  remove: (path: string) =>
    request<unknown>('/api/files/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }),

  adminUsers: () => request<{ users: AdminUser[] }>('/api/admin/users'),

  usage: (days = 7, user?: string | null) => {
    const params = new URLSearchParams({ days: String(days) })
    if (user) params.set('user', user)
    return request<Usage>(`/api/usage?${params.toString()}`)
  },
}

export interface UploadHandle {
  promise: Promise<UploadResponse>
  xhr: XMLHttpRequest
}

/** Multipart upload with progress, sent through XHR. */
export function uploadFiles(
  dir: string,
  files: File[],
  onProgress?: (fraction: number) => void,
): UploadHandle {
  const form = new FormData()
  for (const file of files) form.append('files', file, file.name)

  const xhr = new XMLHttpRequest()
  const promise = new Promise<UploadResponse>((resolve, reject) => {
    xhr.open('POST', `/api/files/upload?${new URLSearchParams({ path: dir }).toString()}`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResponse)
        } catch {
          resolve({})
        }
      } else {
        let message = `Upload failed (${xhr.status})`
        try {
          const body = JSON.parse(xhr.responseText) as { error?: { message?: string } }
          if (body?.error?.message) message = body.error.message
        } catch {
          /* not JSON */
        }
        reject(new ApiError(xhr.status, message))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Network error during upload.', 'network'))
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled.', 'aborted'))
    xhr.send(form)
  })
  return { promise, xhr }
}

/** Kick off a browser download through the content endpoint. */
export function startDownload(path: string, name: string, user?: string | null): void {
  const anchor = document.createElement('a')
  anchor.href = api.contentUrl(path, user)
  anchor.download = name
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

/** Defensive normalization of a listing entry coming from the API. */
export function sanitizeEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.name !== 'string' || value.name.length === 0) return null
  const type = value.type === 'folder' ? 'folder' : 'file'
  return {
    name: value.name,
    type,
    size: typeof value.size === 'number' && Number.isFinite(value.size) ? value.size : 0,
    modified: typeof value.modified === 'string' ? value.modified : '',
    mime: typeof value.mime === 'string' ? value.mime : undefined,
  }
}
