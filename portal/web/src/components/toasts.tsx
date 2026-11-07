import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CircleAlert, CircleCheck, CloudUpload, Info, X } from 'lucide-react'
import { cx } from '../lib/format'
import { ProgressBar } from './ui'

export type ToastKind = 'progress' | 'success' | 'error' | 'info'

export interface ToastInput {
  kind: ToastKind
  title: string
  description?: string
  /** 0..1, only for progress toasts */
  progress?: number
  duration?: number
}

export interface Toast extends ToastInput {
  id: number
}

interface ToastApi {
  push: (toast: ToastInput) => number
  update: (id: number, patch: Partial<ToastInput>) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToasts(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToasts must be used inside <ToastProvider>')
  return ctx
}

const MAX_TOASTS = 4
const DEFAULT_DURATION = 7000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const push = useCallback((toast: ToastInput) => {
    const id = nextId.current
    nextId.current += 1
    setToasts((current) => {
      const next = [...current, { ...toast, id }]
      if (next.length > MAX_TOASTS) {
        // Prefer dropping the oldest finished toast, never a live progress one
        // unless everything on screen is uploading.
        const index = next.findIndex((item) => item.kind !== 'progress' && item.id !== id)
        next.splice(index === -1 ? 0 : index, 1)
      }
      return next
    })
    return id
  }, [])

  const update = useCallback((id: number, patch: Partial<ToastInput>) => {
    setToasts((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const value = useMemo(() => ({ push, update, dismiss }), [push, update, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed right-3 top-3 z-[70] flex w-[380px] max-w-[calc(100vw-24px)] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({
  toast,
  dismiss,
}: {
  toast: Toast
  dismiss: (id: number) => void
}) {
  const { id, kind, title, description, progress, duration = DEFAULT_DURATION } = toast

  useEffect(() => {
    if (kind === 'progress') return
    const timer = window.setTimeout(() => dismiss(id), duration)
    return () => window.clearTimeout(timer)
  }, [id, kind, duration, dismiss])

  const icon =
    kind === 'progress' ? (
      <CloudUpload size={20} className="text-brand-fg" />
    ) : kind === 'success' ? (
      <CircleCheck size={20} className="text-success" />
    ) : kind === 'error' ? (
      <CircleAlert size={20} className="text-danger" />
    ) : (
      <Info size={20} className="text-brand-fg" />
    )

  return (
    <div
      role="status"
      className="animate-toast-in pointer-events-auto rounded-card border border-line-subtle bg-surface p-3 shadow-menu"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{title}</div>
          {description ? <div className="mt-0.5 text-xs text-ink-3">{description}</div> : null}
          {kind === 'progress' ? (
            <ProgressBar
              value={Math.round((progress ?? 0) * 100)}
              className={cx('mt-2', 'h-1')}
            />
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => dismiss(id)}
          className="icon-btn -mr-1 -mt-1 h-7 w-7 shrink-0"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
