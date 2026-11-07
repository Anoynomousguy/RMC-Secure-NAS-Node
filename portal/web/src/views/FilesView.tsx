import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { api, describeError, isAuthError, startDownload } from '../lib/api'
import { filterEntries, joinPath, parsePath, plural, sortEntries } from '../lib/format'
import { recordRecent } from '../lib/recent'
import type { Entry, FileAction, Sort, ViewMode } from '../lib/types'
import { useDirectory } from '../hooks/useDirectory'
import { usePersistentState } from '../hooks/usePersistentState'
import { useUploads } from '../hooks/useUploads'
import { useToasts } from '../components/toasts'
import { CommandBar } from '../components/CommandBar'
import { FileBrowser } from '../components/FileBrowser'
import { ConfirmDialog, PromptDialog, validateName } from '../components/dialog'
import { ShieldFilled } from '../components/icons'

type DialogState =
  | { kind: 'new-folder' }
  | { kind: 'rename'; name: string }
  | { kind: 'delete'; names: string[] }
  | null

export function FilesView({
  path,
  onNavigatePath,
  browseUser,
  onExitBrowse,
  query,
  active,
  onAuthError,
}: {
  path: string
  onNavigatePath: (path: string) => void
  browseUser: string | null
  onExitBrowse: () => void
  query: string
  active: boolean
  onAuthError: () => void
}) {
  const { push } = useToasts()
  const upload = useUploads()
  const dir = useDirectory(path, browseUser, onAuthError)
  const readOnly = browseUser !== null

  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<DialogState>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string>()
  const lastIndexRef = useRef(-1)

  const [sort, setSort] = usePersistentState<Sort>('fortress.sort', { key: 'name', dir: 'asc' })
  const [view, setView] = usePersistentState<ViewMode>('fortress.view', 'list')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = folderInputRef.current
    if (input) {
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
    }
  }, [])

  // Selection belongs to the directory being viewed.
  useEffect(() => {
    setSelection(new Set())
    lastIndexRef.current = -1
  }, [path, browseUser])

  // Dialogs shouldn't linger if the section is switched while open.
  useEffect(() => {
    if (!active) {
      setDialog(null)
      setDialogError(undefined)
    }
  }, [active])

  const visible = useMemo(
    () => sortEntries(filterEntries(dir.entries, query), sort),
    [dir.entries, query, sort],
  )

  const segmentList = useMemo(() => parsePath(path), [path])

  const clearSelection = useCallback(() => {
    setSelection(new Set())
    lastIndexRef.current = -1
  }, [])

  const toggleSelect = useCallback(
    (name: string, mode: { range?: boolean; additive?: boolean }) => {
      const index = visible.findIndex((entry) => entry.name === name)
      setSelection((prev) => {
        const next = new Set(prev)
        if (mode.range && lastIndexRef.current >= 0 && index >= 0) {
          const start = Math.min(lastIndexRef.current, index)
          const end = Math.max(lastIndexRef.current, index)
          if (!mode.additive) next.clear()
          for (let i = start; i <= end; i += 1) next.add(visible[i].name)
        } else if (next.has(name)) {
          next.delete(name)
        } else {
          next.add(name)
        }
        return next
      })
      if (index >= 0) lastIndexRef.current = index
    },
    [visible],
  )

  const openEntry = useCallback(
    (entry: Entry) => {
      const fullPath = joinPath(path, entry.name)
      recordRecent({
        name: entry.name,
        parent: path,
        type: entry.type,
        mime: entry.mime,
        size: entry.size,
        modified: entry.modified,
      })
      if (entry.type === 'folder') {
        onNavigatePath(fullPath)
      } else {
        startDownload(fullPath, entry.name, browseUser)
      }
    },
    [path, browseUser, onNavigatePath],
  )

  const downloadNames = useCallback(
    (names: string[]) => {
      const targets = dir.entries.filter((entry) => names.includes(entry.name))
      const files = targets.filter((entry) => entry.type === 'file')
      const folders = targets.filter((entry) => entry.type === 'folder')
      if (files.length === 0) {
        push({
          kind: 'info',
          title: 'Folders can’t be downloaded',
          description: 'Download files one by one instead.',
        })
        return
      }
      for (const file of files) {
        startDownload(joinPath(path, file.name), file.name, browseUser)
        recordRecent({
          name: file.name,
          parent: path,
          type: 'file',
          mime: file.mime,
          size: file.size,
          modified: file.modified,
        })
      }
      if (folders.length > 0) {
        push({
          kind: 'info',
          title: `${plural(folders.length, 'folder')} skipped`,
          description: 'Only files can be downloaded.',
        })
      }
    },
    [dir.entries, path, browseUser, push],
  )

  const handleAction = useCallback(
    (action: FileAction, names: string[]) => {
      if (action === 'download') {
        downloadNames(names)
      } else if (action === 'rename' && names.length === 1) {
        setDialogError(undefined)
        setDialog({ kind: 'rename', name: names[0] })
      } else if (action === 'delete') {
        setDialogError(undefined)
        setDialog({ kind: 'delete', names })
      }
    },
    [downloadNames],
  )

  const runUpload = useCallback(
    async (target: string, files: File[]) => {
      try {
        const ok = await upload(target, files)
        if (ok && target === path) dir.reload()
      } catch (err) {
        if (isAuthError(err)) onAuthError()
      }
    },
    [upload, path, dir, onAuthError],
  )

  const onFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) void runUpload(path, files)
  }

  /* ------------------------------- dialog submit ---------------------------- */

  const closeDialog = () => {
    if (busy) return
    setDialog(null)
    setDialogError(undefined)
  }

  const submitNewFolder = async (name: string) => {
    setBusy(true)
    setDialogError(undefined)
    try {
      await api.createFolder(path, name)
      push({ kind: 'success', title: `Created folder “${name}”` })
      dir.reload()
      setDialog(null)
    } catch (err) {
      if (isAuthError(err)) {
        onAuthError()
        return
      }
      setDialogError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const submitRename = async (name: string) => {
    if (!dialog || dialog.kind !== 'rename') return
    setBusy(true)
    setDialogError(undefined)
    try {
      await api.rename(joinPath(path, dialog.name), name)
      push({ kind: 'success', title: `Renamed to “${name}”` })
      clearSelection()
      dir.reload()
      setDialog(null)
    } catch (err) {
      if (isAuthError(err)) {
        onAuthError()
        return
      }
      setDialogError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async () => {
    if (!dialog || dialog.kind !== 'delete') return
    setBusy(true)
    try {
      for (const name of dialog.names) {
        await api.remove(joinPath(path, name))
      }
      push({ kind: 'success', title: `Deleted ${plural(dialog.names.length, 'item')}` })
      clearSelection()
      dir.reload()
      setDialog(null)
    } catch (err) {
      if (isAuthError(err)) {
        onAuthError()
        return
      }
      push({ kind: 'error', title: 'Delete failed', description: describeError(err) })
      setDialog(null)
    } finally {
      setBusy(false)
    }
  }

  /* ---------------------------------- render -------------------------------- */

  const rootLabel = browseUser ?? 'My files'

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <CommandBar
        selectionCount={selection.size}
        onClearSelection={clearSelection}
        onDownload={() => downloadNames([...selection])}
        onRename={
          selection.size === 1 ? () => handleAction('rename', [...selection]) : undefined
        }
        onDelete={() => setDialog({ kind: 'delete', names: [...selection] })}
        onCreateFolder={() => setDialog({ kind: 'new-folder' })}
        onUploadFiles={() => fileInputRef.current?.click()}
        onUploadFolder={() => folderInputRef.current?.click()}
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={setView}
        onRefresh={dir.reload}
        refreshing={dir.refreshing}
        readOnly={readOnly}
      />

      {readOnly ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-line-subtle bg-brand-tint px-4 py-2 text-sm">
          <ShieldFilled size={16} className="shrink-0 text-brand-fg" />
          <span className="min-w-0 truncate text-ink-2">
            Viewing files for <span className="font-semibold text-ink">{browseUser}</span> · read-only
          </span>
          <button
            type="button"
            onClick={onExitBrowse}
            className="ml-auto shrink-0 rounded-control px-2 py-1 font-medium text-brand-fg transition-colors duration-150 hover:bg-surface-hover"
          >
            Back to my files
          </button>
        </div>
      ) : null}

      <nav
        aria-label="Breadcrumb"
        className="no-scrollbar flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-line-subtle bg-surface px-3 text-sm"
      >
        {segmentList.length === 0 ? (
          <span className="px-1.5 font-semibold text-ink">{rootLabel}</span>
        ) : (
          <button
            type="button"
            onClick={() => onNavigatePath('')}
            className="rounded-control px-1.5 py-1 text-ink-2 transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
          >
            {rootLabel}
          </button>
        )}
        {segmentList.map((segment, index) => {
          const isLast = index === segmentList.length - 1
          const target = segmentList.slice(0, index + 1).join('/')
          return (
            <Fragment key={target}>
              <ChevronRight size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
              {isLast ? (
                <span className="max-w-[240px] truncate px-1.5 font-semibold text-ink">
                  {segment}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigatePath(target)}
                  className="max-w-[200px] truncate rounded-control px-1.5 py-1 text-ink-2 transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                >
                  {segment}
                </button>
              )}
            </Fragment>
          )
        })}
      </nav>

      <FileBrowser
        entries={visible}
        currentPath={path}
        browseUser={browseUser}
        view={view}
        query={query}
        loading={dir.status === 'loading'}
        error={dir.status === 'error' ? dir.error ?? 'The folder could not be loaded.' : null}
        onRetry={dir.reload}
        selection={selection}
        onToggleSelect={toggleSelect}
        onSelectAll={(next) =>
          setSelection(next ? new Set(visible.map((entry) => entry.name)) : new Set())
        }
        onOpen={openEntry}
        onAction={handleAction}
        onDropFiles={(files, targetFolder) => {
          const target = targetFolder ? joinPath(path, targetFolder) : path
          void runUpload(target, files)
        }}
        onUploadRequest={() => fileInputRef.current?.click()}
        readOnly={readOnly}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onFilePicked}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={onFilePicked}
        aria-hidden="true"
        tabIndex={-1}
      />

      <PromptDialog
        open={dialog?.kind === 'new-folder'}
        title="New folder"
        label="Folder name"
        initialValue="New folder"
        confirmLabel="Create"
        busy={busy}
        error={dialogError}
        validate={validateName}
        onCancel={closeDialog}
        onSubmit={(name) => void submitNewFolder(name)}
      />

      <PromptDialog
        open={dialog?.kind === 'rename'}
        title="Rename"
        label="Name"
        initialValue={dialog?.kind === 'rename' ? dialog.name : ''}
        confirmLabel="Rename"
        busy={busy}
        error={dialogError}
        validate={validateName}
        onCancel={closeDialog}
        onSubmit={(name) => void submitRename(name)}
      />

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={
          dialog?.kind === 'delete' && dialog.names.length > 1
            ? `Delete ${dialog.names.length} items?`
            : 'Delete this item?'
        }
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={closeDialog}
        onConfirm={() => void submitDelete()}
        description={
          dialog?.kind === 'delete' ? (
            dialog.names.length === 1 ? (
              <p>“{dialog.names[0]}” will be removed from your files.</p>
            ) : (
              <>
                <p>These items will be removed from your files:</p>
                <ul className="mt-2 list-disc pl-5 text-ink-3">
                  {dialog.names.slice(0, 5).map((name) => (
                    <li key={name} className="truncate">
                      {name}
                    </li>
                  ))}
                  {dialog.names.length > 5 ? <li>and {dialog.names.length - 5} more</li> : null}
                </ul>
              </>
            )
          ) : null
        }
      />
    </div>
  )
}
