import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import {
  CloudUpload,
  Download,
  FolderOpen,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  Search,
  TriangleAlert,
  Trash2,
} from 'lucide-react'
import { api } from '../lib/api'
import {
  cx,
  fileKind,
  formatBytes,
  formatDate,
  formatFullDate,
  joinPath,
} from '../lib/format'
import type { Entry, FileAction, ViewMode } from '../lib/types'
import { ContextMenu, MenuButton, type MenuEntry } from './menu'
import { Button, CircleCheckbox, IconButton } from './ui'
import { FileGlyph } from './icons'

const GRID_COLS =
  'grid grid-cols-[40px_minmax(0,1fr)_44px] items-center sm:grid-cols-[40px_minmax(0,1fr)_100px_44px] md:grid-cols-[40px_minmax(160px,1fr)_160px_100px_44px]'

export interface FileBrowserProps {
  entries: Entry[]
  currentPath: string
  browseUser: string | null
  view: ViewMode
  query: string
  loading: boolean
  error: string | null
  onRetry: () => void
  selection: Set<string>
  onToggleSelect: (name: string, mode: { range?: boolean; additive?: boolean }) => void
  onSelectAll: (next: boolean) => void
  onOpen: (entry: Entry) => void
  onAction: (action: FileAction, names: string[]) => void
  onDropFiles: (files: File[], targetFolder: string) => void
  onUploadRequest: () => void
  readOnly: boolean
}

