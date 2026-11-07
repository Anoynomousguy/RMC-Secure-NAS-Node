import { useCallback, useEffect, useRef, useState } from 'react'
import { api, isAuthError, sanitizeEntry, describeError } from '../lib/api'
import type { Entry } from '../lib/types'

export interface DirectoryState {
  status: 'loading' | 'ready' | 'error'
  path: string
  entries: Entry[]
  error?: string
  refreshing: boolean
}

/** Lists a directory through GET /api/files, tracking loading/refresh states. */
export function useDirectory(
  path: string,
  user: string | null,
  onAuthError: () => void,
): DirectoryState & { reload: () => void } {
  const [state, setState] = useState<DirectoryState>({
    status: 'loading',
    path: '',
    entries: [],
    refreshing: false,
  })
  const [tick, setTick] = useState(0)
  const authRef = useRef(onAuthError)
  authRef.current = onAuthError

  const reload = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false
    setState((prev) =>
      prev.path === path && prev.status === 'ready'
        ? { ...prev, refreshing: true, error: undefined }
        : { status: 'loading', path, entries: [], refreshing: false },
    )

    api
      .files(path, user)
      .then((result) => {
        if (cancelled) return
        const entries = Array.isArray(result?.entries)
          ? result.entries.map(sanitizeEntry).filter((entry): entry is Entry => entry !== null)
          : []
        setState({ status: 'ready', path, entries, refreshing: false })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (isAuthError(err)) {
          authRef.current()
          setState({ status: 'loading', path, entries: [], refreshing: false })
          return
        }
        setState({
          status: 'error',
          path,
          entries: [],
          refreshing: false,
          error: describeError(err),
        })
      })

    return () => {
      cancelled = true
    }
  }, [path, user, tick])

  return { ...state, reload }
}
