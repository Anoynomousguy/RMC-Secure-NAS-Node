import { useEffect, useRef } from 'react'
import { ExternalLink, Menu, Moon, Search, Sun, X } from 'lucide-react'
import { authPortalUrl } from '../lib/api'
import { cx } from '../lib/format'
import type { Me } from '../lib/types'
import { MenuButton, type MenuEntry } from './menu'
import { Avatar, IconButton } from './ui'

export function Header({
  title,
  query,
  onQueryChange,
  theme,
  onToggleTheme,
  me,
  version,
  onToggleSidebar,
}: {
  title: string
  query: string
  onQueryChange: (value: string) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  me: Me | null
  version?: string
  onToggleSidebar: () => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)

  // Press "/" to jump into the search field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/') return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const portal = authPortalUrl()
  const hasPortal = portal !== '/'

  const accountEntries: MenuEntry[] = [
    ...(me
      ? ([
          {
            type: 'custom',
            key: 'identity',
            node: (
              <div className="flex items-center gap-3 px-3 py-2">
                <Avatar name={me.user} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{me.user}</div>
                  <div className="text-xs text-ink-3">
                    {me.role === 'admin' ? 'Administrator' : 'Member'}
                  </div>
                </div>
              </div>
            ),
          },
          { type: 'separator' },
        ] as MenuEntry[])
      : []),
    {
      type: 'item',
      key: 'theme',
      label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
      onSelect: onToggleTheme,
    },
    ...(hasPortal
      ? ([
          {
            type: 'item',
            key: 'portal',
            label: 'Account portal',
            icon: <ExternalLink size={16} />,
            onSelect: () => window.open(portal, '_blank', 'noopener'),
          },
        ] as MenuEntry[])
      : []),
    ...(version
      ? ([
          { type: 'separator' },
          {
            type: 'custom',
            key: 'version',
            node: <div className="px-3 py-1.5 text-xs text-ink-3">Connected · server v{version}</div>,
          },
        ] as MenuEntry[])
      : []),
  ]

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line-subtle bg-surface px-2">
      <IconButton label="Toggle navigation" onClick={onToggleSidebar}>
        <Menu size={20} aria-hidden="true" />
      </IconButton>

      <h1 className="truncate pl-1 pr-2 text-base font-semibold text-ink">{title}</h1>

      <div className="mx-2 flex min-w-0 flex-1 items-center justify-end gap-2 sm:justify-center">
        <div className="relative w-full max-w-[480px]">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search"
            aria-label="Search"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.stopPropagation()
                onQueryChange('')
              }
            }}
            className={cx(
              'h-8 w-full rounded-control border border-transparent bg-surface-subtle pl-9 pr-8 text-sm text-ink',
              'placeholder:text-ink-3 hover:bg-surface-hover focus:border-brand focus:bg-surface focus:outline-none',
              'transition-colors duration-150',
            )}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                onQueryChange('')
                searchRef.current?.focus()
              }}
              className="icon-btn absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <IconButton
        label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={onToggleTheme}
      >
        {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
      </IconButton>

      <MenuButton
        align="end"
        label="Account"
        entries={accountEntries}
        renderTrigger={(props) => (
          <button
            {...props}
            aria-label="Account and settings"
            className="ml-1 rounded-full transition-shadow duration-150 hover:shadow-menu"
          >
            <Avatar name={me?.user ?? '?'} size={32} />
          </button>
        )}
      />
    </header>
  )
}
