import { useCallback } from 'react'
import { isAuthError, uploadFiles, describeError } from '../lib/api'
import { formatBytes, plural } from '../lib/format'
import { useToasts } from '../components/toasts'

/**
 * Uploads a batch to a directory, driving a persistent progress toast and a
 * success/error toast when the batch settles. Returns true when the target
 * directory should be refreshed.
 */
export function useUploads(): (dir: string, files: File[]) => Promise<boolean> {
  const { push, update, dismiss } = useToasts()

  return useCallback(
    async (dir: string, files: File[]) => {
      if (files.length === 0) return false
      const count = files.length
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
      const id = push({
        kind: 'progress',
        title: `Uploading ${plural(count, 'item')}…`,
        description: `0% of ${formatBytes(totalBytes)}`,
        progress: 0,
      })

      const { promise } = uploadFiles(dir, files, (fraction) => {
        update(id, {
          progress: fraction,
          description: `${Math.round(fraction * 100)}% of ${formatBytes(totalBytes)}`,
        })
      })

      try {
        const result = await promise
        const failed = result.errors ?? []
        const uploaded = result.uploaded?.length ?? Math.max(0, count - failed.length)
        dismiss(id)
        if (failed.length > 0) {
          const first = failed[0]
          push({
            kind: 'error',
            title: `Uploaded ${uploaded} of ${plural(count, 'item')}`,
            description:
              first?.message ??
              first?.error ??
              (first?.name ? `"${first.name}" could not be uploaded.` : 'Some files failed.'),
          })
        } else {
          push({ kind: 'success', title: `Uploaded ${plural(count, 'item')}` })
        }
        return uploaded > 0
      } catch (err) {
        dismiss(id)
        if (isAuthError(err)) throw err
        push({ kind: 'error', title: 'Upload failed', description: describeError(err) })
        return false
      }
    },
    [push, update, dismiss],
  )
}
