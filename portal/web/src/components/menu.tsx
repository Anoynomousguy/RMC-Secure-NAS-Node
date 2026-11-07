import {
  createPortal,
} from 'react-dom'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { Check } from 'lucide-react'
import { cx } from '../lib/format'

/* ---------------------------------------------------------------------------
   Menu entries
   --------------------------------------------------------------------------- */

export type MenuEntry =
  | { type: 'separator' }
  | { type: 'header'; label: string }
  | { type: 'custom'; key: string; node: ReactNode }
  | {
      type: 'item'
      key: string
      label: string
      icon?: ReactNode
      danger?: boolean
      disabled?: boolean
      checked?: boolean
      onSelect?: () => void
    }

/* ---------------------------------------------------------------------------
   MenuList — the panel itself, with roving focus + arrow keys.
   --------------------------------------------------------------------------- */

export function MenuList({
  entries,
  onClose,
  label,
  className,
}: {
  entries: MenuEntry[]
  onClose: () => void
  label?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    node?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({
      preventScroll: true,
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const items = Array.from(
        ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
      )
      if (items.length === 0) return
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        items[(index + 1) % items.length]?.focus({ preventScroll: true })
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        items[(index - 1 + items.length) % items.length]?.focus({ preventScroll: true })
      } else if (event.key === 'Home') {
        event.preventDefault()
        items[0]?.focus({ preventScroll: true })
      } else if (event.key === 'End') {
        event.preventDefault()
        items[items.length - 1]?.focus({ preventScroll: true })
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={cx('menu-panel animate-menu-in', className)}
    >
      {entries.map((entry, index) => {
        if (entry.type === 'separator') {
          return <div key={`sep-${index}`} role="separator" className="mx-2 my-1 h-px bg-line-subtle" />
        }
        if (entry.type === 'header') {
          return (
            <div key={`head-${index}`} className="px-3 pb-1 pt-2 text-xs text-ink-3">
              {entry.label}
            </div>
          )
        }
        if (entry.type === 'custom') {
          return <div key={entry.key}>{entry.node}</div>
        }
        return (
          <button
            key={entry.key}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => entry.onSelect?.()}
            className={cx(
              'flex w-full items-center gap-3 rounded-[3px] px-3 py-2 text-left text-sm transition-colors duration-150',
              entry.danger
                ? 'text-danger hover:bg-danger/10'
                : 'text-ink hover:bg-surface-hover',
              entry.disabled && 'cursor-default opacity-45 hover:bg-transparent',
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                'flex h-4 w-4 shrink-0 items-center justify-center',
                entry.danger ? 'text-danger' : 'text-ink-2',
              )}
            >
              {entry.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.checked ? (
              <Check size={14} strokeWidth={2.5} className="shrink-0 text-brand-fg" aria-hidden="true" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------------------
   FloatingMenu — portal with clamped placement, dismiss handling.
   --------------------------------------------------------------------------- */

interface TriggerProps {
  onClick: (event: ReactMouseEvent<HTMLElement>) => void
  'aria-expanded': boolean
  'aria-haspopup': 'menu'
}

function FloatingMenu({
  anchor,
  align,
  entries,
  onClose,
  triggerEl,
  label,
}: {
  anchor: DOMRect
  align: 'start' | 'end'
  entries: MenuEntry[]
  onClose: () => void
  triggerEl?: HTMLElement | null
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ left: 0, top: 0, visibility: 'hidden' })

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const pad = 8
    let x = align === 'end' ? anchor.right - rect.width : anchor.left
    x = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad))
    let y = anchor.bottom + 4
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, anchor.top - rect.height - 4)
    }
    setStyle({ left: x, top: y, visibility: 'visible' })
  }, [anchor, align])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (ref.current?.contains(target)) return
      if (triggerEl?.contains(target)) return
      onClose()
    }
    const onScrollOrResize = () => onClose()
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [onClose, triggerEl])

  return createPortal(
    <div ref={ref} className="fixed z-[65]" style={style}>
      <MenuList entries={entries} onClose={onClose} label={label} />
    </div>,
    document.body,
  )
}

/* ---------------------------------------------------------------------------
   MenuButton — dropdown anchored to a trigger.
   --------------------------------------------------------------------------- */

export function MenuButton({
  entries,
  align = 'start',
  renderTrigger,
  label,
}: {
  entries: MenuEntry[]
  align?: 'start' | 'end'
  renderTrigger: (props: TriggerProps) => ReactNode
  label?: string
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const close = useCallback(() => setAnchor(null), [])

  const onTriggerClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    // Keep the click from reaching parents (rows are clickable too).
    event.stopPropagation()
    const trigger = event.currentTarget
    triggerRef.current = trigger
    // Capture the rect now — currentTarget is only valid during dispatch.
    const rect = trigger.getBoundingClientRect()
    setAnchor((prev) => (prev ? null : rect))
  }, [])

  return (
    <>
      {renderTrigger({
        onClick: onTriggerClick,
        'aria-expanded': anchor !== null,
        'aria-haspopup': 'menu',
      })}
      {anchor ? (
        <FloatingMenu
          anchor={anchor}
          align={align}
          entries={entries}
          onClose={close}
          triggerEl={triggerRef.current}
          label={label}
        />
      ) : null}
    </>
  )
}

/* ---------------------------------------------------------------------------
   ContextMenu — right-click menu at pointer coordinates.
   --------------------------------------------------------------------------- */

export function ContextMenu({
  state,
  onClose,
}: {
  state: { x: number; y: number; entries: MenuEntry[] } | null
  onClose: () => void
}) {
  const rect = state
    ? ({ left: state.x, right: state.x, top: state.y, bottom: state.y, width: 0, height: 0 } as DOMRect)
    : null
  if (!state || !rect) return null
  return (
    <FloatingMenu anchor={rect} align="start" entries={state.entries} onClose={onClose} />
  )
}
