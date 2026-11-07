import { Check, Minus } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx, initials } from '../lib/format'

/* ---------------------------------------------------------------------------
   Button
   --------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger' | 'danger-solid'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  subtle: 'btn-subtle',
  danger: 'btn-danger',
  'danger-solid': 'btn-danger-solid',
}

export function Button({
  variant = 'subtle',
  icon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  icon?: ReactNode
}) {
  return (
    <button type={type} className={cx('btn', VARIANT_CLASS[variant], className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  active,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      data-active={active || undefined}
      className={cx('icon-btn', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ---------------------------------------------------------------------------
   Circular checkbox (Fluent style)
   --------------------------------------------------------------------------- */

export function CircleCheckbox({
  checked,
  indeterminate,
  onToggle,
  label,
  size = 16,
  className,
}: {
  checked: boolean
  indeterminate?: boolean
  onToggle: (next: boolean, event: React.MouseEvent<HTMLButtonElement>) => void
  label: string
  size?: number
  className?: string
}) {
  const active = checked || indeterminate
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        onToggle(!checked, event)
      }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full border transition-colors duration-150',
        active
          ? 'border-brand bg-brand text-white'
          : 'border-ink-3/80 bg-transparent hover:border-brand',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {indeterminate ? (
        <Minus size={Math.round(size * 0.62)} strokeWidth={3} aria-hidden="true" />
      ) : checked ? (
        <Check size={Math.round(size * 0.62)} strokeWidth={3} aria-hidden="true" />
      ) : null}
    </button>
  )
}

/* ---------------------------------------------------------------------------
   Avatar
   --------------------------------------------------------------------------- */

export function Avatar({
  name,
  size = 32,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-brand-tint font-semibold text-brand-fg',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials(name)}
    </span>
  )
}

/* ---------------------------------------------------------------------------
   Progress bar
   --------------------------------------------------------------------------- */

export type ProgressTone = 'brand' | 'warning' | 'danger' | 'success'

const TONE_CLASS: Record<ProgressTone, string> = {
  brand: 'bg-brand',
  warning: 'bg-warning',
  danger: 'bg-danger',
  success: 'bg-success',
}

export function ProgressBar({
  value,
  tone = 'brand',
  className,
}: {
  value: number
  tone?: ProgressTone
  className?: string
}) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx('h-1 w-full overflow-hidden rounded-full bg-surface-muted', className)}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-200', TONE_CLASS[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
