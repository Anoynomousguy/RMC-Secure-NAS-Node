import { useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { fileKind, formatBytes, formatDate } from '../lib/format'
import { clearRecent, loadRecent, type RecentEntry } from '../lib/recent'
import { FileGlyph } from '../components/icons'
import { Button } from '../components/ui'

const GRID_COLS =
  'grid grid-cols-[minmax(0,1fr)_80px] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_150px_80px] md:grid-cols-[minmax(180px,1fr)_minmax(120px,220px)_150px_80px]'

export function RecentView({
  query,
  onOpenFolderPath,
  onOpenFile,
}: {
  query: string
  onOpenFolderPath: (path: string) => void
  onOpenFile: (entry: RecentEntry) => void
}) {
  const [items, setItems] = useState<RecentEntry[]>(() => loadRecent())

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => item.name.toLowerCase().includes(needle))
  }, [items, query])

  const open = (item: RecentEntry) => {
    if (item.type === 'folder') onOpenFolderPath(item.key)
    else onOpenFile(item)
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-surface p-6">
        <div className="flex max-w-[420px] flex-col items-center text-center">
          <History size={48} strokeWidth={1.25} className="text-ink-3/60" aria-hidden="true" />
          <h2 className="mt-4 text-xl/[26px] font-semibold text-ink">No recent activity</h2>
          <p className="mt-2 text-sm text-ink-2">
            Files and folders you open will appear here, newest first.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line-subtle px-4">
        <span className="text-xs text-ink-3">
          {visible.length === items.length
            ? `${items.length} recent item${items.length === 1 ? '' : 's'}`
            : `${visible.length} of ${items.length} items`}
        </span>
        <Button
          variant="subtle"
          onClick={() => {
            clearRecent()
            setItems([])
          }}
        >
          Clear history
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-ink-2">No recent items match “{query.trim()}”.</p>
          </div>
        ) : (
          <div role="grid" aria-label="Recent items">
            <div
              role="row"
              className={`${GRID_COLS} sticky top-0 z-10 h-9 border-b border-line-subtle bg-surface px-4 text-xs text-ink-3`}
            >
              <div role="columnheader">Name</div>
              <div role="columnheader" className="hidden md:block">Location</div>
              <div role="columnheader" className="hidden sm:block">Modified</div>
              <div role="columnheader">Size</div>
            </div>
            <ul role="rowgroup" className="pb-6">
              {visible.map((item) => (
                <li
                  key={item.key}
                  role="row"
                  tabIndex={0}
                  onClick={() => open(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      open(item)
                    }
                  }}
                  className={`${GRID_COLS} h-11 cursor-default select-none border-b border-line-subtle px-4 transition-colors duration-100 hover:bg-surface-hover`}
                >
                  <div role="gridcell" className="flex min-w-0 items-center gap-3">
                    <FileGlyph kind={item.type === 'folder' ? 'folder' : fileKind(item)} size={22} />
                    <span className="truncate text-sm text-ink" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div role="gridcell" className="hidden truncate text-sm text-ink-3 md:block">
                    {item.parent || 'My files'}
                  </div>
                  <div role="gridcell" className="hidden truncate text-sm text-ink-3 sm:block">
                    {formatDate(item.modified)}
                  </div>
                  <div role="gridcell" className="text-sm tabular-nums text-ink-3">
                    {item.type === 'folder' ? '—' : formatBytes(item.size)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
