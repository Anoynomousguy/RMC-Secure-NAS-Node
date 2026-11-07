import type { CSSProperties, ReactNode } from 'react'
import { cx, formatBytes, percentOf, quotaTone } from '../lib/format'
import type { Me, Section } from '../lib/types'
import {
  CloudLogo,
  ClockFilled,
  FolderFilled,
  HomeFilled,
  PeopleFilled,
  ShieldFilled,
  TrashFilled,
} from './icons'
import { ProgressBar } from './ui'

interface NavItemDef {
  id: Section
  label: string
  Icon: (props: { size?: number; className?: string }) => ReactNode
}

const MAIN_ITEMS: NavItemDef[] = [
  { id: 'home', label: 'Home', Icon: HomeFilled },
  { id: 'files', label: 'My files', Icon: FolderFilled },
  { id: 'recent', label: 'Recent', Icon: ClockFilled },
  { id: 'shared', label: 'Shared', Icon: PeopleFilled },
  { id: 'bin', label: 'Recycle bin', Icon: TrashFilled },
]

function SidebarContent({
  me,
  section,
  onNavigate,
}: {
  me: Me | null
  section: Section
  onNavigate: (section: Section) => void
}) {
  const quotaPct = me ? percentOf(me.quota.usedBytes, me.quota.limitBytes) : 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <CloudLogo size={26} />
        <span className="text-base font-semibold text-ink">Fortress</span>
      </div>

      <nav aria-label="Primary" className="px-2 pb-2 pt-1">
        <ul className="space-y-0.5">
          {MAIN_ITEMS.map((item, index) => (
            <li key={item.id} className="stagger-item" style={{ '--stagger': index } as CSSProperties}>
              <button
                type="button"
                aria-current={section === item.id ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
                className={cx(
                  'flex h-8 w-full items-center gap-3 rounded-control px-3 text-sm transition-colors duration-150',
                  section === item.id
                    ? 'bg-surface-selected text-ink'
                    : 'text-ink-2 hover:bg-surface-hover hover:text-ink',
                )}
              >
                <item.Icon
                  size={20}
                  className={section === item.id ? 'shrink-0 text-brand-fg' : 'shrink-0 text-ink-2'}
                />
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {me?.role === 'admin' ? (
          <div className="mt-2 border-t border-line-subtle pt-2">
            <div className="px-3 pb-1 text-xs text-ink-3">Admin</div>
            <button
              type="button"
              aria-current={section === 'admin' ? 'page' : undefined}
              onClick={() => onNavigate('admin')}
              className={cx(
                'flex h-8 w-full items-center gap-3 rounded-control px-3 text-sm transition-colors duration-150',
                section === 'admin'
                  ? 'bg-surface-selected text-ink'
                  : 'text-ink-2 hover:bg-surface-hover hover:text-ink',
              )}
            >
              <ShieldFilled
                size={20}
                className={section === 'admin' ? 'shrink-0 text-brand-fg' : 'shrink-0 text-ink-2'}
              />
              <span className="truncate">Users</span>
            </button>
          </div>
        ) : null}
      </nav>

      {me ? (
        <div className="mt-auto border-t border-line-subtle px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between text-xs text-ink-3">
            <span>Storage</span>
            <span>{quotaPct}%</span>
          </div>
          <ProgressBar value={quotaPct} tone={quotaTone(quotaPct)} />
          <p className="mt-1.5 text-xs text-ink-3">
            {formatBytes(me.quota.usedBytes)} of {formatBytes(me.quota.limitBytes)} used
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function Sidebar({
  me,
  section,
  onNavigate,
}: {
  me: Me | null
  section: Section
  onNavigate: (section: Section) => void
}) {
  return (
    <aside className="hidden h-full w-full flex-col border-r border-line-subtle bg-surface-subtle sm:flex">
      <SidebarContent me={me} section={section} onNavigate={onNavigate} />
    </aside>
  )
}

export function SidebarDrawer({
  open,
  onClose,
  me,
  section,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  me: Me | null
  section: Section
  onNavigate: (section: Section) => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="absolute inset-0 animate-fade-in bg-[var(--overlay)]" onClick={onClose} aria-hidden="true" />
      <div className="animate-drawer-in absolute inset-y-0 left-0 w-[260px] border-r border-line-subtle bg-surface-subtle shadow-menu">
        <SidebarContent
          me={me}
          section={section}
          onNavigate={(next) => {
            onNavigate(next)
            onClose()
          }}
        />
      </div>
    </div>
  )
}
