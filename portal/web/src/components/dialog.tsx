import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle } from 'lucide-react'
import { cx } from '../lib/format'
import { Button } from './ui'

/* ---------------------------------------------------------------------------
   Base dialog with focus trap, Escape and backdrop dismissal.
   --------------------------------------------------------------------------- */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 440,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
    const preferred = panel?.querySelector<HTMLElement>('[data-autofocus]')
    ;(preferred ?? focusables()[0] ?? panel)?.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previousFocus.current?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-[var(--overlay)]"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="animate-dialog-in relative w-full rounded-card border border-line-subtle bg-surface p-6 shadow-dialog focus:outline-none"
        style={{ maxWidth: width }}
      >
        <h2 id={titleId} className="text-xl/[26px] font-semibold text-ink">
          {title}
        </h2>
        {description ? (
          <div id={descId} className="mt-2 text-sm text-ink-2">
            {description}
          </div>
        ) : null}
        {children}
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------------------------------------------------------------------
   Confirm dialog
   --------------------------------------------------------------------------- */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      width={420}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger-solid' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
            data-autofocus
          >
            {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}

/* ---------------------------------------------------------------------------
   Prompt dialog (new folder / rename)
   --------------------------------------------------------------------------- */

export function PromptDialog({
  open,
  title,
  label,
  initialValue,
  placeholder,
  confirmLabel,
  busy,
  error,
  validate,
  onCancel,
  onSubmit,
}: {
  open: boolean
  title: string
  label: string
  initialValue: string
  placeholder?: string
  confirmLabel: string
  busy?: boolean
  error?: string
  validate?: (value: string) => string | null
  onCancel: () => void
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue)
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    setTouched(false)
    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      const dot = initialValue.lastIndexOf('.')
      input.setSelectionRange(0, dot > 0 ? dot : initialValue.length)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, initialValue])

  const validationMessage = validate ? validate(value) : null
  const showValidation = touched && validationMessage !== null
  const disabled = busy || value.trim().length === 0 || validationMessage !== null

  const submit = useCallback(() => {
    setTouched(true)
    if (value.trim().length === 0 || validationMessage !== null) return
    onSubmit(value.trim())
  }, [onSubmit, value, validationMessage])

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      width={420}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={disabled}>
            {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm text-ink-2">{label}</span>
          <input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(event) => {
              event.stopPropagation()
            }}
            className={cx(
              'h-8 w-full rounded-control border bg-surface px-3 text-sm text-ink placeholder:text-ink-3',
              showValidation || error ? 'border-danger' : 'border-line',
            )}
            aria-invalid={showValidation || !!error}
          />
        </label>
        {showValidation ? (
          <p className="mt-1 text-xs text-danger">{validationMessage}</p>
        ) : error ? (
          <p className="mt-1 text-xs text-danger">{error}</p>
        ) : null}
      </form>
    </Dialog>
  )
}

/** Rejects path separators and reserved names — shared by the prompts. */
export function validateName(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Enter a name.'
  if (trimmed === '.' || trimmed === '..') return 'That name is reserved.'
  if (/[/\\]/.test(trimmed)) return "Names can't contain / or \\."
  if (trimmed.length > 120) return 'That name is too long.'
  return null
}
