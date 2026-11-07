import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { TriangleAlert } from 'lucide-react'
import { api, isAuthError } from '../lib/api'
import { fileKind, formatBytes, formatDate, percentOf, plural, quotaTone } from '../lib/format'
import type { Entry, Me, Usage } from '../lib/types'
import { useDirectory } from '../hooks/useDirectory'
import { FileGlyph, FolderGlyph } from '../components/icons'
import { Button, ProgressBar } from '../components/ui'

export function HomeView({
  me,
  query,
  onAuthError,
  onOpenFolder,
  onOpenFile,
}: {
  me: Me | null
  query: string
  onAuthError: () => void
  onOpenFolder: (path: string) => void
  onOpenFile: (entry: Entry) => void
}) {
  const root = useDirectory('', null, onAuthError)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [usage, setUsage] = useState<Usage | null>(null)

  const quickFolders = useMemo(
    () => root.entries.filter((entry) => entry.type === 'folder').slice(0, 6),
    [root.entries],
  )
  const foldersKey = quickFolders.map((folder) => folder.name).join('|')

  const recentFiles = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return root.entries
      .filter((entry) => entry.type === 'file')
      .filter((entry) => !needle || entry.name.toLowerCase().includes(needle))
      .sort((a, b) => (Date.parse(b.modified) || 0) - (Date.parse(a.modified) || 0))
      .slice(0, 8)
  }, [root.entries, query])

  // Lazily resolve item counts for the quick-access cards only.
  useEffect(() => {
    let cancelled = false
    const names = foldersKey ? foldersKey.split('|') : []
    setCounts({})
    for (const name of names) {
      api
        .files(name, null)
        .then((result) => {
          if (cancelled) return
          setCounts((prev) => ({ ...prev, [name]: result.entries?.length ?? 0 }))
        })
        .catch((err: unknown) => {
          if (isAuthError(err)) onAuthError()
        })
    }
    return () => {
      cancelled = true
    }
  }, [foldersKey, onAuthError])

  useEffect(() => {
    let cancelled = false
    api
      .usage(7)
      .then((result) => {
        if (!cancelled) setUsage(result)
      })
      .catch((err: unknown) => {
        if (isAuthError(err)) onAuthError()
      })
    return () => {
      cancelled = true
    }
  }, [onAuthError])

  const loading = root.status === 'loading' && root.entries.length === 0
  const maxDay = usage ? Math.max(1, ...usage.byDay.map((day) => day.bytes)) : 1
  const quotaPct = me ? percentOf(me.quota.usedBytes, me.quota.limitBytes) : 0

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[1100px] px-6 py-6">
          {root.status === 'error' ? (
            <div className="flex flex-col items-start rounded-card border border-line-subtle bg-surface p-6">
              <TriangleAlert size={28} className="text-danger" />
              <h2 className="mt-3 text-base font-semibold text-ink">Your files could not be loaded</h2>
              <p className="mt-1 text-sm text-ink-2">{root.error}</p>
              <Button variant="secondary" className="mt-4" onClick={root.reload}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-xl/[26px] font-semibold text-ink">Quick access</h2>
              {loading ? (
                <div
                  className="mt-4 grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
                >
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 rounded-card border border-line-subtle p-3"
                    >
                      <div className="skeleton h-8 w-8 rounded" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-4 w-2/3" />
                        <div className="skeleton h-3 w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : quickFolders.length === 0 ? (
                <p className="mt-3 text-sm text-ink-3">Folders you create will show up here.</p>
              ) : (
                <div
                  className="mt-4 grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
                >
                  {quickFolders.map((folder, index) => (
                    <button
                      key={folder.name}
                      type="button"
                      onClick={() => onOpenFolder(folder.name)}
                      className="stagger-item flex items-center gap-3 rounded-card border border-line-subtle bg-surface p-3 text-left transition-all duration-150 hover:border-line hover:bg-surface-hover hover:shadow-menu"
                      style={{ '--stagger': index } as CSSProperties}
                    >
                      <FolderGlyph size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {folder.name}
                        </span>
                        <span className="block truncate text-xs text-ink-3">
                          {counts[folder.name] != null
                            ? plural(counts[folder.name], 'item')
                            : formatDate(folder.modified)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <h2 className="mt-8 text-xl/[26px] font-semibold text-ink">Recent files</h2>
              {loading ? (
                <div className="mt-4 space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="skeleton h-12 w-full rounded-control" />
                  ))}
                </div>
              ) : recentFiles.length === 0 ? (
                <p className="mt-3 text-sm text-ink-3">
                  {query.trim()
                    ? `No files match “${query.trim()}”.`
                    : 'Files you add to this folder will show up here.'}
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-line-subtle overflow-hidden rounded-card border border-line-subtle bg-surface">
                  {recentFiles.map((file) => (
                    <li key={file.name}>
                      <button
                        type="button"
                        onClick={() => onOpenFile(file)}
                        className="flex h-12 w-full items-center gap-3 px-4 text-left transition-colors duration-150 hover:bg-surface-hover"
                      >
                        <FileGlyph kind={fileKind(file)} size={22} />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink" title={file.name}>
                          {file.name}
                        </span>
                        <span className="hidden text-xs text-ink-3 sm:block">
                          {formatDate(file.modified)}
                        </span>
                        <span className="w-[72px] text-right text-xs tabular-nums text-ink-3">
                          {formatBytes(file.size)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      <aside className="hidden w-[300px] shrink-0 overflow-auto border-l border-line-subtle px-6 py-6 xl:block">
        <section className="rounded-card border border-line-subtle bg-surface p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Storage</h3>
            {me ? <span className="text-xs text-ink-3">{quotaPct}%</span> : null}
          </div>
          {me ? (
            <>
              <ProgressBar
                value={quotaPct}
                tone={quotaTone(quotaPct)}
                className="mt-3"
              />
              <p className="mt-2 text-xs text-ink-3">
                {formatBytes(me.quota.usedBytes)} of {formatBytes(me.quota.limitBytes)} used
              </p>
            </>
          ) : (
            <div className="skeleton mt-3 h-1 w-full rounded-full" />
          )}

          <div className="mt-4 border-t border-line-subtle pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-2">Uploads · last 7 days</span>
              {usage ? (
                <span className="text-ink-3">
                  {formatBytes(usage.byDay.reduce((sum, day) => sum + day.bytes, 0))}
                </span>
              ) : null}
            </div>
            {usage ? (
              <>
                <div
                  className="mt-3 flex h-16 items-end gap-1.5"
                  role="img"
                  aria-label="Uploads per day over the last 7 days"
                >
                  {usage.byDay.map((day) => (
                    <div
                      key={day.date}
                      title={`${day.date}: ${formatBytes(day.bytes)}`}
                      className="flex-1 rounded-sm bg-brand/75 transition-[height] duration-200"
                      style={{
                        height: `${Math.max(6, Math.round((day.bytes / maxDay) * 100))}%`,
                      }}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-ink-3">
                  <span>{usage.byDay[0]?.date ?? ''}</span>
                  <span>{usage.byDay[usage.byDay.length - 1]?.date ?? ''}</span>
                </div>
              </>
            ) : (
              <div className="skeleton mt-3 h-16 w-full" />
            )}
          </div>
        </section>
      </aside>
    </div>
  )
}
