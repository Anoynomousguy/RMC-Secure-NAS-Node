import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronDown,
  Download,
  FolderPlus,
  LayoutGrid,
  List,
  PencilLine,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { cx } from '../lib/format'
import type { Sort, SortDir, SortKey, ViewMode } from '../lib/types'
import { MenuButton, type MenuEntry } from './menu'
import { Button, IconButton } from './ui'

/* ---------------------------------------------------------------------------
   Split button
   --------------------------------------------------------------------------- */

function SplitButton({
  label,
  icon,
  variant,
  onClick,
  entries,
  menuLabel,
  compactLabel,
}: {
  label: string
  icon: ReactNode
  variant: 'primary' | 'secondary'
  onClick: () => void
  entries: MenuEntry[]
  menuLabel: string
  compactLabel?: boolean
}) {
  const primary = variant === 'primary'
  const part = cx(
    'inline-flex h-8 items-center gap-2 px-3 text-sm whitespace-nowrap transition-colors duration-150',
    primary ? 'text-white' : 'text-ink',
    primary ? 'hover:bg-brand-hover active:bg-brand-pressed' : 'hover:bg-surface-hover',
  )
  return (
    <div
      className={cx(
        'inline-flex shrink-0 items-stretch overflow-hidden rounded-control',
        primary ? 'bg-brand' : 'border border-line bg-surface',
      )}
    >
      <button type="button" className={cx(part, 'rounded-l-[3px]')} onClick={onClick}>
        {icon}
        <span className={compactLabel ? 'hidden sm:inline' : undefined}>{label}</span>
      </button>
      <span
        aria-hidden="true"
        className={cx('my-1.5 w-px shrink-0', primary ? 'bg-white/30' : 'bg-line')}
      />
      <MenuButton
        align="start"
        label={menuLabel}
        entries={entries}
        renderTrigger={(props) => (
          <button
            {...props}
            aria-label={menuLabel}
            className={cx(part, 'rounded-r-[3px] px-1.5')}
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        )}
      />
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Command bar
   --------------------------------------------------------------------------- */

export function CommandBar({
  selectionCount,
  onClearSelection,
  onDownload,
  onRename,
  onDelete,
  onCreateFolder,
  onUploadFiles,
  onUploadFolder,
  sort,
  onSortChange,
  view,
  onViewChange,
  onRefresh,
  refreshing,
  readOnly,
}: {
  selectionCount: number
  onClearSelection: () => void
  onDownload: () => void
  onRename?: () => void
  onDelete: () => void
  onCreateFolder: () => void
  onUploadFiles: () => void
  onUploadFolder: () => void
  sort: Sort
  onSortChange: (sort: Sort) => void
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  onRefresh: () => void
  refreshing?: boolean
  readOnly?: boolean
}) {
  const setKey = (key: SortKey) => onSortChange({ ...sort, key })
  const setDir = (dir: SortDir) => onSortChange({ ...sort, dir })

  const sortEntries: MenuEntry[] = [
    { type: 'header', label: 'Sort by' },
    {
      type: 'item',
      key: 'name',
      label: 'Name',
      checked: sort.key === 'name',
      onSelect: () => setKey('name'),
    },
    {
      type: 'item',
      key: 'modified',
      label: 'Modified',
      checked: sort.key === 'modified',
      onSelect: () => setKey('modified'),
    },
    { type: 'separator' },
    {
      type: 'item',
      key: 'asc',
      label: 'Ascending',
      icon: <ArrowUp size={14} />,
      checked: sort.dir === 'asc',
      onSelect: () => setDir('asc'),
    },
    {
      type: 'item',
      key: 'desc',
      label: 'Descending',
      icon: <ArrowDown size={14} />,
      checked: sort.dir === 'desc',
      onSelect: () => setDir('desc'),
    },
  ]

  const createEntries: MenuEntry[] = [
    {
      type: 'item',
      key: 'folder',
      label: 'Folder',
      icon: <FolderPlus size={16} />,
      onSelect: onCreateFolder,
    },
    { type: 'separator' },
    {
      type: 'item',
      key: 'files',
      label: 'Upload files',
      icon: <Upload size={16} />,
      onSelect: onUploadFiles,
    },
    {
      type: 'item',
      key: 'upload-folder',
      label: 'Upload folder',
      icon: <FolderPlus size={16} />,
      onSelect: onUploadFolder,
    },
  ]

  const uploadEntries: MenuEntry[] = [
    {
      type: 'item',
      key: 'files',
      label: 'Files',
      icon: <Upload size={16} />,
      onSelect: onUploadFiles,
    },
    {
      type: 'item',
      key: 'folder',
      label: 'Folder',
      icon: <FolderPlus size={16} />,
      onSelect: onUploadFolder,
    },
  ]

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line-subtle bg-surface px-2">
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {selectionCount > 0 ? (
          <>
            <span className="flex items-center gap-1 pl-1 text-sm text-ink-2">
              <span className="whitespace-nowrap">{selectionCount} selected</span>
              <IconButton label="Clear selection" onClick={onClearSelection} className="h-7 w-7">
                <X size={14} aria-hidden="true" />
              </IconButton>
            </span>
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />
            <Button variant="subtle" icon={<Download size={18} aria-hidden="true" />} onClick={onDownload}>
              Download
            </Button>
            {!readOnly ? (
              <>
                <Button
                  variant="subtle"
                  icon={<PencilLine size={18} aria-hidden="true" />}
                  onClick={onRename}
                  disabled={!onRename}
                >
                  Rename
                </Button>
                <Button
                  variant="danger"
                  icon={<Trash2 size={18} aria-hidden="true" />}
                  onClick={onDelete}
                >
                  Delete
                </Button>
                <Button variant="subtle" onClick={onClearSelection}>
                  Clear
                </Button>
              </>
            ) : (
              <Button variant="subtle" onClick={onClearSelection}>
                Clear
              </Button>
            )}
          </>
        ) : !readOnly ? (
          <div className="animate-fade-in flex items-center gap-2">
            <SplitButton
              label="Create or upload"
              menuLabel="Create or upload options"
              icon={<Plus size={18} aria-hidden="true" />}
              variant="primary"
              onClick={onUploadFiles}
              entries={createEntries}
            />
            <SplitButton
              label="Upload"
              menuLabel="Upload options"
              icon={<Upload size={18} aria-hidden="true" />}
              variant="secondary"
              onClick={onUploadFiles}
              entries={uploadEntries}
              compactLabel
            />
            <Button
              variant="secondary"
              icon={<FolderPlus size={18} aria-hidden="true" />}
              onClick={onCreateFolder}
              className="hidden sm:inline-flex"
            >
              New folder
            </Button>
          </div>
        ) : (
          <span className="pl-1 text-sm text-ink-3">Read-only</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <MenuButton
          align="end"
          label="Sort"
          entries={sortEntries}
          renderTrigger={(props) => (
            <button
              {...props}
              className="btn btn-subtle gap-2 pr-2 text-ink-2 hover:text-ink"
            >
              <ArrowDownUp size={16} aria-hidden="true" />
              <span className="hidden md:inline">Sort</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          )}
        />

        <div
          role="group"
          aria-label="View"
          className="flex items-center rounded-control border border-transparent p-0.5"
        >
          <IconButton
            label="List view"
            active={view === 'list'}
            onClick={() => onViewChange('list')}
            className="h-7 w-7"
          >
            <List size={16} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Tiles view"
            active={view === 'tiles'}
            onClick={() => onViewChange('tiles')}
            className="h-7 w-7"
          >
            <LayoutGrid size={16} aria-hidden="true" />
          </IconButton>
        </div>

        <IconButton label="Refresh" onClick={onRefresh} className="h-8 w-8">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  )
}
