import type { ReactNode } from 'react'
import { CloudOff, LockKeyhole, RotateCcw, Trash2, Users } from 'lucide-react'
import { authPortalUrl } from '../lib/api'
import { Button } from '../components/ui'
import { CloudLogo } from '../components/icons'

/* ---------------------------------------------------------------------------
   Session required (401/403 from any API call)
   --------------------------------------------------------------------------- */

export function SignInPanel({ message }: { message?: string }) {
  const portal = authPortalUrl()
  return (
    <div className="flex h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[420px] rounded-card border border-line-subtle bg-surface p-8 text-center shadow-menu">
        <CloudLogo size={36} className="mx-auto" />
        <div className="mx-auto mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint">
          <LockKeyhole size={22} className="text-brand-fg" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl/[26px] font-semibold text-ink">Session required</h1>
        <p className="mt-2 text-sm text-ink-2">
          You need to sign in to open Fortress Files. Your session may have expired, or this
          account might not have access to the portal.
        </p>
        {message ? <p className="mt-2 text-xs text-ink-3">{message}</p> : null}
        <Button
          variant="primary"
          className="mt-5 w-full"
          onClick={() => {
            window.location.assign(portal)
          }}
        >
          Sign in
        </Button>
        <p className="mt-3 text-xs text-ink-3">
          You will be redirected to the sign-in portal.
        </p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Boot failure (server unreachable)
   --------------------------------------------------------------------------- */

export function ServerErrorPanel({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[420px] rounded-card border border-line-subtle bg-surface p-8 text-center shadow-menu">
        <CloudLogo size={36} className="mx-auto" />
        <div className="mx-auto mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint">
          <CloudOff size={22} className="text-brand-fg" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl/[26px] font-semibold text-ink">Can’t reach the server</h1>
        <p className="mt-2 text-sm text-ink-2">
          The portal backend didn’t respond. Check that the server is running, then try again.
        </p>
        {message ? <p className="mt-2 text-xs text-ink-3">{message}</p> : null}
        <Button
          variant="primary"
          className="mt-5 w-full"
          icon={<RotateCcw size={16} aria-hidden="true" />}
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Section placeholders (Shared / Recycle bin)
   --------------------------------------------------------------------------- */

export function EmptySection({
  kind,
  title,
  description,
  children,
}: {
  kind: 'shared' | 'bin'
  title: string
  description: string
  children?: ReactNode
}) {
  const Icon = kind === 'shared' ? Users : Trash2
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-surface p-6">
      <div className="flex max-w-[440px] flex-col items-center text-center">
        <Icon size={48} strokeWidth={1.25} className="text-ink-3/60" aria-hidden="true" />
        <h2 className="mt-4 text-xl/[26px] font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-ink-2">{description}</p>
        {children}
      </div>
    </div>
  )
}
