import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderOpen, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { api, describeError, isAuthError } from '../lib/api'
import { formatBytes, percentOf, quotaTone } from '../lib/format'
import type { AdminUser } from '../lib/types'
import { Avatar, Button, IconButton, ProgressBar } from '../components/ui'

export function AdminView({
  query,
  onBrowse,
  onAuthError,
}: {
  query: string
  onBrowse: (user: string) => void
  onAuthError: () => void
}) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    try {
      const result = await api.adminUsers()
      const list = Array.isArray(result?.users) ? result.users : []
      setUsers(
        list.map((entry) => ({
          user: String(entry.user ?? ''),
          root: String(entry.root ?? ''),
          usedBytes: Number(entry.usedBytes) || 0,
          limitBytes: Number(entry.limitBytes) || 0,
          entries: Number(entry.entries) || 0,
        })),
      )
    } catch (err) {
      if (isAuthError(err)) {
        onAuthError()
        return
      }
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }, [onAuthError])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    if (!users) return []
    const needle = query.trim().toLowerCase()
    if (!needle) return users
    return users.filter((user) => user.user.toLowerCase().includes(needle))
  }, [users, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line-subtle px-4">
        <div className="text-sm text-ink-2">
          {users ? `${users.length} ${users.length === 1 ? 'account' : 'accounts'}` : 'Accounts'}
        </div>
        <div className="flex items-center gap-1">
          {busy ? (
            <LoaderCircle size={16} className="animate-spin text-ink-3" aria-hidden="true" />
          ) : null}
          <IconButton label="Refresh" onClick={() => void load()}>
            <RefreshCw size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="flex max-w-[420px] flex-col items-center text-center">
              <TriangleAlert size={48} strokeWidth={1.25} className="text-danger" aria-hidden="true" />
              <h2 className="mt-4 text-xl/[26px] font-semibold text-ink">Users could not be loaded</h2>
              <p className="mt-2 text-sm text-ink-2">{error}</p>
              <Button variant="secondary" className="mt-5" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          </div>
        ) : users === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton h-14 w-full rounded-control" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-ink-2">
              {query.trim() ? `No accounts match “${query.trim()}”.` : 'No accounts yet.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-line-subtle bg-surface text-left text-xs font-normal text-ink-3">
                <th scope="col" className="h-9 px-4 font-normal">User</th>
                <th scope="col" className="h-9 min-w-[240px] px-4 font-normal">Storage</th>
                <th scope="col" className="hidden h-9 px-4 font-normal sm:table-cell">Items</th>
                <th scope="col" className="h-9 px-4 text-right font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => {
                const pct = percentOf(user.usedBytes, user.limitBytes)
                return (
                  <tr
                    key={user.user}
                    className="border-b border-line-subtle transition-colors duration-100 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.user} size={32} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink">{user.user}</div>
                          {user.root ? (
                            <div className="max-w-[280px] truncate text-xs text-ink-3" title={user.root}>
                              {user.root}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ProgressBar value={pct} tone={quotaTone(pct)} />
                      <div className="mt-1.5 text-xs text-ink-3">
                        {formatBytes(user.usedBytes)} of {formatBytes(user.limitBytes)} · {pct}%
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-ink-2 sm:table-cell">
                      {user.entries.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        icon={<FolderOpen size={16} aria-hidden="true" />}
                        onClick={() => onBrowse(user.user)}
                      >
                        Browse files
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