export function FileBrowser(props: FileBrowserProps) {
  const {
    entries,
    currentPath,
    browseUser,
    view,
    query,
    loading,
    error,
    onRetry,
    selection,
    onToggleSelect,
    onSelectAll,
    onOpen,
    onAction,
    onDropFiles,
    onUploadRequest,
    readOnly,
  } = props

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; names: string[] } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dragDepth = useRef(0)

  const allSelected = entries.length > 0 && entries.every((entry) => selection.has(entry.name))
  const someSelected = entries.some((entry) => selection.has(entry.name))

  const rowMenuEntries = useMemo(
    () =>
      (names: string[]): MenuEntry[] => {
        const single = names.length === 1
        const items: MenuEntry[] = [
          {
            type: 'item',
            key: 'download',
            label: 'Download',
            icon: <Download size={16} />,
            onSelect: () => onAction('download', names),
          },
        ]
        if (!readOnly) {
          items.push(
            {
              type: 'item',
              key: 'rename',
              label: 'Rename',
              icon: <PencilLine size={16} />,
              disabled: !single,
              onSelect: () => onAction('rename', names),
            },
            { type: 'separator' },
            {
              type: 'item',
              key: 'delete',
              label: 'Delete',
              icon: <Trash2 size={16} />,
              danger: true,
              onSelect: () => onAction('delete', names),
            },
          )
        }
        return items
      },
    [onAction, readOnly],
  )

  /* ------------------------------ drag & drop ------------------------------ */

  const hasFilesDrag = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files')

  const onDragEnter = (event: DragEvent) => {
    if (readOnly || !hasFilesDrag(event)) return
    dragDepth.current += 1
    setDragging(true)
  }

  const onDragOver = (event: DragEvent) => {
    if (readOnly || !hasFilesDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) {
      setDragging(false)
      setDropTarget(null)
    }
  }

  const onDrop = (event: DragEvent) => {
    if (readOnly) return
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    setDropTarget(null)
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length > 0) onDropFiles(files, '')
  }

  /* ------------------------------- row helpers ------------------------------ */

  const selectionFor = (entry: Entry): string[] => {
    if (selection.has(entry.name)) {
      return [...selection]
    }
    return [entry.name]
  }

  const openContextMenu = (event: ReactMouseEvent, entry: Entry) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, names: selectionFor(entry) })
  }

  const onRowClick = (event: ReactMouseEvent, entry: Entry) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault()
      onToggleSelect(entry.name, { range: event.shiftKey, additive: event.ctrlKey || event.metaKey })
      return
    }
    onOpen(entry)
  }

  const onRowKeyDown = (event: KeyboardEvent, entry: Entry) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter') {
      event.preventDefault()
      onOpen(entry)
    } else if (event.key === ' ') {
      event.preventDefault()
      onToggleSelect(entry.name, { additive: true })
    }
  }

  const folderDropHandlers = (entry: Entry) => {
    if (readOnly) return {}
    return {
      onDragOver: (event: DragEvent) => {
        if (!hasFilesDrag(event)) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
        if (dropTarget !== entry.name) setDropTarget(entry.name)
      },
      onDragLeave: () => {
        setDropTarget((current) => (current === entry.name ? null : current))
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        event.stopPropagation()
        dragDepth.current = 0
        setDragging(false)
        setDropTarget(null)
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (files.length > 0) onDropFiles(files, entry.name)
      },
    }
  }

  /* -------------------------------- rendering ------------------------------- */

  const busy = loading && entries.length === 0

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex max-w-[420px] flex-col items-center text-center">
          <TriangleAlert size={48} strokeWidth={1.25} className="text-danger" aria-hidden="true" />
          <h2 className="mt-4 text-xl/[26px] font-semibold text-ink">Something went wrong</h2>
          <p className="mt-2 text-sm text-ink-2">{error}</p>
          <Button
            variant="secondary"
            className="mt-5"
            icon={<RotateCcw size={16} aria-hidden="true" />}
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="min-h-0 flex-1 overflow-auto" aria-busy={busy}>
        {busy ? (
          <BrowserSkeleton view={view} />
        ) : entries.length === 0 ? (
          <EmptyState
            query={query}
            readOnly={readOnly}
            onUploadRequest={onUploadRequest}
          />
        ) : view === 'list' ? (
          <div role="grid" aria-label="Files" aria-multiselectable="true">
            <div
              role="row"
              className={cx(
                GRID_COLS,
                'sticky top-0 z-10 h-9 border-b border-line-subtle bg-surface px-2 text-xs text-ink-3',
              )}
            >
              <div role="columnheader" className="flex justify-center">
                <CircleCheckbox
                  checked={allSelected}
                  indeterminate={!allSelected && someSelected}
                  label={allSelected ? 'Clear selection' : 'Select all'}
                  onToggle={(next) => onSelectAll(next)}
                />
              </div>
              <div role="columnheader" className="pl-1">Name</div>
              <div role="columnheader" className="hidden md:block">Modified</div>
              <div role="columnheader" className="hidden sm:block">Size</div>
              <div role="columnheader" className="sr-only">Actions</div>
            </div>

            <ul role="rowgroup" className="pb-6">
              {entries.map((entry) => {
                const selected = selection.has(entry.name)
                const isDropTarget = dropTarget === entry.name
                return (
                  <li
                    key={entry.name}
                    role="row"
                    aria-selected={selected}
                    tabIndex={0}
                    onClick={(event) => onRowClick(event, entry)}
                    onKeyDown={(event) => onRowKeyDown(event, entry)}
                    onContextMenu={(event) => openContextMenu(event, entry)}
                    {...folderDropHandlers(entry)}
                    className={cx(
                      GRID_COLS,
                      'group h-11 cursor-default select-none border-b border-line-subtle px-2 transition-colors duration-100',
                      selected ? 'bg-brand-tint' : 'hover:bg-surface-hover',
                      isDropTarget && 'bg-brand-tint ring-1 ring-inset ring-brand',
                    )}
                  >
                    <div role="gridcell" className="flex justify-center">
                      <span
                        className={cx(
                          'transition-opacity duration-150',
                          selected
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                        )}
                      >
                        <CircleCheckbox
                          checked={selected}
                          label={`Select ${entry.name}`}
                          onToggle={(_next, event) =>
                            onToggleSelect(entry.name, {
                              range: event.shiftKey,
                              additive: event.ctrlKey || event.metaKey,
                            })
                          }
                        />
                      </span>
                    </div>
                    <div role="gridcell" className="flex min-w-0 items-center gap-3 pr-2">
                      <FileGlyph kind={fileKind(entry)} size={22} />
                      <span className="truncate text-sm text-ink" title={entry.name}>
                        {entry.name}
                      </span>
                    </div>
                    <div
                      role="gridcell"
                      className="hidden truncate text-sm text-ink-3 md:block"
                      title={formatFullDate(entry.modified)}
                    >
                      {formatDate(entry.modified)}
                    </div>
                    <div role="gridcell" className="hidden text-sm tabular-nums text-ink-3 sm:block">
                      {entry.type === 'folder' ? '—' : formatBytes(entry.size)}
                    </div>
                    <div role="gridcell" className="flex justify-center">
                      <span
                        className={cx(
                          'transition-opacity duration-150',
                          selected
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                        )}
                      >
                        <MenuButton
                          align="end"
                          label={`More options for ${entry.name}`}
                          entries={rowMenuEntries(selectionFor(entry))}
                          renderTrigger={(triggerProps) => (
                            <IconButton
                              label={`More options for ${entry.name}`}
                              className="h-7 w-7"
                              {...triggerProps}
                            >
                              <MoreHorizontal size={16} aria-hidden="true" />
                            </IconButton>
                          )}
                        />
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <ul
            role="list"
            aria-label="Files"
            className="grid gap-3 p-4 pb-8"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } as CSSProperties}
          >
            {entries.map((entry) => {
              const selected = selection.has(entry.name)
              const isDropTarget = dropTarget === entry.name
              return (
                <li
                  key={entry.name}
                  role="listitem"
                  className="group relative"
                  {...folderDropHandlers(entry)}
                >
                  <div
                    role="row"
                    aria-selected={selected}
                    tabIndex={0}
                    onClick={(event) => onRowClick(event, entry)}
                    onKeyDown={(event) => onRowKeyDown(event, entry)}
                    onContextMenu={(event) => openContextMenu(event, entry)}
                    className={cx(
                      'flex h-full cursor-default select-none flex-col rounded-card border p-3 transition-colors duration-100',
                      selected
                        ? 'border-brand/40 bg-brand-tint'
                        : 'border-line-subtle bg-surface hover:bg-surface-hover',
                      isDropTarget && 'ring-1 ring-inset ring-brand',
                    )}
                  >
                    <div className="pointer-events-none flex h-28 items-center justify-center overflow-hidden rounded-control">
                      <Thumbnail entry={entry} currentPath={currentPath} browseUser={browseUser} />
                    </div>
                    <div className="mt-3 line-clamp-2 text-sm text-ink" title={entry.name}>
                      {entry.name}
                    </div>
                    <div className="mt-1 text-xs text-ink-3" title={formatFullDate(entry.modified)}>
                      {formatDate(entry.modified)}
                    </div>
                  </div>

                  <span
                    className={cx(
                      'absolute right-2 top-2 transition-opacity duration-150',
                      selected
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                    )}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface/85 backdrop-blur-sm">
                      <CircleCheckbox
                        checked={selected}
                        label={`Select ${entry.name}`}
                        onToggle={(_next, event) =>
                          onToggleSelect(entry.name, {
                            range: event.shiftKey,
                            additive: event.ctrlKey || event.metaKey,
                          })
                        }
                      />
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-surface/80 p-6 backdrop-blur-[2px]">
          <div className="flex flex-col items-center rounded-card border-2 border-dashed border-brand px-10 py-8 text-center">
            <CloudUpload size={40} className="text-brand-fg" aria-hidden="true" />
            <p className="mt-3 text-base font-semibold text-ink">Drop your files here</p>
            <p className="mt-1 text-sm text-ink-3">
              They will be uploaded to this folder
            </p>
          </div>
        </div>
      ) : null}

      <ContextMenu
        state={
          contextMenu
            ? { x: contextMenu.x, y: contextMenu.y, entries: rowMenuEntries(contextMenu.names) }
            : null
        }
        onClose={() => setContextMenu(null)}
      />
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Thumbnail — real previews for images, glyphs otherwise.
   --------------------------------------------------------------------------- */

function Thumbnail({
  entry,
  currentPath,
  browseUser,
}: {
  entry: Entry
  currentPath: string
  browseUser: string | null
}) {
  const [failed, setFailed] = useState(false)
  const kind = fileKind(entry)
  if (kind === 'image' && !failed) {
    return (
      <img
        src={api.contentUrl(joinPath(currentPath, entry.name), browseUser)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full rounded-control object-cover"
      />
    )
  }
  return <FileGlyph kind={kind} size={48} />
}

/* ---------------------------------------------------------------------------
   Skeleton + empty states
   --------------------------------------------------------------------------- */

function BrowserSkeleton({ view }: { view: ViewMode }) {
  if (view === 'tiles') {
    return (
      <div
        className="grid gap-3 p-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
        aria-hidden="true"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-card border border-line-subtle p-3">
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="px-2 pt-2" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, index) => (
        <div key={index} className={cx(GRID_COLS, 'h-11 border-b border-line-subtle')}>
          <div className="flex justify-center">
            <div className="skeleton h-4 w-4 rounded-full" />
          </div>
          <div className="flex items-center gap-3 pr-2">
            <div className="skeleton h-5 w-5" />
            <div className="skeleton h-4" style={{ width: `${35 + ((index * 13) % 40)}%` }} />
          </div>
          <div className="hidden items-center md:flex">
            <div className="skeleton h-3.5 w-24" />
          </div>
          <div className="hidden items-center sm:flex">
            <div className="skeleton h-3.5 w-12" />
          </div>
          <div />
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  query,
  readOnly,
  onUploadRequest,
}: {
  query: string
  readOnly: boolean
  onUploadRequest: () => void
}) {
  const searching = query.trim().length > 0
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-[420px] flex-col items-center text-center">
        {searching ? (
          <>
            <Search size={48} strokeWidth={1.25} className="text-ink-3/60" aria-hidden="true" />
            <h2 className="mt-4 text-xl/[26px] font-semibold text-ink">
              No results for “{query.trim()}”
            </h2>
            <p className="mt-2 text-sm text-ink-2">
              Check the spelling or try a different search term.
            </p>
          </>
        ) : (
          <>
            <FolderOpen size={48} strokeWidth={1.25} className="text-ink-3/60" aria-hidden="true" />
            <h2 className="mt-4 text-xl/[26px] font-semibold text-ink">This folder is empty</h2>
            {readOnly ? (
              <p className="mt-2 text-sm text-ink-2">This user hasn't stored anything here yet.</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-2">
                  Drag and drop files here, or use the button below.
                </p>
                <Button
                  variant="primary"
                  className="mt-5"
                  icon={<CloudUpload size={16} aria-hidden="true" />}
                  onClick={onUploadRequest}
                >
                  Upload files
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
