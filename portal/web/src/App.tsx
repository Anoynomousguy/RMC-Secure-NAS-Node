import { useCallback, useEffect, useState } from 'react'
import { api, describeError, isAuthError, startDownload } from './lib/api'
import { cx } from './lib/format'
import { recordRecent, type RecentEntry } from './lib/recent'
import type { Entry, Me, Section } from './lib/types'
import { useTheme } from './hooks/useTheme'
import { Header } from './components/Header'
import { Sidebar, SidebarDrawer } from './components/Sidebar'
import { CloudLogo } from './components/icons'
import { FilesView } from './views/FilesView'
import { HomeView } from './views/HomeView'
import { RecentView } from './views/RecentView'
import { AdminView } from './views/AdminView'
import { EmptySection, ServerErrorPanel, SignInPanel } from './views/panels'

const SECTION_TITLES: Record<Section, string> = {
  home: 'Home',
  files: 'My files',
  recent: 'Recent',
  shared: 'Shared',
  bin: 'Recycle bin',
  admin: 'Admin · Users',
}

type BootState = 'loading' | 'ready' | 'auth' | 'error'

export default function App() {
  const { theme, toggle } = useTheme()

  const [boot, setBoot] = useState<BootState>('loading')
  const [bootError, setBootError] = useState<string>()
  const [me, setMe] = useState<Me | null>(null)
  const [version, setVersion] = useState<string>()

  const [section, setSection] = useState<Section>('home')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [path, setPath] = useState('')
  const [browseUser, setBrowseUser] = useState<string | null>(null)

  const loadMe = useCallback(async () => {
    setBoot('loading')
    setBootError(undefined)
    try {
      const profile = await api.me()
      setMe(profile)
      setBoot('ready')
      api
        .health()
        .then((health) => setVersion(health?.version))
        .catch(() => {
          /* status line is optional */
        })
    } catch (err) {
      if (isAuthError(err)) {
        setBoot('auth')
      } else {
        setBootError(describeError(err))
        setBoot('error')
      }
    }
  }, [])

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  const onAuthError = useCallback(() => setBoot('auth'), [])

  const toggleSidebar = useCallback(() => {
    if (window.matchMedia('(max-width: 639.9px)').matches) {
      setDrawerOpen((open) => !open)
    } else {
      setSidebarOpen((open) => !open)
    }
  }, [])

  const navigate = useCallback((next: Section) => {
    setSection(next)
    setQuery('')
    setBrowseUser(null)
    // "My files" always opens the root, like OneDrive's nav item.
    if (next === 'files') setPath('')
  }, [])

  const openFolderPath = useCallback((nextPath: string) => {
    setBrowseUser(null)
    setPath(nextPath)
    setSection('files')
    setQuery('')
  }, [])

  const browseUserFiles = useCallback((user: string) => {
    setBrowseUser(user)
    setPath('')
    setSection('files')
    setQuery('')
  }, [])

  const exitBrowse = useCallback(() => {
    setBrowseUser(null)
    setPath('')
  }, [])

  const openHomeFile = useCallback((entry: Entry) => {
    startDownload(entry.name, entry.name, null)
    recordRecent({
      name: entry.name,
      parent: '',
      type: 'file',
      mime: entry.mime,
      size: entry.size,
      modified: entry.modified,
    })
  }, [])

  const openRecentFile = useCallback((item: RecentEntry) => {
    startDownload(item.key, item.name, null)
  }, [])

  if (boot === 'auth') return <SignInPanel />
  if (boot === 'error') {
    return <ServerErrorPanel message={bootError} onRetry={() => void loadMe()} />
  }
  if (boot === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <CloudLogo size={40} className="animate-pulse" />
          <span className="text-sm text-ink-3">Connecting…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden bg-canvas text-ink">
      <div
        className={cx(
          'hidden shrink-0 overflow-hidden transition-[width] duration-200 sm:block',
          sidebarOpen ? 'w-[260px]' : 'w-0',
        )}
      >
        <Sidebar me={me} section={section} onNavigate={navigate} />
      </div>

      <SidebarDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        me={me}
        section={section}
        onNavigate={navigate}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={SECTION_TITLES[section]}
          query={query}
          onQueryChange={setQuery}
          theme={theme}
          onToggleTheme={toggle}
          me={me}
          version={version}
          onToggleSidebar={toggleSidebar}
        />

        <main className="flex min-h-0 flex-1 flex-col">
          {/* Files stays mounted so path, selection and view survive section switches. */}
          <div className={cx('min-h-0 flex-1', section === 'files' ? 'flex flex-col' : 'hidden')}>
            <FilesView
              path={path}
              onNavigatePath={setPath}
              browseUser={browseUser}
              onExitBrowse={exitBrowse}
              query={query}
              active={section === 'files'}
              onAuthError={onAuthError}
            />
          </div>

          {section === 'home' ? (
            <HomeView
              me={me}
              query={query}
              onAuthError={onAuthError}
              onOpenFolder={openFolderPath}
              onOpenFile={openHomeFile}
            />
          ) : null}

          {section === 'recent' ? (
            <RecentView
              query={query}
              onOpenFolderPath={openFolderPath}
              onOpenFile={openRecentFile}
            />
          ) : null}

          {section === 'shared' ? (
            <EmptySection
              kind="shared"
              title="Nothing shared with you yet"
              description="Files that other members share with you will show up here."
            />
          ) : null}

          {section === 'bin' ? (
            <EmptySection
              kind="bin"
              title="Recycle bin is empty"
              description="Deleted items will rest here before they are removed for good."
            />
          ) : null}

          {section === 'admin' ? (
            <AdminView query={query} onBrowse={browseUserFiles} onAuthError={onAuthError} />
          ) : null}
        </main>
      </div>
    </div>
  )
}
